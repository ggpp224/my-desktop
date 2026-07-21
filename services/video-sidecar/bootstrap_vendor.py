# AI 生成 By Peng.Guo
"""Inject vendor shims (xformers) before third-party imports."""

from __future__ import annotations

import sys
from pathlib import Path

_VENDOR = Path(__file__).resolve().parent / "vendor"
if _VENDOR.is_dir():
    vendor_path = str(_VENDOR)
    if vendor_path not in sys.path:
        sys.path.insert(0, vendor_path)
