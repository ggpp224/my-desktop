/* AI 生成 By Peng.Guo */
/**
 * 1.0 前置：验证 Ollama + Qwen2.5 是否支持 tool/function calling 及返回格式。
 * 运行前请确保已安装并启动 Ollama，且已拉取模型：ollama pull qwen2.5
 * 运行：node scripts/verify-ollama-tools.js
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5';

const tools = [
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Execute a shell command on the local machine',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', description: 'The shell command to run' },
        },
      },
    },
  },
];

async function checkOllamaHealth() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!res.ok) throw new Error(`Ollama not reachable: ${res.status}`);
  const data = await res.json();
  const hasModel = data.models?.some((m) => (m.name || '').startsWith(MODEL));
  if (!hasModel) console.warn(`Warning: model "${MODEL}" may not be installed. Run: ollama pull ${MODEL}`);
  return true;
}

async function verifyToolCalling() {
  console.log('Checking Ollama health...');
  await checkOllamaHealth();
  console.log('Sending chat request with tools...');
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [{ role: 'user', content: 'Run the command: echo hello' }],
      tools,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const msg = data.message || {};
  const toolCalls = msg.tool_calls;
  if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    const call = toolCalls[0];
    const name = call.function?.name ?? call.name;
    const args = call.function?.arguments ?? call.arguments;
    console.log('OK: Ollama returned structured tool_calls.');
    console.log('  tool:', name, 'arguments:', typeof args === 'object' ? JSON.stringify(args) : args);
    return { supported: true, format: 'tool_calls' };
  }
  if (msg.content && typeof msg.content === 'string') {
    console.log('Fallback: Model returned text (no tool_calls). Consider intent parsing fallback.');
    console.log('  content:', msg.content.slice(0, 200));
    return { supported: false, format: 'text', content: msg.content };
  }
  console.log('Unexpected response shape:', JSON.stringify(msg).slice(0, 300));
  return { supported: false, format: 'unknown' };
}

verifyToolCalling()
  .then((r) => {
    console.log('\nResult:', r);
    process.exit(r.supported ? 0 : 1);
  })
  .catch((err) => {
    console.error('Verification failed:', err.message);
    if (err.message === 'fetch failed' || err.cause?.code === 'ECONNREFUSED') {
      console.error('\n可能原因：Ollama 未启动或地址不正确。');
      console.error('请尝试：');
      console.error('  1. 启动 Ollama：ollama serve  或  ollama run qwen2.5');
      console.error('  2. 若 Ollama 在其他机器/端口，设置环境变量：OLLAMA_BASE=http://<host>:<port>');
    }
    process.exit(1);
  });
