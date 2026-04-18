/* AI 生成 By Peng.Guo */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

type TerminalStatus = 'running' | 'success' | 'error';

export interface WorkTerminal {
  id: string;
  title: string;
  taskKey: string;
  stepIndex: number;
  status: TerminalStatus;
  lines: string[];
  cwdAbs: string;
  terminalSessionId?: string;
}

interface MyWorkPanelProps {
  apiBase: string;
  sessionId: string;
  initialTerminals: WorkTerminal[];
}

/** 新建页签时继承的目录：当前选中页签，若无则第一个页签 */
function resolveInheritCwdForNewTab(terminals: WorkTerminal[], activeTerminalId: string): string | undefined {
  const active = terminals.find((t) => t.id === activeTerminalId) ?? terminals[0];
  const cwd = active?.cwdAbs?.trim();
  return cwd || undefined;
}

export function MyWorkPanel({ apiBase, sessionId, initialTerminals }: MyWorkPanelProps) {
  const [terminals, setTerminals] = useState<WorkTerminal[]>(initialTerminals);
  const [activeTerminalId, setActiveTerminalId] = useState<string>(initialTerminals[0]?.id ?? '');
  const [creatingTerminal, setCreatingTerminal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const terminalMountRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activePtySeqRef = useRef(0);
  const activePtyIdRef = useRef('');
  const renderedTerminalIdRef = useRef('');
  const tabContextRef = useRef({ terminals: initialTerminals, activeTerminalId: initialTerminals[0]?.id ?? '' });
  tabContextRef.current = { terminals, activeTerminalId };

  const createManualTerminal = useCallback(async () => {
    if (!sessionId || creatingTerminal) return;
    setCreatingTerminal(true);
    try {
      const inheritCwd = resolveInheritCwdForNewTab(tabContextRef.current.terminals, tabContextRef.current.activeTerminalId);
      const resp = await fetch(`${apiBase}/workflow/sessions/${encodeURIComponent(sessionId)}/terminals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inheritCwd ? { cwdAbs: inheritCwd } : {}),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.success && data.terminal) {
        const created = data.terminal as WorkTerminal;
        setTerminals((prev) => [...prev, created]);
        setActiveTerminalId(created.id);
      }
    } catch {
      // ignore create failures to avoid interrupting existing terminals
    } finally {
      setCreatingTerminal(false);
    }
  }, [apiBase, creatingTerminal, sessionId]);

  useEffect(() => {
    setTerminals(initialTerminals);
    setActiveTerminalId(initialTerminals[0]?.id ?? '');
  }, [sessionId, initialTerminals]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setInterval(async () => {
      try {
        const resp = await fetch(`${apiBase}/workflow/sessions/${encodeURIComponent(sessionId)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data?.success && Array.isArray(data.terminals)) {
          const next = data.terminals as WorkTerminal[];
          setTerminals((prev) => {
            const sameShape =
              prev.length === next.length &&
              prev.every(
                (item, index) =>
                  item.id === next[index]?.id &&
                  item.title === next[index]?.title &&
                  item.status === next[index]?.status &&
                  item.terminalSessionId === next[index]?.terminalSessionId
              );
            return sameShape ? prev : next;
          });
        }
      } catch {
        // 网络抖动时保留当前内容，避免打断阅读。
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [apiBase, sessionId]);

  useEffect(() => {
    const onWindowClick = () => setContextMenu(null);
    window.addEventListener('click', onWindowClick);
    return () => window.removeEventListener('click', onWindowClick);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const cmdOrCtrl = event.metaKey || event.ctrlKey;
      if (!cmdOrCtrl) return;
      if (event.key.toLowerCase() !== 't') return;
      event.preventDefault();
      createManualTerminal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createManualTerminal]);

  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0],
    [activeTerminalId, terminals]
  );

  useEffect(() => {
    if (!terminalMountRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: { background: '#020617', foreground: '#e2e8f0' },
      convertEol: false,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalMountRef.current);
    fitAddon.fit();
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    const onDataDispose = terminal.onData((data) => {
      const ptyId = activePtyIdRef.current;
      if (!ptyId) return;
      fetch(`${apiBase}/terminal/sessions/${encodeURIComponent(ptyId)}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      }).catch(() => {});
    });

    const onResize = () => {
      if (!fitAddonRef.current || !xtermRef.current) return;
      fitAddonRef.current.fit();
      const ptyId = activePtyIdRef.current;
      if (!ptyId) return;
      fetch(`${apiBase}/terminal/sessions/${encodeURIComponent(ptyId)}/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: xtermRef.current.cols, rows: xtermRef.current.rows }),
      }).catch(() => {});
    };
    window.addEventListener('resize', onResize);

    return () => {
      onDataDispose.dispose();
      window.removeEventListener('resize', onResize);
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [apiBase]);

  useEffect(() => {
    const terminal = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    if (renderedTerminalIdRef.current === activeTerminal?.id) return;
    renderedTerminalIdRef.current = activeTerminal?.id ?? '';
    terminal.reset();
    activePtySeqRef.current = 0;
    activePtyIdRef.current = activeTerminal?.terminalSessionId ?? '';
    if (!activeTerminal?.terminalSessionId) {
      const fallback = (activeTerminal?.lines ?? []).join('\r\n');
      terminal.writeln(fallback || '该步骤暂无可交互终端。');
      return;
    }
    fitAddon.fit();
    fetch(`${apiBase}/terminal/sessions/${encodeURIComponent(activeTerminal.terminalSessionId)}/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols: terminal.cols, rows: terminal.rows }),
    }).catch(() => {});
  }, [activeTerminal?.id, activeTerminal?.terminalSessionId, apiBase]);

  useEffect(() => {
    const ptyId = activeTerminal?.terminalSessionId;
    if (!ptyId || !xtermRef.current) return;
    const timer = window.setInterval(async () => {
      const currentPtyId = activePtyIdRef.current;
      if (!currentPtyId) return;
      try {
        const resp = await fetch(
          `${apiBase}/terminal/sessions/${encodeURIComponent(currentPtyId)}/output?from=${activePtySeqRef.current}`
        );
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data?.success) return;
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          const terminal = xtermRef.current;
          if (terminal && currentPtyId === activePtyIdRef.current) {
            data.chunks.forEach((chunk: string) => terminal.write(chunk));
          }
        }
        if (typeof data.seq === 'number') activePtySeqRef.current = data.seq;
      } catch {
        // ignore poll errors
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [activeTerminal?.terminalSessionId, apiBase]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderBottom: '1px solid #334155', overflowX: 'auto' }}>
        <button
          type="button"
          disabled={creatingTerminal}
          onClick={createManualTerminal}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px dashed #4f83ff',
            background: '#0b1220',
            color: '#93c5fd',
            cursor: creatingTerminal ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title="手动创建空终端（目录与当前页签一致，⌘T / Ctrl+T 同）"
        >
          + 新建终端
        </button>
        {terminals.map((terminal) => {
          const isActive = terminal.id === activeTerminal?.id;
          return (
            <div
              key={terminal.id}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, path: terminal.cwdAbs });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px 6px 12px',
                borderRadius: 6,
                border: `1px solid ${isActive ? '#4f83ff' : '#334155'}`,
                background: isActive ? '#1d4ed8' : '#0f172a',
                color: '#e2e8f0',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              title={`${terminal.cwdAbs} (${terminal.status})`}
            >
              <button
                type="button"
                onClick={() => setActiveTerminalId(terminal.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  font: 'inherit',
                }}
                title={`${terminal.cwdAbs} (${terminal.status})`}
              >
                {terminal.title}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await fetch(
                      `${apiBase}/workflow/sessions/${encodeURIComponent(sessionId)}/terminals/${encodeURIComponent(terminal.id)}`,
                      { method: 'DELETE' }
                    );
                    setTerminals((prev) => {
                      const next = prev.filter((item) => item.id !== terminal.id);
                      if (activeTerminalId === terminal.id) {
                        setActiveTerminalId(next[0]?.id ?? '');
                      }
                      return next;
                    });
                  } catch {
                    // ignore close errors
                  }
                }}
                title={`关闭 ${terminal.title}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  width: 16,
                  height: 16,
                  lineHeight: '16px',
                  textAlign: 'center',
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12 }}>
        状态：{activeTerminal?.status ?? 'unknown'}
      </div>
      <div
        ref={terminalMountRef}
        style={{ flex: 1, minHeight: 240, borderTop: '1px solid #1e293b', padding: 8, background: '#020617' }}
      />
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            zIndex: 999,
            minWidth: 140,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(contextMenu.path);
              } catch {
                // ignore clipboard errors
              }
              setContextMenu(null);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              border: 'none',
              background: 'transparent',
              color: '#e2e8f0',
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            复制路径
          </button>
        </div>
      )}
    </section>
  );
}
