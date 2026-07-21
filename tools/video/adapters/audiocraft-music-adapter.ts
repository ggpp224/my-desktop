/* AI 生成 By Peng.Guo */
import path from 'path';
import { config } from '../../../config/default.js';
import type { JobContext, VideoModelAdapter } from './model-adapter.js';
import { SidecarClient } from './sidecar-client.js';
import type { VideoScriptMusic } from '../domain/video-script.js';

export class AudioCraftMusicAdapter implements VideoModelAdapter {
  readonly name = 'audiocraft-music';
  private readonly client: SidecarClient;

  constructor() {
    this.client = new SidecarClient({ baseUrl: config.video.sidecars.audiocraft, adapterName: 'AudioCraft' });
  }

  healthCheck() {
    return this.client.healthCheck();
  }

  unload() {
    return this.client.unload();
  }

  async generate(input: VideoScriptMusic, ctx: JobContext): Promise<string> {
    const outputPath = path.join(ctx.rawDir, 'music.wav');
    ctx.onProgress?.('AudioCraft 生成背景音乐中…');
    return this.client.generateAndWait(
      {
        prompt: input.prompt,
        durationSec: input.durationSec,
        outputPath,
        kind: 'music',
      },
      { signal: ctx.signal, onProgress: (p) => ctx.onProgress?.(`AudioCraft 进度 ${p}%`) }
    );
  }
}
