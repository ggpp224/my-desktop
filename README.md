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

### 6. 打包成 Mac 应用程序

在项目根目录执行：

```bash
npm install
npm run pack
```

或直接：

```bash
npm run pack:mac
```

会先执行 `npm run build`（编译 TS + 构建 UI），再使用 **electron-builder** 打出 Mac 安装包，输出在 **`release/`** 目录：

- **AI Dev Control Center-0.1.0.dmg**：可拖到「应用程序」安装的镜像
- **AI Dev Control Center-0.1.0-mac.zip**：解压即用的 .app 包

首次打包需安装 `electron-builder`（已在 devDependencies 中）。若需自定义图标，在项目根目录放 `build/icon.icns`，并在 `package.json` 的 `build.mac.icon` 中指定路径。

## 配置

- **Ollama**：`OLLAMA_BASE`（默认 `http://localhost:11434`）、`OLLAMA_MODEL`（默认 `qwen2.5`）
- **Jenkins**：`JENKINS_BASE_URL`、`JENKINS_TOKEN`（勿提交到代码库，使用环境变量或本地配置）
- **Jira（8.8，非 token）**：`JIRA_BASE_URL`、`JIRA_USERNAME`、`JIRA_PASSWORD`
- **Shell 工作目录**：`SHELL_CWD`（默认当前工作目录）

敏感信息请使用环境变量，不要硬编码。

## 可用指令（自然语言）

在 Chat 输入自然语言即可，完整说明见 **[docs/可用指令.md](docs/可用指令.md)**。

| 类型 | 示例 |
|------|------|
| 工作流 | 开始工作、启动 cpxy、启动 react18、启动 scm、升级集测react18的nova版本、升级集测cc-web的nova版本 |
| 部署 | 部署 nova、部署 base、部署 cc-web、部署 scm |
| 合并 | 合并 nova、合并 biz-solution、合并 scm |
| IDE 打开/关闭 | ws打开base、cursor打开scm、关闭ws的nova、关闭cursor的base |
| 浏览器 / Shell | 打开 Jenkins、执行 xxx 命令 |
| Jira | 我的bug、查询我的bug |

项目代号与 `config/projects` 一致，可扩展。

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
