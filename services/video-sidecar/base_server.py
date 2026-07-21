# AI 生成 By Peng.Guo
"""Shared FastAPI sidecar base for video pipeline (mock + real inference hooks)."""

from __future__ import annotations

import bootstrap_vendor  # noqa: F401 — xformers shim on Apple Silicon

import asyncio
import os
import subprocess
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field
import uvicorn


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"


@dataclass
class JobRecord:
    status: JobStatus = JobStatus.PENDING
    progress: int = 0
    output_path: str | None = None
    error: str | None = None


class GenerateRequest(BaseModel):
    prompt: str | None = None
    title: str | None = None
    negative_prompt: str | None = Field(None, alias="negativePrompt")
    text: str | None = None
    speaker: str | None = None
    speed: float = 1.0
    resolution: str = "720p"
    fps: int = 24
    duration_sec: float = Field(8, alias="durationSec")
    output_path: str = Field(..., alias="outputPath")
    kind: str | None = None

    model_config = {"populate_by_name": True}


def resolution_to_size(resolution: str) -> tuple[int, int]:
    mapping = {"480p": (854, 480), "720p": (1280, 720), "1080p": (1920, 1080)}
    return mapping.get(resolution, (1280, 720))


def ffmpeg_bin() -> str:
    return os.environ.get("FFMPEG_PATH", "ffmpeg")


def run_ffmpeg(args: list[str]) -> None:
    bin_path = ffmpeg_bin()
    cmd = [bin_path, *args[1:]] if args and args[0] == "ffmpeg" else [bin_path, *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"ffmpeg failed: {proc.returncode}")


async def mock_generate_video(req: GenerateRequest) -> None:
    out = Path(req.output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    w, h = resolution_to_size(req.resolution)
    duration = max(2, min(30, req.duration_sec))
    title = (req.title or req.prompt or "AI Video Mock").replace("'", "\\'")[:40]
    # 彩色测试画面 + 标题叠字，Mock 模式便于确认有画面
    run_ffmpeg([
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"testsrc2=size={w}x{h}:rate={req.fps}:duration={duration}",
        "-vf", f"drawtext=text='{title}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=h-80:box=1:boxcolor=black@0.5",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-an",
        str(out),
    ])


async def mock_generate_audio(req: GenerateRequest, freq: float = 440.0) -> None:
    out = Path(req.output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    duration = max(2, min(30, req.duration_sec))
    run_ffmpeg([
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"sine=frequency={freq}:duration={duration}",
        "-af", "volume=0.6",
        "-ar", "44100",
        str(out),
    ])


def create_app(service_name: str, model_name: str, service_kind: str) -> FastAPI:
    app = FastAPI(title=f"{service_name} Sidecar")
    jobs: dict[str, JobRecord] = {}
    mock_mode = os.environ.get("VIDEO_MOCK_MODE", "1") in ("1", "true", "yes", "on")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        payload: dict[str, Any] = {
            "ok": True,
            "model": model_name,
            "ready": True,
            "mock": mock_mode,
            "service": service_name,
            "kind": service_kind,
        }
        if not mock_mode:
            try:
                from inference.device import resolve_device
                payload["device"] = resolve_device()
            except Exception as exc:  # noqa: BLE001
                payload["ok"] = False
                payload["ready"] = False
                payload["error"] = str(exc)
        return payload

    @app.post("/unload")
    async def unload() -> dict[str, bool]:
        if not mock_mode:
            if service_kind == "wan":
                from inference.wan_infer import unload_wan
                unload_wan()
            elif service_kind == "cosyvoice":
                from inference.cosyvoice_infer import unload_cosyvoice
                unload_cosyvoice()
            elif service_kind in ("music", "foley"):
                from inference.audiocraft_infer import unload_audiocraft
                unload_audiocraft()
        return {"ok": True}

    async def _run_real_job(req: GenerateRequest) -> None:
        if service_kind == "wan":
            from inference.wan_infer import generate_video
            await asyncio.to_thread(
                generate_video,
                req.prompt,
                req.negative_prompt,
                req.resolution,
                req.fps,
                req.duration_sec,
                req.output_path,
            )
        elif service_kind == "cosyvoice":
            from inference.cosyvoice_infer import generate_voice
            await asyncio.to_thread(generate_voice, req.text, req.speaker, req.output_path)
        elif service_kind == "music":
            from inference.audiocraft_infer import generate_music
            await asyncio.to_thread(generate_music, req.prompt, req.duration_sec, req.output_path)
        elif service_kind == "foley":
            from inference.audiocraft_infer import generate_foley
            await asyncio.to_thread(generate_foley, req.prompt, req.duration_sec, req.output_path)
        else:
            raise ValueError(f"unknown kind: {service_kind}")

    async def _run_job(job_id: str, req: GenerateRequest) -> None:
        record = jobs[job_id]
        record.status = JobStatus.RUNNING
        try:
            record.progress = 10
            if mock_mode:
                for p in (20, 50, 80):
                    record.progress = p
                    await asyncio.sleep(0.3)
                if service_kind == "wan":
                    await mock_generate_video(req)
                elif service_kind == "cosyvoice":
                    await mock_generate_audio(req, freq=330.0)
                elif service_kind == "music":
                    await mock_generate_audio(req, freq=261.6)
                elif service_kind == "foley":
                    await mock_generate_audio(req, freq=180.0)
                else:
                    raise ValueError(f"unknown kind: {service_kind}")
            else:
                record.progress = 30
                await _run_real_job(req)
            record.progress = 100
            record.output_path = req.output_path
            record.status = JobStatus.SUCCESS
        except Exception as exc:  # noqa: BLE001
            record.status = JobStatus.FAILURE
            record.error = str(exc)

    @app.post("/generate")
    async def generate(req: GenerateRequest) -> dict[str, str]:
        job_id = str(uuid.uuid4())
        jobs[job_id] = JobRecord()
        asyncio.create_task(_run_job(job_id, req))
        return {"jobId": job_id}

    @app.get("/jobs/{job_id}")
    async def get_job(job_id: str) -> dict[str, Any]:
        record = jobs.get(job_id)
        if not record:
            return {"status": JobStatus.FAILURE.value, "error": "job not found"}
        return {
            "status": record.status.value,
            "progress": record.progress,
            "outputPath": record.output_path,
            "error": record.error,
        }

    return app


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", required=True, choices=["wan", "cosyvoice", "music", "foley"])
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    names = {
        "wan": ("Wan2.2", "Wan2.2-TI2V-5B"),
        "cosyvoice": ("CosyVoice", "Fun-CosyVoice3-0.5B"),
        "music": ("AudioCraft", "musicgen-small"),
        "foley": ("Foley", "audiogen-medium"),
    }
    service_name, model_name = names[args.kind]
    app = create_app(service_name, model_name, args.kind)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
