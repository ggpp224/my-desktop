/* AI 生成 By Peng.Guo */
/**
 * Domain Entry 领域类型
 * - 按「业务环境」(contextEnv: test/inte/…) 管理各自的 MF 入口覆盖
 * - 每域可选入口来源：跟随本环境 / 本地端口 / 其它 CDN 环境 / 自定义 URL
 * - 落到浏览器仍写 domain-debug-helper-ccweb（页面 domainEntry.js 契约；key 名历史遗留）
 */

/** 业务环境 / CDN 环境标签 */
export type MfEnvId =
  | 'local'
  | 'dev'
  | 'pre-test'
  | 'test'
  | 'test2'
  | 'inte'
  | 'inte2'
  | 'moni'
  | 'moni2'
  | 'hotfix'
  | 'prod'
  | 'prod2'
  | (string & {});

/** 单域入口来源 */
export type MfSourceKind = 'follow' | 'local' | 'cdn' | 'url';

/**
 * 单域入口来源定义
 * - follow: 不覆盖，使用页面默认（业务环境 CDN）
 * - local: value 为端口号；空则用 bindings.defaultPort
 * - cdn: value 为 CDN 环境名（如 inte / test）
 * - url: value 为完整 remoteEntry URL
 */
export interface IDomainMfSource {
  kind: MfSourceKind;
  value?: string;
}

/** 某一业务环境下的 MF 覆盖方案 */
export interface IContextDomainEntryProfile {
  contextEnv: MfEnvId;
  /**
   * 是否有覆盖生效（由 sources 推导：存在非 follow 即为 true）。
   * 保留字段以兼容桥接契约；UI 不再提供手动勾选。
   */
  enable: boolean;
  /** domain → 来源；未列出的域视为 follow */
  sources: Record<string, IDomainMfSource>;
  /** 打印日志：写入页面 LS.logEnable，供 rewriteConsole 读取 */
  logEnable?: boolean;
  /**
   * 是否启用桌面→页面桥接写入（默认 true）。
   * false 时桥接仍可心跳/收配置，但不改 domain-debug-helper 等，便于只使用 cc-helper。
   */
  bridgeEnable?: boolean;
  /**
   * 安装 ccweb-helper（外部开关）：
   * 桥接写 LS `ccweb-helper-enable` 为 'true'|'false'（键存在=外部管控）。
   * 未写过该键：installCCWebHelper.ts 完全保持原逻辑。
   */
  installCCWebHelper?: boolean;
  /**
   * 本地 node：EnableCjetProxy → 页面 sw → https://{proxyIp}:8888 → cpxy → localhost:{proxyPort}。
   * Network 可见；需本机 `cpxy`。与 MF domainEntry 无关。
   */
  isCjetProxy?: boolean;
  /** cjet-proxy / SW 使用的 IP，默认 127.0.0.1 */
  proxyIp?: string;
  /** 本地 node 端口（cpxy 目标），默认 7001 */
  proxyPort?: number;
  updatedAt: string;
}

/** 多业务环境总存储 */
export interface IDomainEntryStore {
  version: 2;
  profiles: Record<string, IContextDomainEntryProfile>;
}

/** 编译后的单域覆盖（写入 localStorage domainEntry） */
export interface IDomainEntryOverride {
  domain: string;
  remoteEntryUrl: string;
  source: MfSourceKind;
}

/**
 * 页面 domainEntry.js / 桥接读写的 localStorage 契约
 */
export interface IDomainEntryPageConfig {
  enable: boolean;
  /** 业务环境标签，便于对照 */
  current: string;
  domainEntry: Record<string, string>;
  logEnable?: boolean;
  vConsoleEnable?: boolean;
  remoteDebug?: boolean;
  /** 默认 true；false 时桥接不写入页面 domain-debug */
  bridgeEnable?: boolean;
  /** 对应独立 LS ccweb-helper-enable */
  installCCWebHelper?: boolean;
  isCjetProxy?: boolean;
  proxyIp?: string;
  proxyPort?: number;
  /** 桌面→页面实时同步：允许桥接在 enable=false 时清空页面配置 */
  syncClear?: boolean;
  /** 配置修订时间，桥接用来判断是否需要应用 */
  updatedAt?: string;
}

/** @deprecated 兼容旧单 profile；迁移后不再作为主模型 */
export interface IDomainEntryProfile {
  id: string;
  name: string;
  env: MfEnvId;
  enable: boolean;
  overrides: Array<{ domain: string; remoteEntryUrl: string; source?: string }>;
  openUrl?: string;
  updatedAt: string;
}

export interface ICompileDomainEntryParams {
  env: MfEnvId;
  baseEntries?: Record<string, string>;
  cdnHost?: string;
}

export interface IResolveEntryInputParams {
  domain: string;
  raw: string;
  baseUrl?: string;
}
