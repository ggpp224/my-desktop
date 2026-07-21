/* AI 生成 By Peng.Guo */
import { composeVideoWithAudio } from '../ffmpeg-composer.js';
import type { JobContext, VideoModelAdapter } from './model-adapter.js';
import type { VideoScriptMix } from '../domain/video-script.js';

export type FfmpegComposePayload = {
  videoPath: string;
  voicePath?: string;
  musicPath?: string;
  foleyPath?: string;
  outputPath: string;
  mix: VideoScriptMix;
};

export class FfmpegAdapter implements VideoModelAdapter {
  readonly name = 'ffmpeg';

  async healthCheck() {
    const { checkFfmpegAvailable } = await import('../ffmpeg-composer.js');
    const ok = await checkFfmpegAvailable();
    return { ok, model: 'ffmpeg', ready: ok };
  }

  async generate(input: FfmpegComposePayload, ctx: JobContext): Promise<string> {
    ctx.onProgress?.('FFmpeg 混流合成中…');
    const result = await composeVideoWithAudio({
      videoPath: input.videoPath,
      voicePath: input.voicePath,
      musicPath: input.musicPath,
      foleyPath: input.foleyPath,
      outputPath: input.outputPath,
      mix: input.mix,
    });
    if (!result.success || !result.outputPath) {
      throw new Error(result.error || 'FFmpeg 合成失败');
    }
    return result.outputPath;
  }
}
