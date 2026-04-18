/* AI 生成 By Peng.Guo */
/**
 * Ollama 运行时模型：与 env 默认解耦，支持 UI 切换；列表来自 Ollama /api/tags。
 */
import { config } from '../config/default.js';

let activeModel = (config.ollama.model || 'qwen2.5').trim();

export function getOllamaActiveModel(): string {
  return activeModel;
}

export function setOllamaActiveModel(model: string): void {
  activeModel = model.trim() || activeModel;
}

export async function fetchOllamaInstalledModelNames(): Promise<string[]> {
  const res = await fetch(`${config.ollama.baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`Ollama tags failed: ${res.status}`);
  const data = (await res.json()) as { models?: Array<{ name?: string }> };
  const names = (data.models ?? [])
    .map((m) => (typeof m?.name === 'string' ? m.name.trim() : ''))
    .filter(Boolean);
  return [...new Set(names)].sort();
}

/**
 * 当前已加载到内存的模型（与 `ollama ps` 一致），用于启动时与 UI 默认展示对齐。
 * @see https://docs.ollama.com/api/ps
 */
export async function fetchOllamaRunningModelNames(): Promise<string[]> {
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/ps`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const names = (data.models ?? [])
      .map((m) => {
        const n = typeof m?.name === 'string' ? m.name.trim() : '';
        const alt = typeof m?.model === 'string' ? m.model.trim() : '';
        return n || alt;
      })
      .filter(Boolean);
    return [...new Set(names)];
  } catch {
    return [];
  }
}

/**
 * 启动时调用：若 Ollama 已有在跑模型则与之一致；否则用 env 默认（config.ollama.model）。
 */
export async function syncActiveModelFromOllamaPs(): Promise<string> {
  const running = await fetchOllamaRunningModelNames();
  if (running.length === 0) {
    setOllamaActiveModel(config.ollama.model || 'qwen2.5');
    return getOllamaActiveModel();
  }
  setOllamaActiveModel(running[0]!);
  return getOllamaActiveModel();
}

/**
 * 请求 Ollama 尽快卸载指定模型（释放显存/进程内加载）。
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md#unload-a-model
 */
export async function unloadOllamaModel(model: string): Promise<void> {
  const name = model.trim();
  if (!name) return;
  try {
    await fetch(`${config.ollama.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: name,
        prompt: '',
        stream: false,
        keep_alive: 0,
      }),
    });
  } catch {
    /* 卸载失败不阻塞切换 */
  }
}
