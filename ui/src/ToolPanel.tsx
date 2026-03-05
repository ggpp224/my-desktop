/* AI 生成 By Peng.Guo */
const TOOLS = [
  { name: 'run_shell', desc: '执行 shell 命令' },
  { name: 'open_browser', desc: '打开浏览器 URL' },
  { name: 'deploy_jenkins', desc: '触发 Jenkins 部署' },
  { name: 'run_workflow', desc: '执行预定义工作流' },
];

export function ToolPanel() {
  return (
    <section style={{ padding: 16, flex: 1 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Tools</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {TOOLS.map((t) => (
          <li key={t.name} style={{ marginBottom: 8, fontSize: 13, color: '#aaa' }}>
            <strong style={{ color: '#eaeaea' }}>{t.name}</strong> — {t.desc}
          </li>
        ))}
      </ul>
    </section>
  );
}
