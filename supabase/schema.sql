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
  avatar_url text,
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
  -- A plain copy of the work_types row's name at assignment time, not a
  -- foreign key — deliberately denormalized so renaming or deleting a
  -- work type later never rewrites what an already-assigned roster entry
  -- says, same reasoning as worker_note_replies.author_name.
  work_type text,
  created_at timestamptz not null default now()
);

-- An admin-managed, per-business list of work types (e.g. "kick out",
-- "pole work") offered as a picker when assigning a roster entry. Not
-- referenced by roster_entries via foreign key — see the comment there.
create table public.work_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.worker_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- A note can be about a past shift, an upcoming roster entry, or
  -- neither (a general note) — never more than one. Both are set null
  -- (not cascade-deleted) if the shift/entry is later removed, so the
  -- note itself stays as a record even without what it was about.
  shift_id uuid references public.shifts (id) on delete set null,
  roster_entry_id uuid references public.roster_entries (id) on delete set null,
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint worker_notes_at_most_one_target check (
    shift_id is null or roster_entry_id is null
  )
);

-- A lightweight back-and-forth thread on a worker_note: either the admin
-- replying to a worker's flag, or the worker replying back. Never deleted
-- independently of its parent note (no delete policy on worker_notes
-- either), so cascading here is safe and needs no set-null handling.
--
-- author_name/author_role are a deliberate denormalization, captured at
-- send time by the submit-note-reply Edge Function (which already has
-- them from the caller's own profile) instead of being read back out via
-- a join to `users`. A worker's RLS policy on `users` is "select self"
-- only, so a join from a reply to an *admin* author's users row would be
-- silently filtered to null by RLS when a worker reads their own note's
-- thread — crashing any UI that assumes the joined author is always
-- present. Storing the name/role directly here avoids that cross-role
-- visibility problem entirely rather than widening `users` RLS for it.
create table public.worker_note_replies (
  id uuid primary key default gen_random_uuid(),
  worker_note_id uuid not null references public.worker_notes (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  author_name text not null,
  author_role text not null check (author_role in ('admin', 'worker')),
  message text not null,
  created_at timestamptz not null default now()
);

-- A worker's request for time off, covering start_date..end_date
-- inclusive (a single day has start_date = end_date). Always created by
-- the submit-leave-request Edge Function (service role, same reasoning
-- as worker_notes — it looks up admin emails to notify) and decided by
-- the decide-leave-request Edge Function (also service role, so it can
-- look up the worker's email to notify them of the outcome).
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_at timestamptz,
  decided_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint leave_requests_valid_range check (end_date >= start_date)
);

create index shifts_user_id_idx on public.shifts (user_id);
create index shifts_business_id_idx on public.shifts (business_id);
create index roster_entries_business_id_idx on public.roster_entries (business_id);
create index roster_entries_user_id_idx on public.roster_entries (user_id);
create index users_business_id_idx on public.users (business_id);
create index worker_notes_business_id_idx on public.worker_notes (business_id);
create index worker_notes_user_id_idx on public.worker_notes (user_id);
create index worker_note_replies_note_id_idx on public.worker_note_replies (worker_note_id);
create index worker_note_replies_business_id_idx on public.worker_note_replies (business_id);
create index leave_requests_business_id_idx on public.leave_requests (business_id);
create index leave_requests_user_id_idx on public.leave_requests (user_id);
create index work_types_business_id_idx on public.work_types (business_id);

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
alter table public.worker_notes enable row level security;
alter table public.worker_note_replies enable row level security;
alter table public.leave_requests enable row level security;
alter table public.work_types enable row level security;

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

-- work_types: admin-only in every direction — workers never query this
-- table directly, they only ever see the resulting roster_entries.work_type
-- text copy (see that column's comment).
create policy "admin select business work types" on public.work_types
  for select using (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin insert business work types" on public.work_types
  for insert with check (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin update business work types" on public.work_types
  for update using (public.app_role() = 'admin' and business_id = public.app_business_id())
  with check (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin delete business work types" on public.work_types
  for delete using (public.app_role() = 'admin' and business_id = public.app_business_id());

-- worker_notes
create policy "worker select own notes" on public.worker_notes
  for select using (user_id = public.app_user_id());

create policy "admin select business notes" on public.worker_notes
  for select using (public.app_role() = 'admin' and business_id = public.app_business_id());

create policy "admin update business notes" on public.worker_notes
  for update using (public.app_role() = 'admin' and business_id = public.app_business_id())
  with check (public.app_role() = 'admin' and business_id = public.app_business_id());
-- No insert policy: notes are created by the submit-worker-note Edge
-- Function using the service role key — it also looks up the business's
-- admin emails to send a notification, which a worker's own RLS-scoped
-- client can't do (can't see other users' emails).

-- worker_note_replies
create policy "worker select own note replies" on public.worker_note_replies
  for select using (
    worker_note_id in (select id from public.worker_notes where user_id = public.app_user_id())
  );

create policy "admin select business note replies" on public.worker_note_replies
  for select using (public.app_role() = 'admin' and business_id = public.app_business_id());
-- No insert policy: replies are created by the submit-note-reply Edge
-- Function using the service role key — same reasoning as worker_notes
-- above (it looks up the other party's email to notify them).

-- leave_requests
create policy "worker select own leave requests" on public.leave_requests
  for select using (user_id = public.app_user_id());

create policy "admin select business leave requests" on public.leave_requests
  for select using (public.app_role() = 'admin' and business_id = public.app_business_id());
-- No insert or update policy: requests are created by submit-leave-request
-- and decided by decide-leave-request, both using the service role key —
-- same reasoning as worker_notes (each needs to look up and email the
-- other party, which the caller's own RLS-scoped client can't do).

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

-- ---------------------------------------------------------------------------
-- Storage: worker avatars
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Path convention: {business_id}/{user_id}.jpg, always overwritten in place
-- (not one file per upload like shift photos), so this needs both an
-- insert and an update policy — the second upload for the same worker
-- hits the update path, not a fresh insert.
create policy "admin upload business worker avatars" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.app_role() = 'admin'
    and (storage.foldername(name)) [1] = public.app_business_id()::text
  );

create policy "admin update business worker avatars" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.app_role() = 'admin'
    and (storage.foldername(name)) [1] = public.app_business_id()::text
  );

create policy "business members read avatars" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name)) [1] = public.app_business_id()::text
  );
