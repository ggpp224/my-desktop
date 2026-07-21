/* AI 生成 By Peng.Guo */
import path from 'path';
import { config } from '../../../config/default.js';
import type { JobContext, VideoModelAdapter } from './model-adapter.js';
import { SidecarClient } from './sidecar-client.js';
import type { VideoScriptFoley } from '../domain/video-script.js';

export class AudioCraftFoleyAdapter implements VideoModelAdapter {
  readonly name = 'audiocraft-foley';
  private readonly client: SidecarClient;

  constructor() {
    this.client = new SidecarClient({ baseUrl: config.video.sidecars.foley, adapterName: 'Foley' });
  }

  healthCheck() {
    return this.client.healthCheck();
  }

  unload() {
    return this.client.unload();
  }

  async generate(input: VideoScriptFoley, ctx: JobContext): Promise<string> {
    const outputPath = path.join(ctx.rawDir, 'foley.wav');
    ctx.onProgress?.('Foley 生成环境音中…');
    return this.client.generateAndWait(
      {
        prompt: input.prompt,
        durationSec: input.durationSec,
        outputPath,
        kind: 'foley',
      },
      { signal: ctx.signal, onProgress: (p) => ctx.onProgress?.(`Foley 进度 ${p}%`) }
    );
  }
}
