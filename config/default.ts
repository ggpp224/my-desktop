/* AI 生成 By Peng.Guo */
export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'qwen2.5',
  },
  server: {
    port: Number(process.env.PORT) || 3000,
  },
  jenkins: {
    baseUrl: process.env.JENKINS_BASE_URL || '',
    token: process.env.JENKINS_TOKEN || '',
  },
  shell: {
    allowedCwd: process.env.SHELL_CWD || process.cwd(),
  },
};
