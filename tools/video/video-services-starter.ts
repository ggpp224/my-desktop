/* AI 生成 By Peng.Guo */
import { platform } from 'os';
import path from 'path';
import { createRequire } from 'module';
import { runInTerminal } from '../shell-tool.js';
import { checkVideoPipelineHealth, type VideoHealthReport } from './video-health.js';

const require = createRequire(import.meta.url);

export type VideoServiceStartItem = {
  id: 'ollama' | 'sidecars';
  label: string;
  cmd: string;
};

function getDesktopRoot(): string {
  if (typeof process !== 'undefined' && process.versions?.electron) {
    try {
      const { app } = require('electron');
      return app.getAppPath();
    } catch {
      return process.cwd();
    }
  }
  return process.cwd();
}

export function buildOllamaStartCommand(): string {
  const plat = platform();
  if (plat === 'darwin') {
    return 'open -a Ollama 2>/dev/null || ollama serve';
  }
  if (plat === 'win32') {
    return 'start "" ollama serve';
  }
  return 'ollama serve';
}

export function buildSidecarStartCommand(root?: string): string {
  const desktopRoot = (root ?? getDesktopRoot()).replace(/"/g, '\\"');
  return `export PATH="/opt/homebrew/bin:$PATH"; cd "${desktopRoot}" && npm run dev:video-sidecars`;
}

export function planVideoServiceStarts(health: VideoHealthReport, root?: string): {
  items: VideoServiceStartItem[];
  notes: string[];
} {
  const items: VideoServiceStartItem[] = [];
  const notes: string[] = [];

  if (!health.ffmpeg) {
    notes.push('FFmpeg 未安装：请在终端执行 brew install ffmpeg');
  }
  if (!health.ollama) {
    items.push({ id: 'ollama', label: 'Ollama', cmd: buildOllamaStartCommand() });
  }
  const sidecarsOk = Object.values(health.sidecars).every((s) => s.ok);
  if (!sidecarsOk) {
    items.push({
      id: 'sidecars',
      label: '视频 Sidecar（Wan / CosyVoice / Music / Foley）',
      cmd: buildSidecarStartCommand(root),
    });
  }
  if (items.length === 0 && notes.length === 0) {
    notes.push('音视频依赖已全部就绪，无需启动');
  }
  return { items, notes };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 在系统终端依次启动视频管线所需服务（Ollama + Sidecar） */
export async function startVideoServices(): Promise<{
  success: boolean;
  started: string[];
  skipped: string[];
  notes: string[];
  error?: string;
}> {
  const health = await checkVideoPipelineHealth();
  const { items, notes } = planVideoServiceStarts(health);
  const started: string[] = [];
  const skipped: string[] = [];

  if (!health.ollama) skipped.push('ollama（将启动）');
  else skipped.push('ollama（已运行）');

  const sidecarsOk = Object.values(health.sidecars).every((s) => s.ok);
  if (sidecarsOk) skipped.push('sidecars（已运行）');
  else skipped.push('sidecars（将启动）');

  if (items.length === 0) {
    return { success: true, started, skipped, notes };
  }

  try {
    for (let i = 0; i < items.length; i++) {
      if (i > 0) await sleep(600);
      await runInTerminal(items[i].cmd);
      started.push(items[i].label);
    }
    notes.push('已在系统终端打开启动命令；Sidecar 就绪后点击「刷新」或等待自动检测。');
    return { success: true, started, skipped, notes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, started, skipped, notes, error: message };
  }
}

export function resolveVideoSidecarDir(): string {
  return path.join(getDesktopRoot(), 'services', 'video-sidecar');
}
