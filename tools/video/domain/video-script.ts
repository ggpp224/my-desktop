/* AI 生成 By Peng.Guo */

export type VideoResolution = '480p' | '720p' | '1080p';

export type VideoScriptVideo = {
  prompt: string;
  negativePrompt: string;
  resolution: VideoResolution;
  fps: number;
};

export type VideoScriptVoiceover = {
  enabled: boolean;
  text: string;
  speaker: string;
  speed: number;
};

export type VideoScriptMusic = {
  enabled: boolean;
  prompt: string;
  durationSec: number;
};

export type VideoScriptFoley = {
  enabled: boolean;
  prompt: string;
  durationSec: number;
};

export type VideoScriptMix = {
  voiceGainDb: number;
  musicGainDb: number;
  foleyGainDb: number;
};

export type VideoScript = {
  title: string;
  durationSec: number;
  video: VideoScriptVideo;
  voiceover: VideoScriptVoiceover;
  music: VideoScriptMusic;
  foley: VideoScriptFoley;
  mix: VideoScriptMix;
};

const RESOLUTIONS = new Set<VideoResolution>(['480p', '720p', '1080p']);

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 从 LLM 原始 JSON 解析并填充默认值 */
export function parseVideoScript(raw: unknown, fallbackDurationSec = 8): VideoScript {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const video = obj.video && typeof obj.video === 'object' ? (obj.video as Record<string, unknown>) : {};
  const voiceover =
    obj.voiceover && typeof obj.voiceover === 'object' ? (obj.voiceover as Record<string, unknown>) : {};
  const music = obj.music && typeof obj.music === 'object' ? (obj.music as Record<string, unknown>) : {};
  const foley = obj.foley && typeof obj.foley === 'object' ? (obj.foley as Record<string, unknown>) : {};
  const mix = obj.mix && typeof obj.mix === 'object' ? (obj.mix as Record<string, unknown>) : {};

  const durationSec = clamp(asNumber(obj.durationSec, fallbackDurationSec), 2, 30);
  const resolutionRaw = asString(video.resolution, '720p') as VideoResolution;

  return {
    title: asString(obj.title, '未命名视频'),
    durationSec,
    video: {
      prompt: asString(video.prompt, 'cinematic scene, high quality'),
      negativePrompt: asString(video.negativePrompt, 'blurry, low quality, watermark'),
      resolution: RESOLUTIONS.has(resolutionRaw) ? resolutionRaw : '720p',
      fps: clamp(asNumber(video.fps, 24), 12, 30),
    },
    voiceover: {
      enabled: asBool(voiceover.enabled, true),
      text: asString(voiceover.text, ''),
      speaker: asString(voiceover.speaker, '中文女'),
      speed: clamp(asNumber(voiceover.speed, 1), 0.5, 2),
    },
    music: {
      enabled: asBool(music.enabled, true),
      prompt: asString(music.prompt, 'soft ambient background music'),
      durationSec: clamp(asNumber(music.durationSec, durationSec), 2, 30),
    },
    foley: {
      enabled: asBool(foley.enabled, true),
      prompt: asString(foley.prompt, 'subtle ambient environment sounds'),
      durationSec: clamp(asNumber(foley.durationSec, durationSec), 2, 30),
    },
    mix: {
      voiceGainDb: asNumber(mix.voiceGainDb, 0),
      musicGainDb: asNumber(mix.musicGainDb, -12),
      foleyGainDb: asNumber(mix.foleyGainDb, -8),
    },
  };
}

/** 从 LLM 文本中提取 JSON（支持 markdown 代码块包裹） */
export function extractJsonFromLlmText(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('LLM 输出中未找到 JSON 对象');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function validateVideoScript(script: VideoScript): string[] {
  const errors: string[] = [];
  if (!script.video.prompt) errors.push('video.prompt 不能为空');
  if (script.voiceover.enabled && !script.voiceover.text) errors.push('voiceover.text 不能为空');
  if (script.music.enabled && !script.music.prompt) errors.push('music.prompt 不能为空');
  if (script.foley.enabled && !script.foley.prompt) errors.push('foley.prompt 不能为空');
  return errors;
}
