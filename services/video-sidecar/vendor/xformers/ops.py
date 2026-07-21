# AI 生成 By Peng.Guo
"""Torch-backed subset of xformers.ops used by AudioCraft on MPS."""

from __future__ import annotations

import torch
from torch.nn import functional as F


def unbind(tensor: torch.Tensor, dim: int = 0) -> tuple[torch.Tensor, ...]:
    return torch.unbind(tensor, dim=dim)


def memory_efficient_attention(
    query: torch.Tensor,
    key: torch.Tensor,
    value: torch.Tensor,
    attn_bias: torch.Tensor | None = None,
    p: float = 0.0,
    **_: object,
) -> torch.Tensor:
    return F.scaled_dot_product_attention(
        query,
        key,
        value,
        attn_mask=attn_bias,
        dropout_p=p,
    )
