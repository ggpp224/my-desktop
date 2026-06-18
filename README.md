# AI Dev Control Center

<!-- AI 生成 By Peng.Guo -->

桌面开发中控应用：通过自然语言驱动本地工具链，统一完成工作流启动、终端操作、Jenkins 部署、仓库合并、Jira/Wiki 查询与周报生成。  
项目根目录：`my-desktop`。

## 当前能力概览（与代码实现一致）

- **Agent 对话执行**：支持普通请求与 SSE 流式请求（含首轮模型增量输出、工具执行进度、结果汇总）。
- **模型能力**：支持本地 Ollama 与外部 Gemini 双模式；支持运行时切换本地模型、测试 Gemini 连通性。
- **工作流能力**：支持完整工作流执行、单步执行、内嵌终端会话（可新增/关闭子终端并轮询输出）。
- **开发工具能力**：Shell 执行、浏览器打开、Jenkins 触发部署与状态查询、项目在 IDE 中打开/关闭。
- **知识库能力**：支持私人知识库目录导入、索引重建、来源文档打开与文档内相对链接跳转。
- **协同能力**：Jira 固定查询（我的 bug / 线上 bug / 本周完成 / 本周经我手 bug）、Wiki 周报定位/抓取、周报自动编写、组内总结生成。
- **工程辅助能力**：Cursor 用量查询与 Cookie 自动同步；命令历史持久化（`runtime/command-history.json`）；主题持久化。
- **技术趋势能力**：聚合 GitHub Trending、Hacker News、Reddit 多源抓取，经关键词过滤与 LLM 分析生成日/月/半年度 Markdown 报告；支持 SSE 流式刷新与本地缓存（`runtime/tech-digest/`）。
- **SDK 自动化能力（PoC）**：支持基于 Cursor SDK 的仓库健康检查与 PR 自动审查脚本（本地运行，可落盘审查报告）。

## 近期新增能力（2026-05 ~ 2026-06）

- **技术趋势页签**：顶部常驻「技术趋势」，聚合 GitHub / HN / Reddit 抓取 + LLM 解读；`GET /tech-digest/latest`、`POST /tech-digest/refresh/stream`（SSE）；缓存 `runtime/tech-digest/`。
- **主题系统**：新增浅色/深色/高对比主题切换，前端会记忆上次主题。
- **模型设置面板**：新增本地/外部模式切换；Gemini API Key、模型、Base URL 可视化配置与连通性测试。
- **流式体验增强**：`/agent/chat/stream` 增加 `llm_delta`、`tool_progress`、`token_usage` 事件，聊天体验更平滑。
- **知识库闭环**：新增 `POST /knowledge-base/import` 导入本地 Markdown，支持从引用直接打开原文 `GET /knowledge-base/document`。
- **内嵌终端增强**：`/workflow/:workflowName/embedded` 启动会话，支持会话恢复、新增页签、输入/输出轮询、尺寸同步与关闭回收。
- **Markdown 转 PDF**：新增 `md生成pdf` 指令与独立页签，可选择本地 `.md` 并在同目录生成同名 `.pdf`，支持 GitLab 风格排版、代码高亮与 Mermaid 图渲染。
- **固定口令路由收敛**：对「开始工作」「统计常用指令」「md生成pdf」「打开集测环境/测试环境/json配置中心」等固定口令，首轮仅暴露候选工具，降低同类工具误选。

## 环境要求

- Node.js `>=18`
- macOS（主流程优先；部分能力依赖本机客户端与 `open -a`）
- Ollama（本地模式）
- 知识库必备 Ollama 模型：
  - `bge-m3`（向量嵌入，必需）
  - `qwen2.5-coder:14b`（预处理抽取 metadata，推荐）
  - `qwen2.5:7b`（知识库问答，默认）
- 可选：Gemini API Key（外部模型模式）

## 快速开始

### 1) 安装依赖

```bash
npm install
```

> 根目录安装会自动触发 `postinstall` 安装 `ui` 子项目依赖。

### 2) （可选）验证 Ollama Tool Calling

```bash
npm run verify-ollama
```

### 2.1)（强烈建议）预拉取知识库模型

```bash
# 知识库向量模型（必需）
ollama pull bge-m3

# 知识库默认问答模型
ollama pull qwen2.5:7b

# 知识库默认预处理模型（推荐）
ollama pull qwen2.5-coder:14b
```

