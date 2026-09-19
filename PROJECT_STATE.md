# Current State

## STRATEGIC RESET — 2026-09-19

Business viability re-scored **4/10**, removed from JonnyLab's product candidate list: the category leader (claude-receipts, 624★) is free (zero monetization basis), Anthropic's `bashEditDiffEnabled` + Claude Code's checkpoint/rewind system already cover or can incrementally absorb most of the value, and "many free users → few paid" has failed four times before. Everything in this file below this section (the ≥25/≥15/≥3 validation-track metrics, the 10-01 GO/PIVOT/KILL decision, `docs/PLAN.md` §1–7) is **retired**. Kept only as history.

**New goal: zero revenue expectation. The entire point is leaving one published open-source artifact.** Justified by how much is already reusable — realistic in 2 days; not worth doing past that.

**Absolute rules (non-negotiable, do not propose loosening any of these):**
1. **Hard 2-day work-time cap.** Whatever works at the cap point ships; nothing extends.
2. **Zero monetization work of any kind** — no payment, licensing, paid tiers, waitlist, landing page, funnel, email capture.
3. **No scope expansion.** Anything not on the build list below goes in the README's "what we don't do" section, never into code.

**Build list (complete, nothing more):** Claude Code hooks that snapshot target files before destructive Bash calls; a session-end receipt (created/modified/deleted incl. via Bash, commands run, outside-working-folder access, risk flags); file-level restore (**the core value — the receipt is secondary**); a README.

**Explicit exclusions (do not build):** pre-approval prompts, signing/attestation (Ed25519/VC-style), cloud sync, simultaneous multi-agent support, Codex/Cursor support, enterprise features, team sharing, telemetry, auto-update.

**Decisions confirmed 09-19:**
- Hermes cron (`agent-receipt-watch`) keeps running on its existing schedule until this rebuild is publicly shipped, then gets stopped. Existing npm package + GitHub repo stay public/unarchived as-is.
- This is an in-place simplification of the existing repo (`iamjohn96/agent-receipt`) and existing npm package (`@jonnylab/agent-receipt`) — not a fresh start.
- The v0.0.3 opt-in Supabase telemetry is removed entirely, not made more private/opt-out.
- APG's (`agent-permission-guard`) named audit/risk files were **not** imported — agent-receipt's own existing equivalents (~516 lines, already tested) already cover the same build-list items; importing the heavier APG versions (~2440 lines) would have been scope expansion for no functional gain. Confirmed with Jonny 09-19.

**Retired as of this reset:** the ≥15-reply / ≥3-community-post "exposure commitment" and the 10-01 GO/PIVOT/KILL decision — those measured business-validation signal, which no longer applies. The historical reply log below is kept for reference; Hermes-sourced GitHub/gist replies may continue under the existing human-approved workflow only until this rebuild ships, not toward any revived quota.

**Release procedure (day 2):** public GitHub repo (already public) → `npm publish` (Jonny runs it himself) → share exactly once, lightly, in one or two relevant communities, disclosing authorship — no marketing campaign.

**After it ships: stop.** No feature additions, no expanded issue-response work, no follow-up roadmap. One pre-decided reconsideration trigger, fixed in advance so it can't be rationalized later: within 30 days, either GitHub reaches **≥200 stars** or an **unsolicited paid inquiry** arrives. Neither → no reconsideration, and this number does not get loosened later.

### Rebuild status — SHIPPED 09-19

- **Telemetry removal: done.** Removed `src/util/telemetry.ts`, `test/telemetry.test.ts`, `ops/telemetry/` (Supabase schema + docs); stripped the `telemetry` CLI subcommand and install-time opt-in prompt from `src/cli/main.ts`; rewrote the README's privacy section, added the honest `bashEditDiffEnabled`/`/rewind` comparison and child-process observation limit, added a best-effort-maintenance line, confirmed "tamper-proof" appears nowhere. Version `0.0.3` → `0.0.4`. Verified in an isolated fresh install: typecheck clean, 16/16 tests pass.
- **Committed** `13eccbc`, **pushed** to `origin/main` (confirmed `main`/`origin/main` in sync, 09-19).
- **Published to npm**: `@jonnylab/agent-receipt@0.0.4` (`npm publish` run by Jonny, 09-19).
- **Exclusion-list audit:** grepped `src/` + README for every explicit-exclusion term — clean.
- **Build-list coverage:** hooks/snapshot, session-end receipt (incl. risk flags, outside-folder access), file-level restore, README — all present and tested.
- **AGENTS.md synced 09-19**: the old "telemetry if added, opt-in" line and the shorter anti-scope list were stale against this reset — both corrected.
- Remaining: Jonny's single "가볍게 한 번" community share, then per the rule above — stop. Watch only the 30-day/200-star/paid-inquiry trigger.

