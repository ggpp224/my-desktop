/* AI 生成 By Peng.Guo */
import path from 'path';
import { config } from '../../../config/default.js';
import type { JobContext, VideoModelAdapter } from './model-adapter.js';
import { SidecarClient } from './sidecar-client.js';
import type { VideoScriptVideo } from '../domain/video-script.js';

export class WanAdapter implements VideoModelAdapter {
  readonly name = 'wan';
  private readonly client: SidecarClient;

  constructor() {
    this.client = new SidecarClient({ baseUrl: config.video.sidecars.wan, adapterName: 'Wan2.2' });
  }

  healthCheck() {
    return this.client.healthCheck();
  }

  unload() {
    return this.client.unload();
  }

  async generate(input: VideoScriptVideo & { durationSec: number; title?: string; outputPath: string }, ctx: JobContext): Promise<string> {
    const outputPath = path.join(ctx.rawDir, 'video.mp4');
    ctx.onProgress?.('Wan2.2 生成视频中…');
    return this.client.generateAndWait(
      {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        resolution: input.resolution,
        fps: input.fps,
        durationSec: input.durationSec,
        title: input.title,
        outputPath,
      },
      { signal: ctx.signal, onProgress: (p) => ctx.onProgress?.(`Wan2.2 进度 ${p}%`) }
    );
  }
}
