/* AI 生成 By Peng.Guo */
import { useState, useEffect, useRef } from 'react';
import { ChatPanel } from './ChatPanel';
import { WorkflowPanel } from './WorkflowPanel';
import { ToolPanel } from './ToolPanel';
import { LogsPanel } from './LogsPanel';
import { MyWorkPanel, type WorkTerminal } from './MyWorkPanel';

const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
type HeaderTab = { key: string; label: string };
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
  { section: '浏览器 / Wiki', command: '写周报', description: '提取“本周已完成任务”的 Jira 号和标题，大模型按 Markdown 生成周报，结果自动转为 Confluence Wiki 供粘贴' },
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
  const [apiBase, setApiBase] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.electronAPI ? null : DEFAULT_API_BASE
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeHeaderTab, setActiveHeaderTab] = useState<string>(HEADER_TABS[0].key);
  const [headerTabs, setHeaderTabs] = useState<HeaderTab[]>(HEADER_TABS);
  const [hoveredHeaderTab, setHoveredHeaderTab] = useState<string | null>(null);
  const [myWorkSessionId, setMyWorkSessionId] = useState('');
  const [myWorkTerminals, setMyWorkTerminals] = useState<WorkTerminal[]>([]);
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightWidth, setRightWidth] = useState(400);
  const [resizing, setResizing] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
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

  const onStartWorkEmbedded = (payload: { sessionId: string; terminals: WorkTerminal[] }) => {
    setMyWorkSessionId(payload.sessionId);
    setMyWorkTerminals(payload.terminals);
    setHeaderTabs((prev) => {
      if (prev.some((tab) => tab.key === 'my-work')) return prev;
      return [...prev, { key: 'my-work', label: '终端' }];
    });
    setActiveHeaderTab('my-work');
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
    }
    setHeaderTabs((prev) => prev.filter((tab) => tab.key !== tabKey));
    setActiveHeaderTab((prev) => (prev === tabKey ? 'workspace' : prev));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #333', background: '#16213e', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <nav aria-label="头部功能页签" style={{ display: 'flex', gap: 6 }}>
            {headerTabs.map((tab) => {
              const isActive = activeHeaderTab === tab.key;
              const closable = tab.key !== 'workspace';
              return (
                <div
                  key={tab.key}
                  onMouseEnter={() => setHoveredHeaderTab(tab.key)}
                  onMouseLeave={() => setHoveredHeaderTab((prev) => (prev === tab.key ? null : prev))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: `1px solid ${isActive ? '#4f83ff' : '#334155'}`,
                    background: isActive ? '#1d4ed8' : '#0f172a',
                    color: '#e2e8f0',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveHeaderTab(tab.key)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit',
                      fontWeight: 600,
                      minWidth: 72,
                      textAlign: 'center',
                    }}
                  >
                    {tab.label}
                  </button>
                  {closable && (
                    <button
                      type="button"
                      onClick={() => void closeHeaderTab(tab.key)}
                      title={`关闭 ${tab.label}`}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        color: '#cbd5e1',
                        cursor: hoveredHeaderTab === tab.key ? 'pointer' : 'default',
                        width: 16,
                        height: 16,
                        lineHeight: '16px',
                        textAlign: 'center',
                        padding: 0,
                        opacity: hoveredHeaderTab === tab.key ? 1 : 0,
                        pointerEvents: hoveredHeaderTab === tab.key ? 'auto' : 'none',
                        transition: 'opacity 0.12s ease',
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </nav>
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
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                {HELP_COMMANDS.flatMap((item, i) => {
                  const showSection = item.section && (i === 0 || HELP_COMMANDS[i - 1].section !== item.section);
                  return [
                    ...(showSection ? [<li key={`${i}-sec`} style={{ listStyle: 'none', marginLeft: -20, marginTop: i === 0 ? 0 : 10, marginBottom: 2, fontWeight: 600, color: '#94a3b8' }}>{item.section}</li>] : []),
                    <li key={i} style={{ marginBottom: 8, listStyle: 'disc' }}>
                      <span style={{ color: '#f1f5f9' }}>{item.command}</span>
                      <span style={{ color: '#64748b', marginLeft: 6 }}>— {item.description}</span>
                    </li>,
                  ];
                })}
              </ul>
              <div style={{ fontSize: 12, marginTop: 14, paddingTop: 10, borderTop: '1px solid #475569' }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#e2e8f0' }}>代号速查（便于查找指令）</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#94a3b8' }}>项目代号：</span>
                  <span style={{ color: '#cbd5e1', wordBreak: 'break-all' }}>{HELP_CODES['项目代号'].join('、')}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>IDE 代号：</span>
                  <span style={{ color: '#cbd5e1' }}>{HELP_CODES['IDE代号'].join('；')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
      <div ref={contentRef} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: leftCollapsed ? 40 : 250,
            flexShrink: 0,
            borderRight: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            background: '#16213e',
            overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}
        >
          <button
            type="button"
            onClick={() => setLeftCollapsed((c) => !c)}
            title={leftCollapsed ? '展开左侧' : '收起左侧'}
            style={{
              flexShrink: 0,
              width: '100%',
              padding: '10px 0',
              border: 'none',
              borderBottom: '1px solid #333',
              background: '#0f3460',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {leftCollapsed ? '▶' : '◀'}
          </button>
          {!leftCollapsed && (
            <>
              <WorkflowPanel apiBase={apiBase} addLog={addLog} onStartWorkEmbedded={onStartWorkEmbedded} />
              <ToolPanel />
            </>
          )}
        </aside>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid #333' }}>
          {activeHeaderTab === 'my-work' && myWorkSessionId ? (
            <MyWorkPanel apiBase={apiBase} sessionId={myWorkSessionId} initialTerminals={myWorkTerminals} />
          ) : (
            <ChatPanel apiBase={apiBase} addLog={addLog} onStartWorkEmbedded={onStartWorkEmbedded} />
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
            background: resizing ? '#475569' : '#334155',
          }}
        />
        <LogsPanel logs={logs} width={rightWidth} onClear={() => setLogs([])} />
      </div>
    </div>
  );
}
