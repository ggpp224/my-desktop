# AI 生成 By Peng.Guo
from __future__ import annotations


def resolution_to_size(resolution: str) -> tuple[int, int]:
    mapping = {"480p": (854, 480), "720p": (1280, 720), "1080p": (1920, 1080)}
    return mapping.get(resolution, (1280, 720))
