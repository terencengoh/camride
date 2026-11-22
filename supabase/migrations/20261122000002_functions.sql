-- CamRide business logic in Postgres: pricing, nearest-driver search (PostGIS),
-- driver / rider / restaurant / courier state transitions, ratings, triggers.
-- All state-changing RPCs are SECURITY DEFINER with explicit auth checks and a fixed search_path.

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.make_point(p_lat double precision, p_lng double precision)
returns extensions.geography language sql immutable set search_path = public, extensions as $$
  select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
$$;

-- Rough bounding box of Cameroon, used to reject obviously wrong coordinates.
create or replace function public.in_cameroon(p_lat double precision, p_lng double precision)
returns boolean language sql immutable as $$
  select p_lat between 1.6 and 13.1 and p_lng between 8.4 and 16.25;
$$;

-- ---------- pricing ----------
-- Fare rule (keep in sync with supabase/functions/_shared/fare.ts; both are tested
-- against supabase/tests/fare_fixtures.json):
--   raw  = base + per_km * distance_km + per_min * duration_min
--   fare = round_to_50(max(minimum, raw))       (FCFA, half-up to the nearest 50)
create or replace function public.round_xaf(p_amount numeric)
returns integer language sql immutable as $$
  select (floor(p_amount / 50 + 0.5) * 50)::integer;
$$;

create or replace function public.fare_quote(p_key text, p_distance_km numeric, p_duration_min numeric)
returns integer language plpgsql stable set search_path = public as $$
declare rc public.rate_cards;
begin
  select * into rc from public.rate_cards where key = p_key;
  if not found then raise exception 'unknown rate card %', p_key using errcode = '22023'; end if;
  if p_distance_km < 0 or p_duration_min < 0 then raise exception 'negative distance/duration' using errcode = '22023'; end if;
  return public.round_xaf(greatest(rc.minimum_xaf, rc.base_xaf + rc.per_km_xaf * p_distance_km + rc.per_min_xaf * p_duration_min));
end $$;

-- Straight-line distance x 1.3 road factor, 22 km/h average urban speed.
-- Replace with a routing provider (self-hosted OSRM/Valhalla or a paid API) for production accuracy.
create or replace function public.estimate_route(p_from extensions.geography, p_to extensions.geography,
  out distance_km numeric, out duration_min numeric)
language sql immutable set search_path = public, extensions as $$
  select round((extensions.st_distance(p_from, p_to) / 1000.0 * 1.3)::numeric, 2),
         round(greatest(2, extensions.st_distance(p_from, p_to) / 1000.0 * 1.3 / 22 * 60)::numeric, 1);
$$;

