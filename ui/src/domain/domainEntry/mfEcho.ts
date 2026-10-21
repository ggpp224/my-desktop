/* AI 生成 By Peng.Guo */
/**
 * MF 行高亮与列表回显对齐：有本地覆盖 → local；否则 → 当前业务环境。
 * 与页面契约 current 语义一致（有 localhost 覆盖时 current=local）。
 */
import type { IDomainMfSource, MfEnvId } from './models';

/** 任意自定义覆盖（含非 localhost 的 url / 显式 cdn）；勾选「覆盖」用这个，不要用 localhost 判定 */
export function isOverrideMfSource(source: IDomainMfSource | undefined): boolean {
  return Boolean(source && source.kind && source.kind !== 'follow');
}

/** 本地勾选：仅 localhost / 端口覆盖 */
export function isLocalhostMfSource(source: IDomainMfSource | undefined): boolean {
  if (!source) return false;
  if (source.kind === 'local') return true;
  if (source.kind === 'url' && source.value) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(source.value);
  }
  return false;
}

/** @deprecated 用 isLocalhostMfSource；保留给 MF 高亮（有 url 覆盖也算离开纯 CDN） */
export function isLocalMfSource(source: IDomainMfSource | undefined): boolean {
  return source?.kind === 'local' || source?.kind === 'url' || isLocalhostMfSource(source);
}

/** 由 sources + 业务环境推导 MF 行应高亮的按钮 */
export function inferMfHighlight(
  sources: Record<string, IDomainMfSource> | undefined,
  contextEnv: MfEnvId
): string {
  const list = Object.values(sources || {});
  // 有任一 localhost，或 current 语义下的本地壳覆盖 → local
  if (list.some(isLocalhostMfSource)) return 'local';
  if (list.some((s) => s?.kind === 'local' || s?.kind === 'url')) return 'local';
  return contextEnv === 'local' ? 'inte' : contextEnv;
}
