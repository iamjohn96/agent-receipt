-- Agent Receipt telemetry collector (Supabase / Postgres).
-- Run this once in the Supabase SQL editor. Nothing here is secret.
--
-- Design notes:
--   * The CLI authenticates with the project's ANON key, which is public by design.
--     Safety comes from RLS: anon may INSERT and may not SELECT, so the public key
--     cannot read the table back.
--   * (install_id, event) is unique, so a client that retries can never double-count.
--   * CHECK constraints reject anything that is not one of the two documented events,
--     which keeps a malformed or hostile client from widening what gets stored.

create table if not exists public.install_events (
  id          bigint generated always as identity primary key,
  install_id  uuid        not null,
  event       text        not null check (event in ('installed', 'third_receipt')),
  version     text        not null check (char_length(version) between 1 and 20),
  platform    text        not null check (platform in ('darwin', 'linux', 'win32')),
  days        integer                  check (days between 1 and 400),
  created_at  timestamptz not null default now(),
  unique (install_id, event)
);

alter table public.install_events enable row level security;

-- Insert-only for the public key. No select/update/delete policy exists, so anon has none.
drop policy if exists "anon may insert events" on public.install_events;
create policy "anon may insert events"
  on public.install_events
  for insert
  to anon
  with check (true);

-- ── The two numbers the 10-01 decision needs (PLAN.md §4/§5) ────────────────────

-- Confirmed installers (ping half; add self-reported installs separately, deduped by hand).
create or replace view public.metric_confirmed_installs as
  select count(distinct install_id) as confirmed_installs
  from public.install_events
  where event = 'installed';

-- Active users: >= 3 receipts (the event only fires at three) across >= 2 distinct days.
create or replace view public.metric_active_users as
  select count(distinct install_id) as active_users
  from public.install_events
  where event = 'third_receipt' and coalesce(days, 1) >= 2;

-- Daily install curve, for the metrics table in PROJECT_STATE.md.
create or replace view public.metric_daily as
  select created_at::date as day,
         count(*) filter (where event = 'installed')     as installs,
         count(*) filter (where event = 'third_receipt') as milestones
  from public.install_events
  group by 1
  order by 1;
