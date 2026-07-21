#!/usr/bin/env bash
# AI 生成 By Peng.Guo
set -euo pipefail
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:${PATH:-}"
export FFMPEG_PATH="${FFMPEG_PATH:-/opt/homebrew/bin/ffmpeg}"
export VIDEO_MOCK_MODE="${VIDEO_MOCK_MODE:-1}"
ENV_FILE="$ROOT/../../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
PY="${PYTHON:-python3}"
if [[ -f "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
fi
start_one() {
  local kind="$1"
  local port="$2"
  echo "Starting $kind on :$port (VIDEO_MOCK_MODE=$VIDEO_MOCK_MODE)"
  "$PY" "$ROOT/base_server.py" --kind "$kind" --port "$port" &
}
start_one wan 5101
start_one cosyvoice 5102
start_one music 5103
start_one foley 5104
echo "All sidecars started. PIDs: $!"
wait
