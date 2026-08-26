/* AI 生成 By Peng.Guo */
import './load-env.js';
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAllProjects } from '../config/projects.js';
import { toCapabilityProjects } from './execute-command.js';
import { getMyDesktopRoot } from './load-env.js';
import { collectSlashSpokenCommands, slashCommandFileStem } from './slash-spoken-list.js';

const ADC_MARKER = '<!-- adc-generated -->';
const REPO_ROOT = getMyDesktopRoot();
const COMMANDS_DIR = path.join(os.homedir(), '.cursor', 'commands');

const PREFIX_COMMANDS: { fileStem: string; prefix: string; examples: string }[] = [
  { fileStem: '部署', prefix: '部署', examples: '/部署 nova、/部署 nova 集测' },
  { fileStem: '合并', prefix: '合并', examples: '/合并 nova、/合并 nova 集测' },
  { fileStem: '启动', prefix: '启动', examples: '/启动 react18' },
  { fileStem: '执行工作流', prefix: '执行工作流', examples: '/执行工作流 start-work' },
];

const PROTECTED_FILES = new Set([
  'ship.md',
  'ship-last.md',
  '全部提交.md',
  '复用提交.md',
  'jira-create-task.md',
]);

const EXTRA_COMMAND_FILES = ['start-dev-center.md'];

function adcShell(spoken: string): string {
  return `cd "${REPO_ROOT}" && npm run adc -- ${spoken}`;
}

function commandBody(spoken: string, extra: string): string {
  return `---
description: ${spoken}
---
${ADC_MARKER}
把口令投递到 **AI Dev Control Center**（与输入框发送同一条链路）。禁止自己拼 Jenkins URL / git merge / pnpm run release。

\`\`\`bash
${adcShell(spoken)}
\`\`\`

${extra}

根据 stdout JSON：
- \`"code":"dispatched"\`：已送到中控，请用户看 Dev Center 聊天区与 Logs 的实时流
- \`"code":"queued"\`：中控窗口未连接，已排队；请先开 Dev Center 或 /start-dev-center
- \`"code":"dev_center_offline"\`：原样报告 error，不要改在 Cursor 里直接调 Jenkins
`;
}

function writeCommand(fileStem: string, body: string): void {
  const filename = `${fileStem}.md`;
  if (PROTECTED_FILES.has(filename)) {
    throw new Error(`拒绝覆盖已有命令: ${filename}`);
  }
  writeFileSync(path.join(COMMANDS_DIR, filename), body, 'utf8');
}

function removePreviousGenerated(): void {
  for (const entry of readdirSync(COMMANDS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (PROTECTED_FILES.has(entry.name)) continue;
    const full = path.join(COMMANDS_DIR, entry.name);
    const text = readFileSync(full, 'utf8');
    if (text.includes(ADC_MARKER)) unlinkSync(full);
  }
}

function main(): void {
  mkdirSync(COMMANDS_DIR, { recursive: true });
  removePreviousGenerated();

  const usedStems = new Set<string>();
  let written = 0;

  const writeOnce = (fileStem: string, body: string): void => {
    if (usedStems.has(fileStem) || PROTECTED_FILES.has(`${fileStem}.md`)) return;
    usedStems.add(fileStem);
    writeCommand(fileStem, body);
    written += 1;
  };

  for (const item of PREFIX_COMMANDS) {
    writeOnce(
      item.fileStem,
      commandBody(
        `${item.prefix} <参数>`,
        `用户输入 ${item.examples}。把 \`/${item.prefix}\` 后面的文字拼进 adc 参数。`
      )
    );
  }

  const spokenList = collectSlashSpokenCommands(toCapabilityProjects(getAllProjects()));
  for (const spoken of spokenList) {
    writeOnce(
      slashCommandFileStem(spoken),
      commandBody(spoken, '按口令原文执行，不要改写。')
    );
  }

  const extraDir = path.join(REPO_ROOT, 'cursor-commands');
  for (const filename of EXTRA_COMMAND_FILES) {
    const src = path.join(extraDir, filename);
    const dest = path.join(COMMANDS_DIR, filename);
    if (PROTECTED_FILES.has(filename)) {
      throw new Error(`拒绝覆盖已有命令: ${filename}`);
    }
    writeFileSync(dest, `${ADC_MARKER}\n${readFileSync(src, 'utf8')}`, 'utf8');
    written += 1;
  }

  process.stdout.write(`已写入 ${written} 条命令到 ${COMMANDS_DIR}\n`);
}

main();
