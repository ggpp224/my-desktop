/* AI 生成 By Peng.Guo */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { DeployPollingTarget, DeployStatusResult } from '../../domain/deploy/models';
import { DEFAULT_DEPLOY_POLLING_POLICY, type DeployPollingPolicy } from '../../domain/deploy/pollingPolicy';
import { createDeployPollingService } from '../../domain/deploy/deployPollingService';
import { JenkinsDeployStatusDataSource } from '../../infrastructure/deploy/JenkinsDeployStatusDataSource';

type Message = { role: 'user' | 'assistant'; content: string; toolResults?: unknown[] };

function formatDeployMsg(args: { status: DeployStatusResult; label: string }): string {
  const { status: s, label } = args;
  const name = s.buildName ?? label;
  const num = s.buildNumber != null ? ` #${s.buildNumber}` : '';
  const progress = s.message ?? '';
  return progress ? `${name}${num} ${progress}` : `${name}${num}`;
}

export function startDeployPolling(args: {
  apiBase: string;
  target: DeployPollingTarget;
  label: string;
  taskKey?: string;
  policy?: Partial<DeployPollingPolicy>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  addLog: (line: string) => void;
  pollRef: MutableRefObject<{ stop: () => void } | null>;
}): void {
  const { apiBase, target, label, taskKey, setMessages, addLog, pollRef } = args;

  const prefix = taskKey ? `【${taskKey}】` : '';
  const policy: DeployPollingPolicy = { ...DEFAULT_DEPLOY_POLLING_POLICY, ...(args.policy ?? {}) };

  if (pollRef.current) {
    pollRef.current.stop();
    pollRef.current = null;
  }

  const dataSource = new JenkinsDeployStatusDataSource(apiBase);
  const service = createDeployPollingService({ policy, dataSource });

  const controller = service.start({
    label,
    target,
    callbacks: {
      onProgress: (s) => {
        const progressMsg = formatDeployMsg({ status: s, label });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && (last.content.includes('构建中') || last.content.includes('排队') || last.content.includes(label))) {
            next[next.length - 1] = { ...last, content: progressMsg };
            return next;
          }
          return [...prev, { role: 'assistant', content: progressMsg }];
        });
      },
      onTerminal: (s) => {
        const msg = formatDeployMsg({ status: s, label });
        const logMsg = s.status === 'success' ? `${prefix}部署成功` : msg;
        addLog(logMsg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      },
      onTimeout: () => {
        const msg = `${prefix}部署状态查询超时，请到 Jenkins 查看。`;
        addLog(msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      },
      onConsecutiveFailureStop: (reason) => {
        const msg =
          reason === 'bad_response'
            ? `${prefix}轮询失败：连续20次无法获取状态，请到 Jenkins 查看。`
            : `${prefix}轮询失败：连续20次请求异常，请到 Jenkins 查看。`;
        addLog(msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      },
    },
  });

  pollRef.current = controller;
}

