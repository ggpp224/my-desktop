# AI 视频生成 — 本机真实推理（Apple Silicon / M3）

本指南面向 **全部在本机运行**（Ollama 分镜 + Sidecar 推理 + FFmpeg 混流），无需远程 GPU 服务器。

## 你的机器

- **Apple M3 Pro**：使用 PyTorch **MPS**（Metal）加速；无 NVIDIA CUDA
- 推荐模型：**Wan2.2-TI2V-5B**（勿用 14B，显存不够）
- 单次生成耗时：**数分钟～数十分钟**（视分辨率与时长而定）

---

## 一、一次性安装（约 30 分钟 + 模型下载）

```bash
cd services/video-sidecar

# 1. Python 虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 2. PyTorch(MPS) + AudioCraft + 基础依赖
chmod +x scripts/*.sh
./scripts/install-real-deps.sh

# 3. 克隆仓库并下载权重（数 GB～数十 GB）
./scripts/setup-local-models.sh
```

---

## 二、配置 `.env`（项目根目录）

```env
VIDEO_MOCK_MODE=0

FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
VIDEO_OUTPUT_DIR=/Users/guopeng/Downloads/ai-video-jobs

# Sidecar 本机地址
VIDEO_WAN_BASE=http://127.0.0.1:5101
VIDEO_COSYVOICE_BASE=http://127.0.0.1:5102
VIDEO_AUDIOCRAFT_BASE=http://127.0.0.1:5103
VIDEO_FOLEY_BASE=http://127.0.0.1:5104

# 模型路径（与 setup-local-models.sh 输出一致）
WAN_REPO_DIR=/Users/guopeng/disk/test/my-desktop/services/video-sidecar/models/Wan2.2
WAN_CKPT_DIR=/Users/guopeng/disk/test/my-desktop/services/video-sidecar/models/Wan2.2-TI2V-5B
WAN_TASK=ti2v-5B
COSYVOICE_REPO_DIR=/Users/guopeng/disk/test/my-desktop/services/video-sidecar/models/CosyVoice
COSYVOICE_MODEL_DIR=/Users/guopeng/disk/test/my-desktop/services/video-sidecar/models/Fun-CosyVoice3-0.5B
AUDIOCRAFT_MUSIC_MODEL=facebook/musicgen-small
AUDIOCRAFT_FOLEY_MODEL=facebook/audiogen-medium
```

修改后 **重启 API**：`npm run dev:server`

---

## 三、启动 Sidecar（真实模式）

```bash
cd services/video-sidecar
source .venv/bin/activate
export VIDEO_MOCK_MODE=0
# 加载项目根 .env 中的模型路径（可选）
set -a && source ../../.env && set +a

./scripts/start-all-sidecars.sh
```

或项目根：

```bash
VIDEO_MOCK_MODE=0 npm run dev:video-sidecars
```

验证：

```bash
curl -s http://127.0.0.1:5101/health | python3 -m json.tool
# 期望: "mock": false, "device": "mps"
```

---

## 四、生成视频

1. 面板依赖全绿（FFmpeg · Ollama · Sidecar 4/4，**无 Mock 提示**）
2. 输入 Prompt → 生成
3. 成片在 **「下载」** 文件夹：`~/Downloads/{标题}_xxxxxxxx.mp4`

---

## 五、架构说明

| 步骤 | 组件 | 本机实现 |
|------|------|----------|
| 分镜 | Ollama | 已有 |
| 视频 | Wan2.2 | `inference/wan_infer.py` → 子进程 `generate.py` |
| 配音 | CosyVoice3 | `inference/cosyvoice_infer.py` |
| 背景音乐 | MusicGen | `inference/audiocraft_infer.py` |
| 环境音 | AudioGen | 同上 |
| 混流 | FFmpeg | Node `ffmpeg-composer.ts` |

模型 **串行** 加载（Wan → unload → CosyVoice → …），避免 M3 统一内存 OOM。

---

## 六、常见问题

| 现象 | 处理 |
|------|------|
| health 显示 `mock: true` | 确认 `VIDEO_MOCK_MODE=0` 并重启 Sidecar |
| Wan 推理失败 | 查看 Sidecar 终端日志；可先降分辨率 480p |
| `No module named 'easydict'` | 官方 requirements 含 `flash_attn`（Mac 装不上）导致整批中断；执行 `pip install -r services/video-sidecar/requirements-wan-mac.txt` 或重跑 `npm run video:setup-models` |
| Wan `Torch not compiled with CUDA`（导入阶段） | 已由 `wan_apple_silicon_patch` 在推理前自动改默认 device；重启 Sidecar 后再生成 |
| CosyVoice 找不到模型 | 检查 `COSYVOICE_MODEL_DIR` 路径 |
| `openai-whisper` 构建失败 `No module named pkg_resources` | setuptools 82+ 已移除 pkg_resources；脚本会固定 `setuptools<81` 并以 `--no-build-isolation` 安装 whisper。也可手动：`pip install 'setuptools>=70,<81' && pip install 'openai-whisper==20231117' --no-build-isolation` |
| AudioCraft 安装失败 | 先 `brew install pkg-config ffmpeg`；再 `npm run video:install-real`（脚本用 Python 3.11 + `audiocraft --no-deps`，无需编译 xformers） |
| `pkg-config is required for building PyAV` | `brew install pkg-config`，并重跑安装脚本 |
| `No module named xformers` | 已内置 `vendor/xformers` shim，确保 Sidecar 经 `base_server.py` 启动 |
| 极慢 | MPS/CPU 正常；可缩短 `durationSec`（分镜 JSON 里 5～8 秒） |
| Wan 不支持 MPS | 设置 `PYTORCH_ENABLE_MPS_FALLBACK=1`（脚本已默认）；仍失败则仅 Wan 用 CPU |

---

## 七、回退 Mock

```env
VIDEO_MOCK_MODE=1
```

重启 Sidecar 即可，无需改代码。
