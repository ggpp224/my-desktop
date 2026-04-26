/* AI 生成 By Peng.Guo */
import { useEffect, useState, type FormEvent } from 'react';
import type { GeminiUserSettings, LlmRuntimeMode } from '../domain/llm/agentLlmRequest.js';
import { DEFAULT_GEMINI_MODEL } from '../domain/llm/agentLlmRequest.js';
import { useGeminiConnectionTest } from '../viewmodel/llm/useGeminiConnectionTest';

export type LlmSettingsModalProps = {
  open: boolean;
  apiBase: string;
  mode: LlmRuntimeMode;
  gemini: GeminiUserSettings;
  onClose: () => void;
  onSave: (next: { mode: LlmRuntimeMode; gemini: GeminiUserSettings }) => void;
};

export function LlmSettingsModal({ open, apiBase, mode, gemini, onClose, onSave }: LlmSettingsModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="llm-settings-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          background: '#1e293b',
          border: '1px solid #475569',
          borderRadius: 10,
          padding: 20,
          color: '#e2e8f0',
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="llm-settings-title" style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
          模型设置
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
          外部模型密钥仅保存在本机浏览器 localStorage，经本机后端转发至 Google API，不会写入服务端磁盘。若出现「无法连接 Gemini」或 fetch
          失败，多为本机无法直连 Google。处理方式：① 在启动 API 的终端设置环境变量 `HTTPS_PROXY`（如 Clash 的 `http://127.0.0.1:7890`）后重启服务；② 或在下方填写可访问的「API 根地址」；③ 服务端已默认「DNS 优先 IPv4」与更长连接超时，仍超时可将 `GEMINI_CONNECT_TIMEOUT_MS` 调大。
        </p>
        <LlmSettingsForm apiBase={apiBase} mode={mode} gemini={gemini} onSave={onSave} onCancel={onClose} />
      </div>
    </div>
  );
}

type FormProps = {
  apiBase: string;
  mode: LlmRuntimeMode;
  gemini: GeminiUserSettings;
  onSave: (next: { mode: LlmRuntimeMode; gemini: GeminiUserSettings }) => void;
  onCancel: () => void;
};

function LlmSettingsForm({ apiBase, mode, gemini, onSave, onCancel }: FormProps) {
  const [apiKey, setApiKey] = useState(gemini.apiKey);
  const [model, setModel] = useState(gemini.model || DEFAULT_GEMINI_MODEL);
  const [baseUrl, setBaseUrl] = useState(gemini.baseUrl);
  const [error, setError] = useState('');
  const { state: testState, runTest, clear: clearTest } = useGeminiConnectionTest(apiBase);

  useEffect(() => {
    setApiKey(gemini.apiKey);
    setModel(gemini.model || DEFAULT_GEMINI_MODEL);
    setBaseUrl(gemini.baseUrl);
    setError('');
    clearTest();
  }, [gemini.apiKey, gemini.baseUrl, gemini.model, mode, clearTest]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'external' && !apiKey.trim()) {
      setError('使用外部模型时请填写 Gemini API Key');
      return;
    }
    setError('');
    onSave({ mode, gemini: { apiKey: apiKey.trim(), model: model.trim() || DEFAULT_GEMINI_MODEL, baseUrl: baseUrl.trim() } });
  };

  return (
    <form onSubmit={handleSubmit}>
      {mode === 'external' ? (
        <>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Gemini API Key</label>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(ev) => setApiKey(ev.target.value)}
            placeholder="AIza…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 12,
              padding: '10px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 13,
            }}
          />
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>模型 ID</label>
          <input
            type="text"
            value={model}
            onChange={(ev) => setModel(ev.target.value)}
            placeholder={DEFAULT_GEMINI_MODEL}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 12,
              padding: '10px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 13,
            }}
          />
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            API 根地址（可选，留空为 Google 官方）
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(ev) => setBaseUrl(ev.target.value)}
            placeholder="https://generativelanguage.googleapis.com"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 12,
              padding: '10px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 13,
            }}
          />
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => {
                setError('');
                void runTest({
                  apiKey: apiKey.trim() || undefined,
                  model: model.trim() || DEFAULT_GEMINI_MODEL,
                  baseUrl: baseUrl.trim() || undefined,
                });
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid #64748b',
                background: '#334155',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {testState.phase === 'loading' ? '测试中…' : '连接测试'}
            </button>
            {testState.phase === 'success' ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#86efac', lineHeight: 1.5 }}>{testState.message}</div>
            ) : null}
            {testState.phase === 'error' ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>{testState.message}</div>
            ) : null}
          </div>
        </>
      ) : (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#cbd5e1' }}>当前为本地模式：使用本机 Ollama，具体模型在聊天区下拉切换。</p>
      )}
      {error ? (
        <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 10 }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: '1px solid #475569',
            background: '#0f172a',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          取消
        </button>
        <button
          type="submit"
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: '1px solid #2563eb',
            background: '#1d4ed8',
            color: '#f8fafc',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          保存
        </button>
      </div>
    </form>
  );
}
