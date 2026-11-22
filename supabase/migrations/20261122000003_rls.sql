-- Row Level Security. Default deny: every table has RLS on; writes to trips/orders/payments
-- happen only through Edge Functions (service role) or the SECURITY DEFINER RPCs above.

alter table public.regions enable row level security;
alter table public.cities enable row level security;
alter table public.rate_cards enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.trips enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;  -- no policies: service role only
alter table public.ratings enable row level security;

-- Reference data: readable by everyone, writable by admins.
create policy "regions readable" on public.regions for select to anon, authenticated using (true);
create policy "cities readable" on public.cities for select to anon, authenticated using (true);
create policy "rate cards readable" on public.rate_cards for select to anon, authenticated using (true);
create policy "rate cards admin" on public.rate_cards for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profiles
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Riders see the name of their current driver / courier, drivers see their rider's name.
create policy "counterpart profile read" on public.profiles for select to authenticated using (
  exists (select 1 from public.trips t where t.status in ('offered', 'accepted', 'arrived', 'in_progress', 'completed')
          and ((t.rider_id = auth.uid() and t.driver_id = profiles.id) or ((t.driver_id = auth.uid() or t.offered_driver_id = auth.uid()) and t.rider_id = profiles.id)))
  or exists (select 1 from public.orders o where (o.customer_id = auth.uid() and o.courier_id = profiles.id)
          or ((o.courier_id = auth.uid() or o.offered_courier_id = auth.uid()) and o.customer_id = profiles.id))
);

-- Vehicles: owners manage their own (verified flag is protected by trigger).
create policy "own vehicles" on public.vehicles for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "insert own vehicle" on public.vehicles for insert to authenticated with check (owner_id = auth.uid());
create policy "update own vehicle" on public.vehicles for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "assigned vehicle read" on public.vehicles for select to authenticated using (
  exists (select 1 from public.drivers d join public.trips t on t.driver_id = d.id
          where d.vehicle_id = vehicles.id and t.rider_id = auth.uid() and t.status in ('accepted', 'arrived', 'in_progress'))
  or exists (select 1 from public.drivers d join public.orders o on o.courier_id = d.id
          where d.vehicle_id = vehicles.id and o.customer_id = auth.uid() and o.status in ('accepted', 'preparing', 'ready', 'picked_up'))
);

-- Drivers: no direct writes from clients (status/location/acceptance go through RPCs).
create policy "own driver row" on public.drivers for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "assigned driver read" on public.drivers for select to authenticated using (
  exists (select 1 from public.trips t where t.driver_id = drivers.id and t.rider_id = auth.uid() and t.status in ('accepted', 'arrived', 'in_progress'))
  or exists (select 1 from public.orders o where o.courier_id = drivers.id and o.customer_id = auth.uid() and o.status in ('accepted', 'preparing', 'ready', 'picked_up'))
);
create policy "admin drivers" on public.drivers for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Trips
create policy "rider trips" on public.trips for select to authenticated using (rider_id = auth.uid());
create policy "driver trips" on public.trips for select to authenticated using (driver_id = auth.uid() or offered_driver_id = auth.uid());
create policy "admin trips" on public.trips for select to authenticated using (public.is_admin());

-- Restaurants & menus: public catalogue; owners manage their own.
create policy "restaurants readable" on public.restaurants for select to anon, authenticated using (true);
create policy "owner inserts restaurant" on public.restaurants for insert to authenticated with check (owner_id = auth.uid());
create policy "owner updates restaurant" on public.restaurants for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "menu readable" on public.menu_items for select to anon, authenticated using (true);
create policy "owner manages menu" on public.menu_items for all to authenticated
  using (exists (select 1 from public.restaurants r where r.id = menu_items.restaurant_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.restaurants r where r.id = menu_items.restaurant_id and r.owner_id = auth.uid()));

-- Orders
create policy "customer orders" on public.orders for select to authenticated using (customer_id = auth.uid());
create policy "restaurant orders" on public.orders for select to authenticated using (
  status <> 'pending_payment' and exists (select 1 from public.restaurants r where r.id = orders.restaurant_id and r.owner_id = auth.uid()));
create policy "courier orders" on public.orders for select to authenticated using (courier_id = auth.uid() or offered_courier_id = auth.uid());
create policy "admin orders" on public.orders for select to authenticated using (public.is_admin());
create policy "order items follow order" on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_items.order_id));

-- Payments: payers read their own; only the service role writes.
create policy "own payments" on public.payments for select to authenticated using (payer_id = auth.uid() or public.is_admin());

-- Ratings
create policy "own ratings" on public.ratings for select to authenticated using (rater_id = auth.uid() or ratee_id = auth.uid());

-- Column-level hardening: clients may only edit these profile fields.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, role, city_id, lang) on public.profiles to authenticated;

-- Realtime: trip/order/payment status and driver positions.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trips, public.orders, public.payments, public.drivers;
  end if;
end $$;
