# Current State

Updated 2026-09-17. Validation timebox 09-17 → 09-30, decision 10-01 (see docs/PLAN.md §1, §5 — do not loosen).

## Current Milestone
M1 — Claude Code v0 usable end-to-end locally (release target 09-22).

## Completed
- D0 competitor check (docs/PLAN.md §6): Entire CLI excludes gitignored files, has no Bash attribution, removed restore;
  npm `agent-receipt` logs commands only. Early-KILL gate passed.
- Core pipeline: CAS store, incremental scan/diff, JSONL hash-chain ledger with cross-process lock,
  Claude hook adapter (SessionStart/PreToolUse/PostToolUse/PostToolUseFailure/Stop/SessionEnd),
  attribution (tool / shared for parallel calls / unattributed between calls), outside-root detection,
  command risk scoring, cost estimate from transcript (prices checked 2026-09-17), receipt JSON + text render
  with `--share` masking, restore (dry-run, conflict detection, backup, index refresh), installer merge/uninstall.
- Tests: 16 passing (`npm test`), including CLI stdin end-to-end and garbage-input hook safety.

## Bench (Linux VM on the dev Mac, not APFS — re-run on macOS)
| files | cold scan | warm scan | Pre/Post hook process (median) |
|---|---|---|---|
| 10k | 404 ms | 17 ms | 72 ms |
| 50k | 1972 ms | 83 ms | 229 ms |
SessionStart baseline on 50k files took ~4 s.

## Remaining (M1)
1. ~~Dogfood~~ — done against the real installer output (see "Dogfood run" below); organic real-agent session
   still needs the user's own Terminal (not blocking).
2. Share card: single-file HTML receipt (`agent-receipt card`) — primary content unit, must pass the "shareable without explanation" filter.
3. CAS retention cleanup (default 7 days) — stored copies include `.env` files.
4. Opt-in anonymous ping (installed / 3rd receipt) per docs/PLAN.md §4.
5. README with 60-second demo, LICENSE file, npm name `@jonnylab/agent-receipt`.
6. Per-root baseline cache so a new session in the same repo does not re-hash everything.

## Important Decisions
- JSONL + file CAS instead of SQLite (no native deps, Node >= 20) — install friction matters more than query power.
- Pre-scan on mutating tools only; PostToolUse `*` so outside-root reads are visible.
- Hook command is `"<node>" "<abs main.js>" hook claude --by=jonnylab-agent-receipt`; the marker scopes uninstall.

## Known Issues
- `appendLedger` re-reads the whole file per append (fine for hundreds of events).
- Changes outside the project root are never observed; only mentioned paths are reported.
- A session first seen at PostToolUse (hooks installed mid-session) cannot see that call's changes (`lateStart`).

## Do Not Change
Hook stdout silence and exit-0 behavior; restore conflict checks; `safeSegment` on hook ids.

## Dogfood run (2026-09-17)
Ran the installed pipeline end-to-end for real, not just via vitest: `init --project --yes` in a throwaway
project, extracted the exact hook `command` string from the generated `.claude/settings.json`, and replayed
schema-accurate Claude Code hook JSON through it via `bash -c "$HOOK_CMD"` (SessionStart → PreToolUse/PostToolUse
Bash `rm -rf notes .env` → PreToolUse/PostToolUse Write `generated.ts` → Stop → SessionEnd), then used the real
CLI for `show`, `restore last --deleted --yes`, `verify`, `uninstall --project --yes`.

Result: correct end to end. `.env` and `notes/todo.md` recorded as deleted+restorable, risk band `high`
(`recursive_delete`, `secret_file`), `generated.ts` recorded as created, hash chain verified after the restore
event was appended, restored files came back byte-for-byte (secret value included — confirms redaction is
display-only, never touches stored/restored bytes), `uninstall` backed up settings.json and left `{}`.

**Two things this did NOT test, and can't from here:**
1. **An organically agent-driven session.** The `claude` CLI itself reports "claude is not enabled in this
   environment" inside this device shell, so the hook JSON above was replayed manually (schema-accurate, from
   the real installed command), not produced by an actual agent deciding to run `rm -rf`. Closing this gap needs
   the user to run real Claude Code (their own Terminal/app) against a project with `agent-receipt init --project`.
2. **True macOS-native perf.** This device shell is itself a Linux VM (`uname -a` → Linux aarch64), not native
   macOS — the mounted folder is a bind-mount passthrough into the real Mac disk, but Node/npm here still run as
   Linux binaries. Confirmed the bind-mount has real per-file overhead unrelated to production perf: writing
   ~60k small files through `$HOME/mnt/MacOS/...` stalled past 180s (vs. 404ms/1972ms for 10k/50k files in the
   VM's own /tmp — see prior bench table), deleting the same ~52.5k files took ~24s. This is Cowork-bridge
   overhead, not how the hook process behaves when it runs natively on the user's Mac. The 09-16 bench table
   (VM-local /tmp) remains the best number on file; a true native-Mac reading still needs `npm run bench` run
   directly in the user's own Terminal.

## Next Recommended Task
Build the share card (`agent-receipt card` → single-file HTML, `docs/PLAN.md` §2 item 2 — the primary
shareable content unit). The pipeline is now verified against the real installer output; the remaining gap
(organic real-agent session) is something only the user's own Terminal can close and doesn't block this.
Record results (hook latency, missing/extra events, errors.log) here.
