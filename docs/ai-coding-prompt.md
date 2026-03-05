# AI Coding Prompt（用于生成项目代码）

你是一个高级全栈工程师，请根据以下要求生成完整项目代码。

项目名称：AI Dev Control Center

目标： 构建一个本地运行的桌面应用，通过 AI 自动控制开发者电脑执行任务。

核心能力：

1 自然语言控制开发流程 2 自动执行 shell 命令 3 自动打开浏览器页面 4
自动触发 Jenkins 部署 5 支持预定义 workflow

技术栈要求：

Desktop: Electron

Frontend: React + Vite + Typescript

Backend: Node.js + Express

AI: Ollama API

模型： Qwen2.5

------------------------------------------------------------------------

系统架构

Desktop UI (Electron + React) ↓ Node Agent ↓ Ollama Local LLM ↓ Tool
Router ↓ Tools

------------------------------------------------------------------------

Tools 需要实现：

shell_tool

run(command: string)

browser_tool

open(url: string)

jenkins_tool

deploy(jobName: string)

workflow_tool

runWorkflow(name)

------------------------------------------------------------------------

Agent 逻辑：

1 接收用户输入 2 调用 Ollama 3 解析返回 tool call 4 调用对应 tool 5
返回执行结果

------------------------------------------------------------------------

项目结构：

ai-dev-control-center/

agent/ agent.ts tool-router.ts

tools/ shell-tool.ts browser-tool.ts jenkins-tool.ts

workflows/ start-work.json

desktop/ electron-main.ts

ui/ react-app/

server/ api.ts

------------------------------------------------------------------------

要求：

1 生成完整项目结构 2 所有代码使用 Typescript 3 包含 package.json 4
包含基础 UI 5 实现 Tool Router 6 实现 Agent 调用 Ollama API 7 实现
Desktop Electron 启动 React

最终输出：

完整项目代码
