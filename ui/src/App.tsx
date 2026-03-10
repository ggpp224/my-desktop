/* AI 生成 By Peng.Guo */
import { useState, useEffect, useRef } from 'react';
import { ChatPanel } from './ChatPanel';
import { WorkflowPanel } from './WorkflowPanel';
import { ToolPanel } from './ToolPanel';
import { LogsPanel } from './LogsPanel';

const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** 帮助弹层：可用指令及作用描述（与 ChatPanel 内指令一致） */
const HELP_COMMANDS: Array<{ command: string; description: string }> = [
  { command: '开始工作', description: '执行完整开发环境启动流程（cpxy、react18、cc-web、biz-solution、uikit、shared、docker）' },
  { command: '打开 Jenkins', description: '在浏览器中打开 Jenkins 地址' },
  { command: '启动 cpxy', description: '单独在终端启动 cpxy' },
  { command: '启动 react18', description: '单独在终端启动 react18 前端项目' },
  { command: '启动 cc-web', description: '单独在终端启动 cc-web 主应用' },
  { command: '启动 biz-solution', description: '单独在终端启动 biz-solution' },
  { command: '启动 uikit', description: '单独在终端启动 uikit 组件库' },
  { command: '启动 shared', description: '单独在终端启动 shared 共享库' },
  { command: '启动 scm', description: '单独在终端启动 saas-cc-web-scm（不参与「开始工作」流程）' },
  { command: '合并 nova', description: '执行 nova 仓库合并流程（目标分支等）' },
  { command: '合并 biz-solution', description: '执行 biz-solution 仓库合并流程' },
  { command: '合并 scm', description: '执行 scm 仓库合并流程' },
  { command: '部署nova、部署cc-web、部署react18、部署biz-solution、部署biz-guide、部署scm', description: '触发 Jenkins 对应 Job 的构建部署，可下拉选择' },
  { command: '其他自然语言', description: '由 AI Agent 理解并调用工具执行（如打开 URL、执行 shell 等）' },
];

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
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const addLog = (line: string) => setLogs((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} ${line}`]);

  useEffect(() => {
    if (!helpOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [helpOpen]);

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
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #333', background: '#16213e', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>AI Dev Control Center</h1>
          {ollamaOk === false && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f59e0b' }}>
              请先安装并启动 Ollama，并拉取模型（如 ollama pull qwen2.5）。<a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>文档</a>
            </p>
          )}
        </div>
        <div ref={helpRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setHelpOpen((v) => !v); }}
            title="帮助：可用指令"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1px solid #475569',
              background: helpOpen ? '#334155' : '#1e293b',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ?
          </button>
          {helpOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                width: 420,
                maxWidth: 'calc(100vw - 32px)',
                maxHeight: '70vh',
                overflow: 'auto',
                background: '#1e293b',
                border: '1px solid #475569',
                borderRadius: 8,
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                padding: 12,
                zIndex: 100,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#e2e8f0' }}>可用指令及说明</div>
              <ul style={{ margin: 0, paddingLeft: 20, listStyle: 'disc', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                {HELP_COMMANDS.map((item, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>
                    <span style={{ color: '#f1f5f9' }}>{item.command}</span>
                    <span style={{ color: '#64748b', marginLeft: 6 }}>— {item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
