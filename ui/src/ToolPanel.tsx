/* AI 生成 By Peng.Guo */
const TOOLS = [
  { name: 'run_shell', desc: '执行 shell 命令' },
  { name: 'open_browser', desc: '打开浏览器 URL' },
  { name: 'deploy_jenkins', desc: '触发 Jenkins 部署' },
  { name: 'run_workflow', desc: '执行预定义工作流' },
  { name: 'open_in_ide', desc: '用 IDE 打开项目（如 ws打开base、cursor打开scm）' },
  { name: 'close_ide_project', desc: '关闭 IDE 中已打开的项目窗口（如 关闭ws的nova、关闭cursor的base）' },
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
