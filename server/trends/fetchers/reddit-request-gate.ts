/* AI 生成 By Peng.Guo */
/**
 * 全局 Reddit 请求闸门：串行化所有 Reddit HTTP 调用，避免多周期/多版块并发触发 429。
 */
import { config } from '../../../config/default.js';

let tail: Promise<unknown> = Promise.resolve();
let cooldownUntilMs = 0;
let lastRequestEndAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function markRedditRateLimited(retryAfterSec?: number): void {
  const waitMs =
    Number.isFinite(retryAfterSec) && retryAfterSec! > 0
      ? Math.min(120_000, retryAfterSec! * 1000)
      : config.techDigest.reddit429CooldownMs;
  cooldownUntilMs = Math.max(cooldownUntilMs, Date.now() + waitMs);
}

export function scheduleRedditFetch<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    const now = Date.now();
    const cooldownWait = Math.max(0, cooldownUntilMs - now);
    const gapWait = Math.max(0, lastRequestEndAt + config.techDigest.redditRequestGapMs - now);
    const wait = Math.max(cooldownWait, gapWait);
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastRequestEndAt = Date.now();
    }
  });
  tail = run.catch(() => {});
  return run;
}

/** 单次刷新结束后重置，避免冷却状态泄漏到下次刷新 */
export function resetRedditRequestGate(): void {
  tail = Promise.resolve();
  cooldownUntilMs = 0;
  lastRequestEndAt = 0;
}
