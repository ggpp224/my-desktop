/* AI 生成 By Peng.Guo */
/**
 * MF domain ↔ 本地端口 ↔ 项目代号 单一事实源。
 * 用于 Domain Entry 编译 local 覆盖，替代油猴 8080 递减启发式。
 */

export type MfBindingKind = 'shell' | 'remote';

export interface IMfLocalBinding {
  /** __Domain_Entries__ key */
  mfDomain: string;
  /** config/projects.ts 代号 */
  projectCode: string;
  /** 本地联调默认端口 */
  defaultPort: number;
  /** shell=壳内领域；remote=独立微应用 */
  kind: MfBindingKind;
  /**
   * CDN 子路径模板，`$env` 会被替换为环境名。
   * 最终 URL：`${CDN_HOST}/${cdnTemplate.replace('$env', env)}/remoteEntry.js`
   */
  cdnTemplate: string;
}

/** 默认静态资源主机（与现网 cloud.static.chanjet.com 对齐） */
export const MF_CDN_HOST = 'https://cloud.static.chanjet.com';

/**
 * 覆盖截图与常见联调域；端口与 cc-web 本地 cjet 习惯对齐。
 */
export const MF_DOMAIN_BINDINGS: readonly IMfLocalBinding[] = [
  {
    mfDomain: 'apphub',
    projectCode: 'cc-web2',
    defaultPort: 8079,
    kind: 'shell',
    cdnTemplate: 'saas-cc-web/$env/apphub',
  },
  {
    mfDomain: 'components',
    projectCode: 'cc-web2',
    defaultPort: 8078,
    kind: 'shell',
    cdnTemplate: 'saas-cc-web/$env/components',
  },
  {
    mfDomain: 'modules',
    projectCode: 'cc-web2',
    defaultPort: 8077,
    kind: 'shell',
    cdnTemplate: 'saas-cc-web/$env/modules',
  },
  {
    mfDomain: 'thirdlib',
    projectCode: 'cc-web2',
    defaultPort: 8076,
    kind: 'shell',
    cdnTemplate: 'saas-cc-web/$env/thirdlib',
  },
  {
    mfDomain: 'voucher-common',
    projectCode: 'cc-web2',
    defaultPort: 8075,
    kind: 'shell',
    cdnTemplate: 'saas-cc-web/$env/voucher-common',
  },
  {
    mfDomain: 'React18App',
    projectCode: 'react18',
    defaultPort: 8100,
    kind: 'remote',
    cdnTemplate: 'react18-antd5-mobx6/$env',
  },
  {
    mfDomain: 'bizsolutions',
    projectCode: 'biz-solution',
    /** 与集测 LOCAL_REMOTES / 本地联调习惯一致 */
    defaultPort: 8200,
    kind: 'remote',
    cdnTemplate: 'biz-solution/$env',
  },
  {
    mfDomain: 'ccwebscm',
    projectCode: 'scm',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-scm/$env',
  },
  {
    mfDomain: 'ccwebBase',
    projectCode: 'base',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-base/$env',
  },
  {
    mfDomain: 'ydzee',
    projectCode: 'cc-web2',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-ydzee/$env',
  },
  {
    mfDomain: 'hkj',
    projectCode: 'cc-web-hkj',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-hkj/$env',
  },
  {
    mfDomain: 'hkj18',
    projectCode: 'cc-web-hkj',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-hkj18/$env',
  },
  {
    mfDomain: 'finance18',
    projectCode: 'cc-web2',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-finance18/$env',
  },
  {
    mfDomain: 'metapage',
    projectCode: 'metapage',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-metapage/$env',
  },
  {
    mfDomain: 'appService',
    projectCode: 'cc-web2',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'cc-front-biz-app-service/$env',
  },
  {
    mfDomain: 'bireportdesigner',
    projectCode: 'cc-web2',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-bireportdesigner/$env',
  },
  {
    mfDomain: 'bireport',
    projectCode: 'cc-web2',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-bireport/$env',
  },
  {
    mfDomain: 'ccwebscm18',
    projectCode: 'scm18',
    defaultPort: 0,
    kind: 'remote',
    cdnTemplate: 'saas-cc-web-scm18/$env',
  },
];

export function getMfDomainBindings(): readonly IMfLocalBinding[] {
  return MF_DOMAIN_BINDINGS;
}

export function getMfBindingByDomain(domain: string): IMfLocalBinding | undefined {
  return MF_DOMAIN_BINDINGS.find((b) => b.mfDomain === domain);
}
