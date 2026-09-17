# Agent Receipt v0 — APG 코드 재사용 분석

작성: 2026-09-17 · 기준: `agent-permission-guard` @ `cf0f419` (src/audit, src/risk, src/dashboard, src/db 직접 검토)

## 0. 결론 먼저

APG는 **게이트웨이**(MCP 호출을 가로채서 허용/거부)이고, Agent Receipt는 **관찰자**(에이전트가 한 일을 사후에 기록·복구)다.
이 차이 때문에 APG의 스키마·DB·대시보드 라우트는 대부분 그대로 못 가져오고, **작은 순수 함수와 설계 패턴**이 재사용 가치의 핵심이다.
실제로 복사 가능한 코드는 약 150줄, 패턴 참고가 약 500줄, 나머지(~2,100줄)는 v0에 불필요.

가장 큰 신규 작업은 APG에 아예 없는 **파일시스템 스냅샷/CAS 엔진**이다. `/rewind`의 Bash 한계를 메우는 게 이 제품의 존재 이유이므로, 여기에 빌드 시간의 절반을 쓴다.

## 1. 파일별 판정

| APG 파일 | 줄 수 | 판정 | 이유 / 가져갈 것 |
|---|---:|---|---|
| `audit/canonical-json.ts` | 14 | **그대로 복사** | 키 정렬 JSON. 영수증 digest의 기반. |
| `audit/redaction.ts` | 43 | **복사 + 확장 필수** | 키 이름 기반(`token`, `password`…)만 가림. 셸 명령은 문자열이라 `export OPENAI_API_KEY=sk-…`가 **그대로 통과함** → 값 패턴(sk-, ghp_, AKIA, Bearer, `KEY=값`) 리댁션 추가 필요. 공유 카드에 비밀이 찍히면 제품이 끝나므로 v0 필수. |
| `audit/recorder.ts` | 847 | **패턴만 (~40줄)** | `appendEvent`의 `sha256(previousHash + "\n" + eventJson)` 체인과 `verifyChain` 루프만 가져옴. `tool_calls`/승인/Graph Genesis/MCP 결과 요약은 불필요. **주의:** 훅은 호출마다 별도 프로세스라 병렬 PostToolUse에서 체인 append가 경합 → 세션 단위 lockfile(O_EXCL) 신규 필요. |
| `audit/receipt.ts` | 630 | **스키마 폐기, 기법만** | ER1 스키마는 APG 전용(`routedThroughApg: literal(true)`, policy/approval/identityAssurance). 가져갈 것: zod `.strict()` 스키마 작성 방식, `validateJsonValue`(깊이·크기·순환 제한), `receiptDigest`, **`coverage.observed / notObserved` + `limitations` 블록** — "우리가 못 보는 것"을 영수증에 명시하는 이 정직성 장치는 Agent Receipt의 신뢰 근거로 그대로 채택. |
| `audit/portable-receipt.ts` | 425 | **개념 재사용, 재작성** | envelope + 이벤트 proof + 파일 크기 상한 + `timingSafeEqual` 비교 구조는 유효. SQLite 행 기반이라 JSONL 기반으로 재작성. v0에선 `receipt verify` 하나로 축소. |
| `audit/query-service.ts` | 114 | 불필요 | SQLite 조회용. |
| `risk/scorer.ts` + `types.ts` | 149 | **구조 재사용, 탐지기 재작성 (~60%)** | Map 기반 signal 중복제거·점수 합산·band 구간(30/60/80)은 그대로. 탐지 대상이 MCP 툴 이름 → **셸 명령·경로**로 바뀜: `rm -rf`, `git reset --hard`, `git clean -fd`, `git push --force`, `curl … \| sh`, `sudo`, `chmod -R`, `.env`/`~/.ssh`/`~/.aws` 접근, 작업 폴더 밖 경로, 한 명령에 N개 이상 삭제. |
| `dashboard/server.ts` | 359 | **v0에서 제외** | 라이브 서버 대신 정적 HTML 영수증 파일(`receipt open`)이 더 단순하고 공격면 0. 나중에 라이브 뷰가 필요하면 보안 골격(127.0.0.1 바인드, Host/Origin 검사, 32자+ 토큰 timing-safe 비교, CSP·XFO 헤더, ~80줄)만 가져옴. 승인/정책/graph 라우트는 영구 제외. |
| `dashboard/state-file.ts` | 178 | 제외 | 대시보드 없으면 불필요. `ensurePrivateDirectory`(0700) 패턴만 차용. |
| `db/database.ts`, `migrations/` | ~250 | **v0에서 제외** | `better-sqlite3`는 네이티브 빌드 의존성 + APG는 `node >=24` 요구 → "한번 써보세요"의 설치 마찰. v0는 세션별 JSONL + 파일 CAS, `node >=20`, 네이티브 의존성 0. |
| `src/stage/**`, graph-genesis | — | **가져오지 않음** | 지시대로. |
| 테스트 606개 | — | 일부만 | canonical-json·redaction·체인 검증 테스트만 포팅. 나머지는 버리는 부분의 테스트. |

