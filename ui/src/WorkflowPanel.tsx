/* AI 生成 By Peng.Guo */
import { useState } from 'react';
import { appendToolResultsToLogs } from './log-tools';
import type { WorkTerminal } from './MyWorkPanel';
import type { AppThemeTokens } from './domain/theme/appTheme';
import { Button } from './view/Button';

interface WorkflowPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
  onStartWorkEmbedded: (payload: { sessionId: string; terminals: WorkTerminal[] }) => void;
  themeTokens: AppThemeTokens;
}

export function WorkflowPanel({ apiBase, addLog, onStartWorkEmbedded, themeTokens }: WorkflowPanelProps) {
  const [workflows] = useState<Array<{ name: string; label: string }>>([
    { name: 'start-work', label: '开始工作' },
    { name: 'upgrade-react18-nova', label: '升级集测 react18 的 nova 版本' },
    { name: 'upgrade-cc-web-nova', label: '升级集测 cc-web 的 nova 版本' },
  ]);
  const [running, setRunning] = useState(false);

  const runWorkflow = async (name: string, label: string) => {
    setRunning(true);
    addLog(`执行工作流: ${label}（${name}）`);
    try {
      if (name === 'start-work') {
        const res = await fetch(`${apiBase}/workflow/${name}/embedded`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          addLog(`失败: ${data.error || '启动内嵌工作流失败'}`);
          return;
        }
        onStartWorkEmbedded({ sessionId: data.sessionId, terminals: data.terminals ?? [] });
        addLog(`工作流 ${label} 已在“我的工作”中启动`);
        return;
      }

      const chatRes = await fetch(`${apiBase}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `执行工作流 ${name}` }),
      });
      const chatData = await chatRes.json();
      appendToolResultsToLogs(chatData.toolResults, addLog);
      addLog(chatData.success ? `工作流 ${label} 完成` : `失败: ${chatData.error}`);
    } catch (e) {
      addLog(`请求失败: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section style={{ padding: 16, borderBottom: `1px solid ${themeTokens.panelBorder}` }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, color: themeTokens.textSecondary }}>Workflow</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {workflows.map(({ name, label }) => (
          <li key={name} style={{ marginBottom: 8 }}>
            <Button
              themeTokens={themeTokens}
              onClick={() => runWorkflow(name, label)}
              loading={running}
              disabled={running}
              variant="ghost"
              size="md"
              fullWidth
              style={{ justifyContent: 'flex-start' }}
            >
              {label}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
