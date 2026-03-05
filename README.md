# AI Dev Control Center

桌面应用：通过自然语言或按钮操作，由本地 LLM（Ollama）驱动执行开发流程（启动环境、打开页面、Jenkins 部署、工作流等）。  
项目根目录为 **my-desktop**。

## 环境要求

- **Node.js** 18.x / 20.x（LTS）
- **Ollama**：已安装并拉取模型，例如 `ollama pull qwen2.5`
- **系统**：macOS（优先）、Windows（browser 使用 `start`）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

（在仓库根目录执行，会通过 `postinstall` 安装 UI 依赖。）

### 2. 验证 Ollama 与 Tool Calling（可选）

```bash
npm run verify-ollama
```

需先启动 Ollama（`ollama serve` 或直接运行 `ollama run qwen2.5`）。若返回 `OK: Ollama returned structured tool_calls` 表示支持 tool calling。

### 3. 启动 Ollama

确保本机已启动 Ollama，并拉取模型：

```bash
ollama pull qwen2.5
ollama run qwen2.5   # 或后台运行 ollama serve
```

### 4. 开发模式

```bash
npm run dev
```

会先编译 TS，然后同时启动：Vite UI（5173）、后端 API（3000），并在两者就绪后启动 Electron 窗口。  
若只跑后端与 Electron、UI 自己起，可分别执行：

```bash
npm run dev:ui        # 终端 1
npm run dev:server    # 终端 2
npm run dev:electron  # 终端 3（需先 tsc）
```

### 5. 生产构建与运行

```bash
npm run build
npm run start
```

Electron 主进程内会启动 Express，并加载打包后的 UI。

## 配置

- **Ollama**：`OLLAMA_BASE`（默认 `http://localhost:11434`）、`OLLAMA_MODEL`（默认 `qwen2.5`）
- **Jenkins**：`JENKINS_BASE_URL`、`JENKINS_TOKEN`（勿提交到代码库，使用环境变量或本地配置）
- **Shell 工作目录**：`SHELL_CWD`（默认当前工作目录）

敏感信息请使用环境变量，不要硬编码。

## 成功标准示例

- 输入「开始工作」：可执行简化版（如打开 Jenkins、启动 docker 等 1～2 步），完整流程见工作流 `start-work`。
- 输入「部署 order-service」：触发 Jenkins 对应 Job（需配置 Jenkins）。
- 输入「打开开发环境」：可打开常用页面（GitHub、Jenkins、Confluence、Grafana 等，URL 可在 config 或 workflow 中配置）。

## 项目结构（根目录 my-desktop）

```
agent/          # Agent、Tool Router、Ollama 封装
tools/          # shell、browser、jenkins、workflow
workflows/      # start-work.json 等
server/         # Express API
desktop/        # Electron 主进程
config/         # 配置
ui/             # React + Vite 前端
scripts/        # 如 verify-ollama-tools.js
docs/           # 文档（如 ai-coding-prompt.md）
```
