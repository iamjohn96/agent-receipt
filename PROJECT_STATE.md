# Current State

## DISTRIBUTION PHASE — 2026-09-20 (this session now owns execution)

Full plan: `docs/CHANNEL_BREAKTHROUGH_PLAN_90D.md` (saved 09-20) — that document is the actual 90-day work order, this section just tracks live status against it. One-line version: build/publish is done (v0.0.4 shipped 09-19/09-20); "공개하면 종료" is retired in favor of "공개는 끝났고 지금은 90일간 단일 채널(Claude Code 생태계)에 반복 예치하며 이름을 아는 연락 가능한 사용자 명단을 만드는 단계." Not re-opening product/monetization work — see the still-active absolute rules below.

**Rules carried over unchanged from the 09-19 reset (do not loosen):** no monetization work, no new engineering/features, no scope expansion — this phase is distribution/community-response only. The 30-day/200-star/paid-inquiry reconsideration trigger stands separately and is not this phase's success metric. This phase's own metric: **30 named, contactable real users within 90 days** (not stars, not downloads).

### Live status, 09-20

- Repo stats (baseline, 09-20 morning): 0 stars, 0 watchers, 0 forks, 0 open issues (created 09-17). npm downloads last 24h: 167 (unclear yet how much is real vs. CI/bot noise).
- **Discussions enabled** in repo Settings — the README's "Try it without installing" CTA link now resolves.
- **r/ClaudeAI megathread comment posted 09-20**: https://www.reddit.com/r/ClaudeAI/comments/1wkkdca/comment/pax1kcx/ (the mod-redirected "Built with Claude" Showcase Megathread, after the original feed post was removed for karma <50).
- **Hermes cron repurposed for daily distribution metrics.** `67058cb`: fetches GitHub stars/forks/open_issues + npm last-day downloads once per UTC day, logs to `~/.hermes/scripts/.agent_receipt_metrics.jsonl`, and surfaces a one-line Korean METRICS report in Telegram even on ticks with no outreach candidate. Candidate-sourcing/reply-drafting is unchanged. Supersedes the 09-19 "stop cron once shipped" plan for this cron specifically.
- HN / GeekNews / `awesome-claude-code` issue: all gated on account/repo age, retry window 10/1–10/2.
- `claude-plugins-community` / plugin-manifest rewrite: explicitly deferred — new engineering, conflicts with no-scope-expansion.

### Responder log (starts empty, 09-20)

No named responders yet — repo has 0 stars/issues/comments as of the 09-20 check. Update as people show up (issues, PRs, discussion posts, replies to the megathread comment, etc.):

| Name/handle | Where | What they said/did | First seen | Seen again? |
|---|---|---|---|---|
| _(none yet)_ | | | | |

---

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
- Hermes cron kept running until shipped (09-20: repurposed for metrics rather than stopped — see above).
- In-place simplification of the existing repo (`iamjohn96/agent-receipt`) and npm package (`@jonnylab/agent-receipt`) — not a fresh start.
- v0.0.3 opt-in Supabase telemetry removed entirely.
- APG's named audit/risk files were **not** imported — agent-receipt's own tested equivalents (~516 lines) already cover the build-list items; importing APG's heavier versions (~2440 lines) would be scope expansion for no functional gain.

**Release procedure (day 2):** public GitHub repo → `npm publish` (Jonny, his own Terminal) → share exactly once, lightly, disclosing authorship — no marketing campaign.

**After it ships: stop** feature/roadmap work. One pre-decided reconsideration trigger: within 30 days, GitHub **≥200 stars** or an **unsolicited paid inquiry**. Neither → no reconsideration, number not loosened later.

### Rebuild status — SHIPPED 09-19/09-20

- **Telemetry removal: done.** Removed `src/util/telemetry.ts`, `test/telemetry.test.ts`, `ops/telemetry/`; stripped the CLI subcommand and install-time opt-in prompt; rewrote README privacy section, added the `bashEditDiffEnabled`/`/rewind` comparison, child-process limit, best-effort-maintenance line, confirmed no "tamper-proof". `0.0.3` → `0.0.4`. Isolated fresh install verified: typecheck clean, 16/16 tests.
- Committed `13eccbc`, `595f58a` (docs sync), `b136c72` (npx/Discussions), `67058cb` (Hermes metrics) — all pushed.
- Published to npm: `@jonnylab/agent-receipt@0.0.4`, confirmed live.
- Exclusion-list audit and build-list coverage both confirmed clean/complete.
- AGENTS.md synced to this reset (telemetry line, anti-scope list).

---

Everything below this line predates the 2026-09-19 reset and reflects the retired validation-track plan. Kept as history.

## Hermes classifier tightened 09-19

`ops/hermes/cron_prompt.md` excludes tool-internal-file bugs, permission/sandbox bugs with no deletion, thin reports; forbids the copy-pasted closer; requires an honest scope check (home/drive-root wipes, >5MB media) before any tool pitch. Committed `d27b8aa`, live cron redeployed and test-confirmed 09-19.

## Reconciled reply count as of 09-19: 9 posted (retired quota)

`anthropics/claude-code#70727`, `#94453`, gist `yurukusa/...#gistcomment-6376953`, `r/ClaudeAI` comment `paizxbh`, `openai/codex#46186`, `anthropics/claude-code#95245`, `#87360`, `#95414`, `#75861` — all confirmed live as of 09-19.

## Important Decisions
- JSONL + file CAS instead of SQLite. Hooks are pure observers. Global install required. License: Apache-2.0.
- `git push` / `npm publish` run by Jonny in his own Terminal — the device bridge has no GitHub credentials.
- Editing `ops/hermes/cron_prompt.md` needs `hermes cron remove` + re-run `bootstrap.sh` from Jonny's own Mac Terminal to take effect.
- All outward posts require Jonny live/approving — no autonomous posting. Reddit is unreachable from this session's tools entirely (read or write) — Jonny posts there directly.
- 2026-09-19 reset and 2026-09-20 distribution-phase addition both binding — see top of file. Do not propose loosening the build cap, the monetization ban, or the 30-day/200-star/paid-inquiry trigger.
- **Device-bridge git-lock files** (`.git/index.lock`, `.git/HEAD.lock`, `.git/objects/maintenance.lock`) recur periodically and block `rm` with "Operation not permitted" until `device_request_delete_permission` is (re-)granted for `/Users/jonny/Desktop/github/MacOS` — this can need re-granting even within the same session if the device-bridge connection drops and reconnects. Once granted, `rm` works immediately.

## Known Issues & Limits
- Changes outside project root not restored. Costs are estimates.
- Reddit is blocked for this session's WebFetch/browser tools entirely — Jonny handles Reddit directly.
- GitHub unauthenticated REST API gives public repo stats but not stargazer names (401 without a token).
- `gh` CLI not installed in the cloud container.
- The device bridge's shell is a separate Linux VM, not Jonny's real macOS — has git but no GitHub credentials, no `hermes`/`launchd`.
- Running `npm install`/`npm test` against a connected folder's existing `node_modules` from the device bridge can fail with native-binary mismatches (macOS vs Linux) — stage source only, fresh install elsewhere.
- `anthropics/claude-code` auto-closes stale issues then auto-locks ~7 days later — a `stale` label on a still-open issue is an early warning, not a reason to skip.
