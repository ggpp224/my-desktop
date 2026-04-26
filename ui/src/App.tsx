/* AI 生成 By Peng.Guo */
import { useState, useEffect, useRef, useMemo } from 'react';
import { ChatPanel } from './ChatPanel';
import { WorkflowPanel } from './WorkflowPanel';
import { ToolPanel } from './ToolPanel';
import { LogsPanel } from './LogsPanel';
import { MyWorkPanel, type WorkTerminal } from './MyWorkPanel';
import { KnowledgeBasePanel } from './KnowledgeBasePanel';
import { KnowledgeDocPanel } from './KnowledgeDocPanel';
import { LlmSettingsModal } from './view/LlmSettingsModal';
import { HeaderTabNav } from './view/HeaderTabNav';
import { ThemeSwitcher } from './view/ThemeSwitcher';
import { Button } from './view/Button';
import { IconButton } from './view/IconButton';
import { loadLlmSettings, saveLlmSettings } from './infrastructure/llm/llmSettingsRepository';
import { buildAgentChatLlmBody } from './domain/llm/agentLlmRequest';
import type { GeminiUserSettings, LlmRuntimeMode } from './domain/llm/agentLlmRequest';
import { useAppTheme } from './viewmodel/theme/useAppTheme';
import { getHelpCodebook, getHelpCommands } from './infrastructure/help/helpCatalogDataSource';

const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const MY_WORK_SESSION_STORAGE_KEY = 'ai-dev-control-center:my-work-session-id';
type HeaderTab = { key: string; label: string; docPath?: string };
const HEADER_TABS: HeaderTab[] = [
  { key: 'workspace', label: 'AI Dev Control Center' },
];
const HELP_COMMANDS = getHelpCommands();
const HELP_CODES = getHelpCodebook();

declare global {
  interface Window {
    electronAPI?: { getApiBase: () => Promise<string> };
  }
}

