#!/bin/bash
# 수동 확인용 래퍼: Hermes 수집 스크립트를 dry-run(상태 저장 없음)으로 실행한다.
#   bash ~/Desktop/github/MacOS/agent-receipt/monitor.sh [시간, 기본 72]
exec python3 "$(cd "$(dirname "$0")" && pwd)/ops/hermes/agent_receipt_watch.py" --dry-run --hours "${1:-72}"