---

Everything below this line predates the 2026-09-19 reset and reflects the retired validation-track plan. Kept as history / for the reply log and Hermes operational notes, not as active goals.

Updated 2026-09-19 (05:2x UTC / 14:2x KST). Validation timebox 09-17 → 09-30, decision 10-01 (see docs/PLAN.md §1, §5).

**Pipeline split, final (09-19):** GitHub/gist outreach for Agent Receipt lives entirely in the Cowork "MacOS" session (built-in browser, Jonny live/approving). The "X 계정 운영" chat owns **X/Bluesky/Threads only**. Hermes/Telegram still feeds candidate leads in; drafts get rewritten before posting, never copy-pasted.

## Hermes classifier tightened 09-19 — landed and confirmed live

`ops/hermes/cron_prompt.md` rewritten to fix false positives: excludes tool-internal/config/credential-file bugs, permission/sandbox bugs with no actual deletion, thin one-line reports; forbids reusing a fixed closing sentence; requires a scope/honesty check before any tool pitch (home-root/drive-root wipes, >5MB media get an honest non-fit disclosure, since `AGENT_RECEIPT_HOME` lives under `~/.agent-receipt`). Committed `d27b8aa`. Live cron re-deployed via `hermes cron remove` + `bootstrap.sh` (this file is baked in as a literal string at job-creation time, not live-reloaded).

## Reconciled reply count as of 09-19: 9 posted (retired quota — see reset above)

| # | Issue | Posted via | Status |
|---|---|---|---|
| 1 | `anthropics/claude-code#70727` | Cowork session, 09-18 | ✅ live |
| 2 | `anthropics/claude-code#94453` | Cowork session, 09-18 | ✅ live |
| 3 | gist `yurukusa/...#gistcomment-6376953` | Cowork session, 09-18 | ✅ live |
| 4 | `r/ClaudeAI` comment `paizxbh` | Cowork session, 09-18 | ✅ posted |
| 5 | `openai/codex#46186` | Other session (Hermes/Telegram), 09-18 | ✅ posted |
| 6 | `anthropics/claude-code#95245` | Other session (Hermes/Telegram), 09-18 | ✅ posted |
| 7 | `anthropics/claude-code#87360` | Cowork session, 09-19 | ✅ posted |
| 8 | `anthropics/claude-code#95414` | Cowork session, 09-19 | ✅ posted |
| 9 | `anthropics/claude-code#75861` | Cowork session, 09-19 | ✅ posted |

## Monitoring (docs/PLAN.md §3) — active until shipped, now due to stop

Hermes = Nous Research Hermes Agent. Files: `ops/hermes/`. Cron `agent-receipt-watch` on schedule (`0 9,13,18,22 * * *` KST). Per the 09-19 reset decision: the rebuild has now shipped (pushed + published), so this cron should be stopped next (`hermes cron remove agent-receipt-watch`, from Jonny's own Terminal).

## Important Decisions
- JSONL + file CAS instead of SQLite.
- ~~Opt-in telemetry~~ — removed entirely 09-19.
- Hooks are pure observers.
- Global install required.
- License: Apache-2.0.
- `git push` / `npm publish` run by Jonny in his own Terminal — the device bridge has no GitHub credentials.
- Editing `ops/hermes/cron_prompt.md` does not update the live cron job — needs `hermes cron remove` + re-run `bootstrap.sh`, from Jonny's own Mac Terminal.
- All outward posts require Jonny live/approving — no autonomous posting.
- **2026-09-19 reset:** hard 2-day cap, zero monetization work, no scope expansion beyond the build list. Do not propose loosening the cap or the 30-day/200-star/paid-inquiry reconsideration trigger.

## Known Issues & Limits
- Changes outside project root not restored. Costs are estimates.
- `gh` CLI not installed in the cloud container.
- The device bridge's shell (Cowork) is a separate Linux VM, not Jonny's real macOS — no `hermes`/`launchd`, no GitHub credentials for push.
- Running `npm install`/`npm test` against a connected folder's existing `node_modules` from the device bridge can fail with native-binary mismatches (macOS vs Linux) — stage source only and do a fresh install in an isolated location instead.
- `.ar-testsrc.tgz` in repo root is gitignored test scratch, harmless.
