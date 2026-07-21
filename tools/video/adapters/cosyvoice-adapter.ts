/* AI 生成 By Peng.Guo */
import path from 'path';
import { config } from '../../../config/default.js';
import type { JobContext, VideoModelAdapter } from './model-adapter.js';
import { SidecarClient } from './sidecar-client.js';
import type { VideoScriptVoiceover } from '../domain/video-script.js';

export class CosyVoiceAdapter implements VideoModelAdapter {
  readonly name = 'cosyvoice';
  private readonly client: SidecarClient;

  constructor() {
    this.client = new SidecarClient({ baseUrl: config.video.sidecars.cosyvoice, adapterName: 'CosyVoice' });
  }

  healthCheck() {
    return this.client.healthCheck();
  }

  unload() {
    return this.client.unload();
  }

  async generate(input: VideoScriptVoiceover & { durationSec: number }, ctx: JobContext): Promise<string> {
    const outputPath = path.join(ctx.rawDir, 'voice.wav');
    ctx.onProgress?.('CosyVoice 生成配音中…');
    return this.client.generateAndWait(
      {
        text: input.text,
        speaker: input.speaker,
        speed: input.speed,
        durationSec: input.durationSec,
        outputPath,
      },
      { signal: ctx.signal, onProgress: (p) => ctx.onProgress?.(`CosyVoice 进度 ${p}%`) }
    );
  }
}
