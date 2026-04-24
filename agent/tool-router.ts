/* AI 生成 By Peng.Guo */
/** 集测环境（好业财）固定 URL */
const JICE_ENV_URL =
  'https://inte-cloud.chanjet.com/cc/uhwr78vnst8x/3axr8fvxct/index.html?autoLogin=true&accountNumber=15911200000#/home?pageId=home&pageParams=%7B%22activeFromTab%22%3Atrue%2C%22traceRoute%22%3Afalse%7D&tabId=home&_k=58boge';
/** 测试环境（好业财）固定 URL */
const TEST_ENV_URL =
  'https://test-cloud.chanjet.com/cc/ue255vjnqnwa/urp6o0wpbf/index.html?autoLogin=true&accountNumber=15911200000#/home?pageId=home&pageParams=%7B%22activeFromTab%22%3Atrue%2C%22jumpPageOptions%22%3A%7B%7D%2C%22traceRoute%22%3Afalse%7D&tabId=home&_k=2zf335';
/** json 配置中心（前端配置管理）固定 URL */
const JSON_CONFIG_CENTER_URL = 'https://inte-feconfig.chanjet.com.cn/#/project/projectList';

import { config } from '../config/default.js';
import { getJenkinsPreset } from '../config/jenkins-presets.js';
import { existsSync, statSync } from 'fs';
import { getProjectByCode, getProjectPath } from '../config/projects.js';
import { run as shellRun } from '../tools/shell-tool.js';
import { open as browserOpen } from '../tools/browser-tool.js';
import { deploy as jenkinsDeploy } from '../tools/jenkins-tool.js';
import { runWorkflow, runWorkflowStep } from '../tools/workflow-tool.js';
import { openEmbeddedTerminalWorkspace, startEmbeddedWorkflow } from '../tools/workflow-embedded-service.js';
import { mergeNova, mergeBizSolution, mergeScm } from '../tools/merge-tool.js';
import { openInIde } from '../tools/open-ide-tool.js';
import { closeIdeProject } from '../tools/close-ide-tool.js';
import { searchMyBugs, searchOnlineBugs, searchWeeklyDoneTasks, searchWeeklyHandoffBugs } from '../tools/jira-tool.js';
import { getCursorTodayUsage, getCursorUsage } from '../tools/cursor-usage-tool.js';
import { syncCursorCookieFromChrome } from '../tools/cursor-cookie-sync-tool.js';
import { fetchWeeklyReportPageInfo, openWeeklyReportPage } from '../tools/wiki-tool.js';
import { writeWeeklyReport } from '../tools/weekly-report-tool.js';
import { generateWeeklyTeamSummary } from '../tools/weekly-team-summary-tool.js';
import { queryKnowledgeBase, rebuildKnowledgeBaseIndex, listKnowledgeDocs } from './knowledge/knowledge-service.js';
import type { ToolCall } from './ollama-client.js';
import type { RouteExecuteContext } from './tool-progress.js';

async function withCursorAutoSync<T extends object>(executor: () => Promise<T>): Promise<T> {
  try {
    return await executor();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const needCookie =
      msg.includes('CURSOR_API_TOKEN') ||
      msg.includes('CURSOR_COOKIE') ||
      msg.includes('认证信息缺失');
    if (!needCookie) throw err;
    const syncResult = await syncCursorCookieFromChrome();
    const result = await executor();
    return { ...result, authSync: syncResult } as T;
  }
}

