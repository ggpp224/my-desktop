# AI 视频生成 Sidecar

Python GPU Sidecar 服务，为 my-desktop 视频管线提供 Wan2.2 / CosyVoice / AudioCraft / Foley 推理能力。

## 快速开始（Mock 模式）

无需 GPU，使用 FFmpeg 生成占位媒体文件，用于端到端验证：

```bash
cd services/video-sidecar
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 确保系统已安装 ffmpeg
ffmpeg -version

# 启动全部 Sidecar
chmod +x scripts/start-all-sidecars.sh
./scripts/start-all-sidecars.sh
```

各服务端口：

| 服务 | 端口 | 环境变量 |
|------|------|----------|
| Wan2.2 | 5101 | `VIDEO_WAN_BASE` |
| CosyVoice | 5102 | `VIDEO_COSYVOICE_BASE` |
| AudioCraft | 5103 | `VIDEO_AUDIOCRAFT_BASE` |
| Foley | 5104 | `VIDEO_FOLEY_BASE` |

## API 契约

```
GET  /health
POST /generate   → { jobId }
GET  /jobs/:id   → { status, progress, outputPath, error }
POST /unload
```

## 真实模型接入

Mock 验证通过后，在各 Sidecar 的 `_run_job` 中替换为真实推理：

1. **Wan2.2**：参考 [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2)，推荐 `Wan2.2-TI2V-5B`
2. **CosyVoice**：参考 [FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice)，`runtime/python/fastapi`
3. **AudioCraft MusicGen**：`facebookresearch/audiocraft`
4. **Foley (AudioGen)**：同属 AudioCraft 套件

## 硬件建议

- 单卡 RTX 4090 24GB：Wan TI2V-5B + 串行 unload 可跑通
- Wan 14B：建议 48GB+ VRAM

## my-desktop 配置

在项目根 `.env` 中设置：

```env
VIDEO_MOCK_MODE=1
VIDEO_SCRIPT_MODEL=qwen3:8b
```

重启 API 后打开「AI 视频生成」面板即可使用。
