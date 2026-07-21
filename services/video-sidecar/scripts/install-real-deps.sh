#!/usr/bin/env bash
# AI 生成 By Peng.Guo
# 本机 Apple Silicon：Python 3.11 + PyTorch(MPS) + AudioCraft（--no-deps）
set -euo pipefail
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"
cd "$ROOT"

echo "==> 系统依赖（pkg-config / ffmpeg / Python 3.11）"
if command -v brew >/dev/null 2>&1; then
  brew install pkg-config ffmpeg
  # ca-certificates bottle 偶发失败时仍可装 Python 3.11
  brew install python@3.11 --ignore-dependencies 2>/dev/null || brew install python@3.11
else
  echo "需要 Homebrew: brew install pkg-config ffmpeg python@3.11"
  exit 1
fi

export PATH="/opt/homebrew/bin:/opt/homebrew/opt/python@3.11/bin:${PATH:-}"
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:/opt/homebrew/opt/ffmpeg/lib/pkgconfig:${PKG_CONFIG_PATH:-}"

PY="/opt/homebrew/opt/python@3.11/bin/python3.11"
if [[ ! -x "$PY" ]]; then
  PY="$(command -v python3.11)"
fi
if [[ ! -x "$PY" ]]; then
  echo "未找到 python3.11"
  exit 1
fi

echo "==> 使用 Python: $("$PY" --version)"

# 用 3.11 重建 venv（AudioCraft 不支持 3.12）
rm -rf "$ROOT/.venv"
"$PY" -m venv "$ROOT/.venv"
# shellcheck disable=SC1091
source "$ROOT/.venv/bin/activate"

# setuptools 82+ 移除 pkg_resources，会导致 openai-whisper 旧版无法构建
pip install -U 'pip' 'wheel' 'setuptools>=70,<81'

echo "==> PyTorch (MPS)"
pip install torch torchaudio

pip install -r requirements.txt

echo "==> AudioCraft（跳过元数据中的 torch==2.1 / xformers）"
pip install audiocraft --no-deps
pip install -r requirements-real.txt

echo "==> 设备检测 + AudioCraft 导入"
python -c "
import bootstrap_vendor
from inference.device import resolve_device
from audiocraft.models import MusicGen
print('device:', resolve_device())
print('MusicGen import OK (xformers shim)')
"

echo ""
echo "完成。下一步: ./scripts/setup-local-models.sh"
