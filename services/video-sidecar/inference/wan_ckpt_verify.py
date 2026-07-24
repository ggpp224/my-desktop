# AI 生成 By Peng.Guo
"""Verify Wan2.2-TI2V-5B checkpoint files before inference."""

from __future__ import annotations

from pathlib import Path

WAN_TI2V_5B_REQUIRED = (
    "models_t5_umt5-xxl-enc-bf16.pth",
    "Wan2.2_VAE.pth",
    "diffusion_pytorch_model-00001-of-00003.safetensors",
    "diffusion_pytorch_model-00002-of-00003.safetensors",
    "diffusion_pytorch_model-00003-of-00003.safetensors",
    "diffusion_pytorch_model.safetensors.index.json",
    "google/umt5-xxl/spiece.model",
)


def list_missing_wan_ckpt_files(ckpt_dir: Path | str) -> list[str]:
    root = Path(ckpt_dir)
    missing: list[str] = []
    for rel in WAN_TI2V_5B_REQUIRED:
        path = root / rel
        if not path.is_file() or path.stat().st_size < 1024:
            missing.append(rel)
    return missing


def assert_wan_ckpt_complete(ckpt_dir: Path | str) -> None:
    missing = list_missing_wan_ckpt_files(ckpt_dir)
    if not missing:
        return
    ckpt = Path(ckpt_dir)
    lines = "\n".join(f"  - {name}" for name in missing)
    raise RuntimeError(
        f"Wan2.2 权重不完整（上次下载可能中断）: {ckpt}\n"
        f"缺少文件:\n{lines}\n\n"
        "请执行断点续传（约 20GB+，需稳定网络）:\n"
        "  npm run video:resume-wan-ckpt\n"
        "或:\n"
        "  cd services/video-sidecar && ./scripts/resume-wan-ckpt.sh"
    )


def download_wan_ckpt(local_dir: Path | str) -> list[str]:
    """Resume HuggingFace snapshot download; returns still-missing files."""
    from huggingface_hub import snapshot_download

    target = Path(local_dir)
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        "Wan-AI/Wan2.2-TI2V-5B",
        local_dir=str(target),
        resume_download=True,
    )
    return list_missing_wan_ckpt_files(target)
