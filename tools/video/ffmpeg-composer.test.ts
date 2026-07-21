/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFfmpegFilterComplex, buildFfmpegArgs } from './ffmpeg-composer.js';
import { extractJsonFromLlmText, parseVideoScript, validateVideoScript } from './domain/video-script.js';

describe('video-script', () => {
  it('parseVideoScript 填充默认值', () => {
    const script = parseVideoScript({ title: '测试', video: { prompt: 'a cat' } });
    assert.equal(script.title, '测试');
    assert.equal(script.video.prompt, 'a cat');
    assert.equal(script.durationSec, 8);
    assert.equal(script.voiceover.speaker, '中文女');
  });

  it('extractJsonFromLlmText 支持代码块', () => {
    const raw = extractJsonFromLlmText('```json\n{"title":"x","video":{"prompt":"p"}}\n```');
    const script = parseVideoScript(raw);
    assert.equal(script.title, 'x');
  });

  it('validateVideoScript 检测空 prompt', () => {
    const script = parseVideoScript({ video: { prompt: '' } });
    const errors = validateVideoScript(script);
    assert.ok(errors.some((e) => e.includes('video.prompt')));
  });
});

describe('ffmpeg-composer', () => {
  it('buildFfmpegFilterComplex 三路混音', () => {
    const filter = buildFfmpegFilterComplex({
      videoPath: '/tmp/video.mp4',
      voicePath: '/tmp/voice.wav',
      musicPath: '/tmp/music.wav',
      foleyPath: '/tmp/foley.wav',
      outputPath: '/tmp/final.mp4',
      mix: { voiceGainDb: 0, musicGainDb: -12, foleyGainDb: -8 },
    });
    assert.ok(filter);
    assert.match(filter!, /amix=inputs=3/);
    assert.match(filter!, /volume=0dB/);
  });

  it('buildFfmpegArgs 无音频时仅 copy 视频', () => {
    const args = buildFfmpegArgs({
      videoPath: '/tmp/video.mp4',
      outputPath: '/tmp/final.mp4',
      mix: { voiceGainDb: 0, musicGainDb: -12, foleyGainDb: -8 },
    });
    assert.ok(args.includes('-an'));
    assert.equal(args[args.length - 1], '/tmp/final.mp4');
  });
});
