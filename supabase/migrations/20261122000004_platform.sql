-- CamRide platform features:
--   settings, suspension, admin audit, push tokens + notification outbox (with triggers),
--   driver documents (+ private Storage bucket), per-city rate cards, promo codes,
--   restaurant ratings, SOS, support tickets, routes on trips, share links,
--   double-entry ledger (wallets, commission, settlement), refunds, payouts,
--   SQL matching + scheduler (pg_cron when available).

-- =====================================================================
-- Settings
-- =====================================================================
create table public.platform_settings (
  key text primary key,
  value numeric not null,
  description text,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value, description) values
  ('commission_ride_pct', 15, 'Platform commission on ride fares (%)'),
  ('commission_food_pct', 12, 'Platform commission on food subtotals (%)'),
  ('commission_delivery_pct', 15, 'Platform commission on delivery fees (%)'),
  ('min_payout_xaf', 1000, 'Minimum payout request (FCFA)'),
  ('offer_ttl_seconds', 30, 'Seconds a driver/courier has to accept an offer'),
  ('search_radius_m', 5000, 'Driver search radius (metres)'),
  ('give_up_minutes', 5, 'Minutes before an unmatched ride request becomes no_drivers');

create or replace function public.setting(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select value from public.platform_settings where key = p_key;
$$;

create or replace function public.fcfa(p_amount bigint) returns text language sql immutable as $$
  select replace(to_char(p_amount, 'FM999,999,999,990'), ',', ' ') || ' FCFA';
$$;

create or replace function public.assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin only' using errcode = '42501';
  end if;
end $$;

-- =====================================================================
-- Admin audit + suspension
-- =====================================================================
create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.audit(p_action text, p_type text, p_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit (admin_id, action, target_type, target_id, details) values (auth.uid(), p_action, p_type, p_id, p_details);
$$;

alter table public.profiles
  add column suspended boolean not null default false,
  add column suspended_reason text,
  add column accepted_terms_at timestamptz;
grant update (accepted_terms_at) on public.profiles to authenticated;

-- Suspended drivers cannot go online; a suspended driver finishing a job goes offline.
create or replace function public.block_suspended_driver() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'offline' and new.status is distinct from old.status
     and exists (select 1 from public.profiles where id = new.id and suspended) then
    if old.status = 'busy' then new.status := 'offline';
    else raise exception 'account suspended' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger drivers_block_suspended before update of status on public.drivers
  for each row execute function public.block_suspended_driver();

create or replace function public.admin_set_suspended(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.profiles set suspended = p_suspended, suspended_reason = case when p_suspended then p_reason end where id = p_user_id;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if p_suspended then update public.drivers set status = 'offline' where id = p_user_id and status = 'available'; end if;
  perform public.audit(case when p_suspended then 'suspend' else 'unsuspend' end, 'profile', p_user_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.profiles set role = p_role where id = p_user_id;
  perform public.audit('set_role', 'profile', p_user_id::text, jsonb_build_object('role', p_role));
end $$;

-- =====================================================================
-- Push tokens + notification outbox
-- =====================================================================
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' then raise exception 'invalid Expo push token' using errcode = '22023'; end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'no_tokens')),
  attempts integer not null default 0,
  error text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_pending_idx on public.notifications (created_at) where status = 'pending';
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Queues a push in the user's language. Delivered by the `notify` Edge Function.
create or replace function public.notify_user(p_user uuid, p_kind text, p_title_en text, p_body_en text,
  p_title_fr text, p_body_fr text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_lang text;
begin
  if p_user is null then return; end if;
  select lang into v_lang from public.profiles where id = p_user;
  insert into public.notifications (user_id, kind, title, body, data)
  values (p_user, p_kind,
          case when v_lang = 'en' then p_title_en else p_title_fr end,
          case when v_lang = 'en' then p_body_en else p_body_fr end,
          coalesce(p_data, '{}'));
end $$;

create or replace function public.notify_admins(p_kind text, p_title text, p_body text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, data)
  select id, p_kind, p_title, p_body, coalesce(p_data, '{}') from public.profiles where role = 'admin';
$$;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- =====================================================================
-- Driver documents (+ private Storage bucket)
-- =====================================================================
create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null check (doc_type in ('id_card', 'driving_licence', 'vehicle_registration', 'insurance', 'profile_photo')),
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint driver_documents_own_folder check (storage_path like driver_id::text || '/%')
);
create index driver_documents_driver_idx on public.driver_documents (driver_id, doc_type, created_at desc);

create or replace function public.protect_document_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    new.status := 'pending'; new.reviewer_note := null; new.reviewed_by := null; new.reviewed_at := null;
  end if;
  return new;
end $$;
create trigger driver_documents_protect before insert on public.driver_documents
  for each row execute function public.protect_document_review();

create or replace function public.required_documents(p_driver uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case when d.is_courier then array['id_card', 'driving_licence', 'profile_photo']
              else array['id_card', 'driving_licence', 'vehicle_registration', 'insurance', 'profile_photo'] end
  from public.drivers d where d.id = p_driver;
$$;

-- Latest document per type with its review status (driver app and admin).
create or replace function public.driver_document_status(p_driver uuid default null)
returns table (doc_type text, required boolean, status text, document_id uuid, storage_path text, reviewer_note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with who as (select coalesce(p_driver, auth.uid()) as id),
  req as (select unnest(coalesce(public.required_documents((select id from who)), array[]::text[])) as doc_type),
  latest as (
    select distinct on (dd.doc_type) dd.* from public.driver_documents dd
    where dd.driver_id = (select id from who) order by dd.doc_type, dd.created_at desc)
  select coalesce(r.doc_type, l.doc_type), r.doc_type is not null, coalesce(l.status, 'missing'), l.id, l.storage_path, l.reviewer_note, l.created_at
  from req r full join latest l on l.doc_type = r.doc_type
  where (select id from who) = auth.uid() or public.is_admin() or coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.admin_set_driver_verified(p_driver uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_missing int;
begin
  perform public.assert_admin();
  if p_verified then
    select count(*) into v_missing from public.driver_document_status(p_driver) s where s.required and s.status <> 'approved';
    if v_missing > 0 then raise exception '% required document(s) not approved', v_missing using errcode = '55000'; end if;
  end if;
  update public.drivers set documents_verified = p_verified, status = case when p_verified then status else 'offline' end where id = p_driver;
  if not found then raise exception 'driver not found' using errcode = 'P0002'; end if;
  update public.vehicles v set verified = p_verified from public.drivers d where d.id = p_driver and v.id = d.vehicle_id;
  perform public.audit(case when p_verified then 'verify_driver' else 'unverify_driver' end, 'driver', p_driver::text);
  if p_verified then
    perform public.notify_user(p_driver, 'driver_verified', 'You are approved', 'Your documents were approved. You can go online now.',
      'Compte validé', 'Vos documents sont validés. Vous pouvez vous connecter.', jsonb_build_object('url', '/driver'));
  end if;
end $$;

create or replace function public.admin_review_document(p_document_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d public.driver_documents; v_missing int;
begin
  perform public.assert_admin();
  update public.driver_documents set status = case when p_approve then 'approved' else 'rejected' end,
    reviewer_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_document_id returning * into d;
  if not found then raise exception 'document not found' using errcode = 'P0002'; end if;
  perform public.audit(case when p_approve then 'approve_document' else 'reject_document' end, 'driver_document', p_document_id::text, jsonb_build_object('note', p_note));
  if not p_approve then
    perform public.notify_user(d.driver_id, 'document_rejected', 'Document rejected',
      coalesce(p_note, 'Please upload a clearer copy.'), 'Document refusé', coalesce(p_note, 'Merci d''envoyer une copie plus lisible.'),
      jsonb_build_object('url', '/driver/documents'));
    return;
  end if;
  -- All required documents approved -> verify the driver automatically.
  select count(*) into v_missing from public.driver_document_status(d.driver_id) s where s.required and s.status <> 'approved';
  if v_missing = 0 and exists (select 1 from public.drivers where id = d.driver_id and not documents_verified) then
    perform public.admin_set_driver_verified(d.driver_id, true);
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('driver-documents', 'driver-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;
    execute $p$create policy "driver docs: upload to own folder" on storage.objects for insert to authenticated
      with check (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "driver docs: read own or admin" on storage.objects for select to authenticated
      using (bucket_id = 'driver-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$p$;
    execute $p$create policy "driver docs: admin delete" on storage.objects for delete to authenticated
      using (bucket_id = 'driver-documents' and public.is_admin())$p$;
  end if;
end $$;

-- =====================================================================
-- Per-city rate cards
-- =====================================================================
create table public.city_rate_cards (
  city_id text not null references public.cities(id) on delete cascade,
  key text not null references public.rate_cards(key) on delete cascade,
  base_xaf integer not null check (base_xaf >= 0),
  per_km_xaf integer not null check (per_km_xaf >= 0),
  per_min_xaf integer not null default 0 check (per_min_xaf >= 0),
  minimum_xaf integer not null check (minimum_xaf >= 0),
  max_distance_km numeric,
  updated_at timestamptz not null default now(),
  primary key (city_id, key)
);

create or replace function public.effective_rate_card(p_key text, p_city text default null)
returns table (key text, base_xaf integer, per_km_xaf integer, per_min_xaf integer, minimum_xaf integer, max_distance_km numeric, city_id text)
language sql stable set search_path = public as $$
  select x.key, x.base_xaf, x.per_km_xaf, x.per_min_xaf, x.minimum_xaf, x.max_distance_km, x.city_id from (
    select c.key, c.base_xaf, c.per_km_xaf, c.per_min_xaf, c.minimum_xaf, c.max_distance_km, c.city_id, 0 as prio
    from public.city_rate_cards c where c.key = p_key and c.city_id = p_city
    union all
    select r.key, r.base_xaf, r.per_km_xaf, r.per_min_xaf, r.minimum_xaf, r.max_distance_km, null::text, 1
    from public.rate_cards r where r.key = p_key
  ) x order by x.prio limit 1;
$$;

drop function public.fare_quote(text, numeric, numeric);
create or replace function public.fare_quote(p_key text, p_distance_km numeric, p_duration_min numeric, p_city text default null)
returns integer language plpgsql stable set search_path = public as $$
declare rc record;
begin
  select * into rc from public.effective_rate_card(p_key, p_city);
  if not found then raise exception 'unknown rate card %', p_key using errcode = '22023'; end if;
  if p_distance_km < 0 or p_duration_min < 0 then raise exception 'negative distance/duration' using errcode = '22023'; end if;
  return public.round_xaf(greatest(rc.minimum_xaf, rc.base_xaf + rc.per_km_xaf * p_distance_km + rc.per_min_xaf * p_duration_min));
end $$;

drop function public.delivery_fee(numeric);
create or replace function public.delivery_fee(p_distance_km numeric, p_city text default null)
returns integer language sql stable set search_path = public as $$
  select public.fare_quote('delivery', p_distance_km, 0, p_city);
$$;

-- Quotes for every ride type from a route computed server-side (OSRM or estimate).
create or replace function public.quote_route(p_city text, p_distance_km numeric, p_duration_min numeric)
returns table (vehicle_type text, distance_km numeric, duration_min numeric, fare_xaf integer, max_distance_km numeric)
language sql stable set search_path = public as $$
  select v::text, round(p_distance_km, 2), round(p_duration_min, 1),
         public.fare_quote(v::text, p_distance_km, p_duration_min, p_city),
         (select e.max_distance_km from public.effective_rate_card(v::text, p_city) e)
  from unnest(enum_range(null::public.vehicle_type)) as v;
$$;

create or replace function public.quote_trip(p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_lat double precision, p_dropoff_lng double precision)
returns table (vehicle_type text, distance_km numeric, duration_min numeric, fare_xaf integer)
language plpgsql stable set search_path = public, extensions as $$
declare r record; v_city text;
begin
  if not public.in_cameroon(p_pickup_lat, p_pickup_lng) or not public.in_cameroon(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'pickup and dropoff must be in Cameroon' using errcode = '22023';
  end if;
  select * into r from public.estimate_route(public.make_point(p_pickup_lat, p_pickup_lng), public.make_point(p_dropoff_lat, p_dropoff_lng));
  v_city := public.nearest_city(p_pickup_lat, p_pickup_lng);
  return query select q.vehicle_type, q.distance_km, q.duration_min, q.fare_xaf from public.quote_route(v_city, r.distance_km, r.duration_min) q;
end $$;

-- =====================================================================
-- Trips / orders / restaurants: new columns
-- =====================================================================
alter table public.trips
  add column promo_code text,
  add column discount_xaf integer not null default 0 check (discount_xaf >= 0),
  add column amount_due_xaf integer generated always as (fare_xaf - discount_xaf) stored,
  add column route_polyline text,
  add column route_source text,
  add column share_token uuid not null default gen_random_uuid(),
  add constraint trips_discount_lt_fare check (discount_xaf < fare_xaf);
create unique index trips_share_token_uq on public.trips (share_token);

alter table public.orders
  add column promo_code text,
  add column discount_xaf integer not null default 0 check (discount_xaf >= 0),
  add constraint orders_total_matches check (total_xaf = subtotal_xaf + delivery_fee_xaf - discount_xaf);

alter table public.restaurants
  add column active boolean not null default true,
  add column rating_avg numeric(3, 2) not null default 5.00,
  add column rating_count integer not null default 0;

-- Owners cannot re-activate a restaurant disabled by an admin, nor edit ratings.
create or replace function public.protect_restaurant_flags() returns trigger
language plpgsql set search_path = public as $$  -- invoker rights: current_user is the writing role
begin
  -- Only direct client writes are restricted; SECURITY DEFINER RPCs (e.g. rate_order) run as the owner.
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then new.active := true; new.rating_avg := 5.00; new.rating_count := 0;
    else new.active := old.active; new.rating_avg := old.rating_avg; new.rating_count := old.rating_count;
    end if;
  end if;
  return new;
end $$;
create trigger restaurants_protect before insert or update on public.restaurants
  for each row execute function public.protect_restaurant_flags();

create or replace view public.restaurants_public with (security_invoker = true) as
  select r.id, r.name, r.city_id, r.address, r.tags, r.emoji, r.is_open,
         extensions.st_y(r.location::extensions.geometry) as lat, extensions.st_x(r.location::extensions.geometry) as lng,
         r.active, r.rating_avg, r.rating_count
  from public.restaurants r;

drop function public.restaurants_near(double precision, double precision, numeric);
create or replace function public.restaurants_near(p_lat double precision, p_lng double precision, p_radius_km numeric default 25)
returns table (id uuid, name text, city_id text, tags text, emoji text, is_open boolean, lat double precision, lng double precision,
  distance_km numeric, delivery_fee_xaf integer, rating_avg numeric, rating_count integer)
language sql stable set search_path = public, extensions as $$
  select r.id, r.name, r.city_id, r.tags, r.emoji, r.is_open,
         extensions.st_y(r.location::extensions.geometry), extensions.st_x(r.location::extensions.geometry),
         round((extensions.st_distance(r.location, public.make_point(p_lat, p_lng)) / 1000.0)::numeric, 2),
         public.delivery_fee((extensions.st_distance(r.location, public.make_point(p_lat, p_lng)) / 1000.0 * 1.3)::numeric, r.city_id),
         r.rating_avg, r.rating_count
  from public.restaurants r
  where r.active and extensions.st_dwithin(r.location, public.make_point(p_lat, p_lng), p_radius_km * 1000)
  order by r.location operator(extensions.<->) public.make_point(p_lat, p_lng)
  limit 100;
$$;

-- =====================================================================
-- Promo codes
-- =====================================================================
create table public.promo_codes (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,20}$'),
  description text,
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  max_discount_xaf integer check (max_discount_xaf > 0),
  min_amount_xaf integer not null default 0,
  applies_to text not null default 'any' check (applies_to in ('ride', 'food', 'any')),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions > 0),
  per_user_limit integer not null default 1 check (per_user_limit > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promo_percent_max check (kind <> 'percent' or value <= 100)
);

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.promo_codes(code),
  user_id uuid not null references public.profiles(id),
  trip_id uuid references public.trips(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  discount_xaf integer not null check (discount_xaf >= 0),
  created_at timestamptz not null default now()
);
create index promo_redemptions_code_user_idx on public.promo_redemptions (code, user_id);

-- Discount for a user/scope/amount, or an exception explaining why the code is not valid.
-- The customer always pays at least 100 FCFA; discounts are rounded down to 50 FCFA.
create or replace function public.promo_quote(p_code text, p_user uuid, p_scope text, p_amount integer)
returns integer language plpgsql stable security definer set search_path = public as $$
declare p public.promo_codes; v_used int; v_total int; d numeric;
begin
  select * into p from public.promo_codes where code = upper(trim(coalesce(p_code, '')));
  if not found or not p.active then raise exception 'invalid promo code' using errcode = '22023'; end if;
  if (p.starts_at is not null and now() < p.starts_at) or (p.ends_at is not null and now() > p.ends_at) then
    raise exception 'promo code expired' using errcode = '22023';
  end if;
  if p.applies_to <> 'any' and p.applies_to <> p_scope then raise exception 'promo code not valid for this service' using errcode = '22023'; end if;
  if p_amount < p.min_amount_xaf then raise exception 'promo code needs a minimum of %', public.fcfa(p.min_amount_xaf) using errcode = '22023'; end if;
  select count(*) into v_used from public.promo_redemptions where code = p.code and user_id = p_user;
  if v_used >= p.per_user_limit then raise exception 'promo code already used' using errcode = '22023'; end if;
  if p.max_redemptions is not null then
    select count(*) into v_total from public.promo_redemptions where code = p.code;
    if v_total >= p.max_redemptions then raise exception 'promo code fully redeemed' using errcode = '22023'; end if;
  end if;
  d := case when p.kind = 'percent' then p_amount * p.value / 100.0 else p.value end;
  if p.max_discount_xaf is not null then d := least(d, p.max_discount_xaf); end if;
  d := least(d, p_amount - 100);
  return greatest(0, floor(d / 50) * 50)::integer;
end $$;

-- Preview for the signed-in user (the app shows the discount before booking).
create or replace function public.check_promo(p_code text, p_scope text, p_amount integer)
returns integer language sql stable security definer set search_path = public as $$
  select public.promo_quote(p_code, auth.uid(), p_scope, p_amount);
$$;

-- Records a redemption under a row lock (re-validates limits). Called by Edge Functions.
create or replace function public.redeem_promo(p_code text, p_user uuid, p_scope text, p_amount integer,
  p_trip_id uuid default null, p_order_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare d integer;
begin
  perform 1 from public.promo_codes where code = upper(trim(p_code)) for update;
  d := public.promo_quote(p_code, p_user, p_scope, p_amount);
  insert into public.promo_redemptions (code, user_id, trip_id, order_id, discount_xaf)
  values (upper(trim(p_code)), p_user, p_trip_id, p_order_id, d);
  return d;
end $$;

-- =====================================================================
-- Restaurant ratings, SOS, support tickets
-- =====================================================================
create table public.restaurant_ratings (
  order_id uuid primary key references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rater_id uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  comment text check (length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index restaurant_ratings_restaurant_idx on public.restaurant_ratings (restaurant_id, created_at desc);

create or replace function public.rate_order(p_order_id uuid, p_restaurant_stars smallint, p_courier_stars smallint default null, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.customer_id <> auth.uid() then raise exception 'not your order' using errcode = '42501'; end if;
  if o.status <> 'delivered' then raise exception 'order not delivered' using errcode = '55000'; end if;
  insert into public.restaurant_ratings (order_id, restaurant_id, rater_id, stars, comment)
  values (o.id, o.restaurant_id, auth.uid(), p_restaurant_stars, p_comment);
  update public.restaurants set
    rating_avg = round(((rating_avg * rating_count) + p_restaurant_stars) / (rating_count + 1), 2),
    rating_count = rating_count + 1
  where id = o.restaurant_id;
  if p_courier_stars is not null and o.courier_id is not null then
    insert into public.ratings (order_id, rater_id, ratee_id, stars) values (o.id, auth.uid(), o.courier_id, p_courier_stars);
    update public.drivers set
      rating_avg = round(((rating_avg * rating_count) + p_courier_stars) / (rating_count + 1), 2),
      rating_count = rating_count + 1
    where id = o.courier_id;
  end if;
end $$;

create table public.sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  trip_id uuid references public.trips(id),
  lat double precision,
  lng double precision,
  note text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.trigger_sos(p_trip_id uuid default null, p_lat double precision default null,
  p_lng double precision default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; t public.trips;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_trip_id is not null then
    select * into t from public.trips where id = p_trip_id;
    if not found or (t.rider_id <> auth.uid() and t.driver_id is distinct from auth.uid()) then
      raise exception 'not your trip' using errcode = '42501';
    end if;
  end if;
  insert into public.sos_events (user_id, trip_id, lat, lng, note) values (auth.uid(), p_trip_id, p_lat, p_lng, left(p_note, 500))
  returning id into v_id;
  perform public.notify_admins('sos', 'SOS alert', format('SOS from a user%s. Open the admin dashboard.',
    case when p_trip_id is not null then ' on trip ' || left(p_trip_id::text, 8) else '' end),
    jsonb_build_object('sos_id', v_id, 'trip_id', p_trip_id));
  return v_id;
end $$;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  subject text not null check (length(subject) between 3 and 120),
  message text not null check (length(message) between 1 and 4000),
  trip_id uuid references public.trips(id),
  order_id uuid references public.orders(id),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger support_tickets_touch before update on public.support_tickets for each row execute function public.touch_updated_at();

create or replace function public.protect_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    new.status := 'open'; new.admin_reply := null; new.user_id := auth.uid();
  end if;
  return new;
end $$;
create trigger support_tickets_protect before insert on public.support_tickets for each row execute function public.protect_ticket();

create or replace function public.notify_ticket_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.admin_reply is not null and new.admin_reply is distinct from old.admin_reply then
    perform public.notify_user(new.user_id, 'support_reply', 'Support replied', left(new.admin_reply, 140),
      'Réponse du support', left(new.admin_reply, 140), jsonb_build_object('url', '/support'));
  end if;
  return null;
end $$;
create trigger support_tickets_reply after update on public.support_tickets for each row execute function public.notify_ticket_reply();

-- =====================================================================
-- Double-entry ledger
-- Convention: amount_xaf > 0 is a debit, < 0 a credit; every transaction sums to zero.
-- Wallet balance (what CamRide owes the holder) = -(sum of entries).
-- =====================================================================
create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('psp_clearing', 'customer_deposits', 'platform_revenue', 'platform_promotions',
    'payouts_pending', 'adjustments', 'driver_wallet', 'restaurant_wallet')),
  owner_id uuid references public.profiles(id) on delete restrict,
  restaurant_id uuid references public.restaurants(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ledger_accounts_owner check (
    (kind = 'driver_wallet' and owner_id is not null and restaurant_id is null)
    or (kind = 'restaurant_wallet' and restaurant_id is not null and owner_id is null)
    or (kind not in ('driver_wallet', 'restaurant_wallet') and owner_id is null and restaurant_id is null))
);
create unique index ledger_accounts_uq on public.ledger_accounts (kind, owner_id, restaurant_id) nulls not distinct;

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('payment_received', 'trip_settlement', 'order_settlement', 'refund',
    'payout_hold', 'payout_release', 'payout_paid', 'adjustment')),
  trip_id uuid references public.trips(id),
  order_id uuid references public.orders(id),
  payment_id uuid references public.payments(id),
  refund_id uuid,
  payout_id uuid,
  memo text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index ledger_tx_trip_settlement_uq on public.ledger_transactions (trip_id) where kind = 'trip_settlement';
create unique index ledger_tx_order_settlement_uq on public.ledger_transactions (order_id) where kind = 'order_settlement';
create unique index ledger_tx_payment_received_uq on public.ledger_transactions (payment_id) where kind = 'payment_received';
create unique index ledger_tx_refund_uq on public.ledger_transactions (refund_id) where kind = 'refund';
create unique index ledger_tx_payout_uq on public.ledger_transactions (kind, payout_id) where payout_id is not null;

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions(id),
  account_id uuid not null references public.ledger_accounts(id),
  amount_xaf bigint not null check (amount_xaf <> 0),
  created_at timestamptz not null default now()
);
create index ledger_entries_account_idx on public.ledger_entries (account_id, created_at desc);
create index ledger_entries_tx_idx on public.ledger_entries (transaction_id);

create or replace function public.ledger_check_balanced() returns trigger language plpgsql as $$
declare s bigint;
begin
  select coalesce(sum(amount_xaf), 0) into s from public.ledger_entries where transaction_id = new.transaction_id;
  if s <> 0 then raise exception 'ledger transaction % is unbalanced by %', new.transaction_id, s using errcode = '23514'; end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced after insert on public.ledger_entries
  deferrable initially deferred for each row execute function public.ledger_check_balanced();

create or replace function public.ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'the ledger is append-only' using errcode = '55000'; end $$;
create trigger ledger_entries_immutable before update or delete on public.ledger_entries for each row execute function public.ledger_immutable();
create trigger ledger_transactions_immutable before update or delete on public.ledger_transactions for each row execute function public.ledger_immutable();

-- Get-or-create an account.
create or replace function public.acct(p_kind text, p_owner uuid default null, p_restaurant uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.ledger_accounts
  where kind = p_kind and owner_id is not distinct from p_owner and restaurant_id is not distinct from p_restaurant;
  if v is null then
    insert into public.ledger_accounts (kind, owner_id, restaurant_id) values (p_kind, p_owner, p_restaurant)
    on conflict (kind, owner_id, restaurant_id) do nothing returning id into v;
    if v is null then
      select id into v from public.ledger_accounts
      where kind = p_kind and owner_id is not distinct from p_owner and restaurant_id is not distinct from p_restaurant;
    end if;
  end if;
  return v;
end $$;

create or replace function public.entry(p_account uuid, p_amount bigint) returns jsonb language sql immutable as $$
  select jsonb_build_object('account', p_account, 'amount', p_amount);
$$;

-- Posts a balanced transaction. p_entries: jsonb array of entry(account, amount); zero lines are dropped.
create or replace function public.ledger_post(p_kind text, p_entries jsonb, p_trip uuid default null, p_order uuid default null,
  p_payment uuid default null, p_refund uuid default null, p_payout uuid default null, p_memo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_sum bigint;
begin
  select coalesce(sum((x->>'amount')::bigint), 0) into v_sum from jsonb_array_elements(p_entries) x;
  if v_sum <> 0 then raise exception 'unbalanced ledger transaction (%): %', p_kind, v_sum using errcode = '23514'; end if;
  insert into public.ledger_transactions (kind, trip_id, order_id, payment_id, refund_id, payout_id, memo, created_by)
  values (p_kind, p_trip, p_order, p_payment, p_refund, p_payout, p_memo, auth.uid()) returning id into v_tx;
  insert into public.ledger_entries (transaction_id, account_id, amount_xaf)
  select v_tx, (x->>'account')::uuid, sum((x->>'amount')::bigint)
  from jsonb_array_elements(p_entries) x group by (x->>'account')::uuid having sum((x->>'amount')::bigint) <> 0;
  return v_tx;
end $$;

create or replace function public.wallet_balance(p_account uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(-sum(amount_xaf), 0)::bigint from public.ledger_entries where account_id = p_account;
$$;

create or replace function public.commission(p_amount integer, p_key text) returns integer
language sql stable set search_path = public as $$
  select round(p_amount * coalesce(public.setting(p_key), 0) / 100.0)::integer;
$$;

-- Customer money received by the payment provider (mobile money). Cash never touches the PSP.
create or replace function public.post_payment_received(p_payment_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id;
  if not found or p.status <> 'successful' or p.method = 'cash' then return null; end if;
  if exists (select 1 from public.ledger_transactions where kind = 'payment_received' and payment_id = p.id) then return null; end if;
  return public.ledger_post('payment_received', jsonb_build_array(
    public.entry(public.acct('psp_clearing'), p.amount_xaf),
    public.entry(public.acct('customer_deposits'), -p.amount_xaf)), p_payment => p.id,
    p_memo => p.provider || coalesce(' ' || p.provider_ref, ''));
end $$;

-- Trip earnings split. Fare F, discount D (platform-funded), commission C = pct(F):
--   mobile money: customer_deposits +(F-D), promotions +D, revenue -C, driver_wallet -(F-C)
--   cash:         promotions +D, revenue -C, driver_wallet +(C-D)   (the driver kept F-D in cash)
create or replace function public.settle_trip(p_trip_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t public.trips; c integer; v_wallet uuid;
begin
  select * into t from public.trips where id = p_trip_id;
  if not found or t.status <> 'completed' or t.payment_status <> 'paid' or t.driver_id is null then return null; end if;
  if exists (select 1 from public.ledger_transactions where kind = 'trip_settlement' and trip_id = t.id) then return null; end if;
  c := public.commission(t.fare_xaf, 'commission_ride_pct');
  v_wallet := public.acct('driver_wallet', t.driver_id);
  if t.payment_method = 'cash' then
    return public.ledger_post('trip_settlement', jsonb_build_array(
      public.entry(public.acct('platform_promotions'), t.discount_xaf),
      public.entry(public.acct('platform_revenue'), -c),
      public.entry(v_wallet, c - t.discount_xaf)), p_trip => t.id, p_memo => 'cash trip');
  end if;
  return public.ledger_post('trip_settlement', jsonb_build_array(
    public.entry(public.acct('customer_deposits'), t.fare_xaf - t.discount_xaf),
    public.entry(public.acct('platform_promotions'), t.discount_xaf),
    public.entry(public.acct('platform_revenue'), -c),
    public.entry(v_wallet, -(t.fare_xaf - c))), p_trip => t.id, p_memo => 'mobile money trip');
end $$;

-- Order split. Subtotal S, fee Fe, discount D, paid P = S+Fe-D; restaurant gets S-pct(S), courier Fe-pct(Fe).
create or replace function public.settle_order(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.orders; cf integer; cd integer; v_courier uuid;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.status <> 'delivered' or o.payment_status <> 'paid' or o.courier_id is null then return null; end if;
  if exists (select 1 from public.ledger_transactions where kind = 'order_settlement' and order_id = o.id) then return null; end if;
  cf := public.commission(o.subtotal_xaf, 'commission_food_pct');
  cd := public.commission(o.delivery_fee_xaf, 'commission_delivery_pct');
  v_courier := public.acct('driver_wallet', o.courier_id);
  return public.ledger_post('order_settlement', jsonb_build_array(
    case when o.payment_method = 'cash' then public.entry(v_courier, o.total_xaf)   -- courier holds the cash
         else public.entry(public.acct('customer_deposits'), o.total_xaf) end,
    public.entry(public.acct('platform_promotions'), o.discount_xaf),
    public.entry(public.acct('restaurant_wallet', null, o.restaurant_id), -(o.subtotal_xaf - cf)),
    public.entry(v_courier, -(o.delivery_fee_xaf - cd)),
    public.entry(public.acct('platform_revenue'), -(cf + cd))), p_order => o.id, p_memo => o.payment_method || ' order');
end $$;

create or replace function public.admin_adjust_wallet(p_account uuid, p_amount bigint, p_memo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform public.assert_admin();
  if p_memo is null or length(trim(p_memo)) < 3 then raise exception 'memo required' using errcode = '22023'; end if;
  v := public.ledger_post('adjustment', jsonb_build_array(public.entry(p_account, -p_amount), public.entry(public.acct('adjustments'), p_amount)), p_memo => p_memo);
  perform public.audit('adjust_wallet', 'ledger_account', p_account::text, jsonb_build_object('amount', p_amount, 'memo', p_memo));
  return v;
end $$;

create or replace view public.admin_account_balances with (security_invoker = true) as
  select a.id, a.kind, a.owner_id, a.restaurant_id, coalesce(r.name, p.full_name) as label,
         coalesce(sum(e.amount_xaf), 0)::bigint as debit_balance_xaf,
         (-coalesce(sum(e.amount_xaf), 0))::bigint as credit_balance_xaf
  from public.ledger_accounts a
  left join public.ledger_entries e on e.account_id = a.id
  left join public.restaurants r on r.id = a.restaurant_id
  left join public.profiles p on p.id = a.owner_id
  group by a.id, r.name, p.full_name;

-- =====================================================================
-- Refunds (mobile money only; paid back to the payer's number through the provider)
-- =====================================================================
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  amount_xaf integer not null check (amount_xaf > 0),
  reason text not null,
  phone text not null,
  method public.pay_method not null check (method <> 'cash'),
  status text not null default 'requested' check (status in ('requested', 'processing', 'succeeded', 'failed')),
  provider text,
  provider_ref text,
  failure_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_payment_idx on public.refunds (payment_id);
create trigger refunds_touch before update on public.refunds for each row execute function public.touch_updated_at();

create or replace function public.admin_create_refund(p_payment_id uuid, p_amount integer, p_reason text)
returns public.refunds language plpgsql security definer set search_path = public as $$
declare p public.payments; v_refunded bigint; r public.refunds;
begin
  perform public.assert_admin();
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if p.status <> 'successful' then raise exception 'only successful payments can be refunded' using errcode = '55000'; end if;
  if p.method = 'cash' or p.phone is null then
    raise exception 'cash payments cannot be refunded through the provider; use a wallet adjustment' using errcode = '55000';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  select coalesce(sum(amount_xaf), 0) into v_refunded from public.refunds where payment_id = p.id and status <> 'failed';
  if p_amount is null or p_amount <= 0 or p_amount > p.amount_xaf - v_refunded then
    raise exception 'refund exceeds refundable amount (%)', public.fcfa(p.amount_xaf - v_refunded) using errcode = '22023';
  end if;
  insert into public.refunds (payment_id, amount_xaf, reason, phone, method, created_by)
  values (p.id, p_amount, p_reason, p.phone, p.method, auth.uid()) returning * into r;
  perform public.audit('create_refund', 'refund', r.id::text, jsonb_build_object('payment_id', p.id, 'amount', p_amount));
  return r;
end $$;

create or replace function public.refund_mark_processing(p_refund_id uuid, p_provider text)
returns public.refunds language plpgsql security definer set search_path = public as $$
declare r public.refunds;
begin
  perform public.assert_admin();
  update public.refunds set status = 'processing', provider = p_provider where id = p_refund_id and status = 'requested' returning * into r;
  if not found then raise exception 'refund is not awaiting processing' using errcode = '55000'; end if;
  return r;
end $$;

-- Final result from the provider (idempotent). Success posts the ledger: money leaves the PSP and, if
-- the payment was already settled, the settlement is reversed proportionally (earner and platform shares).
create or replace function public.refund_set_result(p_refund_id uuid, p_status text, p_provider_ref text default null, p_reason text default null)
returns public.refunds language plpgsql security definer set search_path = public as $$
declare r public.refunds; p public.payments; v_settle uuid; v_entries jsonb; v_sum bigint;
begin
  perform public.assert_admin();
  if p_status not in ('succeeded', 'failed', 'processing') then raise exception 'bad status %', p_status using errcode = '22023'; end if;
  select * into r from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status <> 'processing' then return r; end if;
  if p_status = 'processing' then
    update public.refunds set provider_ref = coalesce(p_provider_ref, provider_ref) where id = r.id returning * into r;
    return r;
  end if;
  update public.refunds set status = p_status, provider_ref = coalesce(p_provider_ref, provider_ref),
    failure_reason = case when p_status = 'failed' then p_reason end where id = r.id returning * into r;
  if p_status = 'failed' then return r; end if;

  select * into p from public.payments where id = r.payment_id;
  select t.id into v_settle from public.ledger_transactions t
  where (t.kind = 'trip_settlement' and t.trip_id = p.trip_id) or (t.kind = 'order_settlement' and t.order_id = p.order_id) limit 1;
  if v_settle is null then
    v_entries := jsonb_build_array(public.entry(public.acct('customer_deposits'), r.amount_xaf), public.entry(public.acct('psp_clearing'), -r.amount_xaf));
  else
    select coalesce(jsonb_agg(public.entry(e.account_id, -round(e.amount_xaf * r.amount_xaf::numeric / p.amount_xaf)::bigint)), '[]'::jsonb)
    into v_entries
    from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id
    where e.transaction_id = v_settle and a.kind <> 'customer_deposits';
    v_entries := v_entries || jsonb_build_array(public.entry(public.acct('psp_clearing'), -r.amount_xaf));
    select coalesce(sum((x->>'amount')::bigint), 0) into v_sum from jsonb_array_elements(v_entries) x;
    if v_sum <> 0 then v_entries := v_entries || jsonb_build_array(public.entry(public.acct('platform_revenue'), -v_sum)); end if;
  end if;
  perform public.ledger_post('refund', v_entries, p_trip => p.trip_id, p_order => p.order_id, p_payment => p.id, p_refund => r.id, p_memo => r.reason);
  perform public.notify_user(p.payer_id, 'refund', 'Refund sent', format('%s was sent back to your mobile money account.', public.fcfa(r.amount_xaf)),
    'Remboursement envoyé', format('%s a été renvoyé sur votre compte mobile money.', public.fcfa(r.amount_xaf)), '{}');
  return r;
end $$;

-- =====================================================================
-- Payouts (driver/courier/restaurant wallets -> mobile money, admin-approved)
-- =====================================================================
create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ledger_accounts(id),
  requested_by uuid not null references public.profiles(id),
  amount_xaf integer not null check (amount_xaf > 0),
  phone text not null check (phone ~ '^2376[0-9]{8}$'),
  method public.pay_method not null check (method <> 'cash'),
  status text not null default 'requested' check (status in ('requested', 'approved', 'processing', 'paid', 'failed', 'rejected')),
  provider text,
  provider_ref text,
  failure_reason text,
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payout_one_open_per_account on public.payout_requests (account_id) where status in ('requested', 'approved', 'processing');
create trigger payouts_touch before update on public.payout_requests for each row execute function public.touch_updated_at();

create or replace function public.cm_operator(p_phone text) returns text language sql immutable as $$
  select case
    when substr(p_phone, 4, 2) = '67' or substr(p_phone, 4, 3)::int between 650 and 654 or substr(p_phone, 4, 3)::int between 680 and 689 then 'mtn'
    when substr(p_phone, 4, 2) = '69' or substr(p_phone, 4, 3)::int between 655 and 659 then 'orange'
  end
  where p_phone ~ '^2376[0-9]{8}$';
$$;

-- Wallets of the signed-in user (driver/courier wallet + wallets of owned restaurants).
create or replace function public.my_wallets()
returns table (account_id uuid, kind text, restaurant_id uuid, label text, balance_xaf bigint, pending_payout_xaf bigint)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if exists (select 1 from public.drivers where id = auth.uid()) then perform public.acct('driver_wallet', auth.uid()); end if;
  perform public.acct('restaurant_wallet', null, r.id) from public.restaurants r where r.owner_id = auth.uid();
  return query
    select a.id, a.kind, a.restaurant_id, coalesce(r.name, 'Driver wallet'), public.wallet_balance(a.id),
           coalesce((select sum(p.amount_xaf) from public.payout_requests p where p.account_id = a.id and p.status in ('requested', 'approved', 'processing')), 0)::bigint
    from public.ledger_accounts a left join public.restaurants r on r.id = a.restaurant_id
    where a.owner_id = auth.uid() or r.owner_id = auth.uid();
end $$;

-- Statement lines for one of the caller's wallets (amount > 0 = money in for the holder).
create or replace function public.my_ledger(p_account uuid, p_limit integer default 100)
returns table (entry_id bigint, created_at timestamptz, kind text, memo text, amount_xaf bigint, trip_id uuid, order_id uuid, payout_id uuid, refund_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id, e.created_at, t.kind, t.memo, -e.amount_xaf, t.trip_id, t.order_id, t.payout_id, t.refund_id
  from public.ledger_entries e
  join public.ledger_transactions t on t.id = e.transaction_id
  join public.ledger_accounts a on a.id = e.account_id
  left join public.restaurants r on r.id = a.restaurant_id
  where e.account_id = p_account and (a.owner_id = auth.uid() or r.owner_id = auth.uid() or public.is_admin())
  order by e.id desc limit least(greatest(p_limit, 1), 500);
$$;

create or replace function public.request_payout(p_account uuid, p_amount integer, p_phone text, p_method public.pay_method)
returns public.payout_requests language plpgsql security definer set search_path = public as $$
declare a public.ledger_accounts; v_owner uuid; v_bal bigint; pr public.payout_requests;
begin
  select * into a from public.ledger_accounts where id = p_account for update;
  if not found then raise exception 'wallet not found' using errcode = 'P0002'; end if;
  v_owner := coalesce(a.owner_id, (select owner_id from public.restaurants where id = a.restaurant_id));
  if v_owner is distinct from auth.uid() or a.kind not in ('driver_wallet', 'restaurant_wallet') then
    raise exception 'not your wallet' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and suspended) then raise exception 'account suspended' using errcode = '42501'; end if;
  if p_method = 'cash' then raise exception 'payouts go to MTN or Orange mobile money' using errcode = '22023'; end if;
  if public.cm_operator(p_phone) is distinct from p_method::text then
    raise exception 'phone number does not match %', p_method using errcode = '22023';
  end if;
  if p_amount < public.setting('min_payout_xaf') then
    raise exception 'minimum payout is %', public.fcfa(public.setting('min_payout_xaf')::bigint) using errcode = '22023';
  end if;
  v_bal := public.wallet_balance(a.id);
  if p_amount > v_bal then raise exception 'insufficient balance (%)', public.fcfa(v_bal) using errcode = '22023'; end if;
  insert into public.payout_requests (account_id, requested_by, amount_xaf, phone, method)
  values (a.id, auth.uid(), p_amount, p_phone, p_method) returning * into pr;
  perform public.ledger_post('payout_hold', jsonb_build_array(public.entry(a.id, p_amount), public.entry(public.acct('payouts_pending'), -p_amount)),
    p_payout => pr.id, p_memo => 'payout requested');
  perform public.notify_admins('payout_request', 'Payout request', format('%s to %s awaiting approval.', public.fcfa(p_amount), p_method),
    jsonb_build_object('payout_id', pr.id));
  return pr;
end $$;

create or replace function public.payout_release(p_payout_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pr public.payout_requests;
begin
  select * into pr from public.payout_requests where id = p_payout_id;
  return public.ledger_post('payout_release', jsonb_build_array(public.entry(public.acct('payouts_pending'), pr.amount_xaf), public.entry(pr.account_id, -pr.amount_xaf)),
    p_payout => pr.id, p_memo => 'payout ' || pr.status);
end $$;

create or replace function public.admin_review_payout(p_payout_id uuid, p_approve boolean, p_note text default null)
returns public.payout_requests language plpgsql security definer set search_path = public as $$
declare pr public.payout_requests;
begin
  perform public.assert_admin();
  update public.payout_requests set status = case when p_approve then 'approved' else 'rejected' end,
    review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_payout_id and status = 'requested' returning * into pr;
  if not found then raise exception 'payout is not awaiting review' using errcode = '55000'; end if;
  if not p_approve then
    perform public.payout_release(pr.id);
    perform public.notify_user(pr.requested_by, 'payout', 'Payout declined', coalesce(p_note, 'Contact support for details.'),
      'Retrait refusé', coalesce(p_note, 'Contactez le support pour plus de détails.'), jsonb_build_object('url', '/earnings'));
  end if;
  perform public.audit(case when p_approve then 'approve_payout' else 'reject_payout' end, 'payout', pr.id::text, jsonb_build_object('note', p_note));
  return pr;
end $$;

create or replace function public.payout_mark_processing(p_payout_id uuid, p_provider text)
returns public.payout_requests language plpgsql security definer set search_path = public as $$
declare pr public.payout_requests;
begin
  perform public.assert_admin();
  update public.payout_requests set status = 'processing', provider = p_provider where id = p_payout_id and status = 'approved' returning * into pr;
  if not found then raise exception 'payout is not approved' using errcode = '55000'; end if;
  return pr;
end $$;

create or replace function public.payout_set_result(p_payout_id uuid, p_status text, p_provider_ref text default null, p_reason text default null)
returns public.payout_requests language plpgsql security definer set search_path = public as $$
declare pr public.payout_requests;
begin
  perform public.assert_admin();
  if p_status not in ('paid', 'failed', 'processing') then raise exception 'bad status %', p_status using errcode = '22023'; end if;
  select * into pr from public.payout_requests where id = p_payout_id for update;
  if not found then raise exception 'payout not found' using errcode = 'P0002'; end if;
  if pr.status <> 'processing' then return pr; end if;
  if p_status = 'processing' then
    update public.payout_requests set provider_ref = coalesce(p_provider_ref, provider_ref) where id = pr.id returning * into pr;
    return pr;
  end if;
  update public.payout_requests set status = p_status, provider_ref = coalesce(p_provider_ref, provider_ref),
    failure_reason = case when p_status = 'failed' then p_reason end where id = pr.id returning * into pr;
  if p_status = 'paid' then
    perform public.ledger_post('payout_paid', jsonb_build_array(public.entry(public.acct('payouts_pending'), pr.amount_xaf), public.entry(public.acct('psp_clearing'), -pr.amount_xaf)),
      p_payout => pr.id, p_memo => 'payout sent ' || coalesce(pr.provider_ref, ''));
    perform public.notify_user(pr.requested_by, 'payout', 'Payout sent', format('%s was sent to your mobile money.', public.fcfa(pr.amount_xaf)),
      'Retrait envoyé', format('%s a été envoyé sur votre mobile money.', public.fcfa(pr.amount_xaf)), '{}');
  else
    perform public.payout_release(pr.id);
    perform public.notify_user(pr.requested_by, 'payout', 'Payout failed', 'The transfer failed; the amount is back in your wallet.',
      'Échec du retrait', 'Le transfert a échoué ; le montant est de retour dans votre portefeuille.', '{}');
  end if;
  return pr;
end $$;

-- =====================================================================
-- Matching in SQL (used by Edge Functions and the scheduler)
-- =====================================================================
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
  join public.profiles pr on pr.id = d.id and not pr.suspended
  where d.status = 'available'
    and d.documents_verified
    and d.location is not null
    and d.location_updated_at > now() - interval '2 minutes'
    and (p_vehicle_type is null or d.vehicle_type = p_vehicle_type)
    and (not p_couriers_only or d.is_courier)
    and not (d.id = any (p_exclude))
    and not exists (select 1 from public.trips t where t.offered_driver_id = d.id and t.status = 'offered' and t.offer_expires_at > now())
    and not exists (select 1 from public.orders o where o.offered_courier_id = d.id and o.courier_id is null and o.offer_expires_at > now())
    and extensions.st_dwithin(d.location, public.make_point(p_lat, p_lng), p_radius_m)
  order by d.location operator(extensions.<->) public.make_point(p_lat, p_lng)
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.offer_trip(p_trip_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t public.trips; v_ex uuid[]; v_driver uuid; v_dist double precision; v_exp timestamptz;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status not in ('requested', 'offered') then return jsonb_build_object('status', 'not_matchable'); end if;
  if t.status = 'offered' and t.offer_expires_at > now() then
    return jsonb_build_object('status', 'already_offered', 'driver_id', t.offered_driver_id, 'expires_at', t.offer_expires_at);
  end if;
  v_ex := t.declined_driver_ids;
  if t.offered_driver_id is not null and not (t.offered_driver_id = any (v_ex)) then v_ex := array_append(v_ex, t.offered_driver_id); end if;
  select n.driver_id, n.distance_m into v_driver, v_dist from public.nearest_available_drivers(t.pickup_lat, t.pickup_lng, t.vehicle_type, false,
    coalesce(public.setting('search_radius_m'), 5000)::integer, 1, v_ex) n;
  if v_driver is null then
    if t.created_at < now() - make_interval(mins => coalesce(public.setting('give_up_minutes'), 5)::integer) then
      update public.trips set status = 'no_drivers', offered_driver_id = null, offer_expires_at = null, declined_driver_ids = v_ex where id = t.id;
      return jsonb_build_object('status', 'no_drivers');
    end if;
    update public.trips set status = 'requested', offered_driver_id = null, offer_expires_at = null, declined_driver_ids = v_ex where id = t.id;
    return jsonb_build_object('status', 'waiting');
  end if;
  v_exp := now() + make_interval(secs => coalesce(public.setting('offer_ttl_seconds'), 30)::double precision);
  update public.trips set status = 'offered', offered_driver_id = v_driver, offer_expires_at = v_exp, declined_driver_ids = v_ex where id = t.id;
  return jsonb_build_object('status', 'offered', 'driver_id', v_driver, 'distance_m', round(v_dist::numeric), 'expires_at', v_exp);
end $$;

create or replace function public.offer_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare o public.orders; v_ex uuid[]; v_driver uuid; v_dist double precision; v_exp timestamptz; v_lat double precision; v_lng double precision;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.courier_id is not null or o.status not in ('accepted', 'preparing', 'ready') then return jsonb_build_object('status', 'not_matchable'); end if;
  if o.offered_courier_id is not null and o.offer_expires_at > now() then
    return jsonb_build_object('status', 'already_offered', 'driver_id', o.offered_courier_id);
  end if;
  v_ex := o.declined_courier_ids;
  if o.offered_courier_id is not null and not (o.offered_courier_id = any (v_ex)) then v_ex := array_append(v_ex, o.offered_courier_id); end if;
  select extensions.st_y(r.location::extensions.geometry), extensions.st_x(r.location::extensions.geometry) into v_lat, v_lng
  from public.restaurants r where r.id = o.restaurant_id;
  select n.driver_id, n.distance_m into v_driver, v_dist
  from public.nearest_available_drivers(v_lat, v_lng, null, true, coalesce(public.setting('search_radius_m'), 5000)::integer, 1, v_ex) n;
  if v_driver is null then
    update public.orders set offered_courier_id = null, offer_expires_at = null, declined_courier_ids = v_ex where id = o.id;
    return jsonb_build_object('status', 'waiting');
  end if;
  v_exp := now() + make_interval(secs => coalesce(public.setting('offer_ttl_seconds'), 30)::double precision);
  update public.orders set offered_courier_id = v_driver, offer_expires_at = v_exp, declined_courier_ids = v_ex where id = o.id;
  return jsonb_build_object('status', 'offered', 'driver_id', v_driver, 'distance_m', round(v_dist::numeric), 'expires_at', v_exp);
end $$;

-- Scheduler entry point: expires stale offers, re-offers to the next nearest driver/courier and
-- gives up on rides after give_up_minutes. Scheduled every 10 s with pg_cron (end of this file).
create or replace function public.run_matching(p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v jsonb; n_off int := 0; n_wait int := 0; n_gave int := 0; n_ord int := 0;
begin
  for r in select id from public.trips
           where status = 'requested' or (status = 'offered' and offer_expires_at <= now())
           order by created_at limit p_limit loop
    v := public.offer_trip(r.id);
    if v->>'status' = 'offered' then n_off := n_off + 1;
    elsif v->>'status' = 'no_drivers' then n_gave := n_gave + 1;
    else n_wait := n_wait + 1; end if;
  end loop;
  for r in select id from public.orders
           where courier_id is null and status in ('accepted', 'preparing', 'ready')
             and (offered_courier_id is null or offer_expires_at <= now())
           order by created_at limit p_limit loop
    v := public.offer_order(r.id);
    if v->>'status' = 'offered' then n_ord := n_ord + 1; end if;
  end loop;
  return jsonb_build_object('trips_offered', n_off, 'trips_waiting', n_wait, 'trips_gave_up', n_gave, 'orders_offered', n_ord);
end $$;

-- =====================================================================
-- Redefined RPCs (amount due after promo; driver can record cash for an unpaid trip)
-- =====================================================================
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
    if t.payment_method = 'cash' and t.payment_status <> 'paid' then
      insert into public.payments (payer_id, trip_id, amount_xaf, method, provider, status)
      values (t.rider_id, t.id, t.amount_due_xaf, 'cash', 'cash', 'successful');
      update public.trips set payment_status = 'paid' where id = t.id returning * into t;
    end if;
  end if;
  return t;
end $$;

create or replace function public.driver_record_cash(p_trip_id uuid)
returns public.trips language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.driver_id is distinct from auth.uid() then raise exception 'not your trip' using errcode = '42501'; end if;
  if t.status <> 'completed' or t.payment_status = 'paid' then raise exception 'nothing to collect' using errcode = '55000'; end if;
  if exists (select 1 from public.payments where trip_id = t.id and status = 'pending' and created_at > now() - interval '5 minutes') then
    raise exception 'a mobile money payment is in progress' using errcode = '55000';
  end if;
  update public.payments set status = 'failed', failure_reason = 'replaced_by_cash' where trip_id = t.id and status = 'pending';
  insert into public.payments (payer_id, trip_id, amount_xaf, method, provider, status)
  values (t.rider_id, t.id, t.amount_due_xaf, 'cash', 'cash', 'successful');
  update public.trips set payment_method = 'cash', payment_status = 'paid' where id = t.id returning * into t;
  return t;
end $$;

-- =====================================================================
-- Event triggers: notifications outbox, promo release, settlement
-- =====================================================================
create or replace function public.trips_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_data jsonb := jsonb_build_object('trip_id', new.id, 'url', '/trip/' || new.id);
begin
  if new.offered_driver_id is not null and new.status = 'offered'
     and (new.offered_driver_id is distinct from old.offered_driver_id or old.status <> 'offered') then
    perform public.notify_user(new.offered_driver_id, 'ride_offer', 'New ride request',
      format('%s - %s. Accept within %s s.', coalesce(new.pickup_address, 'Pickup'), public.fcfa(new.fare_xaf), coalesce(public.setting('offer_ttl_seconds'), 30)),
      'Nouvelle course', format('%s - %s. Acceptez sous %s s.', coalesce(new.pickup_address, 'Départ'), public.fcfa(new.fare_xaf), coalesce(public.setting('offer_ttl_seconds'), 30)),
      jsonb_build_object('trip_id', new.id, 'url', '/driver'));
  end if;
  if new.status is distinct from old.status then
    case new.status
      when 'accepted' then perform public.notify_user(new.rider_id, 'trip_status', 'Driver on the way', 'Your driver accepted and is heading to you.',
        'Chauffeur en route', 'Votre chauffeur a accepté et arrive.', v_data);
      when 'arrived' then perform public.notify_user(new.rider_id, 'driver_arriving', 'Your driver has arrived', 'Meet your driver at the pickup point.',
        'Votre chauffeur est arrivé', 'Rejoignez votre chauffeur au point de départ.', v_data);
      when 'in_progress' then perform public.notify_user(new.rider_id, 'trip_status', 'Trip started', 'Enjoy your ride. Share your trip from the app.',
        'Course démarrée', 'Bon trajet. Partagez votre course depuis l''app.', v_data);
      when 'completed' then perform public.notify_user(new.rider_id, 'trip_status', 'Trip completed', format('Amount due: %s. Rate your driver.', public.fcfa(new.amount_due_xaf)),
        'Course terminée', format('Montant : %s. Notez votre chauffeur.', public.fcfa(new.amount_due_xaf)), v_data);
      when 'no_drivers' then
        perform public.notify_user(new.rider_id, 'trip_status', 'No drivers available', 'No driver accepted your request. Please try again.',
          'Aucun chauffeur', 'Aucun chauffeur n''a accepté. Veuillez réessayer.', v_data);
        delete from public.promo_redemptions where trip_id = new.id;
      when 'cancelled' then
        if new.driver_id is not null and auth.uid() is distinct from new.driver_id then
          perform public.notify_user(new.driver_id, 'trip_status', 'Trip cancelled', 'The rider cancelled the trip.', 'Course annulée', 'Le passager a annulé la course.', v_data);
        end if;
        if auth.uid() is distinct from new.rider_id then
          perform public.notify_user(new.rider_id, 'trip_status', 'Trip cancelled', 'Your trip was cancelled.', 'Course annulée', 'Votre course a été annulée.', v_data);
        end if;
        delete from public.promo_redemptions where trip_id = new.id;
      else null;
    end case;
  end if;
  if (new.status = 'completed' and old.status <> 'completed') or (new.payment_status = 'paid' and old.payment_status <> 'paid') then
    perform public.settle_trip(new.id);
  end if;
  return null;
end $$;
create trigger trips_after_update after update on public.trips for each row execute function public.trips_after_update();

create or replace function public.orders_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_data jsonb := jsonb_build_object('order_id', new.id, 'url', '/order/' || new.id);
begin
  select owner_id into v_owner from public.restaurants where id = new.restaurant_id;
  if tg_op = 'INSERT' then
    if new.status = 'placed' then
      perform public.notify_user(v_owner, 'order_status', 'New order', format('New order: %s.', public.fcfa(new.subtotal_xaf)),
        'Nouvelle commande', format('Nouvelle commande : %s.', public.fcfa(new.subtotal_xaf)), jsonb_build_object('order_id', new.id, 'url', '/partner'));
    end if;
    return null;
  end if;
  if new.offered_courier_id is not null and new.courier_id is null and new.offered_courier_id is distinct from old.offered_courier_id then
    perform public.notify_user(new.offered_courier_id, 'ride_offer', 'New delivery', format('Delivery fee %s. Accept quickly.', public.fcfa(new.delivery_fee_xaf)),
      'Nouvelle livraison', format('Frais de livraison %s. Acceptez vite.', public.fcfa(new.delivery_fee_xaf)), jsonb_build_object('order_id', new.id, 'url', '/driver'));
  end if;
  if new.status is distinct from old.status then
    case new.status
      when 'placed' then perform public.notify_user(v_owner, 'order_status', 'New order', format('New paid order: %s.', public.fcfa(new.subtotal_xaf)),
        'Nouvelle commande', format('Nouvelle commande payée : %s.', public.fcfa(new.subtotal_xaf)), jsonb_build_object('order_id', new.id, 'url', '/partner'));
      when 'accepted' then perform public.notify_user(new.customer_id, 'order_status', 'Order accepted', 'The restaurant accepted your order.',
        'Commande acceptée', 'Le restaurant a accepté votre commande.', v_data);
      when 'ready' then perform public.notify_user(new.customer_id, 'order_status', 'Order ready', 'Your order is ready and waiting for the courier.',
        'Commande prête', 'Votre commande est prête et attend le livreur.', v_data);
      when 'picked_up' then perform public.notify_user(new.customer_id, 'order_status', 'On the way', 'The courier picked up your order.',
        'En route', 'Le livreur a récupéré votre commande.', v_data);
      when 'delivered' then perform public.notify_user(new.customer_id, 'order_status', 'Delivered', 'Enjoy your meal! Rate the restaurant in the app.',
        'Livrée', 'Bon appétit ! Notez le restaurant dans l''app.', v_data);
      when 'cancelled' then
        perform public.notify_user(new.customer_id, 'order_status', 'Order cancelled', 'Your order was cancelled.', 'Commande annulée', 'Votre commande a été annulée.', v_data);
        delete from public.promo_redemptions where order_id = new.id;
      else null;
    end case;
  end if;
  if (new.status = 'delivered' and old.status <> 'delivered') or (new.payment_status = 'paid' and old.payment_status <> 'paid') then
    perform public.settle_order(new.id);
  end if;
  return null;
end $$;
create trigger orders_after_change after insert or update on public.orders for each row execute function public.orders_after_change();

create or replace function public.payments_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_data jsonb := jsonb_build_object('payment_id', new.id, 'url', coalesce('/trip/' || new.trip_id, '/order/' || new.order_id));
begin
  if new.status = 'successful' and (tg_op = 'INSERT' or old.status <> 'successful') then
    perform public.post_payment_received(new.id);
    if new.method <> 'cash' then
      perform public.notify_user(new.payer_id, 'payment_result', 'Payment received', format('%s paid by mobile money. Thank you!', public.fcfa(new.amount_xaf)),
        'Paiement reçu', format('%s payé par mobile money. Merci !', public.fcfa(new.amount_xaf)), v_data);
    end if;
  elsif new.status = 'failed' and tg_op = 'UPDATE' and old.status <> 'failed' and coalesce(new.failure_reason, '') <> 'replaced_by_cash' then
    perform public.notify_user(new.payer_id, 'payment_result', 'Payment failed', 'The mobile money payment did not go through. Please try again.',
      'Échec du paiement', 'Le paiement mobile money n''a pas abouti. Veuillez réessayer.', v_data);
  end if;
  return null;
end $$;
create trigger payments_after_change after insert or update of status on public.payments for each row execute function public.payments_after_change();

-- Public share link: limited, non-identifying view of a live trip (used by the trip-share Edge Function).
create or replace function public.trip_share_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', t.status, 'vehicle_type', t.vehicle_type,
    'pickup_address', t.pickup_address, 'dropoff_address', t.dropoff_address,
    'pickup', jsonb_build_object('lat', t.pickup_lat, 'lng', t.pickup_lng),
    'dropoff', jsonb_build_object('lat', t.dropoff_lat, 'lng', t.dropoff_lng),
    'driver_first_name', split_part(coalesce(p.full_name, ''), ' ', 1),
    'vehicle', case when v.id is not null then jsonb_build_object('make_model', v.make_model, 'color', v.color, 'plate', v.plate) end,
    'driver_position', case when t.status in ('accepted', 'arrived', 'in_progress') then jsonb_build_object('lat', d.lat, 'lng', d.lng, 'at', d.location_updated_at) end,
    'started_at', t.started_at, 'updated_at', greatest(t.created_at, t.accepted_at, t.arrived_at, t.started_at, t.completed_at, t.cancelled_at))
  from public.trips t
  left join public.drivers d on d.id = t.driver_id
  left join public.profiles p on p.id = t.driver_id
  left join public.vehicles v on v.id = d.vehicle_id
  where t.share_token = p_token and t.created_at > now() - interval '24 hours';
$$;

-- Internal helpers are not callable from the API.
revoke execute on function public.notify_user(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.audit(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.acct(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ledger_post(text, jsonb, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.post_payment_received(uuid) from public, anon, authenticated;
revoke execute on function public.settle_trip(uuid) from public, anon, authenticated;
revoke execute on function public.settle_order(uuid) from public, anon, authenticated;
revoke execute on function public.payout_release(uuid) from public, anon, authenticated;
revoke execute on function public.promo_quote(text, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.redeem_promo(text, uuid, text, integer, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.offer_trip(uuid) from public, anon, authenticated;
revoke execute on function public.offer_order(uuid) from public, anon, authenticated;
revoke execute on function public.run_matching(integer) from public, anon, authenticated;
revoke execute on function public.trip_share_info(uuid) from public, anon, authenticated;
revoke execute on function public.nearest_available_drivers(double precision, double precision, public.vehicle_type, boolean, integer, integer, uuid[]) from public, anon, authenticated;
revoke execute on function public.wallet_balance(uuid) from public, anon, authenticated;

-- Scheduler: pg_cron (enable it under Database > Extensions). Skipped silently where unavailable (local tests).
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('camride-matching', '10 seconds', 'select public.run_matching()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $cron$;
