/* AI 生成 By Peng.Guo */
/** 当前用户在评论中标记「已处理」的固定文案 */
export const SELF_PROCESSED_COMMENT_MARKER = '已处理';

export type JiraCommentAuthor = {
  name?: string;
  displayName?: string;
  key?: string;
};

export type JiraComment = {
  body?: string;
  author?: JiraCommentAuthor;
};

/**
 * 领域规则：issue 是否已被当前用户以评论「已处理」标记。
 * 判定：评论作者 login 名 = 当前 Jira 用户名，且正文包含标记文案。
 */
export class SelfProcessedCommentDetector {
  constructor(
    private readonly currentUsername: string,
    private readonly marker: string = SELF_PROCESSED_COMMENT_MARKER,
  ) {}

  isProcessed(comments: readonly JiraComment[]): boolean {
    const username = this.currentUsername.trim().toLowerCase();
    if (!username) return false;
    return comments.some((comment) => this.matchesSelfProcessed(comment, username));
  }

  private matchesSelfProcessed(comment: JiraComment, username: string): boolean {
    const authorName = (comment.author?.name ?? '').trim().toLowerCase();
    if (!authorName || authorName !== username) return false;
    return String(comment.body ?? '').includes(this.marker);
  }
}
