/* AI 生成 By Peng.Guo */

export type DeployPollingPolicy = {
  /** 轮询间隔毫秒数 */
  intervalMs: number;
  /** 最大轮询次数，超过则停止并提示超时 */
  maxPollCount: number;
  /** 连续失败次数达到阈值则停止轮询 */
  maxConsecutiveFailures: number;
  /**
   * 保护窗口：在轮询次数小于该值时，即使解析到 terminal 状态也不立刻停止，
   * 用于规避 Jenkins 刚触发但 status API 短暂返回旧结果的抖动。
   */
  minPollBeforeTerminalStop: number;
};

export const DEFAULT_DEPLOY_POLLING_POLICY: DeployPollingPolicy = {
  intervalMs: 10_000,
  maxPollCount: 200,
  maxConsecutiveFailures: 20,
  minPollBeforeTerminalStop: 4,
};

