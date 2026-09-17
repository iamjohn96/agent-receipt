# Agent Receipt working rules

## What this is
A local, observe-only CLI. Coding-agent hooks call `agent-receipt hook <agent>`; it snapshots the project
folder around mutating tool calls, records a hash-chained event log per session, renders a receipt, and
restores files one by one. Plan and GO/PIVOT/KILL criteria: `docs/PLAN.md`. Reuse decisions: `docs/REUSE_ANALYSIS.md`.

## Hard rules
- Hooks never print to stdout, never exit non-zero, never block or alter the agent.
- Nothing leaves the machine. Telemetry, if added, is opt-in, default off, and carries no paths, content or commands.
- Hook-supplied identifiers never become path segments without `safeSegment`.
- Restore never overwrites a file whose current content differs from the recorded post-image without `--force`,
  and always backs up current content first.
- Receipts state what is not observed (`coverage.notObserved`). Never claim causal attribution.
- v0 anti-scope: policy/blocking, approvals, live dashboard, SQLite, signing, cloud, anything from APG `src/stage/**`.

## Allowed without approval
Read/search this repo, edit src/test/docs, build, test, bench.

## Approval required
`npm publish`, `git push`, adding runtime dependencies, editing any real `~/.claude/settings.json`,
reading real `.env`/credentials, changes outside this repository.

## Layout
- `src/hooks/` agent adapters (`claude.ts`) → agent-neutral `Recorder`
- `src/snapshot/` scan + diff · `src/store/cas.ts` content-addressed blobs · `src/session/` ledger, events, store
- `src/receipt/` build + text render · `src/restore/` plan/execute · `src/risk/` command risk, outside-root access
- `src/cost/` transcript token estimate · `src/install/` Claude settings merge · `src/cli/main.ts`

## Work session operating rules (user instruction, 2026-09-17)
Priority: explicit user instruction → AGENTS.md → PROJECT_STATE.md → existing decisions (docs/) → general defaults.
For this repository these rules replace the Terra/Sol/Luna footer from `JONNYLAB_WORK_POLICY.md`.

- **Session start (no edits yet):** read AGENTS.md and PROJECT_STATE.md → check branch, `git status`, recent commits,
  build/test config → report any mismatch between PROJECT_STATE.md and the repo before assuming either is right →
  give a short state check (milestone, relevant architecture, likely files, constraints, approach) → continue the task.
- **Work:** minimal targeted changes, existing patterns, evidence before architecture changes, tests/build after meaningful
  changes. Consequential changes: Understand → Decide → Act. Data-loss/external-effect risk: Confirm → Verify → Recover.
- **Skills** (use only when they materially help): Archify (boundary changes → `docs/architecture/`), systematic-debugging,
  verification-before-completion (always before claiming done; without run evidence say "Implemented but not fully verified"),
  requesting-code-review, writing-plans, writing-skills, TDD, security-audit, api-contract-verification, git-workflow-hygiene.
- **Approval required:** architecture change, new library/dependency, schema/data migration, production deploy or publish,
  secret/credential/permission changes, product spec changes. Not required: planned implementation, tests, bug fixes, lint, docs, diagrams.
- **Model routing (lowest sufficient tier + thinking):** Claude Haiku 4.5 (implementation, tests, docs; Thinking Off/Medium) →
  Claude Sonnet 5 (review, unknown bugs, contract/security audit, tradeoffs; Thinking High) →
  Claude Opus 5 (architecture, cross-validation, hard concurrency, escalation, data-loss/security decisions; Thinking Medium/High).
- **State:** milestone, decision, limitation or priority changes → PROJECT_STATE.md; durable rule changes → AGENTS.md.

### Session end report (Korean, this exact structure)
```
## 이번 세션 결과 / Feedback      — work done + real results, remaining blockers/risks, key context for next session
Verification: Verified | Partially Verified | Not Verified
Evidence: <one line: run evidence or reason not verified>
## 이전 단계 요약                  — state before this session, 2–4 lines
## 다음 행동 추천
Next:
<one next action>
## 사용자 승인
Approval Required: Yes | No
Reason: <reason>
## 추천 모델
Recommended: <Claude model> (Thinking: <Off|Low|Medium|High>)
Reason: <reason>
```
