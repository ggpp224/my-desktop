/* AI 生成 By Peng.Guo */
import { useState, useEffect } from 'react';
import { ChatPanel } from './ChatPanel';
import { WorkflowPanel } from './WorkflowPanel';
import { ToolPanel } from './ToolPanel';
import { LogsPanel } from './LogsPanel';

const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

declare global {
  interface Window {
    electronAPI?: { getApiBase: () => Promise<string> };
  }
}

export default function App() {
  const [apiBase, setApiBase] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.electronAPI ? null : DEFAULT_API_BASE
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const addLog = (line: string) => setLogs((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} ${line}`]);

  useEffect(() => {
    if (apiBase === null && window.electronAPI) {
      window.electronAPI.getApiBase().then(setApiBase);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/health`)
      .then((r) => r.json())
      .then((d) => setOllamaOk(d.ok))
      .catch(() => setOllamaOk(false));
  }, [apiBase]);

  if (apiBase === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#16213e', color: '#94a3b8' }}>
        加载中…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #333', background: '#16213e' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>AI Dev Control Center</h1>
        {ollamaOk === false && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f59e0b' }}>
            请先安装并启动 Ollama，并拉取模型（如 ollama pull qwen2.5）。<a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>文档</a>
          </p>
        )}
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 280, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <WorkflowPanel apiBase={apiBase} addLog={addLog} />
          <ToolPanel />
        </aside>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <ChatPanel apiBase={apiBase} addLog={addLog} />
          <LogsPanel logs={logs} />
        </main>
      </div>
    </div>
  );
}
