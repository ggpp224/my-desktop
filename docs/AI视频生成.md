# AI 视频生成

my-desktop 内置「Prompt → LLM 分镜 → Wan2.2 视频 + 三路音频 → FFmpeg 合成 MP4」管线。

## 架构

```
Prompt → Ollama (Qwen3/DeepSeek) → 分镜 JSON
  → Wan2.2 (5101)
  → CosyVoice (5102)
  → AudioCraft MusicGen (5103)
  → Foley / AudioGen (5104)
  → FFmpeg 混流 → runtime/video-jobs/<id>/final.mp4
```

## 环境要求

| 组件 | 说明 |
|------|------|
| FFmpeg | `brew install ffmpeg` |
| Ollama | 分镜模型如 `qwen3:8b`、`deepseek-r1:8b` |
| Python Sidecar | 见 `services/video-sidecar/README.md` |
| GPU | 真实推理需 NVIDIA GPU；Mock 模式无需 GPU |

## 配置（.env）

```env
VIDEO_MOCK_MODE=1
VIDEO_SCRIPT_MODEL=qwen3:8b
VIDEO_OUTPUT_DIR=runtime/video-jobs
FFMPEG_PATH=ffmpeg
VIDEO_WAN_BASE=http://127.0.0.1:5101
VIDEO_COSYVOICE_BASE=http://127.0.0.1:5102
VIDEO_AUDIOCRAFT_BASE=http://127.0.0.1:5103
VIDEO_FOLEY_BASE=http://127.0.0.1:5104
```

修改 `.env` 后需**重启 API**。

## 启动步骤

### 1. Mock 模式（推荐先验证）

```bash
# 终端 1：启动 Sidecar
cd services/video-sidecar
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./scripts/start-all-sidecars.sh

# 终端 2：启动 API
npm run dev:server

# 终端 3：启动 UI
npm run dev:ui
```

打开左侧 **AI 视频生成** 按钮，输入 Prompt 生成。

### 2. 真实 GPU 推理

1. 按各模型官方文档安装依赖与权重
2. 在 `services/video-sidecar/base_server.py` 的 `_run_job` 中接入真实推理
3. 设置 `VIDEO_MOCK_MODE=0`

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/video/health` | 依赖健康检查 |
| POST | `/video/generate/stream` | SSE 流式生成 |
| GET | `/video/jobs/:id` | 查询 Job |
| GET | `/video/jobs/:id/final` | 下载成片 |
| POST | `/video/generate/cancel` | 取消进行中的任务 |

## 故障排查

| 现象 | 处理 |
|------|------|
| Sidecar 全红 | 确认 `start-all-sidecars.sh` 已运行 |
| FFmpeg 不可用 | `which ffmpeg`，或设置 `FFMPEG_PATH` |
| Ollama 失败 | `ollama pull qwen3:8b` |
| 显存不足 | 使用 Wan TI2V-5B、串行 unload、降低分辨率 |
| macOS CosyVoice | 建议在 Linux/WSL2 跑 Sidecar |

## 产物目录

```
runtime/video-jobs/<uuid>/
  script.json      # LLM 分镜
  raw/video.mp4
  raw/voice.wav
  raw/music.wav
  raw/foley.wav
  final.mp4
  job-meta.json
```
