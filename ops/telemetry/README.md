# Telemetry collector

PLAN.md §4 makes "confirmed installers" the judgment metric for the 10-01 GO/PIVOT/KILL call, and defines it as
*opt-in `installed` ping + people who say so directly, deduped*. Until 2026-09-18 the ping half did not exist: the CLI
asked for consent and stored the answer locally, and nothing was ever transmitted. This directory is the missing half.

## What the client sends

Two events per install, ever, and only after the user answers `y` to the prompt at `init`:

| Event | When | Extra field |
|---|---|---|
| `installed` | immediately after `agent-receipt init` succeeds | — |
| `third_receipt` | first `show` after three receipts exist | `days` — distinct days with a receipt |

Payload: `install_id` (uuid created on opt-in, deleted on opt-out), `event`, `version`, `platform`, and `days` on the
milestone. Nothing else. Delivery is best-effort with a 2 s timeout, at most once per event, and a failure is silent and
retried on a later run. `agent-receipt telemetry` prints the exact payload to the user.

## Setup (once)

1. Create a Supabase project (free tier is enough).
2. SQL editor → run `schema.sql` from this directory.
3. Project Settings → API → copy the **Project URL** and the **anon public** key.
4. In `src/util/telemetry.ts`, fill the two constants:

   ```ts
   const DEFAULT_ENDPOINT = 'https://<project-ref>.supabase.co/rest/v1/install_events';
   const DEFAULT_KEY = '<anon public key>';
   ```

   Both are public values — the anon key is designed to ship in clients, and RLS is what protects the data. An empty
   endpoint makes telemetry a no-op even for users who opted in, which is the safe default for any unpublished build.
5. `npm run build && npm test`, then publish.

Verify end to end before publishing:

```sh
AGENT_RECEIPT_HOME=/tmp/ar-check node dist/src/cli/main.js telemetry on
AGENT_RECEIPT_HOME=/tmp/ar-check node dist/src/cli/main.js telemetry    # confirm endpoint + payload
```

then check the row landed:

```sql
select * from public.install_events order by created_at desc limit 5;
```

`AGENT_RECEIPT_TELEMETRY_URL` and `AGENT_RECEIPT_TELEMETRY_KEY` override the constants, which is how the tests fake a
collector and how a self-hoster points the CLI somewhere else.

## Reading the numbers

```sql
select * from public.metric_confirmed_installs;   -- PLAN §5 GO needs >= 25
select * from public.metric_active_users;         -- PLAN §5 GO needs >= 5
select * from public.metric_daily;                -- daily curve for PROJECT_STATE.md
```

The anon key cannot run these — there is no select policy for it. Read them from the Supabase dashboard, which uses the
service role.

## Limits worth stating out loud

- **Opt-in rate is the real ceiling.** The prompt defaults to N. If 20 % of installers say yes, 25 confirmed installs
  means roughly 125 real ones. Whatever threshold the decision uses has to be set against the instrument, not against
  imagined demand — see the note in PROJECT_STATE.md.
- **Anyone can POST junk.** The anon key is public, so the table is writable by anyone who reads the source. The unique
  constraint and the CHECK constraints bound the damage to one row per fabricated uuid per event. At the scale this
  experiment operates on, a few dozen fake rows would corrupt the verdict, so sanity-check the `created_at` clustering
  before trusting a sudden jump.
- **This measures consent, not usage.** A user who installs, uses the tool daily, and declines telemetry is invisible
  here and counts only if they say something in an issue or a thread.
