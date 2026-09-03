/* AI 生成 By Peng.Guo */

import type { TransitionFieldIntent } from './jira-transition-screen-field-mapper.js';

/** @deprecated 使用 TransitionFieldIntent；保留别名以兼容既有引用 */
export type SubmitForTestFieldIntent = TransitionFieldIntent;

export type SubmitForTestDefaultsConfig = {
  /** 能否灰度选项文案，默认「能」 */
  canGrayscale: string;
  /** 修改点模板，支持 `{摘要}` */
  modificationTemplate: string;
  /** 测试范围建议模板，支持 `{摘要}` */
  testScopeTemplate: string;
  /** 缺陷原因选项文案；不在 allowedValues 中则跳过（如「无」） */
  defectCause: string;
};

export type SubmitForTestExistingFields = {
  /** 已有缺陷类型选项文案（有则保留） */
  defectType?: string;
};

/**
 * 领域对象：一键提测默认填表策略。
 * 只产出「字段中文名 → 意图字符串」，不感知 customfield id / Jira schema。
 */
export class SubmitForTestDefaults {
  constructor(private readonly config: SubmitForTestDefaultsConfig) {}

  buildIntent(summary: string, existing: SubmitForTestExistingFields = {}): SubmitForTestFieldIntent {
    const title = (summary ?? '').trim() || '（无摘要）';
    return {
      修改点: this.applyTemplate(this.config.modificationTemplate, title),
      测试范围建议: this.applyTemplate(this.config.testScopeTemplate, title),
      能否灰度: this.config.canGrayscale.trim() || undefined,
      缺陷类型: (existing.defectType ?? '').trim() || undefined,
      缺陷原因: this.config.defectCause.trim() || undefined,
    };
  }

  private applyTemplate(template: string, summary: string): string {
    const tpl = (template ?? '').trim() || '{摘要}';
    return tpl.replaceAll('{摘要}', summary);
  }
}