-- Quotes for every ride type between two points (used by the app before booking).
create or replace function public.quote_trip(p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_lat double precision, p_dropoff_lng double precision)
returns table (vehicle_type text, distance_km numeric, duration_min numeric, fare_xaf integer)
language plpgsql stable set search_path = public, extensions as $$
declare r record;
begin
  if not public.in_cameroon(p_pickup_lat, p_pickup_lng) or not public.in_cameroon(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'pickup and dropoff must be in Cameroon' using errcode = '22023';
  end if;
  select * into r from public.estimate_route(public.make_point(p_pickup_lat, p_pickup_lng), public.make_point(p_dropoff_lat, p_dropoff_lng));
  return query
    select v::text, r.distance_km, r.duration_min, public.fare_quote(v::text, r.distance_km, r.duration_min)
    from unnest(enum_range(null::public.vehicle_type)) as v;
end $$;

create or replace function public.delivery_fee(p_distance_km numeric)
returns integer language sql stable set search_path = public as $$
  select public.fare_quote('delivery', p_distance_km, 0);
$$;

-- ---------- nearest drivers (PostGIS) ----------
-- Available, verified drivers of the requested type within p_radius_m whose GPS is fresh (< 2 min).
create or replace function public.nearest_available_drivers(
  p_lat double precision, p_lng double precision, p_vehicle_type public.vehicle_type default null,
  p_couriers_only boolean default false, p_radius_m integer default 5000, p_limit integer default 5,
  p_exclude uuid[] default '{}')
returns table (driver_id uuid, distance_m double precision, lat double precision, lng double precision)
language sql stable security definer set search_path = public, extensions as $$
  select d.id,
         extensions.st_distance(d.location, public.make_point(p_lat, p_lng)) as distance_m,
         extensions.st_y(d.location::extensions.geometry), extensions.st_x(d.location::extensions.geometry)
  from public.drivers d
  where d.status = 'available'
    and d.documents_verified
    and d.location is not null
    and d.location_updated_at > now() - interval '2 minutes'
    and (p_vehicle_type is null or d.vehicle_type = p_vehicle_type)
    and (not p_couriers_only or d.is_courier)
    and not (d.id = any (p_exclude))
    and extensions.st_dwithin(d.location, public.make_point(p_lat, p_lng), p_radius_m)
  order by d.location operator(extensions.<->) public.make_point(p_lat, p_lng)
  limit greatest(1, least(p_limit, 50));
$$;
revoke all on function public.nearest_available_drivers(double precision, double precision, public.vehicle_type, boolean, integer, integer, uuid[]) from public, anon, authenticated;

-- ---------- driver actions ----------
create or replace function public.update_my_location(p_lat double precision, p_lng double precision, p_heading real default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.in_cameroon(p_lat, p_lng) then raise exception 'location outside Cameroon' using errcode = '22023'; end if;
  update public.drivers set location = public.make_point(p_lat, p_lng), lat = p_lat, lng = p_lng, heading = p_heading, location_updated_at = now()
  where id = auth.uid();
  if not found then raise exception 'not a driver' using errcode = '42501'; end if;
end $$;

create or replace function public.set_driver_status(p_status public.driver_status)
returns public.driver_status language plpgsql security definer set search_path = public as $$
declare d public.drivers;
begin
  select * into d from public.drivers where id = auth.uid() for update;
  if not found then raise exception 'not a driver' using errcode = '42501'; end if;
  if p_status = 'busy' then raise exception 'busy is set by the system' using errcode = '22023'; end if;
  if p_status = 'available' and not d.documents_verified then
    raise exception 'documents not verified yet' using errcode = '42501';
  end if;
  if d.status = 'busy' then raise exception 'finish the current job first' using errcode = '55000'; end if;
  update public.drivers set status = p_status where id = d.id;
  return p_status;
end $$;

create or replace function public.accept_trip(p_trip_id uuid)
returns public.trips language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.offered_driver_id is distinct from auth.uid() or t.status <> 'offered' then
    raise exception 'offer not available' using errcode = '55000';
  end if;
  if t.offer_expires_at < now() then raise exception 'offer expired' using errcode = '55000'; end if;
  update public.drivers set status = 'busy' where id = auth.uid() and status = 'available';
  if not found then raise exception 'driver not available' using errcode = '55000'; end if;
  update public.trips set status = 'accepted', driver_id = auth.uid(), offered_driver_id = null,
    offer_expires_at = null, accepted_at = now()
  where id = p_trip_id returning * into t;
  return t;
end $$;

create or replace function public.decline_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.trips set status = 'requested', offered_driver_id = null, offer_expires_at = null,
    declined_driver_ids = array_append(declined_driver_ids, auth.uid())
  where id = p_trip_id and offered_driver_id = auth.uid() and status = 'offered';
  if not found then raise exception 'offer not available' using errcode = '55000'; end if;
end $$;

-- Driver progresses an accepted trip: arrived -> in_progress -> completed.
create or replace function public.advance_trip(p_trip_id uuid, p_to public.trip_status)
returns public.trips language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.driver_id is distinct from auth.uid() then raise exception 'not your trip' using errcode = '42501'; end if;
  if not ((t.status = 'accepted' and p_to = 'arrived') or (t.status = 'arrived' and p_to = 'in_progress')
          or (t.status = 'in_progress' and p_to = 'completed')) then
    raise exception 'invalid transition % -> %', t.status, p_to using errcode = '55000';
  end if;
  update public.trips set status = p_to,
    arrived_at = case when p_to = 'arrived' then now() else arrived_at end,
    started_at = case when p_to = 'in_progress' then now() else started_at end,
    completed_at = case when p_to = 'completed' then now() else completed_at end
  where id = p_trip_id returning * into t;
  if p_to = 'completed' then
    update public.drivers set status = 'available' where id = t.driver_id;
    -- Cash: the driver confirms collection by completing the trip.
    if t.payment_method = 'cash' and t.payment_status <> 'paid' then
      insert into public.payments (payer_id, trip_id, amount_xaf, method, provider, status)
      values (t.rider_id, t.id, t.fare_xaf, 'cash', 'cash', 'successful');
      update public.trips set payment_status = 'paid' where id = t.id returning * into t;
    end if;
  end if;
  return t;
end $$;

create or replace function public.cancel_trip(p_trip_id uuid)
returns public.trips language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found or (t.rider_id <> auth.uid() and t.driver_id is distinct from auth.uid()) then
    raise exception 'not your trip' using errcode = '42501';
  end if;
  if t.status not in ('requested', 'offered', 'accepted', 'arrived', 'no_drivers') then
    raise exception 'trip can no longer be cancelled' using errcode = '55000';
  end if;
  if t.driver_id is not null then update public.drivers set status = 'available' where id = t.driver_id and status = 'busy'; end if;
  update public.trips set status = 'cancelled', cancelled_at = now(), offered_driver_id = null where id = p_trip_id returning * into t;
  return t;
end $$;

create or replace function public.rate_trip(p_trip_id uuid, p_stars smallint, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id;
  if not found or t.rider_id <> auth.uid() then raise exception 'not your trip' using errcode = '42501'; end if;
  if t.status <> 'completed' then raise exception 'trip not completed' using errcode = '55000'; end if;
  insert into public.ratings (trip_id, rater_id, ratee_id, stars, comment) values (t.id, auth.uid(), t.driver_id, p_stars, p_comment);
  update public.drivers set
    rating_avg = round(((rating_avg * rating_count) + p_stars) / (rating_count + 1), 2),
    rating_count = rating_count + 1
  where id = t.driver_id;
end $$;

-- ---------- restaurant actions ----------
create or replace function public.restaurant_set_order_status(p_order_id uuid, p_to public.order_status)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select o2.* into o from public.orders o2 join public.restaurants r on r.id = o2.restaurant_id
  where o2.id = p_order_id and r.owner_id = auth.uid() for update of o2;
  if not found then raise exception 'not your order' using errcode = '42501'; end if;
  if not ((o.status = 'placed' and p_to in ('accepted', 'cancelled')) or (o.status = 'accepted' and p_to = 'preparing')
          or (o.status = 'preparing' and p_to = 'ready')) then
    raise exception 'invalid transition % -> %', o.status, p_to using errcode = '55000';
  end if;
  update public.orders set status = p_to,
    accepted_at = case when p_to = 'accepted' then now() else accepted_at end,
    ready_at = case when p_to = 'ready' then now() else ready_at end,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end
  where id = p_order_id returning * into o;
  return o;
end $$;

-- ---------- courier actions ----------
create or replace function public.accept_delivery(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.offered_courier_id is distinct from auth.uid() or o.offer_expires_at < now()
     or o.courier_id is not null or o.status not in ('accepted', 'preparing', 'ready') then
    raise exception 'offer not available' using errcode = '55000';
  end if;
  update public.drivers set status = 'busy' where id = auth.uid() and status = 'available';
  if not found then raise exception 'courier not available' using errcode = '55000'; end if;
  update public.orders set courier_id = auth.uid(), offered_courier_id = null, offer_expires_at = null
  where id = p_order_id returning * into o;
  return o;
end $$;

create or replace function public.decline_delivery(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set offered_courier_id = null, offer_expires_at = null,
    declined_courier_ids = array_append(declined_courier_ids, auth.uid())
  where id = p_order_id and offered_courier_id = auth.uid() and courier_id is null;
  if not found then raise exception 'offer not available' using errcode = '55000'; end if;
end $$;

create or replace function public.courier_advance_order(p_order_id uuid, p_to public.order_status)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.courier_id is distinct from auth.uid() then raise exception 'not your delivery' using errcode = '42501'; end if;
  if not ((o.status = 'ready' and p_to = 'picked_up') or (o.status = 'picked_up' and p_to = 'delivered')) then
    raise exception 'invalid transition % -> %', o.status, p_to using errcode = '55000';
  end if;
  update public.orders set status = p_to,
    picked_up_at = case when p_to = 'picked_up' then now() else picked_up_at end,
    delivered_at = case when p_to = 'delivered' then now() else delivered_at end
  where id = p_order_id returning * into o;
  if p_to = 'delivered' then
    update public.drivers set status = 'available' where id = o.courier_id;
    if o.payment_method = 'cash' and o.payment_status <> 'paid' then
      insert into public.payments (payer_id, order_id, amount_xaf, method, provider, status)
      values (o.customer_id, o.id, o.total_xaf, 'cash', 'cash', 'successful');
      update public.orders set payment_status = 'paid' where id = o.id returning * into o;
    end if;
  end if;
  return o;
end $$;

-- ---------- triggers ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- New auth user -> profile row (phone comes from Supabase phone OTP sign-up).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Users may pick rider/driver/courier/restaurant themselves; only admins (or the service role) can grant admin.
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' and (old.role is distinct from 'admin') and coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'cannot grant admin' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles for each row execute function public.protect_profile_role();

-- Vehicle verification and driver document checks are admin-only.
create or replace function public.protect_verification_flags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    if tg_table_name = 'vehicles' then
      if tg_op = 'INSERT' then new.verified := false; else new.verified := old.verified; end if;
    end if;
  end if;
  return new;
end $$;
create trigger vehicles_protect before insert or update on public.vehicles for each row execute function public.protect_verification_flags();

-- Driver sign-up (creates the drivers row in 'offline', unverified state).
create or replace function public.register_driver(p_vehicle_type public.vehicle_type, p_make_model text, p_plate text,
  p_color text default null, p_is_courier boolean default false)
returns public.drivers language plpgsql security definer set search_path = public as $$
declare v_id uuid; d public.drivers;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.vehicles (owner_id, type, make_model, plate, color)
  values (auth.uid(), p_vehicle_type, p_make_model, upper(trim(p_plate)), p_color) returning id into v_id;
  insert into public.drivers (id, vehicle_id, vehicle_type, is_courier)
  values (auth.uid(), v_id, p_vehicle_type, p_is_courier)
  on conflict (id) do update set vehicle_id = excluded.vehicle_id, vehicle_type = excluded.vehicle_type,
    is_courier = excluded.is_courier, documents_verified = false
  returning * into d;
  update public.profiles set role = case when p_is_courier then 'courier'::public.app_role else 'driver'::public.app_role end
  where id = auth.uid() and role <> 'admin';
  return d;
end $$;

-- Public read helpers for the app (lat/lng instead of raw geography).
create or replace view public.restaurants_public with (security_invoker = true) as
  select r.id, r.name, r.city_id, r.address, r.tags, r.emoji, r.is_open,
         extensions.st_y(r.location::extensions.geometry) as lat, extensions.st_x(r.location::extensions.geometry) as lng
  from public.restaurants r;

create or replace function public.restaurants_near(p_lat double precision, p_lng double precision, p_radius_km numeric default 25)
returns table (id uuid, name text, city_id text, tags text, emoji text, is_open boolean, lat double precision, lng double precision, distance_km numeric, delivery_fee_xaf integer)
language sql stable set search_path = public, extensions as $$
  select r.id, r.name, r.city_id, r.tags, r.emoji, r.is_open,
         extensions.st_y(r.location::extensions.geometry), extensions.st_x(r.location::extensions.geometry),
         round((extensions.st_distance(r.location, public.make_point(p_lat, p_lng)) / 1000.0)::numeric, 2),
         public.delivery_fee((extensions.st_distance(r.location, public.make_point(p_lat, p_lng)) / 1000.0 * 1.3)::numeric)
  from public.restaurants r
  where extensions.st_dwithin(r.location, public.make_point(p_lat, p_lng), p_radius_km * 1000)
  order by r.location operator(extensions.<->) public.make_point(p_lat, p_lng)
  limit 100;
$$;

-- Lat/lng of a driver for map display, only to the rider/customer currently served by that driver.
create or replace function public.driver_position(p_driver_id uuid)
returns table (lat double precision, lng double precision, heading real, updated_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select extensions.st_y(d.location::extensions.geometry), extensions.st_x(d.location::extensions.geometry), d.heading, d.location_updated_at
  from public.drivers d
  where d.id = p_driver_id and (
    d.id = auth.uid() or public.is_admin()
    or exists (select 1 from public.trips t where t.driver_id = d.id and t.rider_id = auth.uid() and t.status in ('accepted', 'arrived', 'in_progress'))
    or exists (select 1 from public.orders o where o.courier_id = d.id and o.customer_id = auth.uid() and o.status in ('accepted', 'preparing', 'ready', 'picked_up'))
  );
$$;

create or replace function public.nearest_city(p_lat double precision, p_lng double precision)
returns text language sql stable set search_path = public, extensions as $$
  select c.id from public.cities c order by c.location operator(extensions.<->) public.make_point(p_lat, p_lng) limit 1;
$$;
