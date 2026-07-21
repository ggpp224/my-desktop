/* AI 生成 By Peng.Guo */
import { config } from '../../config/default.js';
import { fetchOllamaApiChatWithThinkFallback } from '../../agent/ollama-client.js';
import { extractJsonFromLlmText, parseVideoScript, validateVideoScript, type VideoScript } from './domain/video-script.js';

const SCRIPT_SYSTEM_PROMPT = `你是专业视频分镜编剧。根据用户 Prompt 输出**仅 JSON**（不要 markdown 说明），结构如下：
{
  "title": "视频标题",
  "durationSec": 8,
  "video": {
    "prompt": "英文视频画面描述，电影感",
    "negativePrompt": "blurry, low quality, watermark",
    "resolution": "720p",
    "fps": 24
  },
  "voiceover": {
    "enabled": true,
    "text": "中文旁白文案",
    "speaker": "中文女",
    "speed": 1.0
  },
  "music": {
    "enabled": true,
    "prompt": "英文背景音乐描述",
    "durationSec": 8
  },
  "foley": {
    "enabled": true,
    "prompt": "英文环境音效描述",
    "durationSec": 8
  },
  "mix": {
    "voiceGainDb": 0,
    "musicGainDb": -12,
    "foleyGainDb": -8
  }
}
要求：durationSec 2-30；video.prompt 用英文；旁白用中文；音乐/环境音 prompt 用英文。`;

export type ScriptGeneratorOptions = {
  model?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  maxRetries?: number;
};

export async function generateVideoScript(userPrompt: string, options?: ScriptGeneratorOptions): Promise<VideoScript> {
  const model = options?.model?.trim() || config.video.scriptModel;
  const maxRetries = options?.maxRetries ?? 2;
  const timeoutMs = config.video.scriptTimeoutMs;
  const signal =
    options?.signal ??
    (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let lastError = '未知错误';
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    options?.onProgress?.(`LLM 生成分镜脚本（第 ${attempt}/${maxRetries} 次）…`);
    const body = {
      model,
      messages: [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: {
        num_ctx: 8192,
        num_predict: 2048,
        temperature: config.video.scriptTemperature,
      },
    };
    const res = await fetchOllamaApiChatWithThinkFallback(body, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!res.ok) {
      lastError = await res.text().catch(() => `Ollama HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as { message?: { content?: string; thinking?: string } };
    const text = (data.message?.content || data.message?.thinking || '').trim();
    if (!text) {
      lastError = 'LLM 返回空内容';
      continue;
    }
    try {
      const raw = extractJsonFromLlmText(text);
      const script = parseVideoScript(raw);
      const errors = validateVideoScript(script);
      if (errors.length > 0) {
        lastError = errors.join('; ');
        continue;
      }
      return script;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`分镜脚本生成失败: ${lastError}`);
}
