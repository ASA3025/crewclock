-- Crewclock database schema.
-- Run this once in the Supabase SQL Editor for a fresh project.
-- See ../SETUP.md for the full setup sequence (this file, then the
-- create-worker Edge Function, then the first admin).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'worker')),
  business_id uuid not null references public.businesses (id) on delete cascade,
  hourly_rate numeric(10, 2),
  created_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  clock_in_time timestamptz not null default now(),
  clock_out_time timestamptz,
  gps_lat double precision,
  gps_lng double precision,
  -- Reverse-geocoded from gps_lat/gps_lng on first admin view (see the
  -- reverse-geocode Edge Function) — cached here so a shift is only ever
  -- looked up once, not re-geocoded on every page view.
  address text,
  note text,
  photo_url text,
  approved boolean not null default false,
  rejected boolean not null default false,
  created_at timestamptz not null default now(),
  constraint shifts_not_both_approved_and_rejected check (not (approved and rejected))
);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  location_label text not null,
  -- Per-assignment, optional — a plain wall-clock time-of-day, not tied to
  -- any timezone conversion (unlike shifts.clock_in_time).
  start_time time,
  end_time time,
  created_at timestamptz not null default now()
);

create index shifts_user_id_idx on public.shifts (user_id);
create index shifts_business_id_idx on public.shifts (business_id);
create index roster_entries_business_id_idx on public.roster_entries (business_id);
create index roster_entries_user_id_idx on public.roster_entries (user_id);
create index users_business_id_idx on public.users (business_id);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies on `users` don't
-- recurse into themselves when they need the caller's own business_id/role).
-- ---------------------------------------------------------------------------

create or replace function public.app_user_id()
returns uuid
language sql security definer set search_path = public stable
as $$
  select id from public.users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.app_business_id()
returns uuid
language sql security definer set search_path = public stable
as $$
  select business_id from public.users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.app_role()
returns text
language sql security definer set search_path = public stable
as $$
  select role from public.users where auth_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.roster_entries enable row level security;

-- businesses: read-only from the client, scoped to your own business.
-- Rows are created manually (see SETUP.md) using the Supabase service role,
-- which bypasses RLS.
create policy "select own business" on public.businesses
  for select using (id = public.app_business_id());

-- users
create policy "select self" on public.users
  for select using (auth_id = auth.uid());

create policy "admin select business users" on public.users
  for select using (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin update business users" on public.users
  for update using (public.app_role() = 'admin' and business_id = public.app_business_id())
  with check (public.app_role() = 'admin' and business_id = public.app_business_id());
-- No insert policy: new users are created by the create-worker Edge Function
-- using the service role key, never directly from the browser.

-- shifts
create policy "worker select own shifts" on public.shifts
  for select using (user_id = public.app_user_id());

create policy "worker insert own shifts" on public.shifts
  for insert with check (user_id = public.app_user_id() and business_id = public.app_business_id());

create policy "worker update own shifts" on public.shifts
  for update using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

create policy "admin select business shifts" on public.shifts
  for select using (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin update business shifts" on public.shifts
  for update using (public.app_role() = 'admin' and business_id = public.app_business_id())
  with check (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin delete business shifts" on public.shifts
  for delete using (public.app_role() = 'admin' and business_id = public.app_business_id());

-- roster_entries
create policy "worker select own roster" on public.roster_entries
  for select using (user_id = public.app_user_id());

create policy "admin select business roster" on public.roster_entries
  for select using (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin insert business roster" on public.roster_entries
  for insert with check (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin update business roster" on public.roster_entries
  for update using (public.app_role() = 'admin' and business_id = public.app_business_id())
  with check (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin delete business roster" on public.roster_entries
  for delete using (public.app_role() = 'admin' and business_id = public.app_business_id());

-- ---------------------------------------------------------------------------
-- Storage: shift photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('shift-photos', 'shift-photos', true)
on conflict (id) do nothing;

-- Path convention enforced here: {business_id}/{user_id}/{shift_id}.jpg
create policy "worker upload own shift photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shift-photos'
    and (storage.foldername(name)) [1] = public.app_business_id()::text
    and (storage.foldername(name)) [2] = public.app_user_id()::text
  );

create policy "business members read shift photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'shift-photos'
    and (storage.foldername(name)) [1] = public.app_business_id()::text
  );
