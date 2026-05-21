/* AI 生成 By Peng.Guo */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { safeFitXterm } from './domain/terminal/xtermFit';
import type { AppThemeTokens } from './domain/theme/appTheme';
import { Button } from './view/Button';
import { IconButton } from './view/IconButton';

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
  apiServerOk: boolean;
  sessionId: string;
  initialTerminals: WorkTerminal[];
  themeTokens: AppThemeTokens;
}

/** 新建页签时继承的目录：当前选中页签，若无则第一个页签 */
function resolveInheritCwdForNewTab(terminals: WorkTerminal[], activeTerminalId: string): string | undefined {
  const active = terminals.find((t) => t.id === activeTerminalId) ?? terminals[0];
  const cwd = active?.cwdAbs?.trim();
  return cwd || undefined;
}

export function MyWorkPanel({ apiBase, apiServerOk, sessionId, initialTerminals, themeTokens }: MyWorkPanelProps) {
  const [terminals, setTerminals] = useState<WorkTerminal[]>(initialTerminals);
  const [activeTerminalId, setActiveTerminalId] = useState<string>(initialTerminals[0]?.id ?? '');
  const [creatingTerminal, setCreatingTerminal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [hoveredTerminalId, setHoveredTerminalId] = useState<string | null>(null);
  /** xterm 实例重建时递增，用于触发输出回放 */
  const [xtermEpoch, setXtermEpoch] = useState(0);
  const terminalMountRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activePtySeqRef = useRef(0);
  const activePtyIdRef = useRef('');
  const terminalOutputErrorRef = useRef<string | null>(null);
  /** 已渲染的「页签 id + pty 会话 id」，pty 变化时需 reset 并回放输出 */
  const renderedTerminalKeyRef = useRef('');
  const xtermDisposedRef = useRef(false);
  const tabContextRef = useRef({ terminals: initialTerminals, activeTerminalId: initialTerminals[0]?.id ?? '' });
  tabContextRef.current = { terminals, activeTerminalId };

  const terminalMountHasSize = useCallback((): boolean => {
    const el = terminalMountRef.current;
    if (!el) return false;
    return el.clientWidth >= 2 && el.clientHeight >= 2;
  }, []);

  const safeFitTerminal = useCallback((fitAddon: FitAddon, terminal: Terminal) => {
    if (xtermDisposedRef.current || !fitAddonRef.current || !xtermRef.current) return false;
    if (!terminalMountHasSize()) return false;
    return safeFitXterm(fitAddon, terminal);
  }, [terminalMountHasSize]);

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
    if (!sessionId || !apiServerOk) return;
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
  }, [apiBase, apiServerOk, sessionId]);

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

  const showTerminalMessageOnce = useCallback((key: string, message: string) => {
    if (terminalOutputErrorRef.current === key) return;
    terminalOutputErrorRef.current = key;
    xtermRef.current?.writeln(`\r\n${message}\r\n`);
  }, []);

  const replayTerminalOutput = useCallback(
    async (ptyId: string, fromSeq: number): Promise<{ seq: number; ok: boolean }> => {
      const term = xtermRef.current;
      if (!apiServerOk || !ptyId || !term) return { seq: fromSeq, ok: false };
      try {
        const resp = await fetch(
          `${apiBase}/terminal/sessions/${encodeURIComponent(ptyId)}/output?from=${fromSeq}`
        );
        if (!resp.ok) {
          showTerminalMessageOnce(
            `http-${resp.status}`,
            `[无法拉取终端输出 HTTP ${resp.status}，若刚重启应用请重新「开始工作」]`
          );
          return { seq: fromSeq, ok: false };
        }
        const data = await resp.json();
        if (!data?.success) {
          showTerminalMessageOnce('session-missing', '[终端会话不存在，可能 API 已重启，请重新「开始工作」]');
          return { seq: fromSeq, ok: false };
        }
        terminalOutputErrorRef.current = null;
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          data.chunks.forEach((chunk: string) => term.write(chunk));
        }
        const seq = typeof data.seq === 'number' ? data.seq : fromSeq;
        return { seq, ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showTerminalMessageOnce(
          'network',
          `[无法连接本地 API（${apiBase}）：${msg}。请完全退出应用后重新打开，或重新「开始工作」]`
        );
        return { seq: fromSeq, ok: false };
      }
    },
    [apiBase, apiServerOk, showTerminalMessageOnce]
  );

  const [terminalHostReady, setTerminalHostReady] = useState(false);

  useEffect(() => {
    const host = terminalMountRef.current;
    if (!host) return;
    const syncReady = () => setTerminalHostReady(host.clientWidth >= 2 && host.clientHeight >= 2);
    syncReady();
    const ro = new ResizeObserver(syncReady);
    ro.observe(host);
    return () => {
      ro.disconnect();
      setTerminalHostReady(false);
    };
  }, []);

  useEffect(() => {
    if (!terminalHostReady) return;
    const mountEl = terminalMountRef.current;
    if (!mountEl) return;

    xtermDisposedRef.current = false;
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: { background: themeTokens.workspacePanelBackground, foreground: themeTokens.textPrimary },
      convertEol: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(mountEl);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    renderedTerminalKeyRef.current = '';
    setXtermEpoch((n) => n + 1);

    const notifyPtyResize = () => {
      if (xtermDisposedRef.current || !xtermRef.current) return;
      const ptyId = activePtyIdRef.current;
      if (!ptyId) return;
      fetch(`${apiBase}/terminal/sessions/${encodeURIComponent(ptyId)}/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: xtermRef.current.cols, rows: xtermRef.current.rows }),
      }).catch(() => {});
    };

    let resizeObserver: ResizeObserver | null = null;

    const onResize = () => {
      if (xtermDisposedRef.current) return;
      if (!safeFitTerminal(fitAddon, terminal)) return;
      notifyPtyResize();
    };

    const onDataDispose = terminal.onData((data) => {
      const ptyId = activePtyIdRef.current;
      if (!ptyId) return;
      fetch(`${apiBase}/terminal/sessions/${encodeURIComponent(ptyId)}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      }).catch(() => {});
    });

    window.addEventListener('resize', onResize);

    let rafUntilReady = 0;
    const scheduleFitWhenSized = () => {
      if (xtermDisposedRef.current) return;
      if (safeFitTerminal(fitAddon, terminal)) {
        notifyPtyResize();
        if (!resizeObserver) {
          resizeObserver = new ResizeObserver(() => onResize());
          resizeObserver.observe(mountEl);
        }
        return;
      }
      if (rafUntilReady < 120) {
        rafUntilReady += 1;
        requestAnimationFrame(scheduleFitWhenSized);
      }
    };
    requestAnimationFrame(scheduleFitWhenSized);

    return () => {
      xtermDisposedRef.current = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      onDataDispose.dispose();
      window.removeEventListener('resize', onResize);
      try {
        terminal.dispose();
      } catch {
        /* StrictMode 二次卸载时 xterm 内部可能已无 dimensions */
      }
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [apiBase, safeFitTerminal, terminalHostReady, themeTokens.textPrimary, themeTokens.workspacePanelBackground]);

  useEffect(() => {
    const terminal = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    const renderKey = `${activeTerminal?.id ?? ''}:${activeTerminal?.terminalSessionId ?? ''}:${xtermEpoch}`;
    if (renderedTerminalKeyRef.current === renderKey) return;
    renderedTerminalKeyRef.current = renderKey;

    terminal.reset();
    terminalOutputErrorRef.current = null;
    activePtySeqRef.current = 0;
    activePtyIdRef.current = activeTerminal?.terminalSessionId ?? '';

    if (!activeTerminal?.terminalSessionId) {
      const fallback = (activeTerminal?.lines ?? []).join('\r\n');
      terminal.writeln(fallback || '该步骤暂无可交互终端。');
      return;
    }

    const ptyId = activeTerminal.terminalSessionId;
    const bootstrap = async () => {
      safeFitTerminal(fitAddon, terminal);
      fetch(`${apiBase}/terminal/sessions/${encodeURIComponent(ptyId)}/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: terminal.cols, rows: terminal.rows }),
      }).catch(() => {});
      const result = await replayTerminalOutput(ptyId, 0);
      activePtySeqRef.current = result.seq;
    };
    void bootstrap();
  }, [activeTerminal?.id, activeTerminal?.terminalSessionId, apiBase, replayTerminalOutput, safeFitTerminal, xtermEpoch]);

  useEffect(() => {
    const ptyId = activeTerminal?.terminalSessionId;
    if (!ptyId || !xtermRef.current || !apiServerOk) return;
    let cancelled = false;
    let failures = 0;
    let timer = 0;
    const tick = async () => {
      if (cancelled || !apiServerOk) return;
      const currentPtyId = activePtyIdRef.current;
      if (!currentPtyId || currentPtyId !== ptyId) return;
      const result = await replayTerminalOutput(currentPtyId, activePtySeqRef.current);
      activePtySeqRef.current = result.seq;
      if (!result.ok) {
        failures += 1;
        if (failures >= 5) return;
      } else {
        failures = 0;
      }
      const delay = result.ok ? 300 : Math.min(8000, 400 * 2 ** Math.min(failures, 4));
      timer = window.setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTerminal?.terminalSessionId, apiBase, apiServerOk, replayTerminalOutput]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${themeTokens.inputBorder}`, overflowX: 'auto' }}>
        <IconButton
          themeTokens={themeTokens}
          icon="+"
          label="新建终端"
          onClick={createManualTerminal}
          variant="dashed"
          size="sm"
          title="手动创建空终端（目录与当前页签一致，⌘T / Ctrl+T 同）"
          style={{ whiteSpace: 'nowrap', flexShrink: 0, height: 24, padding: '0 10px', borderRadius: 8 }}
        />
        {terminals.map((terminal) => {
          const isActive = terminal.id === activeTerminal?.id;
          const showClose = hoveredTerminalId === terminal.id;
          return (
            <div
              key={terminal.id}
              onMouseEnter={() => setHoveredTerminalId(terminal.id)}
              onMouseLeave={() => setHoveredTerminalId((prev) => (prev === terminal.id ? null : prev))}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, path: terminal.cwdAbs });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 1px',
                borderBottom: isActive ? `2px solid ${themeTokens.tabActiveBorder}` : '2px solid transparent',
                color: isActive ? themeTokens.tabActiveBorder : themeTokens.textSecondary,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              title={`${terminal.cwdAbs} (${terminal.status})`}
            >
              <Button
                themeTokens={themeTokens}
                onClick={() => setActiveTerminalId(terminal.id)}
                variant="ghost"
                size="sm"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  padding: '5px 0 6px',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  height: 24,
                }}
                title={`${terminal.cwdAbs} (${terminal.status})`}
              >
                {terminal.title}
              </Button>
              <IconButton
                themeTokens={themeTokens}
                icon="×"
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
                variant="ghost"
                size="icon"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  width: 22,
                  height: 22,
                  minWidth: 22,
                  cursor: showClose ? 'pointer' : 'default',
                  opacity: showClose ? 1 : 0,
                  pointerEvents: showClose ? 'auto' : 'none',
                  transition: 'opacity 0.12s ease',
                  marginBottom: 1,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ padding: '8px 12px', color: themeTokens.textSecondary, fontSize: 12 }}>
        状态：{activeTerminal?.status ?? 'unknown'}
      </div>
      <div
        ref={terminalMountRef}
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          borderTop: `1px solid ${themeTokens.inputBorder}`,
          padding: 8,
          background: themeTokens.workspacePanelBackground,
          overflow: 'hidden',
        }}
      />
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: themeTokens.tabInactiveBackground,
            border: `1px solid ${themeTokens.inputBorder}`,
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            zIndex: 999,
            minWidth: 140,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <IconButton
            themeTokens={themeTokens}
            icon="⧉"
            label="复制路径"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(contextMenu.path);
              } catch {
                // ignore clipboard errors
              }
              setContextMenu(null);
            }}
            variant="ghost"
            size="sm"
            fullWidth
            style={{
              textAlign: 'left',
              border: 'none',
              background: 'transparent',
              color: themeTokens.textPrimary,
              padding: '8px 12px',
              justifyContent: 'flex-start',
            }}
          />
        </div>
      )}
    </section>
  );
}
