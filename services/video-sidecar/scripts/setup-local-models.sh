#!/usr/bin/env bash
# AI 生成 By Peng.Guo
# 克隆仓库并下载本机推理所需模型权重（体积较大，请预留磁盘与耐心）
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
MODELS="$ROOT/models"
mkdir -p "$MODELS"
cd "$ROOT"

PY="${PYTHON:-python3}"
if [[ -f "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
fi

echo "==> 使用 Python: $("$PY" --version)"

install_cosyvoice_deps() {
  echo "==> CosyVoice 依赖（Apple Silicon：跳过 CUDA / 不降级 torch）"
  # openai-whisper==20231117 的 setup.py 需要 pkg_resources；setuptools 82+ 已移除
  "$PY" -m pip install 'setuptools>=70,<81' wheel
  "$PY" -m pip install 'openai-whisper==20231117' --no-build-isolation
  "$PY" -m pip install -r "$ROOT/requirements-cosyvoice-mac.txt"
}

echo "==> 1/4 克隆 Wan2.2"
if [[ ! -d "$MODELS/Wan2.2/.git" ]]; then
  git clone --depth 1 https://github.com/Wan-Video/Wan2.2.git "$MODELS/Wan2.2"
fi
echo "==> Wan2.2 依赖（Apple Silicon：跳过 CUDA flash_attn / 不降级 torch）"
"$PY" -m pip install -r "$ROOT/requirements-wan-mac.txt"

echo "==> 2/4 下载 Wan2.2-TI2V-5B（约 20GB+，M3 Pro 推荐 5B）"
"$PY" <<'PY'
from pathlib import Path
from inference.wan_ckpt_verify import download_wan_ckpt, list_missing_wan_ckpt_files

ckpt = Path("models/Wan2.2-TI2V-5B")
missing = list_missing_wan_ckpt_files(ckpt)
if missing:
    print(f"缺少 {len(missing)} 个文件，开始/续传下载…")
    for name in missing:
        print("  -", name)
    still = download_wan_ckpt(ckpt)
    if still:
        raise SystemExit(f"Wan 权重仍不完整: {still}\n请重跑: ./scripts/resume-wan-ckpt.sh")
    print("Wan2.2-TI2V-5B 下载完成")
else:
    print("已存在且完整，跳过: models/Wan2.2-TI2V-5B")
PY

echo "==> 3/4 克隆 CosyVoice"
if [[ ! -d "$MODELS/CosyVoice/.git" ]]; then
  git clone --depth 1 https://github.com/FunAudioLLM/CosyVoice.git "$MODELS/CosyVoice"
fi
install_cosyvoice_deps

echo "==> 4/4 下载 Fun-CosyVoice3-0.5B"
if [[ ! -d "$MODELS/Fun-CosyVoice3-0.5B" ]]; then
  "$PY" <<'PY'
try:
    from modelscope import snapshot_download
    snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir="models/Fun-CosyVoice3-0.5B")
except Exception:
    from huggingface_hub import snapshot_download
    snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir="models/Fun-CosyVoice3-0.5B")
PY
else
  echo "已存在，跳过: $MODELS/Fun-CosyVoice3-0.5B"
fi

echo ""
echo "模型目录："
echo "  WAN_REPO_DIR=$MODELS/Wan2.2"
echo "  WAN_CKPT_DIR=$MODELS/Wan2.2-TI2V-5B"
echo "  COSYVOICE_REPO_DIR=$MODELS/CosyVoice"
echo "  COSYVOICE_MODEL_DIR=$MODELS/Fun-CosyVoice3-0.5B"
echo ""
echo "请将以上变量写入项目根 .env，并设置 VIDEO_MOCK_MODE=0"
