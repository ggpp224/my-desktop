/* AI 生成 By Peng.Guo */
import type { SidecarHealth, SidecarJobStatus } from './model-adapter.js';

const DEFAULT_POLL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 600_000;

export type SidecarClientOptions = {
  baseUrl: string;
  adapterName: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export class SidecarClient {
  readonly baseUrl: string;
  readonly adapterName: string;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: SidecarClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.adapterName = options.adapterName;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async healthCheck(): Promise<SidecarHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return { ok: false };
      return (await res.json()) as SidecarHealth;
    } catch {
      return { ok: false };
    }
  }

  async unload(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/unload`, { method: 'POST', signal: AbortSignal.timeout(30_000) });
    } catch {
      /* sidecar 可能未实现 unload */
    }
  }

  async generate(payload: Record<string, unknown>, signal?: AbortSignal): Promise<{ jobId: string }> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${this.adapterName} 服务不可达（${this.baseUrl}）：${reason}。请先启动 Sidecar：cd services/video-sidecar && ./scripts/start-all-sidecars.sh`
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${this.adapterName} generate 失败: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { jobId?: string };
    if (!data.jobId) throw new Error(`${this.adapterName} 未返回 jobId`);
    return { jobId: data.jobId };
  }

  async getJob(jobId: string, signal?: AbortSignal): Promise<SidecarJobStatus> {
    const res = await fetch(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${this.adapterName} 查询 job 失败: ${res.status} ${text}`);
    }
    return (await res.json()) as SidecarJobStatus;
  }

  async generateAndWait(
    payload: Record<string, unknown>,
    hooks?: { onProgress?: (progress: number, status: SidecarJobStatus) => void; signal?: AbortSignal }
  ): Promise<string> {
    const started = Date.now();
    const { jobId } = await this.generate(payload, hooks?.signal);
    while (true) {
      if (hooks?.signal?.aborted) throw new Error(`${this.adapterName} 已取消`);
      if (Date.now() - started > this.timeoutMs) {
        throw new Error(`${this.adapterName} 生成超时（${this.timeoutMs}ms）`);
      }
      const status = await this.getJob(jobId, hooks?.signal);
      if (typeof status.progress === 'number') {
        hooks?.onProgress?.(status.progress, status);
      }
      if (status.status === 'success') {
        if (!status.outputPath) throw new Error(`${this.adapterName} 成功但未返回 outputPath`);
        return status.outputPath;
      }
      if (status.status === 'failure') {
        throw new Error(status.error || `${this.adapterName} 生成失败`);
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }
}
