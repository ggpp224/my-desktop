/* AI 生成 By Peng.Guo */
import { useEffect, useRef, useState } from 'react';
import type { AppThemeTokens } from './domain/theme/appTheme';
import { Button } from './view/Button';
import { fetchAgentOllamaInstalledModels } from './infrastructure/agent/ollamaModelApi';
import {
  buildVideoFinalUrl,
  cancelVideoGenerate,
  fetchVideoHealth,
  postVideoGenerateStream,
  postVideoStartServices,
  type VideoHealthResponse,
} from './infrastructure/video/videoGeneratorApi';

function pickDefaultScriptModel(preferred: string | undefined, installed: string[]): string {
  if (preferred && installed.includes(preferred)) return preferred;
  return installed[0] ?? preferred ?? '';
}

type GenerateResult = {
  success: boolean;
  jobId?: string;
  outputPath?: string;
  error?: string;
};

interface VideoGeneratorPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
  themeTokens: AppThemeTokens;
}

export function VideoGeneratorPanel({ apiBase, addLog, themeTokens }: VideoGeneratorPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [scriptModel, setScriptModel] = useState('');
  const [scriptModelOptions, setScriptModelOptions] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [health, setHealth] = useState<VideoHealthResponse | null>(null);
  const [startingServices, setStartingServices] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const modelsInitializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchVideoHealth(apiBase), fetchAgentOllamaInstalledModels(apiBase)])
      .then(([h, models]) => {
        if (cancelled) return;
        setHealth(h);
        setScriptModelOptions(models);
        if (!modelsInitializedRef.current) {
          modelsInitializedRef.current = true;
          setScriptModel(pickDefaultScriptModel(h.scriptModel, models));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        addLog(`视频管线初始化失败：${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 apiBase 变化时初始化，避免切换模型后被重置
  }, [apiBase]);

  const refreshHealth = async () => {
    try {
      const h = await fetchVideoHealth(apiBase);
      setHealth(h);
      return h;
    } catch (err) {
      addLog(`健康检查失败：${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const pollHealthAfterStart = () => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refreshHealth().then((h) => {
        if (!h) return;
        const ready = Boolean(h.ffmpeg && h.ollama && Object.values(h.sidecars).every((s) => s.ok));
        if (ready || attempts >= 12) window.clearInterval(timer);
      });
    }, 3000);
  };

  const startServices = async () => {
    setStartingServices(true);
    addLog('正在启动音视频依赖服务（系统终端）…');
    try {
      const result = await postVideoStartServices(apiBase);
      if (result.started?.length) {
        addLog(`已打开终端启动：${result.started.join('、')}`);
      }
      if (result.skipped?.length) {
        addLog(`跳过：${result.skipped.join('、')}`);
      }
      for (const note of result.notes ?? []) {
        addLog(note);
      }
      if (!result.success) {
        addLog(`启动失败：${result.error ?? '未知错误'}`);
        return;
      }
      pollHealthAfterStart();
      await refreshHealth();
    } catch (err) {
      addLog(`启动服务失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStartingServices(false);
    }
  };

  const sidecarsReady = health ? Object.values(health.sidecars).every((s) => s.ok) : false;
  const depsReady = Boolean(health?.ffmpeg && health?.ollama && sidecarsReady);
  const canGenerate = Boolean(prompt.trim()) && Boolean(scriptModel) && !generating && depsReady;

  const generate = async () => {
    const text = prompt.trim();
    if (!text) return;
    setGenerating(true);
    setProgress(0);
    setSteps([]);
    setResult(null);
    addLog(`开始生成视频：${text.slice(0, 60)}…`);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await postVideoGenerateStream(
        apiBase,
        text,
        abort.signal,
        {
          onStep: (message) => {
            setSteps((prev) => [...prev, message]);
            addLog(message);
          },
          onProgress: (percent) => setProgress(percent),
          onDone: (payload) => {
            setResult({ success: true, jobId: payload.jobId, outputPath: payload.outputPath });
            addLog(`视频生成完成：${payload.outputPath ?? payload.jobId}`);
          },
          onError: (message) => {
            setResult({ success: false, error: message });
            addLog(`视频生成失败：${message}`);
          },
        },
        { scriptModel }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ success: false, error: msg });
      addLog(`视频生成失败：${msg}`);
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  };

  const cancel = async () => {
    abortRef.current?.abort();
    try {
      await cancelVideoGenerate(apiBase);
    } catch {
      /* ignore */
    }
    setGenerating(false);
    addLog('已请求取消视频生成');
  };

  const previewUrl =
    result?.success && result.jobId ? buildVideoFinalUrl(apiBase, result.jobId) : undefined;

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: themeTokens.textPrimary }}>AI 视频生成</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: themeTokens.textSecondary, lineHeight: 1.6 }}>
        输入 Prompt → LLM 分镜 → Wan2.2 视频 + CosyVoice 配音 + AudioCraft 背景音乐 + Foley 环境音 → FFmpeg 合成 MP4。
        成片保存至「下载」文件夹。
      </p>

      {health && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${depsReady ? themeTokens.tabActiveBorder : themeTokens.statusWarning}`,
            background: themeTokens.workspacePanelSubtleBackground,
            fontSize: 12,
            color: themeTokens.textSecondary,
            lineHeight: 1.6,
          }}
        >
          <div>
            依赖状态：FFmpeg {health.ffmpeg ? '✓' : '✗'} · Ollama {health.ollama ? '✓' : '✗'} · Sidecar{' '}
            {Object.values(health.sidecars).filter((s) => s.ok).length}/{Object.keys(health.sidecars).length}
            {health.mockMode ? '（Mock 模式：测试画面+音效，非真实 AI 成片）' : ''}
            <button
              type="button"
              onClick={() => void startServices()}
              disabled={startingServices || depsReady}
              title={depsReady ? '依赖已全部就绪' : '在系统终端启动 Ollama 与视频 Sidecar'}
              style={{
                marginLeft: 8,
                padding: '2px 8px',
                fontSize: 11,
                borderRadius: 4,
                border: `1px solid ${themeTokens.tabActiveBorder}`,
                background: depsReady ? 'transparent' : themeTokens.tabActiveBorder,
                color: depsReady ? themeTokens.textSecondary : '#fff',
                cursor: startingServices || depsReady ? 'not-allowed' : 'pointer',
                opacity: startingServices ? 0.7 : 1,
              }}
            >
              {startingServices ? '启动中…' : '启动服务'}
            </button>
            <button
              type="button"
              onClick={() => void refreshHealth()}
              style={{
                marginLeft: 8,
                padding: '2px 8px',
                fontSize: 11,
                borderRadius: 4,
                border: `1px solid ${themeTokens.inputBorder}`,
                background: 'transparent',
                color: themeTokens.textPrimary,
                cursor: 'pointer',
              }}
            >
              刷新
            </button>
          </div>
          {!health.ollama && (
            <div style={{ marginTop: 8, color: themeTokens.statusWarning }}>
              Ollama 未运行。点击「启动服务」将尝试打开 Ollama 应用。
            </div>
          )}
          {!health.ffmpeg && (
            <div style={{ marginTop: 8, color: themeTokens.statusWarning }}>
              FFmpeg 未安装。请在终端执行：<code>brew install ffmpeg</code>
            </div>
          )}
          {!sidecarsReady && (
            <div style={{ marginTop: 8, color: themeTokens.statusWarning }}>
              Sidecar 未就绪。点击上方「启动服务」在系统终端一键启动，或手动执行：
              <code style={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>
                npm run dev:video-sidecars
              </code>
            </div>
          )}
        </div>
      )}

      <label style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 6 }}>Prompt</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="例如：雨夜城市街角，霓虹灯倒映在积水中，镜头缓慢推进…"
        rows={4}
        style={{
          width: '100%',
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 6,
          border: `1px solid ${themeTokens.inputBorder}`,
          background: themeTokens.inputBackground,
          color: themeTokens.textPrimary,
          fontSize: 13,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: themeTokens.textSecondary }}>分镜模型</label>
        <select
          value={scriptModel}
          onChange={(e) => setScriptModel(e.target.value)}
          disabled={generating || scriptModelOptions.length === 0}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid ${themeTokens.inputBorder}`,
            background: themeTokens.inputBackground,
            color: themeTokens.textPrimary,
            fontSize: 13,
            minWidth: 180,
          }}
        >
          {scriptModelOptions.length === 0 ? (
            <option value="">未检测到 Ollama 模型</option>
          ) : (
            scriptModelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))
          )}
        </select>
        <Button themeTokens={themeTokens} onClick={() => void generate()} variant="solid" size="md" loading={generating} disabled={!canGenerate}>
          生成视频
        </Button>
        {generating && (
          <Button themeTokens={themeTokens} onClick={() => void cancel()} variant="soft" size="md">
            取消
          </Button>
        )}
      </div>

      {generating && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: themeTokens.textSecondary, marginBottom: 4 }}>进度 {progress}%</div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: themeTokens.workspacePanelSubtleBackground,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: themeTokens.tabActiveBorder,
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${themeTokens.inputBorder}`,
            background: themeTokens.workspacePanelSubtleBackground,
            fontSize: 12,
            color: themeTokens.textPrimary,
            maxHeight: 200,
            overflow: 'auto',
            lineHeight: 1.6,
          }}
        >
          {steps.map((line, i) => (
            <div key={`${i}-${line}`}>{line}</div>
          ))}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${result.success ? themeTokens.tabActiveBorder : themeTokens.statusWarning}`,
            background: themeTokens.workspacePanelSubtleBackground,
            fontSize: 13,
            color: result.success ? themeTokens.textPrimary : themeTokens.statusWarning,
            lineHeight: 1.6,
          }}
        >
          {result.success ? (
            <>
              生成成功
              {result.outputPath && (
                <div style={{ marginTop: 6, wordBreak: 'break-all', fontSize: 12 }}>
                  已保存至下载目录：{result.outputPath}
                </div>
              )}
              {previewUrl && (
                <div style={{ marginTop: 12 }}>
                  <video src={previewUrl} controls style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 6 }} />
                </div>
              )}
            </>
          ) : (
            <>生成失败：{result.error}</>
          )}
        </div>
      )}
    </section>
  );
}
