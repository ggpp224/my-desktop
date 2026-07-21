/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOllamaStartCommand,
  buildSidecarStartCommand,
  planVideoServiceStarts,
} from './video-services-starter.js';

describe('video-services-starter', () => {
  it('buildSidecarStartCommand uses project root and npm script', () => {
    const cmd = buildSidecarStartCommand('/tmp/my-desktop');
    assert.match(cmd, /cd "\/tmp\/my-desktop"/);
    assert.match(cmd, /npm run dev:video-sidecars/);
    assert.match(cmd, /\/opt\/homebrew\/bin/);
  });

  it('buildOllamaStartCommand prefers Ollama app on macOS', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      assert.match(buildOllamaStartCommand(), /open -a Ollama/);
    } finally {
      Object.defineProperty(process, 'platform', { value: original });
    }
  });

  it('planVideoServiceStarts queues ollama and sidecars when missing', () => {
    const plan = planVideoServiceStarts(
      {
        ok: false,
        ffmpeg: true,
        ollama: false,
        mockMode: true,
        scriptModel: 'qwen2.5',
        sidecars: { wan: { ok: false }, cosyvoice: { ok: true } },
      },
      '/proj'
    );
    assert.equal(plan.items.length, 2);
    assert.equal(plan.items[0]?.id, 'ollama');
    assert.equal(plan.items[1]?.id, 'sidecars');
  });

  it('planVideoServiceStarts notes ffmpeg install when missing', () => {
    const plan = planVideoServiceStarts({
      ok: false,
      ffmpeg: false,
      ollama: true,
      mockMode: false,
      scriptModel: 'qwen2.5',
      sidecars: { wan: { ok: true }, cosyvoice: { ok: true } },
    });
    assert.equal(plan.items.length, 0);
    assert.ok(plan.notes.some((n) => n.includes('FFmpeg')));
  });
});
