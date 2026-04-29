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

## 近期新增能力（2026-04）

- **主题系统**：新增浅色/深色/高对比主题切换，前端会记忆上次主题。
- **模型设置面板**：新增本地/外部模式切换；Gemini API Key、模型、Base URL 可视化配置与连通性测试。
- **流式体验增强**：`/agent/chat/stream` 增加 `llm_delta`、`tool_progress`、`token_usage` 事件，聊天体验更平滑。
- **知识库闭环**：新增 `POST /knowledge-base/import` 导入本地 Markdown，支持从引用直接打开原文 `GET /knowledge-base/document`。
- **内嵌终端增强**：`/workflow/:workflowName/embedded` 启动会话，支持会话恢复、新增页签、输入/输出轮询、尺寸同步与关闭回收。

## 环境要求

- Node.js `>=18`
- macOS（主流程优先；部分能力依赖本机客户端与 `open -a`）
- Ollama（本地模式）
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

### 3) 启动开发模式

```bash
npm run dev
```

该命令会并行启动：

- `ui`（Vite，默认 `5173`）
- `server`（Express API，默认 `3000`，端口冲突会自动递增）
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

## 配置说明

建议先复制 `.env.example` 为 `.env`，再按本机环境配置。

核心配置（节选）：

- **模型**
  - `OLLAMA_BASE`、`OLLAMA_MODEL`
  - `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`
  - 知识库：`KB_CHAT_MODEL`、`KB_INGEST_MODEL`、`KB_EMBED_MODEL`
- **服务**
  - `PORT`、`SHELL_CWD`
- **Jenkins**
  - `JENKINS_BASE_URL`、`JENKINS_USERNAME`、`JENKINS_TOKEN`
  - 以及各项目 `JENKINS_JOB_*` / 默认分支变量
- **Jira**
  - `JIRA_BASE_URL`、`JIRA_USERNAME`、`JIRA_PASSWORD`
- **Wiki 周报**
  - `WIKI_BASE_URL`、`WIKI_TOKEN`、`WIKI_WEEKLY_SPACE_NAME`、`WIKI_WEEKLY_ROOT_PAGE_ID`
- **Cursor 用量**
  - `CURSOR_API_TOKEN` 或 `CURSOR_COOKIE`（未配置时可尝试自动同步 Chrome 登录态）

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
- 执行单步任务：`启动 scm`
- 部署：`部署 nova 分支是 sprint-260326`
- 合并：`合并 biz-solution`
- 知识库：`增量重建知识库索引`、`重建知识库索引`
- 查询：`我的bug`、`本周已完成任务`
- 周报：`周报`、`写周报`、`组内总结`
- Cursor：`cursor用量`、`cursor今日用量`

## 主要目录

```text
agent/       Agent 编排、工具 schema、模型调用
server/      Express API（含 SSE、终端会话、部署/合并接口）
tools/       Shell/Jenkins/Jira/Wiki/Cursor/Workflow 等工具实现
workflows/   工作流配置（start-work/standalone/upgrade-*）
desktop/     Electron 主进程与 preload
ui/          React + Vite 前端
config/      项目映射、Jenkins 预设、默认配置
runtime/     运行时数据（如命令历史）
docs/        使用文档（自然语言指令等）
```
