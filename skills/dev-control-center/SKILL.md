---
name: dev-control-center
description: >-
  通过 my-desktop CLI（npm run adc）执行研发口令：部署、合并、开始工作、经办人bug、写周报、tun。
  用户使用 /部署、/开始工作、/经办人bug 或明确提到 adc 时使用。
disable-model-invocation: true
---

# Dev Control Center

在 Cursor 里执行 my-desktop 口令，用 **斜杠命令** 或 CLI。不要使用 MCP。禁止自己拼 Jenkins URL、`git merge` 或 `pnpm run release`。

## 必须

1. 固定/模式口令走 Shell：

```bash
cd "/Users/guopeng/disk/test/my-desktop" && npm run adc -- <口令原文>
```

例：`/部署 nova` → `npm run adc -- 部署 nova`；`/开始工作` → `npm run adc -- 开始工作`。

2. 需要看口令列表：`npm run adc`（无参数）。
3. 若 JSON `"code":"desktop_only"`：说明只在桌面端窗口可用，不要假装已执行。
4. 若 `"code":"unresolved"`：不要发明部署/合并步骤。

## 开始工作

「开始工作」会改走 `start-work-external-terminal`（系统终端）。不要去开 Electron 内嵌终端。

## 不要做

- 不要为「部署 / 合并 / 工作流」手写 shell 流程。
- 不要调用桌面端 `POST /agent/chat` 或任何 MCP 工具。
- 不要把打开指令统计、md 生成 pdf、打开终端当 Cursor 能力。
