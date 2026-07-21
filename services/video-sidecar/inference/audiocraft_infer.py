# AI 生成 By Peng.Guo
from __future__ import annotations

from pathlib import Path

import torch
import torchaudio

from .device import resolve_device
from .registry import get_model, set_model, unload_models


def _load_music_model():
    cached = get_model("musicgen")
    if cached is not None:
        return cached
    from audiocraft.models import MusicGen

    device = resolve_device()
    model_id = __import__("os").environ.get("AUDIOCRAFT_MUSIC_MODEL", "facebook/musicgen-small")
    model = MusicGen.get_pretrained(model_id, device=device)
    set_model("musicgen", model)
    return model


def _load_foley_model():
    cached = get_model("audiogen")
    if cached is not None:
        return cached
    from audiocraft.models import AudioGen

    device = resolve_device()
    model_id = __import__("os").environ.get("AUDIOCRAFT_FOLEY_MODEL", "facebook/audiogen-medium")
    model = AudioGen.get_pretrained(model_id, device=device)
    set_model("audiogen", model)
    return model


def generate_music(prompt: str | None, duration_sec: float, output_path: str) -> None:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    duration = max(2.0, min(30.0, float(duration_sec)))
    model = _load_music_model()
    model.set_generation_params(duration=duration)
    wav = model.generate([prompt or "soft ambient background music"])
    torchaudio.save(str(out), wav[0].cpu(), model.sample_rate)


def generate_foley(prompt: str | None, duration_sec: float, output_path: str) -> None:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    duration = max(2.0, min(30.0, float(duration_sec)))
    model = _load_foley_model()
    model.set_generation_params(duration=duration)
    wav = model.generate([prompt or "subtle ambient environment sounds"])
    torchaudio.save(str(out), wav[0].cpu(), model.sample_rate)


def unload_audiocraft() -> None:
    unload_models()