export async function routeAndExecute(call: ToolCall, ctx?: RouteExecuteContext): Promise<unknown> {
  const { name, arguments: args } = call;
  switch (name) {
    case 'open_knowledge_base_manager':
      return { openKnowledgeBaseManager: true };
    case 'query_knowledge_base': {
      const question = ((args?.question as string) ?? '').trim();
      if (!question) throw new Error('query_knowledge_base 缺少 question');
      // AI 生成 By Peng.Guo：传递当前模型给知识库查询
      return queryKnowledgeBase(question, ctx?.currentModel, {
        onProgress: (message) =>
          ctx?.onToolProgress?.({
            phase: 'progress',
            tool: 'query_knowledge_base',
            message,
          }),
        onAnswerDelta: (contentDelta) =>
          ctx?.onToolProgress?.({
            phase: 'stream_delta',
            tool: 'query_knowledge_base',
            contentDelta,
          }),
      });
    }
    case 'rebuild_knowledge_base_index':
      ctx?.onToolProgress?.({
        phase: 'progress',
        tool: 'rebuild_knowledge_base_index',
        message: '正在清理并重建知识库索引...',
      });
      // AI 生成 By Peng.Guo：传递进度回调
      return rebuildKnowledgeBaseIndex((message) => {
        ctx?.onToolProgress?.({
          phase: 'progress',
          tool: 'rebuild_knowledge_base_index',
          message,
        });
      });
    case 'list_knowledge_docs':
      ctx?.onToolProgress?.({
        phase: 'progress',
        tool: 'list_knowledge_docs',
        message: '正在扫描知识库文档...',
      });
      return listKnowledgeDocs();
    case 'run_shell':
      return shellRun((args?.command as string) ?? '', { requireConfirmation: false });
    case 'open_browser':
      return browserOpen((args?.url as string) ?? '');
    case 'open_jice_env':
      return browserOpen(JICE_ENV_URL);
    case 'open_test_env':
      return browserOpen(TEST_ENV_URL);
    case 'open_json_config_center':
      return browserOpen(JSON_CONFIG_CENTER_URL);
    case 'open_jenkins_job': {
      const jobKey = (args?.job as string) ?? '';
      const base = config.jenkins.baseUrl?.replace(/\/$/, '') ?? '';
      const preset = getJenkinsPreset(jobKey);
      const jobName = preset?.name;
      const url = jobName && base ? `${base}/job/${encodeURIComponent(jobName)}/` : base;
      return browserOpen(url || 'about:blank');
    }
    case 'deploy_jenkins': {
      ctx?.onToolProgress?.({
        phase: 'progress',
        tool: 'deploy_jenkins',
        message: '正在触发 Jenkins 部署…',
      });
      const job = (args?.job as string) ?? '';
      const branch = (args?.branch as string)?.trim();
      let preset = getJenkinsPreset(job);
      if (!preset) {
        const entry = getProjectByCode(job);
        if (entry?.jenkins) {
          const branchParam = (entry.jenkins.branchParam || 'BRANCH_NAME').trim() || 'BRANCH_NAME';
          preset = {
            name: entry.jenkins.jobName,
            branchParam,
            parameters: { [branchParam]: branch || entry.jenkins.defaultBranch },
          };
        }
      }
      if (preset) {
        const parameters: Record<string, string> = { ...(preset.parameters ?? {}) };
        if (branch) parameters[preset.branchParam || 'BRANCH_NAME'] = branch;
        const result = await jenkinsDeploy(preset.name, parameters);
        return { ...result, jobKey: job };
      }
      return jenkinsDeploy(job);
    }
    case 'run_workflow': {
      const workflowName = ((args?.name as string) ?? 'start-work').trim() || 'start-work';
      if (workflowName === 'start-work') {
        const embedded = await startEmbeddedWorkflow(workflowName);
        return { success: true, embedded: true, ...embedded };
      }
      return runWorkflow(workflowName);
    }
    case 'open_terminal': {
      const code = ((args?.code as string) ?? '').trim();
      if (code) {
        const dir = getProjectPath(code);
        if (!dir) throw new Error(`未知项目代号: ${code}，请使用 config/projects 中已配置的代号`);
        if (!existsSync(dir) || !statSync(dir).isDirectory()) {
          throw new Error(`项目目录不可用或未配置: ${code} → ${dir}`);
        }
        const embedded = openEmbeddedTerminalWorkspace({ cwd: dir, tabTitle: code });
        return { success: true, embedded: true, projectCode: code, ...embedded };
      }
      const embedded = openEmbeddedTerminalWorkspace();
      return { success: true, embedded: true, ...embedded };
    }
    case 'search_my_bugs': {
      const maxResults = Number(args?.maxResults ?? 100);
      return searchMyBugs(maxResults);
    }
    case 'search_online_bugs': {
      const maxResults = Number(args?.maxResults ?? 100);
      return searchOnlineBugs(maxResults);
    }
    case 'search_weekly_done_tasks': {
      const maxResults = Number(args?.maxResults ?? 100);
      return searchWeeklyDoneTasks(maxResults);
    }
    case 'search_weekly_handoff_bugs': {
      const maxResults = Number(args?.maxResults ?? 100);
      return searchWeeklyHandoffBugs(maxResults);
    }
    case 'get_cursor_usage': {
      return withCursorAutoSync(getCursorUsage);
    }
    case 'get_cursor_today_usage': {
      return withCursorAutoSync(getCursorTodayUsage);
    }
    case 'sync_cursor_cookie':
      return syncCursorCookieFromChrome();
    case 'open_weekly_report':
      return openWeeklyReportPage();
    case 'fetch_weekly_report_info':
      return fetchWeeklyReportPageInfo();
    case 'write_weekly_report': {
      const maxResults = Number(args?.maxResults ?? 100);
      return writeWeeklyReport(maxResults, {
        onProgress: (message) =>
          ctx?.onToolProgress?.({ phase: 'progress', tool: 'write_weekly_report', message }),
        onStreamDelta: (d) =>
          ctx?.onToolProgress?.({
            phase: 'stream_delta',
            tool: 'write_weekly_report',
            thinkingDelta: d.thinkingDelta,
            contentDelta: d.contentDelta,
          }),
      });
    }
    case 'generate_weekly_team_summary':
      return generateWeeklyTeamSummary({
        onProgress: (message) =>
          ctx?.onToolProgress?.({ phase: 'progress', tool: 'generate_weekly_team_summary', message }),
        onStreamDelta: (d) =>
          ctx?.onToolProgress?.({
            phase: 'stream_delta',
            tool: 'generate_weekly_team_summary',
            thinkingDelta: d.thinkingDelta,
            contentDelta: d.contentDelta,
          }),
      });
    case 'run_workflow_step': {
      const workflow = (args?.workflow as string) ?? 'start-work';
      const taskKey = (args?.taskKey as string) ?? '';
      return runWorkflowStep(workflow, { taskKey });
    }
    case 'merge_repo': {
      const repo = (args?.repo as string) ?? '';
      if (repo === 'nova') return mergeNova();
      if (repo === 'biz-solution') return mergeBizSolution();
      if (repo === 'scm') return mergeScm();
      throw new Error(`不支持的 merge_repo: ${repo}，应为 nova、biz-solution 或 scm`);
    }
    case 'open_in_ide': {
      const app = (args?.app as string) ?? '';
      const code = (args?.code as string) ?? '';
      return openInIde(app, code);
    }
    case 'close_ide_project': {
      const app = (args?.app as string) ?? '';
      const code = (args?.code as string) ?? '';
      return closeIdeProject(app, code);
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}
