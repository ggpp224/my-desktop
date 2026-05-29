/* AI 生成 By Peng.Guo */
/**
 * 校验 command-catalog 与 toolsSchema、FIXED_COMMAND_HINTS 一致性。
 */
import {
  COMMAND_CATALOG_EXACT_LABELS,
  EXACT_COMMAND_RULES,
  normalizeCommandText,
} from '../config/command-catalog.js';
import { toolsSchema } from '../agent/tools-schema.js';

const schemaTools = new Set(toolsSchema.map((t) => t.function.name));

function fail(msg: string): never {
  console.error(`[verify:catalog] ${msg}`);
  process.exit(1);
}

const normalizedKeys = new Set<string>();
for (const rule of EXACT_COMMAND_RULES) {
  const key = normalizeCommandText(rule.label);
  if (normalizedKeys.has(key)) {
    fail(`exact 口令归一化冲突: ${key}`);
  }
  normalizedKeys.add(key);
  if (!schemaTools.has(rule.tool)) {
    fail(`catalog 工具未在 toolsSchema 中: ${rule.tool} (${rule.label})`);
  }
}

if (COMMAND_CATALOG_EXACT_LABELS.length !== EXACT_COMMAND_RULES.length) {
  fail(
    `COMMAND_CATALOG_EXACT_LABELS(${COMMAND_CATALOG_EXACT_LABELS.length}) !== EXACT_COMMAND_RULES(${EXACT_COMMAND_RULES.length})`
  );
}

for (const label of COMMAND_CATALOG_EXACT_LABELS) {
  if (!normalizedKeys.has(normalizeCommandText(label))) {
    fail(`COMMAND_CATALOG_EXACT_LABELS 缺少规则: ${label}`);
  }
}

console.log(`[verify:catalog] OK: ${EXACT_COMMAND_RULES.length} exact commands, ${schemaTools.size} tools in schema`);
