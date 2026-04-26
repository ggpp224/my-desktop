/* AI 生成 By Peng.Guo */
export type HelpSection =
  | '快速开始'
  | '工作流'
  | '终端'
  | '浏览器 / Wiki'
  | '部署'
  | '合并'
  | 'Jira'
  | 'Cursor'
  | 'IDE 打开'
  | 'IDE 关闭'
  | '知识库'
  | '其他';

export interface HelpCommandItem {
  section: HelpSection;
  command: string;
  description: string;
}

export interface HelpCodebook {
  projectCodes: string[];
  ideAliases: string[];
}
