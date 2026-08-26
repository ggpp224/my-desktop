/* AI 生成 By Peng.Guo */
import { randomUUID } from 'node:crypto';

export type RemoteCommandPayload = {
  id: string;
  message: string;
  at: number;
};

type Subscriber = (payload: RemoteCommandPayload) => void;

const pending: RemoteCommandPayload[] = [];
const subscribers = new Set<Subscriber>();

export function enqueueRemoteCommand(message: string): {
  payload: RemoteCommandPayload;
  subscriberCount: number;
  queued: boolean;
} {
  const payload: RemoteCommandPayload = {
    id: randomUUID(),
    message: message.trim(),
    at: Date.now(),
  };
  const subscriberCount = subscribers.size;
  if (subscriberCount === 0) {
    pending.push(payload);
  } else {
    for (const notify of subscribers) notify(payload);
  }
  return { payload, subscriberCount, queued: subscriberCount === 0 };
}

export function subscribeRemoteCommands(onEvent: Subscriber): () => void {
  subscribers.add(onEvent);
  const drained = pending.splice(0);
  for (const item of drained) onEvent(item);
  return () => {
    subscribers.delete(onEvent);
  };
}

export function getRemoteCommandSubscriberCount(): number {
  return subscribers.size;
}

/** 仅供测试 */
export function resetRemoteCommandHubForTests(): void {
  pending.length = 0;
  subscribers.clear();
}
