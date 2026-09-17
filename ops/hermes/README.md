# Hermes — Agent Receipt 신호 감시

PLAN.md §3의 "Hermes 실시간 감지" 구현. Mac 로컬 Hermes gateway(launchd)에서 동작.

## 구성
| 파일 | 역할 |
|---|---|
| `bootstrap.sh` | 설치·설정·cron 등록 일괄 실행. 재실행해도 안전(중복 등록 없음) |
| `agent_receipt_watch.py` | cron pre-run script. HN(Algolia)·GitHub 이슈·Reddit에서 새 후보만 수집. 새 후보 없으면 출력 없음 → LLM 호출 없이 조용히 종료 |
| `cron_prompt.md` | 후보를 "실제 파일 손실·복구 고민"인지 분류 → 텔레그램 메시지(한국어 요약 + 영어 답글 초안). 해당 없으면 `[SILENT]` |
| `bootstrap.log` | 실행 로그 (대화형 마법사 출력은 제외) |

## 실행
```bash
bash ~/Desktop/github/MacOS/agent-receipt/ops/hermes/bootstrap.sh
```
키 입력이 필요한 단계(OpenRouter API key, Telegram bot token / home channel)에서만 마법사가 뜬다.

## 동작
- job 이름: `agent-receipt-watch`, 스케줄 `0 9,13,18,22 * * *` (KST, 하루 4회)
- 수집 lookback 36시간 + seen-state(`~/.hermes/scripts/.agent_receipt_seen.json`)로 중복 제거
- 2단계 커밋: 이번 배치는 `.agent_receipt_pending.json`에 두고, 다음 실행 때 `~/.hermes/cron/jobs.json`에서 직전 실행이 `ok`(전달 오류 없음)였을 때만 seen으로 확정. 실패했으면 같은 후보를 다시 보냄
- 상태 초기화: `python3 ~/.hermes/scripts/agent_receipt_watch.py --reset`
- 자기 글(`jonnylab`) 제외
- 답글은 자동 게시하지 않음. 초안만 텔레그램으로 전달

## 운영 명령
```bash
hermes cron list                       # 등록 상태
hermes cron run agent-receipt-watch    # 즉시 1회 실행
hermes cron runs agent-receipt-watch   # 실행 이력
hermes gateway status                  # launchd 서비스 상태
python3 ~/.hermes/scripts/agent_receipt_watch.py --dry-run --hours 72   # 수집만 확인
```
수집 스크립트를 고치면 `bootstrap.sh`를 다시 실행해 `~/.hermes/scripts/`로 복사한다. cron job은 손으로 편집하지 말고 `hermes cron edit/remove`를 쓴다.

## 한계
- Mac이 잠자기 상태면 해당 시각 실행이 밀리거나 빠진다. 24시간 감시가 필요하면 서버 이전 검토.
- GitHub 비인증 검색은 분당 10회 제한. `GITHUB_TOKEN` 환경변수가 있으면 사용.
- Reddit `.json`은 환경에 따라 403 차단될 수 있음. 차단 시 해당 소스만 건너뜀.
