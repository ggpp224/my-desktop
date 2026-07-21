# AI 生成 By Peng.Guo
from __future__ import annotations

import os
import sys
from pathlib import Path

import torchaudio

from .registry import get_model, set_model, unload_models


def _ensure_cosyvoice_path() -> str:
    repo = os.environ.get("COSYVOICE_REPO_DIR", "").strip()
    if not repo:
        default = Path(__file__).resolve().parents[1] / "models" / "CosyVoice"
        repo = str(default)
    if repo not in sys.path:
        sys.path.insert(0, repo)
    third_party = Path(repo) / "third_party" / "Matcha-TTS"
    if third_party.is_dir() and str(third_party) not in sys.path:
        sys.path.insert(0, str(third_party))
    return repo


def _load_cosyvoice():
    cached = get_model("cosyvoice")
    if cached is not None:
        return cached
    _ensure_cosyvoice_path()
    from cosyvoice.cli.cosyvoice import CosyVoice

    model_dir = os.environ.get("COSYVOICE_MODEL_DIR", "").strip()
    if not model_dir:
        model_dir = str(Path(__file__).resolve().parents[1] / "models" / "Fun-CosyVoice3-0.5B")
    if not Path(model_dir).is_dir():
        raise RuntimeError(
            f"CosyVoice 模型目录不存在: {model_dir}\n请运行: ./scripts/setup-local-models.sh"
        )
    model = CosyVoice(model_dir)
    set_model("cosyvoice", model)
    return model


def generate_voice(text: str | None, speaker: str | None, output_path: str) -> None:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    content = (text or "").strip()
    if not content:
        raise RuntimeError("配音文本为空")
    spk = (speaker or "中文女").strip()
    model = _load_cosyvoice()
    # SFT 说话人；零样本模式需改用 inference_zero_shot
    for i, chunk in enumerate(model.inference_sft(content, spk, stream=False)):
        torchaudio.save(str(out), chunk["tts_speech"], 22050)
        break


def unload_cosyvoice() -> None:
    unload_models()
