/* AI 生成 By Peng.Guo */
import './load-env.js';
import { listCommands } from './execute-command.js';
import { dispatchToControlCenter } from './dispatch-to-control-center.js';

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const message = process.argv.slice(2).join(' ').trim();
  if (!message) {
    printJson({ ok: false, code: 'usage', commands: listCommands() });
    process.exit(1);
  }

  const result = await dispatchToControlCenter(message);
  if (result.ok) {
    printJson({
      ...result,
      hint:
        result.code === 'dispatched'
          ? '已投递到 Dev Center，请在中控聊天区查看实时进度与指令统计。'
          : '中控窗口未连接，口令已排队；打开 Dev Center 后会自动执行。',
    });
    process.exit(0);
  }
  printJson(result);
  process.exit(2);
}

main().catch((err) => {
  printJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
