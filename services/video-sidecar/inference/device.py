# AI 生成 By Peng.Guo
"""本机推理设备：Apple Silicon 优先 MPS，其次 CUDA，最后 CPU。"""

from __future__ import annotations


def resolve_device() -> str:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("未安装 PyTorch，请运行: ./scripts/install-real-deps.sh") from exc

    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def release_device_memory() -> None:
    import gc

    gc.collect()
    try:
        import torch
    except ImportError:
        return
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        torch.mps.empty_cache()