`jonnylabdesk-macos`(Python)는 코드 이식 불가, **원칙 2개만 채택**:
1. 명령 전후 스냅샷 델타는 "그 명령 중 관찰된 변화"이지 **인과 증명이 아니다**(dev 서버·watcher도 파일을 바꿈) → 영수증 문구를 "Bash 실행 중 변경됨"으로, 명령 사이 변화는 "귀속 불가"로 표기.
2. 복구는 현재 파일이 기록된 post-image와 **다르면 멈춘다**(fail closed) → `--force` 없이는 사용자 수정본을 덮어쓰지 않음.

## 2. 새로 짜야 하는 것 (우선순위순)

| # | 모듈 | 내용 | 비고 |
|---|---|---|---|
| 1 | **snapshot/CAS** | 세션 시작 시 작업 폴더 baseline(경로·size·mtime·ino·sha256), 블롭은 `~/.agent-receipt/objects/`에 저장. macOS APFS는 `copyFile(COPYFILE_FICLONE)`로 거의 무용량 복제. 이후 스캔은 stat 변경분만 재해시. **gitignored 파일 포함**(`.env`, 미커밋 작업이 실제 손실 대상). 기본 제외: `.git`, `node_modules`, 파일당 5MB 초과. | 핵심. 대형 레포 성능(스캔 1회 <300ms 목표)이 최대 기술 리스크 → Day 1에 실측. |
| 2 | **Claude Code 훅 어댑터** | `SessionStart`(baseline) → `PreToolUse`(Bash/Write/Edit/MultiEdit: pre-scan) → `PostToolUse`(post-scan → diff → 이벤트) → `SessionEnd`(영수증 확정). stdin의 `session_id`, `transcript_path`, `cwd`, `tool_name`, `tool_input` 사용. **항상 exit 0, 결정 출력 없음**(관찰 전용, 에이전트를 절대 막지 않음). | 훅 이벤트·필드는 공식 문서로 확인됨. |
| 3 | **installer** | `agent-receipt init`: `~/.claude/settings.json`에 훅 병합(백업 → diff 표시 → 확인 → 기록), `uninstall`로 원복. 대안: Claude Code 플러그인(`hooks/hooks.json`)으로 배포 — settings 직접 수정보다 신뢰 비용이 낮음. | 사용자 설정 파일을 건드리므로 human-controlled 원칙 적용. |
| 4 | **diff & 귀속** | Pre~Post 사이 = 해당 툴 호출에 귀속, Post~다음 Pre 사이 = "귀속 불가(외부/백그라운드)". | |
| 5 | **작업 폴더 밖 접근** | 정확: Read/Write/Edit의 `file_path`가 cwd 밖. 추정: Bash 명령 토큰의 절대경로·`~`·`..`·민감 경로. 폴더 밖 **실제 변경은 관찰 안 됨**을 coverage에 명시. | |
| 6 | **비용** | transcript JSONL의 `usage`를 message id/requestId로 중복 제거 후 목록가 계산, "추정"으로 표기. 공식 문서엔 usage 필드 스펙이 없고 스트리밍 placeholder 값 이슈(#28197)가 있어 **정확 비용 주장 금지**. | |
| 7 | **AR1 영수증 + 렌더러** | JSON(스키마·digest·coverage) + 터미널 출력 + 단일 HTML "영수증 카드". `--share` 모드: 절대경로·프로젝트명 마스킹, 명령 값 리댁션 → **설명 없이 스크린샷 공유 가능한 장면**을 도구가 직접 만든다. | 1차 콘텐츠 단위의 원천. |
| 8 | **restore** | `agent-receipt restore <session> <path>` / `--deleted`. 기본 dry-run, `--yes`로 실행. 복구 직전 현재 상태도 CAS에 저장(복구 자체가 되돌림 가능). post-image 불일치 시 중단. | |
| 9 | Codex 어댑터 (stretch) | Codex 훅(`~/.codex/hooks.json`, PreToolUse/PostToolUse, `apply_patch`·`exec_command` 포함)으로 같은 파이프라인. 롤아웃 포맷은 변경 중이라 비용 파싱은 후순위. | Claude 버전 출시 **후에만**. |

Cursor는 v0 범위 밖. 단 Cursor가 "Claude Code 훅 로딩"을 지원한다고 문서에 명시 → 추가 작업 없이 부분 동작할 가능성, 출시 후 확인만.

## 3. v0에서 의도적으로 안 하는 것 (anti-scope)

정책 엔진/차단, 승인 흐름, 라이브 대시보드, SQLite, 서명 영수증, 클라우드/계정, 텔레메트리 기본 ON, 폴더 밖 변경 복구, 인과 증명, Graph Genesis 계열.

> 솔직한 관찰: APG와 JonnyLab Desk는 둘 다 사용자 이전에 보증 계층(Graph Genesis V2, D-089 등)이 깊어졌다. Agent Receipt의 2주 검증은 그 반대로 가야 한다 — **"설치 5분, 첫 영수증 1세션"이 모든 설계 판단의 상한.**

## 4. 경쟁 지형 (2026-09-17 확인, Day 0에 직접 설치해 재확인)

| 도구 | 규모 | 커버 | Agent Receipt와의 차이(가설) |
|---|---|---|---|
| Entire CLI (entireio/cli) | ★4.9k, MIT | 8개 에이전트, 프롬프트·수정 파일·토큰, 턴 단위 shadow-git 스냅샷 | **D0 확인:** gitignored 제외, Bash 귀속 없음, restore 명령 삭제됨 → 우리 시나리오 미해결 (PLAN.md §6) |
| ccundo | ★1.4k | Claude JSONL 기반 undo, bash 명령은 인식만("Manual intervention required") | Bash 삭제 복구 불가 |
| work-checkpoints | ★5 | shadow-git 전체 트리 스냅샷, 파일 단위 복구 | 기능은 가깝고 배포력 없음 |
| aireceipts | ★29 | 비용 "receipts" | 이름 유사 |
| npm `agent-receipt` | 0.2.0 (2026-03) | 훅 기반 세션 영수증(의도·비용·side effects), SQLite | **D0 확인:** Bash는 명령 텍스트만, 스냅샷·복구 없음. 이름·컨셉 선점 |
| Claude Code `/rewind` | 내장 | 편집 툴 변경만 | 공식 문서: "Checkpointing does not track files modified by Bash commands" |
| Codex | 내장 | `/undo`는 2025-12 제거됨(PR #8424), 복원 요청 이슈 열려 있음(#44852) | Codex 쪽 고통 신호가 오히려 선명 |

출처: code.claude.com/docs/en/checkpointing, /hooks, /statusline · learn.chatgpt.com/docs/hooks · github.com/openai/codex PR #8424, issue #44852 · cursor.com/docs/hooks · 각 GitHub 레포.
