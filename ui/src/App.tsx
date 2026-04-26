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

const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const MY_WORK_SESSION_STORAGE_KEY = 'ai-dev-control-center:my-work-session-id';
type HeaderTab = { key: string; label: string; docPath?: string };
const HEADER_TABS: HeaderTab[] = [
  { key: 'workspace', label: 'AI Dev Control Center' },
];

/** 帮助弹层：可用指令及说明（与 docs/可用指令.md 一致） */
type HelpItem = { section?: string; command: string; description: string };
const HELP_COMMANDS: HelpItem[] = [
  { section: '工作流', command: '开始工作', description: '执行完整开发环境启动（cpxy、react18、cc-web、biz-solution、uikit、shared、docker）' },
  { section: '工作流', command: '升级集测react18的nova版本', description: '执行 react18 的 nova 升级流程：自动切 sprint、改 package.json、提交并 push，再切回原分支' },
  { section: '工作流', command: '升级集测cc-web的nova版本', description: '执行 cc-web2 的 nova 升级流程：自动切 sprint、改 package.json、提交并 push，再切回原分支' },
  { section: '工作流', command: '启动 cpxy', description: '单独在终端启动 cpxy' },
  { section: '工作流', command: '启动 react18 / 启动 cc-web / 启动 biz-solution / 启动 uikit / 启动 shared', description: '单独在终端启动对应项目（start-work 单步）' },
  { section: '工作流', command: '启动 scm', description: '单独在终端启动 scm（可用 standalone 工作流）' },
  {
    section: '终端',
    command: '终端打开 react18 / 终端打开 cc-web2 / 终端打开 nova',
    description: '在「我的工作」内嵌终端中新建页签，初始目录为该项目在 config/projects 与 .env 中配置的路径（代号同部署与 IDE 打开）',
  },
  { section: '浏览器 / Wiki', command: '打开 Jenkins', description: '在浏览器中打开 Jenkins 地址' },
  { section: '浏览器 / Wiki', command: '打开jenkins nova / 打开 Jenkins 的 cc-web', description: '打开该项目对应的 Jenkins 任务页面（代号与部署一致）' },
  { section: '浏览器 / Wiki', command: '周报 / 打开周报 / 打开wiki周报', description: '使用 WIKI_TOKEN 鉴权读取 wiki 目录树，定位“低代码单据前端空间”最新季度下最新周报页并打开（未命中时回退搜索页）' },
  { section: '浏览器 / Wiki', command: '写周报', description: '提取 Jira 标题后由模型按 Markdown 生成；结果含 HTML（富文本粘贴到表格/新版）与 Wiki 纯文本' },
  { section: '部署', command: '部署 nova / 部署 cc-web / 部署 react18 / 部署 base / 部署 base18 等', description: '触发 Jenkins 对应 Job 构建部署；可说「部署 nova 分支是 sprint-260326」指定分支' },
  { section: '合并', command: '合并 nova / 合并 biz-solution / 合并 scm', description: '执行对应仓库合并到测试分支（SSE 流式输出）' },
  { section: 'Jira', command: '我的bug / 查询我的bug', description: '按固定 JQL 查询 Jira Bug 列表，展示关键字、摘要、状态、解决结果、修复版本、经办人' },
  { section: 'Jira', command: '线上bug / 查询线上bug', description: '按固定 JQL 查询 Jira 线上缺陷列表，展示关键字、摘要、状态、解决结果、修复版本、经办人' },
  { section: 'Jira', command: '本周已完成任务 / 查询本周已完成任务', description: '按固定 JQL 查询本周已完成任务（待测试环境验证/已解决/Fixed/Closed），按 updated 倒序返回' },
  { section: 'Cursor', command: 'cursor用量 / 查询cursor用量', description: '调用 Cursor Dashboard 聚合用量 API 获取账号用量数据' },
  { section: 'Cursor', command: 'cursor今日用量 / 查询cursor今日用量', description: '调用 Cursor Dashboard 今日筛选用量 API 获取当天用量数据' },
  { section: 'Cursor', command: '同步cursor登录态', description: '自动读取本机 Chrome 中 cursor.com 登录 Cookie，并注入当前服务内存' },
  { section: 'IDE 打开', command: 'ws打开base / cursor打开scm / 用 WebStorm 打开 nova', description: '用指定应用打开项目目录（ws=WebStorm，cursor=Cursor，code=VS Code）；项目代号与 config/projects 一致' },
  { section: 'IDE 关闭', command: '关闭ws的nova / 关闭cursor的base / 关闭 WebStorm 的 scm', description: '关闭该 IDE 中已打开的项目窗口（WebStorm 走菜单关闭项目，Cursor 走 Cmd+W）' },
  { section: '其他', command: '打开 https://… / 执行 xxx 命令', description: '由 AI Agent 理解并调用工具（如 open_browser、run_shell）' },
  { section: '知识库', command: '添加私人知识库', description: '打开“私人知识库”页签，选择本地目录并将其中 Markdown 文档导入知识库' },
];

/** 代号速查：便于查找指令（与 config/projects 一致） */
const HELP_CODES: { 项目代号: string[]; IDE代号: string[] } = {
  '项目代号': ['cpxy', 'react18', 'cc-web', 'cc-web2', 'biz-solution', 'biz-guide', 'uikit', 'shared', 'scm', 'scm18', 'nova', 'nova-next', 'base', 'base18', 'ai-import', 'uikit-compat', 'cc-node', 'app-service', 'biz-framework', 'front-entity', 'front-pub', 'evoui', 'chanjet-grid', 'nova-form', 'nova-grid', 'nova-server', 'nova-ui', 'chanjet-nova', 'h5-biz-common', 'cc-web-hkj'],
  'IDE代号': ['ws / webstorm → WebStorm', 'cursor → Cursor', 'code / vscode → VS Code'],
};

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
                  <span style={{ color: themeTokens.textPrimary, wordBreak: 'break-all' }}>{HELP_CODES['项目代号'].join('、')}</span>
                </div>
                <div>
                  <span style={{ color: themeTokens.textSecondary }}>IDE 代号：</span>
                  <span style={{ color: themeTokens.textPrimary }}>{HELP_CODES['IDE代号'].join('；')}</span>
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
