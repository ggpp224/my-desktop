/* AI 生成 By Peng.Guo */
import { healthCheck as ollamaHealthCheck } from '../../agent/ollama-client.js';
import { config } from '../../config/default.js';
import { checkFfmpegAvailable } from './ffmpeg-composer.js';
import { GpuModelScheduler } from './gpu-model-scheduler.js';
import { getVideoAdapter } from './registry/video-adapter-registry.js';

export type VideoHealthReport = {
  ok: boolean;
  ffmpeg: boolean;
  ollama: boolean;
  mockMode: boolean;
  sidecars: Record<string, { ok: boolean; model?: string; mock?: boolean }>;
  scriptModel: string;
};

export async function checkVideoPipelineHealth(): Promise<VideoHealthReport> {
  const ffmpeg = await checkFfmpegAvailable();
  const ollama = await ollamaHealthCheck();
  const scheduler = new GpuModelScheduler();
  const sidecars = await scheduler.checkAllHealth();
  const allSidecarsOk = Object.values(sidecars).every((s) => s.ok);
  return {
    ok: ffmpeg && ollama && allSidecarsOk,
    ffmpeg,
    ollama,
    mockMode: config.video.mockMode,
    sidecars,
    scriptModel: config.video.scriptModel,
  };
}

export async function checkFfmpegOnly(): Promise<boolean> {
  return checkFfmpegAvailable();
}

export function getFfmpegAdapter() {
  return getVideoAdapter('ffmpeg');
}
