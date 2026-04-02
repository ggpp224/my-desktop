/* AI 生成 By Peng.Guo */

import type { DeployPollingTarget, DeployStatusResult } from '../../domain/deploy/models';

export interface IDeployStatusDataSource {
  getStatus(target: DeployPollingTarget): Promise<{ ok: boolean; data: DeployStatusResult }>;
}

export class JenkinsDeployStatusDataSource implements IDeployStatusDataSource {
  constructor(private readonly apiBase: string) {}

  async getStatus(target: DeployPollingTarget): Promise<{ ok: boolean; data: DeployStatusResult }> {
    const statusUrl =
      target.kind === 'queueUrl'
        ? `${this.apiBase}/jenkins/deploy/status?queueUrl=${encodeURIComponent(target.value)}`
        : `${this.apiBase}/jenkins/deploy/status?jobName=${encodeURIComponent(target.value)}`;

    const res = await fetch(statusUrl);
    const data = (await res.json()) as DeployStatusResult;
    return { ok: res.ok, data };
  }
}