### 2.2) 一键自检知识库模型是否齐全

```bash
# AI 生成 By Peng.Guo
required_models=("bge-m3" "qwen2.5:7b" "qwen2.5-coder:14b")
installed="$(ollama list | awk 'NR>1 {print $1}')"
missing=()
for model in "${required_models[@]}"; do
  echo "$installed" | rg -q "^${model}$" || missing+=("$model")
done
if [ ${#missing[@]} -eq 0 ]; then
  echo "知识库模型检查通过：全部已安装"
else
  echo "缺少模型：${missing[*]}"
  echo "请执行："
  for model in "${missing[@]}"; do
    echo "  ollama pull ${model}"
  done
fi
```

### 3) 启动开发模式

```bash
npm run dev
```

该命令会并行启动：

- `ui`（Vite，默认 `5173`）
- `server`（Express API，默认 `41738`/`API_PORT`；Electron 托管时固定端口，单独 `tsx server/api.ts` 时端口冲突可递增）
- Electron 主进程（等待 UI/API 可用后启动）

### 4) 生产运行

```bash
npm run start
```

### 5) 构建与打包（macOS）

```bash
npm run build
npm run pack
```

产物目录：`release/`。

### 6) Cursor SDK PoC（可选）

> 该部分仅用于 `scripts/sdk-*.ts` 自动化脚本，不影响主应用运行。

先在 `.env` 配置（最少）：

```bash
CURSOR_API_KEY=你的_key
CURSOR_SDK_MODEL=default
```

执行健康检查：

```bash
npm run sdk:health
```

执行 PR 自动审查（默认对 `main`）：

```bash
npm run sdk:pr-review
```

带参数覆盖（优先级高于 `.env`）：

```bash
npm run sdk:pr-review -- --base main --model default
```

审查结果会落盘到：

- `runtime/sdk-pr-review-*.md`

## 配置说明

建议先复制 `.env.example` 为 `.env`，再按本机环境配置。

核心配置（节选）：

- **模型**
  - `OLLAMA_BASE`、`OLLAMA_MODEL`
  - `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`
  - 知识库：`KB_CHAT_MODEL`、`KB_INGEST_MODEL`、`KB_EMBED_MODEL`
- **服务**
  - `API_PORT`、`SHELL_CWD`
- **Jenkins**
  - `JENKINS_BASE_URL`、`JENKINS_USERNAME`、`JENKINS_TOKEN`
  - 以及各项目 `JENKINS_JOB_*` / 默认分支变量
- **Jira**
  - `JIRA_BASE_URL`、`JIRA_USERNAME`、`JIRA_PASSWORD`
- **Wiki 周报**
  - `WIKI_BASE_URL`、`WIKI_TOKEN`、`WIKI_WEEKLY_SPACE_NAME`、`WIKI_WEEKLY_ROOT_PAGE_ID`
- **Cursor 用量**
  - `CURSOR_API_TOKEN` 或 `CURSOR_COOKIE`（未配置时可尝试自动同步 Chrome 登录态）
- **Cursor SDK（仅 sdk 脚本）**
  - `CURSOR_API_KEY`
  - `CURSOR_SDK_MODEL`
  - `CURSOR_SDK_REVIEW_MODEL`
  - `CURSOR_SDK_REVIEW_BASE`
