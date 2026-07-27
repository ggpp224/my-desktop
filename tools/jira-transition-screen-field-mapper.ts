/* AI 生成 By Peng.Guo */

import type { SubmitForTestFieldIntent } from './jira-submit-for-test-defaults.js';

export type JiraTransitionAllowedValue = {
  id?: string;
  value?: string;
  name?: string;
};

export type JiraTransitionFieldMeta = {
  name?: string;
  required?: boolean;
  schema?: {
    type?: string;
    items?: string;
    system?: string;
    custom?: string;
  };
  allowedValues?: JiraTransitionAllowedValue[];
};

export type JiraTransitionFields = Record<string, JiraTransitionFieldMeta>;

/**
 * 将意图字符串转为 Jira transition fields 可接受的值。
 * 按 schema.type / items 分发，避免在编排层写 if/else。
 */
export interface TransitionFieldValueStrategy {
  canHandle(meta: JiraTransitionFieldMeta): boolean;
  /** 无法映射时返回 undefined（跳过该字段） */
  map(meta: JiraTransitionFieldMeta, intent: string): unknown | undefined;
}

export class StringFieldValueStrategy implements TransitionFieldValueStrategy {
  canHandle(meta: JiraTransitionFieldMeta): boolean {
    return (meta.schema?.type ?? '') === 'string';
  }

  map(_meta: JiraTransitionFieldMeta, intent: string): unknown {
    return intent;
  }
}

export class OptionFieldValueStrategy implements TransitionFieldValueStrategy {
  canHandle(meta: JiraTransitionFieldMeta): boolean {
    return (meta.schema?.type ?? '') === 'option';
  }

  map(meta: JiraTransitionFieldMeta, intent: string): unknown | undefined {
    const hit = findAllowedValue(meta.allowedValues, intent);
    if (!hit?.id && !hit?.value) return undefined;
    return hit.id ? { id: hit.id } : { value: hit.value };
  }
}

export class UserFieldValueStrategy implements TransitionFieldValueStrategy {
  canHandle(meta: JiraTransitionFieldMeta): boolean {
    return (meta.schema?.type ?? '') === 'user';
  }

  map(_meta: JiraTransitionFieldMeta, intent: string): unknown {
    return { name: intent };
  }
}

export class LabelsFieldValueStrategy implements TransitionFieldValueStrategy {
  canHandle(meta: JiraTransitionFieldMeta): boolean {
    return (meta.schema?.type ?? '') === 'array' && (meta.schema?.items ?? '') === 'string';
  }

  map(_meta: JiraTransitionFieldMeta, intent: string): unknown {
    const parts = intent
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
}

function findAllowedValue(
  allowed: JiraTransitionAllowedValue[] | undefined,
  intent: string,
): JiraTransitionAllowedValue | undefined {
  const target = intent.trim().toLowerCase();
  if (!target || !allowed?.length) return undefined;
  return allowed.find((v) => {
    const value = (v.value ?? '').trim().toLowerCase();
    const name = (v.name ?? '').trim().toLowerCase();
    return value === target || name === target;
  });
}

/**
 * 按字段中文名 + schema Strategy 组装 transition.fields。
 * 意图有值但无法映射时，若字段 required 则抛错；否则跳过。
 */
export class TransitionScreenFieldMapper {
  constructor(private readonly strategies: readonly TransitionFieldValueStrategy[]) {}

  static createDefault(): TransitionScreenFieldMapper {
    return new TransitionScreenFieldMapper([
      new StringFieldValueStrategy(),
      new OptionFieldValueStrategy(),
      new UserFieldValueStrategy(),
      new LabelsFieldValueStrategy(),
    ]);
  }

  buildFields(
    screenFields: JiraTransitionFields,
    intent: SubmitForTestFieldIntent,
  ): Record<string, unknown> {
    const byName = indexFieldsByName(screenFields);
    const fields: Record<string, unknown> = {};
    const missingRequired: string[] = [];

    for (const [fieldName, intentValue] of Object.entries(intent)) {
      const value = (intentValue ?? '').trim();
      if (!value) continue;
      const entry = byName.get(fieldName);
      if (!entry) continue;
      const mapped = this.mapOne(entry.meta, value);
      if (mapped === undefined) {
        if (entry.meta.required) missingRequired.push(fieldName);
        continue;
      }
      fields[entry.id] = mapped;
    }

    for (const [id, meta] of Object.entries(screenFields)) {
      if (!meta.required) continue;
      if (fields[id] !== undefined) continue;
      const name = (meta.name ?? id).trim();
      missingRequired.push(name || id);
    }

    if (missingRequired.length > 0) {
      throw new Error(`提测必填字段无法自动填充：${[...new Set(missingRequired)].join('、')}`);
    }

    return fields;
  }

  private mapOne(meta: JiraTransitionFieldMeta, intent: string): unknown | undefined {
    const strategy = this.strategies.find((s) => s.canHandle(meta));
    if (!strategy) return undefined;
    return strategy.map(meta, intent);
  }
}

function indexFieldsByName(
  screenFields: JiraTransitionFields,
): Map<string, { id: string; meta: JiraTransitionFieldMeta }> {
  const map = new Map<string, { id: string; meta: JiraTransitionFieldMeta }>();
  for (const [id, meta] of Object.entries(screenFields)) {
    const name = (meta.name ?? '').trim();
    if (name) map.set(name, { id, meta });
  }
  return map;
}
