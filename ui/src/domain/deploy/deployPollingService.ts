/* AI 生成 By Peng.Guo */

import type { DeployStatusResult } from './models';
import type { DeployPollingPolicy } from './pollingPolicy';
import type { IDeployStatusDataSource } from '../../infrastructure/deploy/JenkinsDeployStatusDataSource';

export type DeployPollingCallbacks = {
  onProgress: (status: DeployStatusResult) => void;
  onTerminal: (status: DeployStatusResult) => void;
  onTimeout: () => void;
  onConsecutiveFailureStop: (reason: 'bad_response' | 'exception') => void;
};

export type DeployPollingController = {
  stop: () => void;
  isRunning: () => boolean;
};

function isTerminalStatus(s: DeployStatusResult): boolean {
  return s.status === 'success' || s.status === 'failure' || s.status === 'aborted';
}

function isFailureResponse(ok: boolean, s: DeployStatusResult): boolean {
  return !ok || s.status === 'unknown';
}

export function createDeployPollingService(deps: {
  policy: DeployPollingPolicy;
  dataSource: IDeployStatusDataSource;
}): {
  start: (args: { callbacks: DeployPollingCallbacks; label: string; target: Parameters<IDeployStatusDataSource['getStatus']>[0] }) => DeployPollingController;
} {
  const { policy, dataSource } = deps;

  return {
    start: ({ callbacks, target }) => {
      let pollCount = 0;
      let consecutiveFailures = 0;
      let timer: ReturnType<typeof setInterval> | null = null;
      let running = true;

      const stop = () => {
        running = false;
        if (timer) clearInterval(timer);
        timer = null;
      };

      timer = setInterval(async () => {
        pollCount += 1;
        if (pollCount > policy.maxPollCount) {
          stop();
          callbacks.onTimeout();
          return;
        }

        try {
          const { ok, data } = await dataSource.getStatus(target);
          if (isTerminalStatus(data)) {
            if (pollCount < policy.minPollBeforeTerminalStop) return;
            stop();
            callbacks.onTerminal(data);
            return;
          }

          if (isFailureResponse(ok, data)) {
            consecutiveFailures += 1;
            if (consecutiveFailures >= policy.maxConsecutiveFailures) {
              stop();
              callbacks.onConsecutiveFailureStop('bad_response');
            }
            return;
          }

          consecutiveFailures = 0;
          callbacks.onProgress(data);
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= policy.maxConsecutiveFailures) {
            stop();
            callbacks.onConsecutiveFailureStop('exception');
          }
        }
      }, policy.intervalMs);

      return { stop, isRunning: () => running };
    },
  };
}

