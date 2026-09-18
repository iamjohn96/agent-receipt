-- Agent Receipt telemetry collector (Supabase / Postgres).
-- Run once in the Supabase SQL editor. Nothing here is secret.
--
-- Design notes, each one learned the hard way on 2026-09-18:
--   * The CLI authenticates with the project's PUBLISHABLE key, which Supabase states is
--     safe to ship publicly as long as RLS is on. Safety comes from RLS, not the key.
--   * The insert policy is NOT scoped `to anon`. Supabase's newer `sb_publishable_…` keys
--     do not necessarily resolve to the `anon` role, and a role-scoped policy silently
--     fails to match — the insert comes back 401 "new row violates row-level security
--     policy". Leaving the policy unscoped applies it to PUBLIC, and the table grants
--     below are what actually bound who can reach the table at all.
--   * There is deliberately no SELECT, UPDATE or DELETE policy, so the public key can
--     write an event and can never read, change or remove one. A SELECT with that key
--     returns [] rather than an error, which is the intended shape.
--   * The client must NOT send `Prefer: resolution=ignore-duplicates`. That makes
--     PostgREST treat the insert as an upsert, which RLS then requires an UPDATE policy
--     for — and granting UPDATE would let anyone rewrite existing rows. Instead the
--     unique constraint rejects a repeat with 409, which the client treats as delivered.
--   * The metric views are security_invoker so they respect RLS, and are revoked from the
--     public roles on top of that. Without both, a view owned by postgres would happily
--     hand the aggregate counts to anyone holding the publishable key.

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

drop policy if exists "anon may insert events" on public.install_events;
drop policy if exists "anyone may insert events" on public.install_events;
create policy "anyone may insert events"
  on public.install_events for insert with check (true);

grant insert on public.install_events to anon, authenticated;

-- ── The numbers the 10-01 decision needs (PLAN.md §4/§5) ────────────────────────
-- Read these from the dashboard (service role). The publishable key cannot.

create or replace view public.metric_confirmed_installs with (security_invoker = true) as
  select count(distinct install_id) as confirmed_installs
  from public.install_events
  where event = 'installed';

create or replace view public.metric_active_users with (security_invoker = true) as
  select count(distinct install_id) as active_users
  from public.install_events
  where event = 'third_receipt' and coalesce(days, 1) >= 2;

create or replace view public.metric_daily with (security_invoker = true) as
  select created_at::date as day,
         count(*) filter (where event = 'installed')     as installs,
         count(*) filter (where event = 'third_receipt') as milestones
  from public.install_events
  group by 1
  order by 1;

revoke all on public.metric_confirmed_installs from anon, authenticated;
revoke all on public.metric_active_users       from anon, authenticated;
revoke all on public.metric_daily              from anon, authenticated;
