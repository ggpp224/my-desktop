/* AI 生成 By Peng.Guo */
import type { AppThemeTokens } from './domain/theme/appTheme';

type ToolItem = { name: string; desc: string };
type ToolGroup = { title: string; tools: ToolItem[] };

const TOOL_GROUPS: ToolGroup[] = [
  {
    title: '工作流 / 项目操作',
    tools: [
      { name: 'run_workflow', desc: '执行工作流（如：开始工作、执行 start-work）' },
      { name: 'run_workflow_step', desc: '执行工作流单步（如：启动 cpxy、启动 react18、启动 scm）' },
      { name: 'open_terminal', desc: '在「我的工作」打开终端页签（如：终端打开 react18）' },
      { name: 'deploy_jenkins', desc: '触发 Jenkins 部署（如：部署 nova、部署 base）' },
      { name: 'merge_repo', desc: '合并代码到测试分支（如：合并 nova、合并 scm）' },
      { name: 'open_in_ide', desc: '用 IDE 打开项目（如：ws打开base、cursor打开scm）' },
      { name: 'close_ide_project', desc: '关闭 IDE 项目窗口（如：关闭ws的nova、关闭cursor的base）' },
    ],
  },
  {
    title: '浏览器 / 环境 / Jenkins',
    tools: [
      { name: 'open_browser', desc: '打开浏览器 URL（如：打开 Jenkins）' },
      { name: 'open_jenkins_job', desc: '打开项目 Jenkins 任务页（如：打开jenkins nova）' },
      { name: 'open_jice_env', desc: '打开集测环境（如：打开集测环境）' },
      { name: 'open_test_env', desc: '打开测试环境（如：打开测试环境）' },
      { name: 'open_json_config_center', desc: '打开 json 配置中心（如：打开json配置中心）' },
    ],
  },
  {
    title: 'Jira / 周报',
    tools: [
      { name: 'search_my_bugs', desc: '查询 Jira 我的 bug（如：我的bug）' },
      { name: 'search_online_bugs', desc: '查询 Jira 线上 bug（如：线上bug）' },
      { name: 'search_weekly_done_tasks', desc: '查询 Jira 本周已完成任务（如：本周已完成任务）' },
      { name: 'search_weekly_handoff_bugs', desc: '查询本周经我手但已转交的 bug（如：本周经我手的bug）' },
      { name: 'open_weekly_report', desc: '定位并打开 wiki 周报（如：周报）' },
      { name: 'fetch_weekly_report_info', desc: '抓取 wiki 当前周报页正文（如：抓取周报信息）' },
      { name: 'write_weekly_report', desc: '基于 Jira 数据生成周报（如：写周报）' },
      { name: 'generate_weekly_team_summary', desc: '从 wiki 周报页 HTML 生成组内总结（如：本周组内总结）' },
    ],
  },
  {
    title: '知识库',
    tools: [
      { name: 'open_knowledge_base_manager', desc: '打开私人知识库管理页（如：添加私人知识库）' },
      { name: 'list_knowledge_docs', desc: '列出知识库文档（如：知识库有哪些文档）' },
      { name: 'query_knowledge_base', desc: '查询知识库内容（如：文档里如何配置）' },
      { name: 'incremental_rebuild_knowledge_base_index', desc: '增量重建索引（如：增量重建知识库索引）' },
      { name: 'rebuild_knowledge_base_index', desc: '全量重建索引（如：重建知识库索引）' },
      { name: 'clear_private_knowledge_base', desc: '清空私人知识库（如：清除私人知识库）' },
    ],
  },
  {
    title: 'Cursor / 其他',
    tools: [
      { name: 'get_cursor_usage', desc: '查询 Cursor 聚合用量（如：cursor用量）' },
      { name: 'get_cursor_today_usage', desc: '查询 Cursor 今日用量（如：cursor今日用量）' },
      { name: 'sync_cursor_cookie', desc: '同步 Cursor 登录态（如：同步cursor登录态）' },
      { name: 'run_shell', desc: '执行 shell 命令（如：执行 pnpm -v）' },
    ],
  },
];

type ToolPanelProps = {
  themeTokens: AppThemeTokens;
};

export function ToolPanel({ themeTokens }: ToolPanelProps) {
  return (
    <section style={{ padding: 16, flex: 1, overflow: 'auto' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, color: themeTokens.textSecondary }}>Tools</h3>
      {TOOL_GROUPS.map((group, groupIndex) => (
        <div key={group.title} style={{ marginBottom: groupIndex === TOOL_GROUPS.length - 1 ? 0 : 12 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: themeTokens.textSecondary,
              marginBottom: 6,
            }}
          >
            {group.title}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {group.tools.map((t) => (
              <li key={t.name} style={{ marginBottom: 8, fontSize: 13, color: themeTokens.textSecondary }}>
                <strong style={{ color: themeTokens.textPrimary }}>{t.name}</strong> — {t.desc}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
