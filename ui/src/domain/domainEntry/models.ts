/* AI 生成 By Peng.Guo */

export type MfEnvId = string;

export type MfSourceKind = 'follow' | 'local' | 'cdn' | 'url';

export interface IDomainMfSource {
  kind: MfSourceKind;
  value?: string;
}

export interface IContextDomainEntryProfile {
  contextEnv: MfEnvId;
  /** 由 sources 推导：有非 follow 覆盖即为 true */
  enable: boolean;
  sources: Record<string, IDomainMfSource>;
  /** 打印日志 → 页面 LS.logEnable */
  logEnable?: boolean;
  /** 启用桥接写入页面（默认 true）；关闭后不受 my-desktop 影响，可只用 cc-helper */
  bridgeEnable?: boolean;
  /** 安装助手 → 外部开关 LS ccweb-helper-enable=true|false */
  installCCWebHelper?: boolean;
  /** 本地 node：SW→8888→cpxy→localhost:nodePort（Network 可见），不改写 MF */
  isCjetProxy?: boolean;
  /** cjet-proxy IP，默认 127.0.0.1 */
  proxyIp?: string;
  /** 本地 node 端口，默认 7001 */
  proxyPort?: number;
  updatedAt: string;
}

export interface IDomainEntryOverride {
  domain: string;
  remoteEntryUrl: string;
  source: MfSourceKind;
}

export interface IMfLocalBinding {
  mfDomain: string;
  projectCode: string;
  defaultPort: number;
  kind: 'shell' | 'remote';
  cdnTemplate: string;
}

export interface IDomainEntryPageConfig {
  /** 由 sources 推导：有非 follow 覆盖即为 true */
  enable: boolean;
  current: string;
  domainEntry: Record<string, string>;
  logEnable?: boolean;
  bridgeEnable?: boolean;
  installCCWebHelper?: boolean;
  isCjetProxy?: boolean;
  proxyIp?: string;
  proxyPort?: number;
  syncClear?: boolean;
  updatedAt?: string;
}

export interface IDomainEntryProfileResponse {
  success: boolean;
  profile?: IContextDomainEntryProfile;
  overrides?: IDomainEntryOverride[];
  envs?: MfEnvId[];
  /** 回显来自业务页 localStorage（桥接 page-echo） */
  fromPage?: boolean;
  pageUpdatedAt?: string;
  reloadHint?: string;
  error?: string;
}

export interface IDomainEntryStoreResponse {
  success: boolean;
  store?: { version: number; profiles: Record<string, IContextDomainEntryProfile> };
  envs?: MfEnvId[];
  enabledContexts?: string[];
  error?: string;
}

export interface IDomainEntryBindingsResponse {
  success: boolean;
  bindings?: IMfLocalBinding[];
  envs?: MfEnvId[];
  error?: string;
}

export interface IDomainEntryExportResponse {
  success: boolean;
  key?: string;
  contextEnv?: string;
  config?: IDomainEntryPageConfig;
  error?: string;
}

export interface IDomainEntryApplyResponse {
  success: boolean;
  profile?: IContextDomainEntryProfile;
  overrides?: IDomainEntryOverride[];
  bootstrap?: IDomainEntryPageConfig;
  reloadHint?: string;
  error?: string;
}
