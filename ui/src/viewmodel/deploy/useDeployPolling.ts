/* AI 生成 By Peng.Guo */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { DeployPollingTarget, DeployStatusResult } from '../../domain/deploy/models';
import { withJenkinsMarkdownLink } from '../../domain/deploy/jenkinsDeployDisplay';
import { DEFAULT_DEPLOY_POLLING_POLICY, type DeployPollingPolicy } from '../../domain/deploy/pollingPolicy';
import { createDeployPollingService } from '../../domain/deploy/deployPollingService';
import { JenkinsDeployStatusDataSource } from '../../infrastructure/deploy/JenkinsDeployStatusDataSource';

type Message = { role: 'user' | 'assistant'; content: string; toolResults?: unknown[] };

function formatDeployMsg(args: {
  status: DeployStatusResult;
  label: string;
  fallbackJenkinsUrl?: string;
}): string {
  const { status: s, label, fallbackJenkinsUrl } = args;
  const jenkinsUrl = s.buildUrl ?? fallbackJenkinsUrl;
  const name = s.buildName ?? label;
  const num = s.buildNumber != null ? ` #${s.buildNumber}` : '';
  const progress = s.message ?? '';
  const core = progress ? `${name}${num} ${progress}` : `${name}${num}`;
  return withJenkinsMarkdownLink(core, jenkinsUrl);
}

export function startDeployPolling(args: {
  apiBase: string;
  target: DeployPollingTarget;
  label: string;
  taskKey?: string;
  /** Job 主页面 URL（/job/.../）；优先于 queueUrl 作为展示链接，queue 仅用于状态 API */
  jobPageUrl?: string;
  policy?: Partial<DeployPollingPolicy>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  addLog: (line: string) => void;
  pollRef: MutableRefObject<{ stop: () => void } | null>;
}): void {
  const { apiBase, target, label, taskKey, setMessages, addLog, pollRef, jobPageUrl } = args;

  const fallbackJenkinsUrl = jobPageUrl ?? (target.kind === 'queueUrl' ? target.value : undefined);

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
        const progressMsg = formatDeployMsg({ status: s, label, fallbackJenkinsUrl });
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
        const msg = formatDeployMsg({ status: s, label, fallbackJenkinsUrl });
        const logMsg = s.status === 'success' ? `${prefix}部署成功` : msg;
        addLog(logMsg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      },
      onTimeout: () => {
        const msg = withJenkinsMarkdownLink(
          `${prefix}部署状态查询超时，请到 Jenkins 查看。`,
          fallbackJenkinsUrl
        );
        addLog(msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      },
      onConsecutiveFailureStop: (reason) => {
        const base =
          reason === 'bad_response'
            ? `${prefix}轮询失败：连续20次无法获取状态，请到 Jenkins 查看。`
            : `${prefix}轮询失败：连续20次请求异常，请到 Jenkins 查看。`;
        const msg = withJenkinsMarkdownLink(base, fallbackJenkinsUrl);
        addLog(msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      },
    },
  });

  pollRef.current = controller;
}

