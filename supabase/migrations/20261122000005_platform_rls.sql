-- RLS for the platform tables (default deny; admin dashboard uses an admin-role JWT).

alter table public.platform_settings enable row level security;
alter table public.admin_audit enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;
alter table public.driver_documents enable row level security;
alter table public.city_rate_cards enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.restaurant_ratings enable row level security;
alter table public.sos_events enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.refunds enable row level security;
alter table public.payout_requests enable row level security;

-- Settings: readable by signed-in users (app shows min payout), editable by admins.
create policy "settings readable" on public.platform_settings for select to authenticated using (true);
create policy "settings admin" on public.platform_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "audit admin read" on public.admin_audit for select to authenticated using (public.is_admin());

create policy "own push tokens" on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy "own push tokens delete" on public.push_tokens for delete to authenticated using (user_id = auth.uid());

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "own documents read" on public.driver_documents for select to authenticated using (driver_id = auth.uid() or public.is_admin());
create policy "own documents insert" on public.driver_documents for insert to authenticated with check (driver_id = auth.uid());

create policy "city rates readable" on public.city_rate_cards for select to anon, authenticated using (true);
create policy "city rates admin" on public.city_rate_cards for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "promo admin" on public.promo_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "own redemptions" on public.promo_redemptions for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "restaurant ratings readable" on public.restaurant_ratings for select to anon, authenticated using (true);

create policy "own sos" on public.sos_events for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "sos admin update" on public.sos_events for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own tickets" on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "create ticket" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy "tickets admin update" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Ledger: holders read their own wallet accounts (statements go through my_ledger); admins read all.
create policy "ledger accounts own" on public.ledger_accounts for select to authenticated using (
  public.is_admin() or owner_id = auth.uid()
  or exists (select 1 from public.restaurants r where r.id = ledger_accounts.restaurant_id and r.owner_id = auth.uid()));
create policy "ledger tx admin" on public.ledger_transactions for select to authenticated using (public.is_admin());
create policy "ledger entries admin" on public.ledger_entries for select to authenticated using (public.is_admin());

create policy "refunds read" on public.refunds for select to authenticated using (
  public.is_admin() or exists (select 1 from public.payments p where p.id = refunds.payment_id and p.payer_id = auth.uid()));

create policy "payouts read" on public.payout_requests for select to authenticated using (requested_by = auth.uid() or public.is_admin());

-- Admin access to existing tables.
create policy "admin restaurants" on public.restaurants for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin menu" on public.menu_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin ratings" on public.ratings for select to authenticated using (public.is_admin());
create policy "admin vehicles" on public.vehicles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin order items" on public.order_items for select to authenticated using (public.is_admin());

-- Admins may edit rate cards and settings columns directly; RPCs cover everything else.
grant select, insert, update, delete on public.city_rate_cards, public.promo_codes to authenticated;
grant select, update on public.platform_settings, public.sos_events to authenticated;

-- Realtime: in-app notification feed.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.payout_requests;
  end if;
end $$;

-- Starter promo code (edit/disable in the admin dashboard).
insert into public.promo_codes (code, description, kind, value, max_discount_xaf, min_amount_xaf, applies_to, per_user_limit)
values ('BIENVENUE', 'Bienvenue sur CamRide : -20% (max 1 000 FCFA) sur votre première course ou commande', 'percent', 20, 1000, 500, 'any', 1)
on conflict (code) do nothing;
