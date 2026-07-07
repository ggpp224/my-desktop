/* AI 生成 By Peng.Guo */
import { useEffect, useState, type FormEvent } from 'react';
import type { GeminiUserSettings, LlmRuntimeMode } from '../domain/llm/agentLlmRequest.js';
import { DEFAULT_GEMINI_MODEL } from '../domain/llm/agentLlmRequest.js';
import type { GeminiEnvSettingsSnapshot } from '../infrastructure/llm/geminiSettingsApi.js';
import { useGeminiConnectionTest } from '../viewmodel/llm/useGeminiConnectionTest';
import type { AppThemeTokens } from '../domain/theme/appTheme';
import { Button } from './Button';

export type LlmSettingsModalProps = {
  open: boolean;
  apiBase: string;
  mode: LlmRuntimeMode;
  gemini: GeminiUserSettings;
  envSaved?: GeminiEnvSettingsSnapshot | null;
  themeTokens: AppThemeTokens;
  onClose: () => void;
  onSave: (next: { mode: LlmRuntimeMode; gemini: GeminiUserSettings }) => void | Promise<void>;
};

export function LlmSettingsModal({ open, apiBase, mode, gemini, envSaved, themeTokens, onClose, onSave }: LlmSettingsModalProps) {
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
          background: themeTokens.workspacePanelSubtleBackground,
          border: `1px solid ${themeTokens.inputBorder}`,
          borderRadius: 10,
          padding: 20,
          color: themeTokens.textPrimary,
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="llm-settings-title" style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
          模型设置
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: themeTokens.textSecondary, lineHeight: 1.55 }}>
          外部模型 Key 保存后会写入本机项目根目录 <code style={{ color: themeTokens.textPrimary }}>.env</code>（
          <code style={{ color: themeTokens.textPrimary }}>GEMINI_API_KEY</code>），并同步到浏览器 localStorage；重开设置页会显示「已记住」提示（密码框留空表示沿用已保存 Key）。若无法连接 Gemini，可在启动
          API 的终端设置 <code style={{ color: themeTokens.textPrimary }}>HTTPS_PROXY</code> 后重启，或填写可访问的 API 根地址。
        </p>
        <LlmSettingsForm apiBase={apiBase} mode={mode} gemini={gemini} envSaved={envSaved} themeTokens={themeTokens} onSave={onSave} onCancel={onClose} />
      </div>
    </div>
  );
}

type FormProps = {
  apiBase: string;
  mode: LlmRuntimeMode;
  gemini: GeminiUserSettings;
  envSaved?: GeminiEnvSettingsSnapshot | null;
  themeTokens: AppThemeTokens;
  onSave: (next: { mode: LlmRuntimeMode; gemini: GeminiUserSettings }) => void | Promise<void>;
  onCancel: () => void;
};

function LlmSettingsForm({ apiBase, mode, gemini, envSaved, themeTokens, onSave, onCancel }: FormProps) {
  const [apiKey, setApiKey] = useState(gemini.apiKey);
  const [model, setModel] = useState(gemini.model || DEFAULT_GEMINI_MODEL);
  const [baseUrl, setBaseUrl] = useState(gemini.baseUrl);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { state: testState, runTest, clear: clearTest } = useGeminiConnectionTest(apiBase);
  const hasSavedKey = Boolean(envSaved?.hasApiKey || gemini.apiKey.trim());
  const savedKeyHint = envSaved?.hasApiKey
    ? `已记住 Key（末尾 ${envSaved.apiKeySuffix || '****'}）`
    : gemini.apiKey.trim()
      ? '已记住 Key（来自本页缓存）'
      : '';

  useEffect(() => {
    setApiKey(gemini.apiKey);
    setModel(gemini.model || DEFAULT_GEMINI_MODEL);
    setBaseUrl(gemini.baseUrl);
    setError('');
    clearTest();
  }, [gemini.apiKey, gemini.baseUrl, gemini.model, mode, clearTest]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'external' && !apiKey.trim() && !hasSavedKey) {
      setError('使用外部模型时请填写 Gemini API Key');
      return;
    }
    setError('');
    setSaving(true);
    void Promise.resolve(
      onSave({
        mode,
        gemini: {
          apiKey: apiKey.trim() || gemini.apiKey.trim(),
          model: model.trim() || DEFAULT_GEMINI_MODEL,
          baseUrl: baseUrl.trim(),
        },
      })
    ).finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit}>
      {mode === 'external' ? (
        <>
          <label style={{ display: 'block', fontSize: 12, color: themeTokens.textSecondary, marginBottom: 6 }}>Gemini API Key</label>
          {savedKeyHint ? (
            <div style={{ marginBottom: 6, fontSize: 12, color: themeTokens.statusSuccess }}>{savedKeyHint}；留空则沿用已保存</div>
          ) : null}
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(ev) => setApiKey(ev.target.value)}
            placeholder={hasSavedKey ? '留空沿用已保存的 Key' : 'AIza…'}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 12,
              padding: '10px 10px',
              borderRadius: 6,
              border: `1px solid ${themeTokens.inputBorder}`,
              background: themeTokens.inputBackground,
              color: themeTokens.textPrimary,
              fontSize: 13,
            }}
          />
          <label style={{ display: 'block', fontSize: 12, color: themeTokens.textSecondary, marginBottom: 6 }}>模型 ID</label>
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
              border: `1px solid ${themeTokens.inputBorder}`,
              background: themeTokens.inputBackground,
              color: themeTokens.textPrimary,
              fontSize: 13,
            }}
          />
          <label style={{ display: 'block', fontSize: 12, color: themeTokens.textSecondary, marginBottom: 6 }}>
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
              border: `1px solid ${themeTokens.inputBorder}`,
              background: themeTokens.inputBackground,
              color: themeTokens.textPrimary,
              fontSize: 13,
            }}
          />
          <div style={{ marginBottom: 12 }}>
            <Button
              themeTokens={themeTokens}
              onClick={() => {
                setError('');
                void runTest({
                  apiKey: apiKey.trim() || undefined,
                  model: model.trim() || DEFAULT_GEMINI_MODEL,
                  baseUrl: baseUrl.trim() || undefined,
                });
              }}
              variant="soft"
              size="md"
            >
              {testState.phase === 'loading' ? '测试中…' : '连接测试'}
            </Button>
            {testState.phase === 'success' ? (
              <div style={{ marginTop: 8, fontSize: 12, color: themeTokens.statusSuccess, lineHeight: 1.5 }}>{testState.message}</div>
            ) : null}
            {testState.phase === 'error' ? (
              <div style={{ marginTop: 8, fontSize: 12, color: themeTokens.statusError, lineHeight: 1.5 }}>{testState.message}</div>
            ) : null}
          </div>
        </>
      ) : (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: themeTokens.textPrimary }}>当前为本地模式：使用本机 Ollama，具体模型在聊天区下拉切换。</p>
      )}
      {error ? (
        <div style={{ fontSize: 12, color: themeTokens.statusError, marginBottom: 10 }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <Button
          themeTokens={themeTokens}
          type="button"
          onClick={onCancel}
          variant="outline"
          size="md"
        >
          取消
        </Button>
        <Button
          themeTokens={themeTokens}
          type="submit"
          variant="solid"
          size="md"
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}
