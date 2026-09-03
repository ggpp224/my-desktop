/* AI 生成 By Peng.Guo */
import type { TransitionFieldIntent } from './jira-transition-screen-field-mapper.js';

export type CloseIssueDefaultsConfig = {
  /** 解决结果选项文案，默认「修复」（与 Jira「关闭问题」屏一致） */
  resolution: string;
};

export type CloseIssueExistingFields = {
  /** 已有缺陷类型选项文案（有则保留） */
  defectType?: string;
  /** 当前经办人 username（屏字段必填时回填） */
  assignee?: string;
  /** 当前修复版本名，逗号分隔 */
  fixVersions?: string;
};

/**
 * 领域对象：一键关闭默认填表策略。
 * 只产出「字段中文名 → 意图字符串」，不感知 customfield id / Jira schema。
 */
export class CloseIssueDefaults {
  constructor(private readonly config: CloseIssueDefaultsConfig) {}

  buildIntent(existing: CloseIssueExistingFields = {}): TransitionFieldIntent {
    return {
      解决结果: this.config.resolution.trim() || '修复',
      缺陷类型: (existing.defectType ?? '').trim() || undefined,
      经办人: (existing.assignee ?? '').trim() || undefined,
      修复的版本: (existing.fixVersions ?? '').trim() || undefined,
    };
  }
}
