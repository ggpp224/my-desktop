// AI 生成 By Peng.Guo
import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Agent, Cursor } from "@cursor/sdk";

const execFileAsync = promisify(execFile);
const MAX_DIFF_CHARS = 120_000;

type ReviewContext = {
  baseBranch: string;
  modelId: string;
  diff: string;
};

type CliOptions = {
  baseBranch?: string;
  modelId?: string;
};

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--base") {
      options.baseBranch = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (current === "--model") {
      options.modelId = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
  }
  return options;
}

function getApiKey(): string {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 CURSOR_API_KEY，请先在环境变量或 .env 中配置。");
  }
  return apiKey;
}

function resolveBaseBranch(cliBaseBranch?: string): string {
  return cliBaseBranch || process.env.CURSOR_SDK_REVIEW_BASE?.trim() || "main";
}

function resolveModelId(cliModelId?: string): string {
  return cliModelId || process.env.CURSOR_SDK_REVIEW_MODEL?.trim() || process.env.CURSOR_SDK_MODEL?.trim() || "default";
}

async function validateModel(apiKey: string, modelId: string): Promise<void> {
  const models = await Cursor.models.list({ apiKey });
  const availableModelIds = new Set(models.map((model) => model.id));
  if (!availableModelIds.has(modelId)) {
    throw new Error(
      `模型不可用: ${modelId}。可用模型: ${models.map((model) => model.id).join(", ")}`
    );
  }
}

async function runGitDiff(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

async function getDiff(baseBranch: string): Promise<string> {
  const committedDiff = await runGitDiff(["diff", `${baseBranch}...HEAD`]);
  const stagedDiff = await runGitDiff(["diff", "--cached"]);
  const unstagedDiff = await runGitDiff(["diff"]);

  const sections: string[] = [];
  if (committedDiff) {
    sections.push(`### COMMITTED_DIFF (${baseBranch}...HEAD)\n${committedDiff}`);
  }
  if (stagedDiff) {
    sections.push(`### STAGED_DIFF\n${stagedDiff}`);
  }
  if (unstagedDiff) {
    sections.push(`### UNSTAGED_DIFF\n${unstagedDiff}`);
  }

  return sections.join("\n\n");
}

function buildReviewPrompt(context: ReviewContext): string {
  const diffContent =
    context.diff.length > MAX_DIFF_CHARS
      ? `${context.diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff 已截断，避免超长输入]`
      : context.diff;

  return [
    "请你作为资深 TypeScript/Node 架构评审，审查以下 git diff。",
    "要求：",
    "1) 只输出真正的问题，不要泛泛建议。",
    "2) 按严重级别输出：High / Medium / Low。",
    "3) 每条问题都包含：影响、原因、建议修复方式。",
    "4) 明确列出测试缺口（Test Gap）。",
    "5) 用中文输出，格式简洁。",
    `基线分支: ${context.baseBranch}`,
    "",
    "=== BEGIN DIFF ===",
    diffContent,
    "=== END DIFF ===",
  ].join("\n");
}

function buildReportFilePath(): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  return path.join(process.cwd(), "runtime", `sdk-pr-review-${timestamp}.md`);
}

async function writeReport(
  reportPath: string,
  reviewText: string,
  context: { baseBranch: string; modelId: string; runId: string; durationMs: number | undefined }
): Promise<void> {
  const directory = path.dirname(reportPath);
  await mkdir(directory, { recursive: true });
  const content = [
    "<!-- AI 生成 By Peng.Guo -->",
    "# SDK PR Review Report",
    "",
    `- baseBranch: ${context.baseBranch}`,
    `- model: ${context.modelId}`,
    `- runId: ${context.runId}`,
    `- durationMs: ${context.durationMs ?? "unknown"}`,
    "",
    "## Review",
    "",
    reviewText,
    "",
  ].join("\n");
  await writeFile(reportPath, content, "utf8");
}

async function main(): Promise<void> {
  const cliOptions = parseCliOptions(process.argv.slice(2));
  const apiKey = getApiKey();
  const baseBranch = resolveBaseBranch(cliOptions.baseBranch);
  const modelId = resolveModelId(cliOptions.modelId);
  await validateModel(apiKey, modelId);

  const diff = await getDiff(baseBranch);
  if (!diff) {
    console.log("没有检测到相对基线分支的差异，无需执行 PR 审查。");
    return;
  }

  await using agent = await Agent.create({
    apiKey,
    model: { id: modelId },
    local: { cwd: process.cwd() },
    name: "sdk-pr-review",
  });

  const prompt = buildReviewPrompt({ baseBranch, modelId, diff });
  const run = await agent.send(prompt);
  const result = await run.wait();

  if (result.status !== "finished") {
    throw new Error(`SDK 运行未成功结束，状态: ${result.status}`);
  }

  console.log("=== Cursor SDK PR Review ===");
  console.log(`agentId: ${agent.agentId}`);
  console.log(`runId: ${result.id}`);
  console.log(`status: ${result.status}`);
  console.log(`model: ${modelId}`);
  console.log(`baseBranch: ${baseBranch}`);
  console.log(`durationMs: ${result.durationMs ?? "unknown"}`);
  console.log("--- review ---");
  const reviewText = result.result ?? "(empty)";
  console.log(reviewText);

  const reportPath = buildReportFilePath();
  await writeReport(reportPath, reviewText, {
    baseBranch,
    modelId,
    runId: result.id,
    durationMs: result.durationMs,
  });
  console.log("--- report ---");
  console.log(reportPath);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[sdk:pr-review] 失败：", message);
  process.exitCode = 1;
});
