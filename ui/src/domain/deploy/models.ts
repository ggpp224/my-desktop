/* AI 生成 By Peng.Guo */

export type DeployStatus =
  | 'pending'
  | 'building'
  | 'success'
  | 'failure'
  | 'aborted'
  | 'unknown';

export type DeployStatusResult = {
  status: DeployStatus;
  message?: string;
  buildUrl?: string;
  buildNumber?: number;
  buildName?: string;
  progressPercent?: number;
};

export type DeployPollingTarget =
  | { kind: 'queueUrl'; value: string }
  | { kind: 'jobName'; value: string };