export default function App() {
  const { themeId, tokens: themeTokens, switchTheme } = useAppTheme();
  const [apiBase, setApiBase] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.electronAPI ? null : DEFAULT_API_BASE
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llmMode, setLlmMode] = useState<LlmRuntimeMode>(() => loadLlmSettings().mode);
  const [geminiSettings, setGeminiSettings] = useState<GeminiUserSettings>(() => loadLlmSettings().gemini);
  const agentChatLlmBody = useMemo(() => buildAgentChatLlmBody(llmMode, geminiSettings), [llmMode, geminiSettings]);
  const [activeHeaderTab, setActiveHeaderTab] = useState<string>(HEADER_TABS[0].key);
  const [headerTabs, setHeaderTabs] = useState<HeaderTab[]>(HEADER_TABS);
  const [myWorkSessionId, setMyWorkSessionId] = useState('');
  const [myWorkTerminals, setMyWorkTerminals] = useState<WorkTerminal[]>([]);
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightWidth, setRightWidth] = useState(400);
  const [resizing, setResizing] = useState(false);
  const [resumeTick, setResumeTick] = useState(0);
  const helpRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const addLog = (line: string) =>
    setLogs((prev) => [
      ...prev,
      `${new Date()
        .toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${line}`,
    ]);

  useEffect(() => {
    if (!resizing) return;
    const minRight = 200;
    const maxRight = 800;
    const onMove = (e: MouseEvent) => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.right - e.clientX;
      setRightWidth(Math.min(maxRight, Math.max(minRight, w)));
    };
    const onUp = () => setResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing]);

  useEffect(() => {
    if (!helpOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [helpOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [settingsOpen]);

  useEffect(() => {
    const tryResume = () => setResumeTick((prev) => prev + 1);
    window.addEventListener('focus', tryResume);
    document.addEventListener('visibilitychange', tryResume);
    return () => {
      window.removeEventListener('focus', tryResume);
      document.removeEventListener('visibilitychange', tryResume);
    };
  }, []);

  useEffect(() => {
    if (apiBase === null && window.electronAPI) {
      window.electronAPI.getApiBase().then(setApiBase);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/health`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; ollamaReachable?: boolean }) => {
        if (typeof d.ollamaReachable === 'boolean') setOllamaOk(d.ollamaReachable);
        else setOllamaOk(!!d.ok);
      })
      .catch(() => setOllamaOk(false));
  }, [apiBase]);

  if (apiBase === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: themeTokens.headerBackground, color: themeTokens.textSecondary }}>
        加载中…
      </div>
    );
  }

  const onStartWorkEmbedded = (payload: { sessionId: string; terminals: WorkTerminal[] }) => {
    setMyWorkSessionId(payload.sessionId);
    setMyWorkTerminals(payload.terminals);
    localStorage.setItem(MY_WORK_SESSION_STORAGE_KEY, payload.sessionId);
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'my-work')) return prev;
      return [...prev, { key: 'my-work', label: '终端' }];
    });
    setActiveHeaderTab('my-work');
  };

  const openKnowledgeBaseTab = () => {
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'knowledge-base')) return prev;
      return [...prev, { key: 'knowledge-base', label: '私人知识库' }];
    });
    setActiveHeaderTab('knowledge-base');
  };

  const openKnowledgeDocTab = (docPath: string) => {
    const normalized = docPath.trim();
    if (!normalized) return;
    const tabKey = `knowledge-doc:${normalized}`;
    const tabLabel = `文档：${normalized.split('/').filter(Boolean).pop() ?? '详情'}`;
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === tabKey)) return prev;
      return [...prev, { key: tabKey, label: tabLabel, docPath: normalized }];
    });
    setActiveHeaderTab(tabKey);
  };

  const closeHeaderTab = async (tabKey: string) => {
    if (tabKey === 'workspace') return;
    if (tabKey === 'my-work' && myWorkSessionId) {
      try {
        await fetch(`${apiBase}/workflow/sessions/${encodeURIComponent(myWorkSessionId)}`, { method: 'DELETE' });
      } catch {
        // ignore close errors to keep UI responsive
      }
      setMyWorkSessionId('');
      setMyWorkTerminals([]);
      localStorage.removeItem(MY_WORK_SESSION_STORAGE_KEY);
    }
    setHeaderTabs((prev) => prev.filter((tab) => tab.key !== tabKey));
    setActiveHeaderTab((prev) => (prev === tabKey ? 'workspace' : prev));
  };

  useEffect(() => {
    if (!apiBase) return;
    const storedSessionId = localStorage.getItem(MY_WORK_SESSION_STORAGE_KEY)?.trim();
    if (!storedSessionId || storedSessionId === myWorkSessionId) return;
    const restoreMyWorkSession = async () => {
      try {
        const response = await fetch(`${apiBase}/workflow/sessions/${encodeURIComponent(storedSessionId)}`);
        if (!response.ok) {
          localStorage.removeItem(MY_WORK_SESSION_STORAGE_KEY);
          return;
        }
        const payload = (await response.json()) as { success?: boolean; terminals?: WorkTerminal[] };
        if (!payload.success || !Array.isArray(payload.terminals)) {
          localStorage.removeItem(MY_WORK_SESSION_STORAGE_KEY);
          return;
        }
        setMyWorkSessionId(storedSessionId);
        setMyWorkTerminals(payload.terminals);
        setHeaderTabs((prev) => {
          if (prev.some((tab) => tab.key === 'my-work')) return prev;
          return [...prev, { key: 'my-work', label: '终端' }];
        });
      } catch {
        // 保留本地会话标记，下次聚焦窗口时继续尝试恢复。
      }
    };
    void restoreMyWorkSession();
  }, [apiBase, myWorkSessionId, resumeTick]);

  useEffect(() => {
    if (!myWorkSessionId) return;
    localStorage.setItem(MY_WORK_SESSION_STORAGE_KEY, myWorkSessionId);
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'my-work')) return prev;
      return [...prev, { key: 'my-work', label: '终端' }];
    });
  }, [myWorkSessionId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: themeTokens.appBackground }}>
      <header style={{ padding: '12px 16px', borderBottom: `1px solid ${themeTokens.panelBorder}`, background: themeTokens.headerBackground, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HeaderTabNav
            tabs={headerTabs}
            activeTabKey={activeHeaderTab}
            themeTokens={themeTokens}
            onTabClick={setActiveHeaderTab}
            onTabClose={(tabKey) => void closeHeaderTab(tabKey)}
          />
          {llmMode === 'local' && ollamaOk === false && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: themeTokens.statusWarning }}>
              请先安装并启动 Ollama，并拉取模型（如 ollama pull qwen2.5）。<a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: themeTokens.tabActiveBorder }}>文档</a>
            </p>
          )}
          {llmMode === 'external' && !geminiSettings.apiKey.trim() && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: themeTokens.textSecondary }}>
              外部模式：未在界面填写 Key 时，将使用启动 API 进程中的 <code style={{ color: themeTokens.textPrimary }}>GEMINI_API_KEY</code> /{' '}
              <code style={{ color: themeTokens.textPrimary }}>GOOGLE_API_KEY</code>（与 A2UI 相同，可在 shell 中 export）。
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
          <ThemeSwitcher
            value={themeId}
            tokens={themeTokens}
            onChange={switchTheme}
          />
          <div
            role="group"
            aria-label="本地或外部模型"
            style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${themeTokens.tabInactiveBorder}`, background: themeTokens.tabInactiveBackground }}
          >
            <Button
              themeTokens={themeTokens}
              onClick={() => {
                const next: LlmRuntimeMode = 'local';
                setLlmMode(next);
                saveLlmSettings({ mode: next, gemini: geminiSettings });
              }}
              variant={llmMode === 'local' ? 'solid' : 'ghost'}
              size="sm"
              style={{ border: 'none', borderRadius: 0 }}
            >
              本地
            </Button>
            <Button
              themeTokens={themeTokens}
              onClick={() => {
                const next: LlmRuntimeMode = 'external';
                setLlmMode(next);
                saveLlmSettings({ mode: next, gemini: geminiSettings });
              }}
              variant={llmMode === 'external' ? 'solid' : 'ghost'}
              size="sm"
              style={{ border: 'none', borderLeft: `1px solid ${themeTokens.tabInactiveBorder}`, borderRadius: 0 }}
            >
              外部
            </Button>
          </div>
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <IconButton
              themeTokens={themeTokens}
              icon="⚙"
              onClick={(e) => {
                e.stopPropagation();
                setSettingsOpen((v) => !v);
                setHelpOpen(false);
              }}
              title="设置：外部模型（Gemini）"
              variant={settingsOpen ? 'solid' : 'soft'}
              size="icon"
              style={{ borderRadius: '50%' }}
            />
            {settingsOpen && (
              <LlmSettingsModal
                open
                apiBase={apiBase}
                mode={llmMode}
                gemini={geminiSettings}
                themeTokens={themeTokens}
                onClose={() => setSettingsOpen(false)}
                onSave={(next) => {
                  setGeminiSettings(next.gemini);
                  setLlmMode(next.mode);
                  saveLlmSettings({ mode: next.mode, gemini: next.gemini });
                  setSettingsOpen(false);
                }}
              />
            )}
          </div>
          <div ref={helpRef} style={{ position: 'relative' }}>
          <IconButton
            themeTokens={themeTokens}
            icon="?"
            onClick={(e) => { e.stopPropagation(); setHelpOpen((v) => !v); setSettingsOpen(false); }}
            title="帮助：可用指令"
            variant={helpOpen ? 'solid' : 'soft'}
            size="icon"
            style={{ borderRadius: '50%' }}
          />
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
                background: themeTokens.tabInactiveBackground,
                border: `1px solid ${themeTokens.tabInactiveBorder}`,
                borderRadius: 8,
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                padding: 12,
                zIndex: 100,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: themeTokens.textPrimary }}>可用指令及说明</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: themeTokens.textSecondary, lineHeight: 1.6 }}>
                {HELP_COMMANDS.flatMap((item, i) => {
                  const showSection = item.section && (i === 0 || HELP_COMMANDS[i - 1].section !== item.section);
                  return [
                    ...(showSection ? [<li key={`${i}-sec`} style={{ listStyle: 'none', marginLeft: -20, marginTop: i === 0 ? 0 : 10, marginBottom: 2, fontWeight: 600, color: themeTokens.textSecondary }}>{item.section}</li>] : []),
                    <li key={i} style={{ marginBottom: 8, listStyle: 'disc' }}>
                      <span style={{ color: themeTokens.textPrimary }}>{item.command}</span>
                      <span style={{ color: themeTokens.textSecondary, marginLeft: 6 }}>— {item.description}</span>
                    </li>,
                  ];
                })}
              </ul>
              <div style={{ fontSize: 12, marginTop: 14, paddingTop: 10, borderTop: `1px solid ${themeTokens.tabInactiveBorder}` }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: themeTokens.textPrimary }}>代号速查（便于查找指令）</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: themeTokens.textSecondary }}>项目代号：</span>
                  <span style={{ color: themeTokens.textPrimary, wordBreak: 'break-all' }}>{HELP_CODES.projectCodes.join('、')}</span>
                </div>
                <div>
                  <span style={{ color: themeTokens.textSecondary }}>IDE 代号：</span>
                  <span style={{ color: themeTokens.textPrimary }}>{HELP_CODES.ideAliases.join('；')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </header>
      <div ref={contentRef} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: leftCollapsed ? 40 : 250,
            flexShrink: 0,
            borderRight: `1px solid ${themeTokens.panelBorder}`,
            display: 'flex',
            flexDirection: 'column',
            background: themeTokens.sidebarBackground,
            overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}
        >
          <IconButton
            themeTokens={themeTokens}
            icon={leftCollapsed ? '▶' : '◀'}
            onClick={() => setLeftCollapsed((c) => !c)}
            title={leftCollapsed ? '展开左侧' : '收起左侧'}
            variant="soft"
            size="md"
            fullWidth
            style={{
              flexShrink: 0,
              border: 'none',
              borderBottom: `1px solid ${themeTokens.panelBorder}`,
              borderRadius: 0,
              background: themeTokens.sidebarToggleBackground,
              justifyContent: 'center',
            }}
          />
          {!leftCollapsed && (
            <>
              <WorkflowPanel apiBase={apiBase} addLog={addLog} onStartWorkEmbedded={onStartWorkEmbedded} themeTokens={themeTokens} />
              <ToolPanel themeTokens={themeTokens} />
            </>
          )}
        </aside>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${themeTokens.panelBorder}` }}>
          {activeHeaderTab === 'knowledge-base' ? (
            <KnowledgeBasePanel apiBase={apiBase} addLog={addLog} themeTokens={themeTokens} />
          ) : activeHeaderTab.startsWith('knowledge-doc:') ? (
            <KnowledgeDocPanel
              apiBase={apiBase}
              sourcePath={headerTabs.find((tab) => tab.key === activeHeaderTab)?.docPath ?? ''}
              themeTokens={themeTokens}
              onOpenKnowledgeDoc={openKnowledgeDocTab}
            />
          ) : activeHeaderTab === 'my-work' && myWorkSessionId ? (
            <MyWorkPanel apiBase={apiBase} sessionId={myWorkSessionId} initialTerminals={myWorkTerminals} themeTokens={themeTokens} />
          ) : (
            <ChatPanel
              apiBase={apiBase}
              addLog={addLog}
              onStartWorkEmbedded={onStartWorkEmbedded}
              onOpenKnowledgeBase={openKnowledgeBaseTab}
              onOpenKnowledgeDoc={openKnowledgeDocTab}
              llmRuntimeMode={llmMode}
              agentChatLlmBody={agentChatLlmBody}
              themeTokens={themeTokens}
            />
          )}
        </main>
        <div
          role="separator"
          aria-label="调节中间与右侧宽度"
          onMouseDown={() => setResizing(true)}
          style={{
            width: 6,
            flexShrink: 0,
            cursor: 'col-resize',
            background: resizing ? themeTokens.tabActiveBorder : themeTokens.inputBorder,
          }}
        />
        <LogsPanel logs={logs} width={rightWidth} onClear={() => setLogs([])} themeTokens={themeTokens} />
      </div>
    </div>
  );
}
