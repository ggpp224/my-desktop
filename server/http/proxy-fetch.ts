/* AI 生成 By Peng.Guo */
/**
 * 出站 HTTP fetch：复用 Gemini 同款代理策略（HTTP/SOCKS/macOS 系统 SOCKS）。
 */
import { execFileSync } from 'node:child_process';
import { socksDispatcher } from 'fetch-socks';
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici';
import type { Dispatcher } from 'undici';

let sharedDispatcher: Dispatcher | undefined;

function socksEndpointFromUrl(raw: string): { type: 4 | 5; host: string; port: number } | null {
  const u = raw.trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const protocol = parsed.protocol.replace(':', '').toLowerCase();
    const isSocks4 = protocol === 'socks4' || protocol === 'socks4a';
    const isSocks5 = protocol === 'socks5' || protocol === 'socks5h' || protocol === 'socks';
    if (!isSocks4 && !isSocks5) return null;
    const host = parsed.hostname;
    if (!host) return null;
    const port = parsed.port ? Number(parsed.port) : 1080;
    if (!Number.isFinite(port) || port <= 0) return null;
    return { type: isSocks4 ? 4 : 5, host, port };
  } catch {
    return null;
  }
}

function readMacSystemSocksEndpoint(): { type: 5; host: string; port: number } | null {
  if (process.platform !== 'darwin') return null;
  if (process.env.GEMINI_USE_MAC_SYSTEM_SOCKS === '0') return null;
  try {
    const out = execFileSync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 3000 });
    if (!/(?:^|\n)\s*SOCKSEnable\s*:\s*1\s*(?:\n|$)/m.test(out)) return null;
    const portM = out.match(/(?:^|\n)\s*SOCKSPort\s*:\s*(\d+)/);
    const hostM = out.match(/(?:^|\n)\s*SOCKSProxy\s*:\s*(\S+)/);
    const host = hostM?.[1]?.trim();
    const port = portM ? Number(portM[1]) : 1080;
    if (!host || !Number.isFinite(port)) return null;
    return { type: 5, host, port };
  } catch {
    return null;
  }
}

function getSharedDispatcher(): Dispatcher {
  if (sharedDispatcher) return sharedDispatcher;

  const candidates = [
    process.env.GEMINI_SOCKS_URL,
    process.env.ALL_PROXY,
    process.env.HTTPS_PROXY,
    process.env.HTTP_PROXY,
  ]
    .map((x) => (x ?? '').trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const socksEp = socksEndpointFromUrl(raw);
    if (socksEp) {
      sharedDispatcher = socksDispatcher(socksEp) as unknown as Dispatcher;
      return sharedDispatcher;
    }
    if (/^https?:\/\//i.test(raw)) {
      sharedDispatcher = new ProxyAgent(raw);
      return sharedDispatcher;
    }
  }

  const macSocks = readMacSystemSocksEndpoint();
  if (macSocks) {
    sharedDispatcher = socksDispatcher(macSocks) as unknown as Dispatcher;
    return sharedDispatcher;
  }

  sharedDispatcher = new Agent({ connectTimeout: 30_000, headersTimeout: 60_000 });
  return sharedDispatcher;
}

export async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  const dispatcher = getSharedDispatcher();
  return undiciFetch(url, { ...init, dispatcher } as Parameters<typeof undiciFetch>[1]) as unknown as Response;
}
