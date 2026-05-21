/* AI 生成 By Peng.Guo */
import { createHash } from 'node:crypto';

export type CommandStatSource = 'chat' | 'workflow' | 'deploy' | 'merge' | 'browser' | 'knowledge';

export type CommandStatEventInput = {
  canonicalKey: string;
  displayLabel: string;
  source: CommandStatSource;
  route: string;
  success?: boolean;
  meta?: Record<string, string | number | undefined>;
};

const DISPLAY_LABEL_MAX = 500;

/** 内置别名：归一化文案 → canonical_key */
const CHAT_ALIAS_ENTRIES: Array<{ patterns: RegExp[]; canonicalKey: string; displayLabel: string }> = [
  {
    patterns: [/^开始工作[，,]?\s*使用外部终端$/, /^开始工作.*外部终端$/],
    canonicalKey: 'workflow:start-work-external-terminal',
    displayLabel: '开始工作（外部终端）',
  },
  {
    patterns: [/^开始工作$/],
    canonicalKey: 'workflow:start-work',
    displayLabel: '开始工作',
  },
  {
    patterns: [/^升级集测\s*react18\s*的\s*nova\s*版本$/i],
    canonicalKey: 'workflow:upgrade-react18-nova',
    displayLabel: '升级集测 react18 的 nova 版本',
  },
  {
    patterns: [/^升级集测\s*cc-web\s*的\s*nova\s*版本$/i],
    canonicalKey: 'workflow:upgrade-cc-web-nova',
    displayLabel: '升级集测 cc-web 的 nova 版本',
  },
  {
    patterns: [/^统计常用指令$/],
    canonicalKey: 'stats:open',
    displayLabel: '统计常用指令',
  },
  {
    patterns: [/^打开\s*jenkins$/i, /^打开jenkins$/i],
    canonicalKey: 'browser:jenkins',
    displayLabel: '打开 Jenkins',
  },
  {
    patterns: [/^周报$/, /^打开周报$/, /^打开wiki周报$/i],
    canonicalKey: 'wiki:weekly-report',
    displayLabel: '周报',
  },
  {
    patterns: [/^写周报$/],
    canonicalKey: 'wiki:write-weekly-report',
    displayLabel: '写周报',
  },
  {
    patterns: [/^部署\s*nova\s*集测$/i, /^部署nova集测$/i],
    canonicalKey: 'deploy:nova-pretest',
    displayLabel: '部署 nova 集测',
  },
  {
    patterns: [/^合并\s*nova\s*集测$/i, /^合并nova集测$/i],
    canonicalKey: 'merge:nova-pretest',
    displayLabel: '合并 nova 集测',
  },
];

function normalizeChatMessage(message: string): string {
  return message
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

function truncateDisplayLabel(label: string): string {
  const t = label.trim();
  if (t.length <= DISPLAY_LABEL_MAX) return t;
  return `${t.slice(0, DISPLAY_LABEL_MAX)}…`;
}

function hashNormalizedKey(normalized: string): string {
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `chat:${digest}`;
}

export function buildChatCommandStat(message: string, route: string): CommandStatEventInput {
  const raw = message.trim();
  const normalized = normalizeChatMessage(raw);
  const displayLabel = truncateDisplayLabel(raw || '(空)');

  for (const entry of CHAT_ALIAS_ENTRIES) {
    if (entry.patterns.some((p) => p.test(normalized) || p.test(raw))) {
      return {
        canonicalKey: entry.canonicalKey,
        displayLabel: entry.displayLabel,
        source: 'chat',
        route,
      };
    }
  }

  const deployMatch = normalized.match(/^部署\s*([a-z0-9_-]+)(?:\s+分支\s*(?:是|=)?\s*([^\s]+))?$/i);
  if (deployMatch) {
    const job = deployMatch[1];
    const branch = deployMatch[2];
    return {
      canonicalKey: `deploy:${job.toLowerCase()}`,
      displayLabel: branch ? `部署 ${job}（${branch}）` : `部署 ${job}`,
      source: 'chat',
      route,
      meta: { job, branch },
    };
  }

  const mergeMatch = normalized.match(/^合并\s*([a-z0-9_-]+)$/i);
  if (mergeMatch) {
    const repo = mergeMatch[1].toLowerCase();
    return {
      canonicalKey: `merge:${repo}`,
      displayLabel: `合并 ${repo}`,
      source: 'chat',
      route,
      meta: { repo },
    };
  }

  const startMatch = normalized.match(/^启动\s*([a-z0-9_-]+)$/i);
  if (startMatch) {
    const taskKey = startMatch[1].toLowerCase();
    return {
      canonicalKey: `workflow:step:${taskKey}`,
      displayLabel: `启动 ${taskKey}`,
      source: 'chat',
      route,
      meta: { taskKey },
    };
  }

  return {
    canonicalKey: normalized ? hashNormalizedKey(normalized) : 'chat:empty',
    displayLabel,
    source: 'chat',
    route,
  };
}

export function buildWorkflowEmbeddedStat(workflowName: string, route: string): CommandStatEventInput {
  const name = workflowName.trim() || 'start-work';
  return {
    canonicalKey: `workflow:embedded:${name}`,
    displayLabel: `工作流 ${name}（内嵌）`,
    source: 'workflow',
    route,
    meta: { workflowName: name },
  };
}

export function buildWorkflowStepStat(
  workflowName: string,
  taskKey: string | undefined,
  stepIndex: number | undefined,
  route: string
): CommandStatEventInput {
  const name = workflowName.trim() || 'start-work';
  const key = taskKey?.trim() || (typeof stepIndex === 'number' ? `step-${stepIndex}` : 'unknown');
  return {
    canonicalKey: `workflow:step:${name}:${key}`,
    displayLabel: `工作流步骤 ${key}`,
    source: 'workflow',
    route,
    meta: { workflowName: name, taskKey: key },
  };
}

export function buildDeployStat(jobKey: string, branch: string | undefined, route: string): CommandStatEventInput {
  const job = jobKey.trim().toLowerCase() || 'unknown';
  const displayLabel = branch?.trim() ? `部署 ${job}（${branch.trim()}）` : `部署 ${job}`;
  return {
    canonicalKey: `deploy:${job}`,
    displayLabel,
    source: 'deploy',
    route,
    meta: { job, branch },
  };
}

export function buildDeployNovaPretestStat(route: string): CommandStatEventInput {
  return {
    canonicalKey: 'deploy:nova-pretest',
    displayLabel: '部署 nova 集测',
    source: 'deploy',
    route,
    meta: { job: 'nova-pretest' },
  };
}

export function buildMergeStat(repo: string, route: string): CommandStatEventInput {
  const r = repo.trim().toLowerCase() || 'unknown';
  return {
    canonicalKey: `merge:${r}`,
    displayLabel: `合并 ${r}`,
    source: 'merge',
    route,
    meta: { repo: r },
  };
}

export function buildOpenUrlStat(route: string): CommandStatEventInput {
  return {
    canonicalKey: 'browser:open-url',
    displayLabel: '打开链接',
    source: 'browser',
    route,
  };
}

export function buildKnowledgeImportStat(route: string): CommandStatEventInput {
  return {
    canonicalKey: 'knowledge:import',
    displayLabel: '导入私人知识库',
    source: 'knowledge',
    route,
  };
}
