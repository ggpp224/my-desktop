#!/usr/bin/env bash
# AI 生成 By Peng.Guo
# 断点续传 Wan2.2-TI2V-5B 权重（上次下载中断时）
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python3}"
if [[ -f "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
fi

CKPT="${WAN_CKPT_DIR:-$ROOT/models/Wan2.2-TI2V-5B}"

echo "==> 校验 Wan2.2-TI2V-5B: $CKPT"
"$PY" <<PY
from pathlib import Path
from inference.wan_ckpt_verify import assert_wan_ckpt_complete, download_wan_ckpt, list_missing_wan_ckpt_files

ckpt = Path("${CKPT}")
missing = list_missing_wan_ckpt_files(ckpt)
if not missing:
    print("权重已完整，无需下载")
else:
    print("缺少", len(missing), "个文件，开始断点续传（约 20GB+）…")
    for name in missing:
        print("  -", name)
    still = download_wan_ckpt(ckpt)
    if still:
        print("ERROR: 仍有缺失:", still)
        raise SystemExit(1)
    print("下载完成，权重已齐全")
PY
