// AI 生成 By Peng.Guo
import "dotenv/config";
import { Agent, Cursor } from "@cursor/sdk";

function getApiKey(): string {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 CURSOR_API_KEY，请先在环境变量或 .env 中配置。");
  }
  return apiKey;
}

async function main(): Promise<void> {
  const apiKey = getApiKey();
  const cwd = process.cwd();
  const preferredModel = process.env.CURSOR_SDK_MODEL?.trim() || "default";

  const models = await Cursor.models.list({ apiKey });
  const availableModelIds = new Set(models.map((model) => model.id));
  if (!availableModelIds.has(preferredModel)) {
    throw new Error(
      `模型不可用: ${preferredModel}。可用模型: ${models
        .map((model) => model.id)
        .join(", ")}`
    );
  }

  await using agent = await Agent.create({
    apiKey,
    model: { id: preferredModel },
    local: { cwd },
    name: "sdk-health-check",
  });

  const run = await agent.send(
    "请用中文用不超过120字总结当前仓库是做什么的，并指出一个你认为最有价值的能力。"
  );
  const result = await run.wait();

  if (result.status !== "finished") {
    throw new Error(`SDK 运行未成功结束，状态: ${result.status}`);
  }

  console.log("=== Cursor SDK Health Check ===");
  console.log(`agentId: ${agent.agentId}`);
  console.log(`runId: ${result.id}`);
  console.log(`status: ${result.status}`);
  console.log(`model: ${preferredModel}`);
  console.log(`durationMs: ${result.durationMs ?? "unknown"}`);
  console.log("--- result ---");
  console.log(result.result ?? "(empty)");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[sdk:health] 失败：", message);
  process.exitCode = 1;
});
