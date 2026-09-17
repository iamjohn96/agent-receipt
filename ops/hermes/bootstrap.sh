#!/bin/bash
# Agent Receipt signal monitoring — Hermes bootstrap for macOS (idempotent; safe to re-run).
#   bash ~/Desktop/github/MacOS/agent-receipt/ops/hermes/bootstrap.sh
# Log: ops/hermes/bootstrap.log (same folder)
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/bootstrap.log"
JOB_NAME="agent-receipt-watch"
SCHEDULE="0 9,13,18,22 * * *"   # local time (KST)
ENVF="$HOME/.hermes/.env"
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

# 비대화형 출력만 로그에 남긴다 (setup 마법사는 TTY가 필요해서 tee로 감싸지 않음)
say()  { echo "$*" | tee -a "$LOG"; }
L()    { "$@" 2>&1 | tee -a "$LOG"; }
step() { say ""; say "==> $*"; }
fail() { say "BOOTSTRAP_FAILED: $*"; exit 1; }

say "=== bootstrap $(date '+%Y-%m-%d %H:%M:%S %Z') ==="

step "1/7 Hermes 설치 확인"
if ! command -v hermes >/dev/null 2>&1; then
  say "hermes 없음 → 공식 설치 스크립트 실행 (setup 마법사는 뒤에서 따로 실행)"
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup 2>&1 | tee -a "$LOG"
  [ "${PIPESTATUS[1]}" -eq 0 ] || fail "installer"
  export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
  hash -r
fi
command -v hermes >/dev/null 2>&1 || fail "hermes not on PATH after install"
say "hermes: $(command -v hermes)"
L hermes --version

step "2/7 수집 스크립트 배치"
mkdir -p "$HOME/.hermes/scripts"
cp "$DIR/agent_receipt_watch.py" "$HOME/.hermes/scripts/agent_receipt_watch.py" || fail "copy script"
chmod 700 "$HOME/.hermes/scripts/agent_receipt_watch.py"
say "ok: ~/.hermes/scripts/agent_receipt_watch.py"

has_env() { [ -f "$ENVF" ] && grep -qE "^$1=.+" "$ENVF"; }

step "3/7 모델 키 확인 (OpenRouter)"
if has_env OPENROUTER_API_KEY; then
  say "ok: OPENROUTER_API_KEY 설정됨"
else
  say "ACTION: 모델 설정 마법사에서 OpenRouter 선택 후 API 키를 직접 입력하세요."
  hermes setup model
  has_env OPENROUTER_API_KEY || say "warn: OPENROUTER_API_KEY 없음 (다른 provider를 골랐다면 무시)"
fi

step "4/7 텔레그램 확인"
if has_env TELEGRAM_BOT_TOKEN && has_env TELEGRAM_HOME_CHANNEL; then
  say "ok: TELEGRAM_BOT_TOKEN / TELEGRAM_HOME_CHANNEL 설정됨"
else
  say "ACTION: 텔레그램 봇 토큰, 허용 사용자 ID, 홈 채널(알림 받을 chat id)을 직접 입력하세요."
  hermes gateway setup
  has_env TELEGRAM_BOT_TOKEN || fail "TELEGRAM_BOT_TOKEN missing"
  has_env TELEGRAM_HOME_CHANNEL || say "warn: TELEGRAM_HOME_CHANNEL 없음 → 봇에게 /sethome 을 보내 홈 채널을 지정하세요"
fi

step "4.5/7 텔레그램 전송 의존성 (python-telegram-bot)"
HPY=""
for c in "$HOME/.hermes/hermes-agent/venv/bin/python" "/usr/local/lib/hermes-agent/venv/bin/python"; do
  [ -x "$c" ] && HPY="$c" && break
done
if [ -z "$HPY" ]; then
  HPY="$(grep -oE '"[^"]+/venv/bin/python"' "$(command -v hermes)" 2>/dev/null | head -1 | tr -d '"')"
fi
if [ -n "$HPY" ] && [ -x "$HPY" ]; then
  HDIR="$(cd "$(dirname "$HPY")/../.." && pwd)"
  (cd "$HDIR" && L "$HPY" -c "from tools.lazy_deps import ensure, is_available; ensure('platform.telegram', prompt=False); print('telegram available:', is_available('platform.telegram'))")
else
  say "warn: Hermes venv python을 못 찾음 → gateway가 첫 사용 시 lazy install 시도"
fi

step "5/7 수집 스크립트 dry-run (72h)"
L python3 "$HOME/.hermes/scripts/agent_receipt_watch.py" --dry-run --hours 72

step "6/7 cron job 등록 ($JOB_NAME)"
JOBS="$(hermes cron list 2>/dev/null || true)"   # pipefail+grep -q 조합은 SIGPIPE로 오판 → 변수로 받는다
if grep -q "Name: *$JOB_NAME\$" <<<"$JOBS"; then
  say "skip: 이미 등록됨"
else
  hermes cron create "$SCHEDULE" "$(cat "$DIR/cron_prompt.md")" \
    --name "$JOB_NAME" --deliver telegram --script agent_receipt_watch.py \
    || fail "cron create"
fi
L hermes cron list

step "7/7 gateway 백그라운드 서비스 (launchd)"
hermes gateway install || say "warn: gateway install 반환값 비정상"
hermes gateway start >/dev/null 2>&1 || true
sleep 3
L hermes gateway status
L hermes cron status

echo
say "첫 알림 테스트: 다음 scheduler tick(≤60초)에 실행 → 텔레그램 확인"
L hermes cron run "$JOB_NAME"
echo
say "BOOTSTRAP_DONE $(date '+%H:%M:%S')"
