在本机 **系统终端（macOS Terminal.app）** 启动 AI Dev Control Center（my-desktop）开发服务。

禁止使用 Cursor 内置终端跑 `yarn dev`。不要走 `adc` 口令。

规则：
- 没有 Terminal 窗口 → 新开一个窗口
- 已经有 Terminal 窗口 → 在现有窗口开**新页签**（不要再开一个窗口）

只执行下面这一条（短命令，用来唤起系统终端）：

```bash
cd /Users/guopeng/disk/test/my-desktop && npx tsx cli/open-system-terminal.ts "cd /Users/guopeng/disk/test/my-desktop && yarn dev"
```

成功时会打印 `tab … of window id …`。

成功时会打印 `tab … of window id …`。

已有 Terminal 窗口时开新页签需要 **辅助功能**（模拟 Command+T）。若报错，提示用户到 **系统设置 → 隐私与安全性 → 辅助功能** 允许 Cursor，然后重试。不要改用 Cursor 内置终端，也不要再新开一个 Terminal 窗口凑合。
