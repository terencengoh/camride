-- CamRide core schema: regions/cities, profiles, vehicles, drivers (PostGIS),
-- trips, restaurants, menu, orders, payments, webhook idempotency, ratings.
-- Money is stored as integer FCFA (XAF has no minor unit in practice).

create extension if not exists postgis with schema extensions;

-- ---------- enums ----------
create type public.app_role as enum ('rider', 'driver', 'courier', 'restaurant', 'admin');
create type public.vehicle_type as enum ('moto', 'car', 'comfort');
create type public.driver_status as enum ('offline', 'available', 'busy');
create type public.trip_status as enum ('requested', 'offered', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_drivers');
create type public.order_status as enum ('pending_payment', 'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled');
create type public.pay_method as enum ('mtn', 'orange', 'cash');
create type public.charge_status as enum ('unpaid', 'pending', 'paid', 'failed');
create type public.payment_status as enum ('pending', 'successful', 'failed');

-- ---------- geography reference data ----------
create table public.regions (
  id text primary key,
  name_en text not null,
  name_fr text not null,
  capital_city_id text
);

create table public.cities (
  id text primary key,
  region_id text not null references public.regions(id),
  name text not null,
  is_capital boolean not null default false,
  location extensions.geography(Point, 4326) not null
);
create index cities_location_gix on public.cities using gist (location);

alter table public.regions
  add constraint regions_capital_fk foreign key (capital_city_id) references public.cities(id) deferrable initially deferred;

-- ---------- pricing ----------
-- key is a vehicle_type value ('moto','car','comfort') or 'delivery'.
create table public.rate_cards (
  key text primary key,
  base_xaf integer not null check (base_xaf >= 0),
  per_km_xaf integer not null check (per_km_xaf >= 0),
  per_min_xaf integer not null default 0 check (per_min_xaf >= 0),
  minimum_xaf integer not null check (minimum_xaf >= 0),
  max_distance_km numeric,
  updated_at timestamptz not null default now()
);

-- ---------- people ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role public.app_role not null default 'rider',
  city_id text references public.cities(id),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type public.vehicle_type not null,
  make_model text not null,
  plate text not null unique,
  color text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.drivers (
  id uuid primary key references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_type public.vehicle_type not null,
  is_courier boolean not null default false,
  status public.driver_status not null default 'offline',
  location extensions.geography(Point, 4326),
  lat double precision,               -- plain copies of location for Realtime payloads
  lng double precision,
  heading real,
  location_updated_at timestamptz,
  documents_verified boolean not null default false,
  rating_avg numeric(3, 2) not null default 5.00,
  rating_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index drivers_location_gix on public.drivers using gist (location);
create index drivers_status_idx on public.drivers (status, vehicle_type);

-- ---------- rides ----------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles(id),
  driver_id uuid references public.drivers(id),
  offered_driver_id uuid references public.drivers(id),
  offer_expires_at timestamptz,
  declined_driver_ids uuid[] not null default '{}',
  vehicle_type public.vehicle_type not null,
  status public.trip_status not null default 'requested',
  city_id text references public.cities(id),
  pickup extensions.geography(Point, 4326) not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_address text,
  dropoff extensions.geography(Point, 4326) not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_address text,
  distance_km numeric(7, 2) not null,
  duration_min numeric(7, 1) not null,
  fare_xaf integer not null check (fare_xaf > 0),
  payment_method public.pay_method not null,
  payment_status public.charge_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
create index trips_rider_idx on public.trips (rider_id, created_at desc);
create index trips_driver_idx on public.trips (driver_id, created_at desc);
create index trips_offered_idx on public.trips (offered_driver_id) where status = 'offered';

-- ---------- food ----------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  city_id text not null references public.cities(id),
  location extensions.geography(Point, 4326) not null,
  address text,
  tags text,
  emoji text,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);
create index restaurants_location_gix on public.restaurants using gist (location);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  name_fr text,
  description text,
  description_fr text,
  price_xaf integer not null check (price_xaf > 0),
  available boolean not null default true,
  created_at timestamptz not null default now()
);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  restaurant_id uuid not null references public.restaurants(id),
  courier_id uuid references public.drivers(id),
  offered_courier_id uuid references public.drivers(id),
  offer_expires_at timestamptz,
  declined_courier_ids uuid[] not null default '{}',
  status public.order_status not null,
  delivery_location extensions.geography(Point, 4326) not null,
  delivery_lat double precision not null,
  delivery_lng double precision not null,
  delivery_address text,
  distance_km numeric(7, 2) not null,
  subtotal_xaf integer not null check (subtotal_xaf > 0),
  delivery_fee_xaf integer not null check (delivery_fee_xaf >= 0),
  total_xaf integer not null check (total_xaf > 0),
  payment_method public.pay_method not null,
  payment_status public.charge_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_restaurant_idx on public.orders (restaurant_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  unit_price_xaf integer not null check (unit_price_xaf > 0),
  quantity integer not null check (quantity between 1 and 50)
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------- payments ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid not null references public.profiles(id),
  trip_id uuid references public.trips(id),
  order_id uuid references public.orders(id),
  amount_xaf integer not null check (amount_xaf > 0),
  currency text not null default 'XAF' check (currency = 'XAF'),
  method public.pay_method not null,
  provider text not null,             -- 'campay' | 'notchpay' | 'cinetpay' | 'cash'
  provider_ref text,                  -- provider's transaction reference
  phone text,                         -- normalised 2376XXXXXXXX
  status public.payment_status not null default 'pending',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_one_target check ((trip_id is null) <> (order_id is null))
);
create index payments_trip_idx on public.payments (trip_id);
create index payments_order_idx on public.payments (order_id);
create unique index payments_provider_ref_uq on public.payments (provider, provider_ref) where provider_ref is not null;

-- Every webhook delivery we accept is recorded once; duplicates are ignored (idempotency).
create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  payment_id uuid references public.payments(id),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------- ratings ----------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  rater_id uuid not null references public.profiles(id),
  ratee_id uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  constraint ratings_one_target check ((trip_id is null) <> (order_id is null)),
  unique (trip_id, rater_id),
  unique (order_id, rater_id)
);
