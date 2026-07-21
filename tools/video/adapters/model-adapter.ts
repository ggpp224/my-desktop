/* AI 生成 By Peng.Guo */

export type JobContext = {
  jobId: string;
  jobDir: string;
  rawDir: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type SidecarHealth = {
  ok: boolean;
  model?: string;
  vramMb?: number;
  ready?: boolean;
  mock?: boolean;
};

export type SidecarJobStatus = {
  status: 'pending' | 'running' | 'success' | 'failure';
  progress?: number;
  outputPath?: string;
  error?: string;
};

export interface VideoModelAdapter {
  readonly name: string;
  healthCheck(): Promise<SidecarHealth>;
  generate(input: unknown, ctx: JobContext): Promise<string>;
  unload?(): Promise<void>;
}
