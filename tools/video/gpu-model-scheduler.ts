/* AI 生成 By Peng.Guo */
import type { VideoModelAdapter } from './adapters/model-adapter.js';
import { getGpuAdapters } from './registry/video-adapter-registry.js';

export type GpuSchedulerHooks = {
  onStep?: (message: string) => void;
};

/** 串行执行 GPU 模型任务，每步完成后 unload 释放显存 */
export class GpuModelScheduler {
  private readonly adapters: VideoModelAdapter[];

  constructor(adapters: VideoModelAdapter[] = getGpuAdapters()) {
    this.adapters = adapters;
  }

  async checkAllHealth(): Promise<Record<string, { ok: boolean; model?: string; mock?: boolean }>> {
    const result: Record<string, { ok: boolean; model?: string; mock?: boolean }> = {};
    for (const adapter of this.adapters) {
      const health = await adapter.healthCheck();
      result[adapter.name] = { ok: health.ok, model: health.model, mock: health.mock };
    }
    return result;
  }

  /** 生成前校验所需 Sidecar 均已就绪 */
  async assertSidecarsReady(requiredAdapterNames: string[]): Promise<void> {
    const health = await this.checkAllHealth();
    const missing = requiredAdapterNames.filter((name) => !health[name]?.ok);
    if (missing.length === 0) return;
    const lines = missing.map((name) => `- ${name}`).join('\n');
    throw new Error(
      `以下 Sidecar 未启动或不可达：\n${lines}\n\n请在另一终端执行：\ncd services/video-sidecar && ./scripts/start-all-sidecars.sh\n\n或：npm run dev:video-sidecars`
    );
  }

  async runSequential<T>(
    tasks: Array<{ adapterName: string; input: unknown; ctx: Parameters<VideoModelAdapter['generate']>[1] }>,
    hooks?: GpuSchedulerHooks
  ): Promise<Record<string, string>> {
    const outputs: Record<string, string> = {};
    for (const task of tasks) {
      const adapter = this.adapters.find((a) => a.name === task.adapterName);
      if (!adapter) throw new Error(`未注册适配器: ${task.adapterName}`);
      hooks?.onStep?.(`开始 ${adapter.name} 生成…`);
      let generated = false;
      try {
        outputs[task.adapterName] = await adapter.generate(task.input, task.ctx);
        generated = true;
        hooks?.onStep?.(`${adapter.name} 生成完成`);
      } finally {
        if (generated && adapter.unload) {
          hooks?.onStep?.(`释放 ${adapter.name} 显存…`);
          await adapter.unload();
        }
      }
    }
    return outputs;
  }
}
