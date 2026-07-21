# AI 生成 By Peng.Guo
"""进程内模型单例，配合 /unload 释放 MPS/CUDA 显存。"""

from __future__ import annotations

from typing import Any

from .device import release_device_memory

_MODELS: dict[str, Any] = {}


def get_model(key: str) -> Any | None:
    return _MODELS.get(key)


def set_model(key: str, model: Any) -> None:
    _MODELS[key] = model


def unload_models() -> None:
    _MODELS.clear()
    release_device_memory()
