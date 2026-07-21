# AI 生成 By Peng.Guo
"""Idempotent Apple Silicon patches for cloned Wan2.2 (CUDA-only defaults)."""

from __future__ import annotations

from pathlib import Path

# Marker comments so re-runs are no-ops
T5_MARKER = "# my-desktop: apple-silicon-safe-default-device"
DEVICE_MARKER = "# my-desktop: apple-silicon-resolve-device"


def _patch_t5_default_device(repo: Path) -> bool:
    path = repo / "wan" / "modules" / "t5.py"
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8")
    if T5_MARKER in text:
        return False
    old = "device=torch.cuda.current_device(),"
    if old not in text:
        return False
    new = f"device=torch.device('cpu'),  {T5_MARKER}"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


def _patch_device_resolution(source: str) -> str | None:
    """Replace hardcoded cuda:{id} with cuda/mps/cpu resolution."""
    if DEVICE_MARKER in source:
        return None
    old = "self.device = torch.device(f\"cuda:{device_id}\")"
    if old not in source:
        # some files use single quotes
        old = "self.device = torch.device(f'cuda:{device_id}')"
        if old not in source:
            return None
    new = (
        f"{DEVICE_MARKER}\n"
        "        if torch.cuda.is_available():\n"
        "            self.device = torch.device(f\"cuda:{device_id}\")\n"
        "        elif getattr(torch.backends, \"mps\", None) and torch.backends.mps.is_available():\n"
        "            self.device = torch.device(\"mps\")\n"
        "        else:\n"
        "            self.device = torch.device(\"cpu\")"
    )
    return source.replace(old, new, 1)


def _patch_pipeline_files(repo: Path) -> list[str]:
    changed: list[str] = []
    for rel in (
        "wan/textimage2video.py",
        "wan/text2video.py",
        "wan/image2video.py",
        "wan/speech2video.py",
        "wan/animate.py",
    ):
        path = repo / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        patched = _patch_device_resolution(text)
        if patched is None:
            continue
        path.write_text(patched, encoding="utf-8")
        changed.append(rel)
    return changed


INIT_MARKER = "# my-desktop: apple-silicon-optional-imports"


def _patch_wan_init_optional_imports(repo: Path) -> bool:
    """Avoid hard-importing pipelines that need unavailable Mac deps (e.g. decord)."""
    path = repo / "wan" / "__init__.py"
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8")
    if INIT_MARKER in text:
        return False
    new = f'''# Copyright 2024-2025 The Alibaba Wan Team Authors. All rights reserved.
{INIT_MARKER}
from . import configs, distributed, modules

# Soft-import optional pipelines: Apple Silicon often lacks CUDA-only deps (decord, etc.)
WanI2V = None
WanS2V = None
WanT2V = None
WanTI2V = None
WanAnimate = None

try:
    from .image2video import WanI2V
except Exception:
    pass
try:
    from .speech2video import WanS2V
except Exception:
    pass
try:
    from .text2video import WanT2V
except Exception:
    pass
try:
    from .textimage2video import WanTI2V
except Exception:
    pass
try:
    from .animate import WanAnimate
except Exception:
    pass
'''
    path.write_text(new, encoding="utf-8")
    return True


GEN_NPROMPT_MARKER = "# my-desktop: wan-negative-prompt-from-env"


def _patch_generate_py_n_prompt(repo: Path) -> bool:
    """Official CLI never passes n_prompt; inject WAN_NEGATIVE_PROMPT for t2v/ti2v."""
    path = repo / "generate.py"
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8")
    if GEN_NPROMPT_MARKER in text:
        return False

    changed = False
    t2v_block = (
        "        video = wan_t2v.generate(\n"
        "            args.prompt,\n"
        "            size=SIZE_CONFIGS[args.size],\n"
        "            frame_num=args.frame_num,\n"
        "            shift=args.sample_shift,\n"
        "            sample_solver=args.sample_solver,\n"
        "            sampling_steps=args.sample_steps,\n"
        "            guide_scale=args.sample_guide_scale,\n"
        "            seed=args.base_seed,\n"
        "            offload_model=args.offload_model)"
    )
    t2v_new = (
        "        video = wan_t2v.generate(\n"
        "            args.prompt,\n"
        "            size=SIZE_CONFIGS[args.size],\n"
        "            frame_num=args.frame_num,\n"
        "            shift=args.sample_shift,\n"
        "            sample_solver=args.sample_solver,\n"
        "            sampling_steps=args.sample_steps,\n"
        "            guide_scale=args.sample_guide_scale,\n"
        "            seed=args.base_seed,\n"
        f"            n_prompt=os.environ.get('WAN_NEGATIVE_PROMPT', ''),  {GEN_NPROMPT_MARKER}\n"
        "            offload_model=args.offload_model)"
    )
    ti2v_block = (
        "        video = wan_ti2v.generate(\n"
        "            args.prompt,\n"
        "            img=img,\n"
        "            size=SIZE_CONFIGS[args.size],\n"
        "            max_area=MAX_AREA_CONFIGS[args.size],\n"
        "            frame_num=args.frame_num,\n"
        "            shift=args.sample_shift,\n"
        "            sample_solver=args.sample_solver,\n"
        "            sampling_steps=args.sample_steps,\n"
        "            guide_scale=args.sample_guide_scale,\n"
        "            seed=args.base_seed,\n"
        "            offload_model=args.offload_model)"
    )
    ti2v_new = (
        "        video = wan_ti2v.generate(\n"
        "            args.prompt,\n"
        "            img=img,\n"
        "            size=SIZE_CONFIGS[args.size],\n"
        "            max_area=MAX_AREA_CONFIGS[args.size],\n"
        "            frame_num=args.frame_num,\n"
        "            shift=args.sample_shift,\n"
        "            sample_solver=args.sample_solver,\n"
        "            sampling_steps=args.sample_steps,\n"
        "            guide_scale=args.sample_guide_scale,\n"
        "            seed=args.base_seed,\n"
        f"            n_prompt=os.environ.get('WAN_NEGATIVE_PROMPT', ''),  {GEN_NPROMPT_MARKER}\n"
        "            offload_model=args.offload_model)"
    )

    if t2v_block in text:
        text = text.replace(t2v_block, t2v_new, 1)
        changed = True
    if ti2v_block in text:
        text = text.replace(ti2v_block, ti2v_new, 1)
        changed = True
    if not changed:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def apply_wan_apple_silicon_patches(repo: Path | str) -> list[str]:
    """Patch Wan2.2 in-place for import/runtime on Apple Silicon. Returns changed files."""
    root = Path(repo)
    changed: list[str] = []
    if _patch_wan_init_optional_imports(root):
        changed.append("wan/__init__.py")
    if _patch_t5_default_device(root):
        changed.append("wan/modules/t5.py")
    changed.extend(_patch_pipeline_files(root))
    if _patch_generate_py_n_prompt(root):
        changed.append("generate.py")
    return changed