- **技术趋势**
  - `OLLAMA_TECH_DIGEST_TEMPERATURE`、`TECH_DIGEST_*` 抓取/超时/Reddit 限流参数
  - 可选：`GITHUB_TOKEN`、`REDDIT_USER_AGENT`、`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`
  - 出站代理与 Gemini 共用：`HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / macOS 系统 SOCKS

完整环境变量说明见：`.cursor/rules/env-constants.mdc`。

## 知识库（重点）

知识库链路为：Markdown 导入 -> 预处理（抽取 metadata）-> 向量索引 -> 混合检索（向量+关键词）-> 重排 -> 引用回传。

### 1) 数据来源与索引目录

- 文档来源目录：`KB_DOC_DIRS`（默认 `doc,docs,runtime/private-kb`）
- 索引持久化目录：`KB_PERSIST_DIR`（默认 `runtime/knowledge-index`）
- 导入私人知识库：`POST /knowledge-base/import`
  - 默认会导入到 `runtime/private-kb/import-latest`
  - 同一导入目录会先清理再写入，避免历史脏文件干扰

### 2) 全量重建 vs 增量重建

- `重建知识库索引`：全量重建；所有文档重走预处理 + 向量构建。
- `增量重建知识库索引`：按文档指纹增量预处理。
  - 未变化文档复用缓存（`ingestion-cache.json`）
  - 仍会重建当前索引快照（保证结果一致性）
  - UI 会显示历史缓存数、本次已处理/复用、处理中项

### 3) 查询策略（当前默认）

- `KB_TOP_K=7`：最终引用条数上限
- `KB_HYBRID_TOP_K=4`：向量/关键词各自候选规模
- `KB_HYBRID_ALPHA=0.4`：向量权重 0.4，关键词权重 0.6
- `KB_RERANK_MODE=rule`：默认规则重排（本地稳定）
- `KB_RERANK_POOL_SIZE=24`：重排候选池大小
- `KB_QUERY_ALLOW_STALE_INDEX=1`（默认）：签名不一致时允许回退上次可用索引，避免重启后直接查询失败

### 4) 调试与排障（建议保留）

- `KB_RULE_PATCH_DEBUG=1`：输出关键规则补丁候选、入选、missing 判定日志
- 常见失败与处理：
  - 报“检测到知识库文档已变化”：先执行一次索引重建；如仅重启后出现，确认索引目录与文档目录未漂移
  - 引用来源偏题：先看 `KB_HYBRID_ALPHA` 与重排模式，再看日志中 Top candidates 是否被入口文档挤占
  - 模型重排不可用：`KB_RERANK_MODE=rule` 可稳定回退

## RAG 性能优化建议

- **14B 模型建议**：在启动应用前设置 `OLLAMA_KV_CACHE_TYPE=q8_0`（显存更充裕时可选 `q4_0`），降低 KV Cache 显存压力。
- **Flash Attention**：知识库链路默认读取 `KB_FLASH_ATTENTION=1`，建议保持开启。
- **上下文窗口保护**：通过 `KB_CONTEXT_WINDOW` 控制 query 阶段窗口，避免长文档导致显存溢出并回退 CPU。
- **索引重建脚本**：`node --loader tsx agent/knowledge/rebuild-index.ts`，强制重建可加 `--force`。

## 常用能力入口

- **自然语言能力清单**：`docs/可用指令.md`
- **使用说明（操作手册）**：`docs/使用文档.md`
- **架构与接口设计**：`docs/设计文档.md`
- **工作流定义**：`workflows/start-work.json`、`workflows/standalone.json`、`workflows/upgrade-*.json`
- **工具路由**：`agent/tool-router.ts`
- **服务接口**：`server/api.ts`

## 典型使用示例

- 启动工作环境：`开始工作`
- 打开内嵌终端并定位项目：`终端打开 react18`
- 执行单步任务：`启动 scm`、`启动 react18`、`启动 mdf-ui`
- 启动工作流外项目：`启动 base`、`启动 mdf-biz`（mdf 系列为 `yarn w`）
- 部署：`部署 nova 分支是 sprint-260326`
- 合并：`合并 biz-solution` / `合并 biz-solution 集测`
- 知识库：`增量重建知识库索引`、`重建知识库索引`
- 查询：`我的bug`、`本周已完成任务`
- 周报：`周报`、`写周报`、`组内总结`
- Cursor：`cursor用量`、`cursor今日用量`
- 技术趋势：点击顶部「技术趋势」页签 → 刷新今日 / 中长周期报告

## 主要目录

```text
agent/       Agent 编排、工具 schema、模型调用
server/      Express API（含 SSE、终端会话、部署/合并、技术趋势 trends/）
tools/       Shell/Jenkins/Jira/Wiki/Cursor/Workflow 等工具实现
workflows/   工作流配置（start-work/standalone/upgrade-*）
desktop/     Electron 主进程与 preload
ui/          React + Vite 前端（含 TechDigestPanel）
config/      项目映射、Jenkins 预设、默认配置
runtime/     运行时数据（命令历史、技术趋势缓存 tech-digest/ 等）
docs/        使用文档（自然语言指令等）
```
