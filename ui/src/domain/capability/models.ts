/* AI 生成 By Peng.Guo */

export type CommandCapabilityBreakdown = {
  fixedCommands: number;
  jsonWorkflows: number;
  agentTools: number;
  deployByProject: number;
  mergeByProject: number;
  terminalByProject: number;
  ideOpenByProject: number;
  ideCloseByProject: number;
  jenkinsOpenByProject: number;
  startDevByProject: number;
};

export type CommandCapabilityDetailItem = {
  label: string;
  note?: string;
};

export type CommandCapabilitySection = {
  key: string;
  title: string;
  description?: string;
  items: CommandCapabilityDetailItem[];
};

export type CommandCapabilityResponse = {
  total: number;
  breakdown: CommandCapabilityBreakdown;
  sections: CommandCapabilitySection[];
};
