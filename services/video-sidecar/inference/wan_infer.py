# AI 生成 By Peng.Guo
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from .wan_apple_silicon_patch import apply_wan_apple_silicon_patches


def _wan_paths() -> tuple[Path, Path]:
    root = Path(__file__).resolve().parents[1]
    repo = Path(os.environ.get("WAN_REPO_DIR", str(root / "models" / "Wan2.2")))
    ckpt = Path(os.environ.get("WAN_CKPT_DIR", str(root / "models" / "Wan2.2-TI2V-5B")))
    return repo, ckpt


def _resolution_to_wan_size(resolution: str) -> str:
    """Map UI resolution to Wan generate.py --size choices."""
    # generate.py: 720*1280,1280*720,480*832,832*480,704*1280,1280*704,1024*704,704*1024
    mapping = {
        "480p": "832*480",
        "720p": "1280*720",
        "1080p": "1280*720",
    }
    return mapping.get(resolution, "1280*720")


def _duration_to_frame_num(duration_sec: float, fps: int) -> int:
    """Wan requires frame_num = 4n+1."""
    raw = max(1, int(round(float(duration_sec) * max(1, int(fps)))))
    n = max(1, min(30, round((raw - 1) / 4)))
    return int(4 * n + 1)


def generate_video(
    prompt: str | None,
    negative_prompt: str | None,
    resolution: str,
    fps: int,
    duration_sec: float,
    output_path: str,
) -> None:
    repo, ckpt = _wan_paths()
    generate_py = repo / "generate.py"
    if not generate_py.is_file():
        raise RuntimeError(f"未找到 Wan2.2 仓库: {repo}\n请运行: ./scripts/setup-local-models.sh")
    if not ckpt.is_dir():
        raise RuntimeError(f"未找到 Wan2.2 权重: {ckpt}\n请运行: ./scripts/setup-local-models.sh")

    apply_wan_apple_silicon_patches(repo)

    size = _resolution_to_wan_size(resolution)
    frame_num = _duration_to_frame_num(duration_sec, fps)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    # generate.py 无 --negative_prompt；用内置 config.sample_neg_prompt（可通过 WAN_NEGATIVE_PROMPT 覆盖）
    task = os.environ.get("WAN_TASK", "ti2v-5B")
    cmd = [
        sys.executable,
        str(generate_py),
        "--task",
        task,
        "--size",
        size,
        "--frame_num",
        str(frame_num),
        "--ckpt_dir",
        str(ckpt),
        "--prompt",
        prompt or "cinematic scene",
        "--save_file",
        str(out),
        "--t5_cpu",
        "--offload_model",
        "True",
    ]

    env = {
        **os.environ,
        "PYTORCH_ENABLE_MPS_FALLBACK": "1",
    }
    if negative_prompt and negative_prompt.strip():
        env["WAN_NEGATIVE_PROMPT"] = negative_prompt.strip()

    proc = subprocess.run(cmd, cwd=str(repo), env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "Wan2.2 推理失败（本机 Apple Silicon 可能较慢或需官方 MPS 支持）:\n"
            + (proc.stderr or proc.stdout or f"exit {proc.returncode}")
        )
    if not out.is_file() or out.stat().st_size < 1024:
        raise RuntimeError("Wan2.2 未生成有效视频文件")


def unload_wan() -> None:
    # Wan 子进程模式，无进程内权重；保留钩子供统一 unload
    pass
