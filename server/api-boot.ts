/* AI 生成 By Peng.Guo */
import { randomUUID } from 'node:crypto';

let apiBootId = randomUUID();

export function getApiBootId(): string {
  return apiBootId;
}

/** API HTTP 服务每次成功 listen 后轮换，供前端检测子进程重启并丢弃内存会话 */
export function rotateApiBootId(): string {
  apiBootId = randomUUID();
  return apiBootId;
}
