/* AI 生成 By Peng.Guo */
import type { VideoModelAdapter } from '../adapters/model-adapter.js';
import { WanAdapter } from '../adapters/wan-adapter.js';
import { CosyVoiceAdapter } from '../adapters/cosyvoice-adapter.js';
import { AudioCraftMusicAdapter } from '../adapters/audiocraft-music-adapter.js';
import { AudioCraftFoleyAdapter } from '../adapters/audiocraft-foley-adapter.js';
import { FfmpegAdapter } from '../adapters/ffmpeg-adapter.js';

const registry = new Map<string, VideoModelAdapter>();

function register(adapter: VideoModelAdapter): void {
  registry.set(adapter.name, adapter);
}

register(new WanAdapter());
register(new CosyVoiceAdapter());
register(new AudioCraftMusicAdapter());
register(new AudioCraftFoleyAdapter());
register(new FfmpegAdapter());

export function getVideoAdapter(name: string): VideoModelAdapter | undefined {
  return registry.get(name);
}

export function listVideoAdapters(): VideoModelAdapter[] {
  return [...registry.values()];
}

export function getGpuAdapters(): VideoModelAdapter[] {
  return [getVideoAdapter('wan')!, getVideoAdapter('cosyvoice')!, getVideoAdapter('audiocraft-music')!, getVideoAdapter('audiocraft-foley')!];
}
