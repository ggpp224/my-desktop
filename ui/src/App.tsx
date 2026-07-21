/* AI 生成 By Peng.Guo */
import { lazy, Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { ChatPanel } from './ChatPanel';
import { WorkflowPanel } from './WorkflowPanel';
import { ToolPanel } from './ToolPanel';
import { LogsPanel } from './LogsPanel';
import type { WorkTerminal } from './MyWorkPanel';

const MyWorkPanel = lazy(() => import('./MyWorkPanel').then((m) => ({ default: m.MyWorkPanel })));
import { KnowledgeBasePanel } from './KnowledgeBasePanel';
import { CommandStatsPanel } from './CommandStatsPanel';
import { CommandCapabilityPanel } from './CommandCapabilityPanel';
import { KnowledgeDocPanel } from './KnowledgeDocPanel';
import { MdToPdfPanel } from './MdToPdfPanel';
import { VideoGeneratorPanel } from './VideoGeneratorPanel';
import { TechDigestPanel } from './TechDigestPanel';
import { LlmSettingsModal } from './view/LlmSettingsModal';
import { HeaderTabNav } from './view/HeaderTabNav';
import { ThemeSwitcher } from './view/ThemeSwitcher';
import { Button } from './view/Button';
import { IconButton } from './view/IconButton';
import { loadLlmSettings, saveLlmSettings } from './infrastructure/llm/llmSettingsRepository';
import { fetchGeminiEnvSettings, saveGeminiEnvSettings, type GeminiEnvSettingsSnapshot } from './infrastructure/llm/geminiSettingsApi';
import { buildAgentChatLlmBody, DEFAULT_GEMINI_MODEL } from './domain/llm/agentLlmRequest';
import type { GeminiUserSettings, LlmRuntimeMode } from './domain/llm/agentLlmRequest';
import { useAppTheme } from './viewmodel/theme/useAppTheme';
import { getHelpCodebook, getHelpCommands } from './infrastructure/help/helpCatalogDataSource';

const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:41738';
const MY_WORK_SESSION_STORAGE_KEY = 'ai-dev-control-center:my-work-session-id';
type HeaderTab = { key: string; label: string; docPath?: string };
const HEADER_TABS: HeaderTab[] = [
  { key: 'workspace', label: 'AI Dev Control Center' },
  { key: 'tech-digest', label: '技术趋势' },
];
const HELP_COMMANDS = getHelpCommands();
const HELP_CODES = getHelpCodebook();

declare global {
  interface Window {
    electronAPI?: {
      getApiBase: () => Promise<string>;
      onApiPortChanged?: (handler: (apiBase: string) => void) => () => void;
      onApiChildExited?: (handler: () => void) => () => void;
      pickMdFile?: () => Promise<{ canceled: boolean; filePath?: string }>;
      generateMdPdf?: (mdFilePath: string) => Promise<{
        success: boolean;
        mdPath?: string;
        pdfPath?: string;
        error?: string;
      }>;
    };
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
  const [geminiEnvSaved, setGeminiEnvSaved] = useState<GeminiEnvSettingsSnapshot | null>(null);
  const agentChatLlmBody = useMemo(() => buildAgentChatLlmBody(llmMode, geminiSettings), [llmMode, geminiSettings]);
  const [activeHeaderTab, setActiveHeaderTab] = useState<string>(HEADER_TABS[0].key);
  const [headerTabs, setHeaderTabs] = useState<HeaderTab[]>(HEADER_TABS);
  const [myWorkSessionId, setMyWorkSessionId] = useState('');
  const [myWorkTerminals, setMyWorkTerminals] = useState<WorkTerminal[]>([]);
  const [myWorkInvalidHint, setMyWorkInvalidHint] = useState('');
  const [apiServerOk, setApiServerOk] = useState(true);
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
    if (!apiBase) return;
    void fetchGeminiEnvSettings(apiBase)
      .then(setGeminiEnvSaved)
      .catch(() => setGeminiEnvSaved(null));
  }, [apiBase]);

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
    const unsub = window.electronAPI?.onApiPortChanged?.((base) => {
      setApiBase(base);
      setApiServerOk(true);
    });
    return () => unsub?.();
  }, []);

  const clearMyWorkSession = (hint: string) => {
    setMyWorkSessionId('');
    setMyWorkTerminals([]);
    localStorage.removeItem(MY_WORK_SESSION_STORAGE_KEY);
    if (hint) {
      setMyWorkInvalidHint(hint);
      addLog(hint);
    }
  };

  useEffect(() => {
    const unsub = window.electronAPI?.onApiChildExited?.(() => {
      setApiServerOk(false);
      const hint =
        '后端 API 子进程已退出（见终端 [api-server] exited）。请 Cmd+Q 完全退出应用后重新 yarn dev，再点「开始工作」。';
      if (myWorkSessionId) clearMyWorkSession(hint);
      else {
        setMyWorkInvalidHint(hint);
        addLog(hint);
      }
    });
    return () => unsub?.();
  }, [myWorkSessionId]);

  useEffect(() => {
    if (!apiBase) return;
    let cancelled = false;
    let ollamaTick = 0;
    /** 瞬态探活失败（休眠唤醒等）不清会话，仅提示等待重连 */
    const apiTransientDownHint = () =>
      `后端 API（${apiBase}）暂时无响应（常见于休眠唤醒）。已保留「开始工作」会话，等待自动重连…`;

    let healthFailStreak = 0;
    const pollHealth = async () => {
      try {
        const r = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(4000) });
        if (!r.ok) throw new Error(`health ${r.status}`);
        if (cancelled) return;
        const wasDown = healthFailStreak > 0;
        healthFailStreak = 0;
        setApiServerOk(true);
        if (wasDown) setMyWorkInvalidHint('');
        ollamaTick += 1;
        if (ollamaTick % 3 === 0) {
          fetch(`${apiBase}/health/ollama`)
            .then((or) => or.json())
            .then((d: { ollamaReachable?: boolean }) => {
              if (!cancelled && typeof d.ollamaReachable === 'boolean') setOllamaOk(d.ollamaReachable);
            })
            .catch(() => {
              if (!cancelled) setOllamaOk(false);
            });
        }
      } catch {
        if (cancelled) return;
        healthFailStreak += 1;
        setApiServerOk(false);
        setOllamaOk(false);
        if (healthFailStreak < 3) return;
        setMyWorkInvalidHint(apiTransientDownHint());
      }
    };
    void pollHealth();
    const timer = window.setInterval(() => void pollHealth(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase || !apiServerOk) return;
    const storedSessionId = localStorage.getItem(MY_WORK_SESSION_STORAGE_KEY)?.trim();
    if (!storedSessionId) return;
    // 内存中已有同一会话时，终端由 MyWorkPanel 轮询同步；此处只做冷恢复
    if (storedSessionId === myWorkSessionId) return;
    const restoreMyWorkSession = async () => {
      try {
        const response = await fetch(`${apiBase}/workflow/sessions/${encodeURIComponent(storedSessionId)}`);
        if (!response.ok) {
          // 仅在 API 明确表示会话不存在时清理；5xx/瞬态错误保留指针以便重试
          if (response.status === 404) {
            clearMyWorkSession('内嵌工作流会话已过期（后端已无此会话），请重新「开始工作」。');
          }
          return;
        }
        const payload = (await response.json()) as { success?: boolean; terminals?: WorkTerminal[] };
        if (!payload.success || !Array.isArray(payload.terminals)) {
          clearMyWorkSession('内嵌终端会话已过期，请重新「开始工作」。');
          return;
        }
        setMyWorkInvalidHint('');
        setMyWorkSessionId(storedSessionId);
        setMyWorkTerminals(payload.terminals);
        setHeaderTabs((prev) => {
          if (prev.some((tab) => tab.key === 'my-work')) return prev;
          return [...prev, { key: 'my-work', label: '终端' }];
        });
      } catch {
        // 网络抖动时保留本地会话标记，下次聚焦或探活恢复后继续尝试。
      }
    };
    void restoreMyWorkSession();
  }, [apiBase, apiServerOk, myWorkSessionId, resumeTick]);

  useEffect(() => {
    if (!myWorkSessionId) return;
    localStorage.setItem(MY_WORK_SESSION_STORAGE_KEY, myWorkSessionId);
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'my-work')) return prev;
      return [...prev, { key: 'my-work', label: '终端' }];
    });
  }, [myWorkSessionId]);

  if (apiBase === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: themeTokens.headerBackground, color: themeTokens.textSecondary }}>
        加载中…
      </div>
    );
  }

  const onStartWorkEmbedded = (payload: { sessionId: string; terminals: WorkTerminal[] }) => {
    setMyWorkInvalidHint('');
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

  const openCommandStatsTab = () => {
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'command-stats')) return prev;
      return [...prev, { key: 'command-stats', label: '指令统计' }];
    });
    setActiveHeaderTab('command-stats');
  };

  const openMdToPdfTab = () => {
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'md-to-pdf')) return prev;
      return [...prev, { key: 'md-to-pdf', label: 'MD 生成 PDF' }];
    });
    setActiveHeaderTab('md-to-pdf');
  };

  const openVideoGeneratorTab = () => {
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'video-generator')) return prev;
      return [...prev, { key: 'video-generator', label: 'AI 视频生成' }];
    });
    setActiveHeaderTab('video-generator');
  };

  const openCommandCapabilityTab = () => {
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'command-capability')) return prev;
      return [...prev, { key: 'command-capability', label: '支持指令明细' }];
    });
    setActiveHeaderTab('command-capability');
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
    if (tabKey === 'workspace' || tabKey === 'tech-digest') return;
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
          {!apiServerOk && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: themeTokens.statusWarning }}>
              后端 API 暂时不可用（{apiBase}）。若刚从休眠唤醒，请稍等自动重连；若持续失败，请查看终端 [api-server] exited 后 Cmd+Q 退出并重新 yarn dev。
            </p>
          )}
          {llmMode === 'local' && ollamaOk === false && apiServerOk && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: themeTokens.statusWarning }}>
              请先安装并启动 Ollama，并拉取模型（如 ollama pull qwen2.5）。<a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: themeTokens.tabActiveBorder }}>文档</a>
            </p>
          )}
          {llmMode === 'external' && !geminiSettings.apiKey.trim() && !geminiEnvSaved?.hasApiKey && (
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
                const persisted = loadLlmSettings();
                setGeminiSettings(persisted.gemini);
                setLlmMode(persisted.mode);
                if (apiBase) {
                  void fetchGeminiEnvSettings(apiBase)
                    .then((snapshot) => {
                      setGeminiEnvSaved(snapshot);
                      if (snapshot.model) {
                        setGeminiSettings((prev) => ({ ...prev, model: snapshot.model }));
                      }
                    })
                    .catch(() => setGeminiEnvSaved(null));
                }
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
                envSaved={geminiEnvSaved}
                themeTokens={themeTokens}
                onClose={() => setSettingsOpen(false)}
                onSave={async (next) => {
                  if (apiBase && next.mode === 'external') {
                    await saveGeminiEnvSettings(apiBase, {
                      ...(next.gemini.apiKey.trim() ? { apiKey: next.gemini.apiKey.trim() } : {}),
                      model: next.gemini.model.trim() || DEFAULT_GEMINI_MODEL,
                    });
                    const snapshot = await fetchGeminiEnvSettings(apiBase);
                    setGeminiEnvSaved(snapshot);
                  }
                  const gemini = {
                    ...next.gemini,
                    apiKey: next.gemini.apiKey.trim() || geminiSettings.apiKey.trim(),
                  };
                  setGeminiSettings(gemini);
                  setLlmMode(next.mode);
                  saveLlmSettings({ mode: next.mode, gemini });
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
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: themeTokens.textSecondary }}>IDE 代号：</span>
                  <span style={{ color: themeTokens.textPrimary }}>{HELP_CODES.ideAliases.join('；')}</span>
                </div>
                {HELP_CODES.projectDevCmdOverrides && HELP_CODES.projectDevCmdOverrides.length > 0 && (
                  <div>
                    <span style={{ color: themeTokens.textSecondary }}>启动命令：</span>
                    <span style={{ color: themeTokens.textPrimary }}>
                      默认 yarn dev；
                      {HELP_CODES.projectDevCmdOverrides.map((o) => `${o.codes.join('、')} → ${o.cmd}`).join('；')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      </header>
      <div ref={contentRef} style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
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
              <WorkflowPanel
                apiBase={apiBase}
                addLog={addLog}
                onStartWorkEmbedded={onStartWorkEmbedded}
                onOpenCommandCapability={openCommandCapabilityTab}
                themeTokens={themeTokens}
              />
              <ToolPanel themeTokens={themeTokens} onOpenVideoGenerator={openVideoGeneratorTab} />
            </>
          )}
        </aside>
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            borderRight: `1px solid ${themeTokens.panelBorder}`,
            position: 'relative',
          }}
        >
          {/* AI 生成 By Peng.Guo：ChatPanel 常驻挂载，避免切换「终端」等页签后聊天状态被重置 */}
          <div
            style={{
              display: activeHeaderTab === 'workspace' ? 'flex' : 'none',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <ChatPanel
              apiBase={apiBase}
              addLog={addLog}
              onStartWorkEmbedded={onStartWorkEmbedded}
              onOpenKnowledgeBase={openKnowledgeBaseTab}
              onOpenCommandStats={openCommandStatsTab}
              onOpenMdToPdf={openMdToPdfTab}
              onOpenKnowledgeDoc={openKnowledgeDocTab}
              llmRuntimeMode={llmMode}
              agentChatLlmBody={agentChatLlmBody}
              themeTokens={themeTokens}
            />
          </div>
          {activeHeaderTab === 'knowledge-base' && (
            <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
              <KnowledgeBasePanel apiBase={apiBase} addLog={addLog} themeTokens={themeTokens} />
            </div>
          )}
          {activeHeaderTab === 'command-stats' && (
            <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
              <CommandStatsPanel apiBase={apiBase} themeTokens={themeTokens} />
            </div>
          )}
          {activeHeaderTab === 'md-to-pdf' && (
            <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
              <MdToPdfPanel addLog={addLog} themeTokens={themeTokens} />
            </div>
          )}
          {activeHeaderTab === 'video-generator' && (
            <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
              <VideoGeneratorPanel apiBase={apiBase} addLog={addLog} themeTokens={themeTokens} />
            </div>
          )}
          {activeHeaderTab === 'command-capability' && (
            <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
              <CommandCapabilityPanel apiBase={apiBase} themeTokens={themeTokens} />
            </div>
          )}
          {activeHeaderTab.startsWith('knowledge-doc:') && (
            <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
              <KnowledgeDocPanel
                apiBase={apiBase}
                sourcePath={headerTabs.find((tab) => tab.key === activeHeaderTab)?.docPath ?? ''}
                themeTokens={themeTokens}
                onOpenKnowledgeDoc={openKnowledgeDocTab}
              />
            </div>
          )}
          {/* AI 生成 By Peng.Guo：技术趋势常驻挂载，切换页签不销毁内容、不中断刷新 SSE */}
          <div
            style={{
              display: activeHeaderTab === 'tech-digest' ? 'flex' : 'none',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <TechDigestPanel
              apiBase={apiBase ?? DEFAULT_API_BASE}
              themeTokens={themeTokens}
              agentChatLlmBody={agentChatLlmBody}
              addLog={addLog}
            />
          </div>
          {activeHeaderTab === 'my-work' && (
            <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {myWorkSessionId ? (
                <>
                  {!apiServerOk && (
                    <div
                      style={{
                        flexShrink: 0,
                        padding: '8px 16px',
                        fontSize: 12,
                        color: themeTokens.statusWarning,
                        background: themeTokens.headerBackground,
                        borderBottom: `1px solid ${themeTokens.panelBorder}`,
                        lineHeight: 1.5,
                      }}
                    >
                      {myWorkInvalidHint ||
                        '后端 API 暂时不可用（常见于休眠唤醒），已暂停终端轮询并保留会话，等待自动重连…'}
                    </div>
                  )}
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
                    <Suspense
                      fallback={
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: themeTokens.textSecondary }}>
                          终端加载中…
                        </div>
                      }
                    >
                      <MyWorkPanel
                        apiBase={apiBase}
                        apiServerOk={apiServerOk}
                        sessionId={myWorkSessionId}
                        initialTerminals={myWorkTerminals}
                        themeTokens={themeTokens}
                      />
                    </Suspense>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                    color: themeTokens.textSecondary,
                    fontSize: 14,
                    textAlign: 'center',
                    lineHeight: 1.6,
                  }}
                >
                  {myWorkInvalidHint || '请在工作区点击「开始工作」以打开内嵌终端。'}
                </div>
              )}
            </div>
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
