/* AI 生成 By Peng.Guo */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { config } from '../../config/default.js';

export type FfmpegComposeInput = {
  videoPath: string;
  voicePath?: string;
  musicPath?: string;
  foleyPath?: string;
  outputPath: string;
  mix: {
    voiceGainDb: number;
    musicGainDb: number;
    foleyGainDb: number;
  };
};

export type FfmpegComposeResult = {
  success: boolean;
  outputPath?: string;
  error?: string;
};

export function buildFfmpegFilterComplex(input: FfmpegComposeInput): string | null {
  const parts: string[] = [];
  const mixInputs: string[] = [];
  let audioIndex = 1;

  if (input.voicePath) {
    parts.push(`[${audioIndex}:a]aresample=44100,volume=${input.mix.voiceGainDb}dB[voice]`);
    mixInputs.push('[voice]');
    audioIndex += 1;
  }
  if (input.musicPath) {
    parts.push(`[${audioIndex}:a]aresample=44100,volume=${input.mix.musicGainDb}dB[music]`);
    mixInputs.push('[music]');
    audioIndex += 1;
  }
  if (input.foleyPath) {
    parts.push(`[${audioIndex}:a]aresample=44100,volume=${input.mix.foleyGainDb}dB[foley]`);
    mixInputs.push('[foley]');
    audioIndex += 1;
  }

  if (mixInputs.length === 0) return null;
  if (mixInputs.length === 1) {
    parts.push(`${mixInputs[0]}anull[aout]`);
  } else {
    parts.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=2[aout]`);
  }
  return parts.join(';');
}

export function buildFfmpegArgs(input: FfmpegComposeInput): string[] {
  const args = ['-y', '-i', input.videoPath];
  if (input.voicePath && existsSync(input.voicePath)) args.push('-i', input.voicePath);
  if (input.musicPath && existsSync(input.musicPath)) args.push('-i', input.musicPath);
  if (input.foleyPath && existsSync(input.foleyPath)) args.push('-i', input.foleyPath);

  const filterInput: FfmpegComposeInput = {
    ...input,
    voicePath: input.voicePath && existsSync(input.voicePath) ? input.voicePath : undefined,
    musicPath: input.musicPath && existsSync(input.musicPath) ? input.musicPath : undefined,
    foleyPath: input.foleyPath && existsSync(input.foleyPath) ? input.foleyPath : undefined,
  };
  const filter = buildFfmpegFilterComplex(filterInput);
  if (filter) {
    args.push(
      '-filter_complex',
      filter,
      '-map',
      '0:v',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest'
    );
  } else {
    args.push('-c:v', 'copy', '-an');
  }
  args.push(input.outputPath);
  return args;
}

export async function checkFfmpegAvailable(ffmpegPath = config.video.ffmpegPath): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

export async function composeVideoWithAudio(input: FfmpegComposeInput): Promise<FfmpegComposeResult> {
  const ffmpegPath = config.video.ffmpegPath;
  const available = await checkFfmpegAvailable(ffmpegPath);
  if (!available) {
    return { success: false, error: `未找到 FFmpeg（${ffmpegPath}），请安装后重试` };
  }
  if (!existsSync(input.videoPath)) {
    return { success: false, error: `视频文件不存在: ${input.videoPath}` };
  }

  const args = buildFfmpegArgs(input);
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    proc.on('close', (code) => {
      if (code === 0 && existsSync(input.outputPath)) {
        resolve({ success: true, outputPath: input.outputPath });
      } else {
        resolve({ success: false, error: stderr.trim() || `FFmpeg 退出码 ${code}` });
      }
    });
  });
}
