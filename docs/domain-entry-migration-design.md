# Domain Entry / 环境切换能力迁移设计

<!-- AI 生成 By Peng.Guo -->

> 目标：将 CCWEB 开发助手（`ccweb-helper` 油猴插件）中 **RemoteEntry / 环境切换** 相关能力，从插件 UI 迁出，由 **my-desktop（AI Dev Control Center）** 统一管理与编排。  
> 范围：仅「领域入口映射 + 环境一键切换 + 本地联调覆盖」；不含 vConsole、cjet 代理控制台、主题色板、国际化上报、IndexedDB 监控等其它插件能力。

---

## 1. 需求理解

### 1.1 用户目标

开发者在本地联调微前端时，需要：

1. 一键切换 RemoteEntry 指向的环境：`local` / `dev` / `pre-test` / `test` / `inte` / `prod` …
2. 按领域（domain）单独覆盖入口 URL（端口号、环境别名、完整 URL）
3. 刷新页面使覆盖生效，或重置回默认 CDN 入口
4. 与「启动本地项目」联动：启动 `apphub/modules/...` 后，自动把对应 domain 指到本地端口

### 1.2 业务目标

- **配置中心化**：环境与入口映射作为开发工作台能力，而不是散落在浏览器油猴脚本里
- **可编排**：与 my-desktop 已有的项目启动、打开测试/集测环境、工作流能力打通
- **可沉淀**：预设、最近方案、按工作流绑定，可进版本管理 / 运行时配置

### 1.3 系统边界

| 在边界内 | 不在本次边界内 |
|----------|----------------|
| Domain → remoteEntry URL 映射的生成、编辑、持久化、应用 | 油猴整包重写 |
| 环境切换（local / CDN 各 env） | cjet-proxy 控制台本体 |
| 与 `projects.ts` / 启动命令联动 | vConsole / 远程调试 / 主题色板 |
| 兼容现有页面加载契约 | 生产环境强制管控入口 |

### 1.4 隐藏需求

- 页面加载 **早于业务模块**：覆盖必须在 `domainEntry.js` 写 `__Domain_Entries__` 时生效，否则 MF 容器已缓存
- 多标签 / 多环境并存：同一台机器可能同时开 inte 与 local
- 特性环境 `f164` 等：URL 中含 `/f\d+/`，切换规则需与现网一致
- 插件仍可能被同事使用：迁移期必须 **兼容同一 localStorage 契约**

### 1.5 未来演进

- 从「写浏览器 localStorage」演进到「宿主主动拉取本地控制面配置」
- Domain 列表随 monorepo 拆分增长，不应靠硬编码端口递减算法

---

## 2. 现状能力分析（As-Is）

### 2.1 插件侧（ccweb-helper v4.5.37）

截图中的能力对应插件「常规功能」里的 Domain Entry 面板：

| UI 能力 | 行为 |
|---------|------|
| 环境按钮（local / inte / prod…） | 批量改写 `domainEntry` map，并写入 `current` |
| 单行编辑入口 | 支持完整 URL；仅数字时补全为 `http://localhost:{port}/remoteEntry.js`；`t/pre/i/p` 等别名改写 CDN path 中的 env 段 |
| 刷新 / 重置 | `location.reload()`；重置会 `removeItem` 配置 key |
| ⏰ 构建信息 | 点击查看 domain 构建信息浮层（非计时器） |
| 「刷新 RemoteEntry」 | 触发页面刷新，配合入口 URL 上的 `?timestamp` 打散缓存 |

持久化结构（写入 `localStorage[window.__DomainDebugHelperKey__]`，默认 key = `domain-debug-helper-ccweb`）：

```ts
interface IDomainEntryPageConfig {
  /** 是否启用覆盖 */
  enable: boolean;
  /** 当前环境标签，如 local / inte */
  current: string;
  /** domain → remoteEntry URL（无 query） */
  domainEntry: Record<string, string>;
  /** 其它插件字段（本次可不迁，但需兼容读写） */
  logEnable?: boolean;
  vConsoleEnable?: boolean;
  remoteDebug?: boolean;
  isCjetProxy?: boolean;
  proxyIp?: string;
}
```

`local` 特殊规则（插件实现）：

- 从 clone 的默认入口出发改写
- **非** `__RemoteDomains__` 的「壳内领域」（apphub/components/modules…）按端口递减：`8080 - index - 1` → 常见为 8079、8078、8077…
- **是** singleDomain 的远程微应用，仍按 CDN/`$env` 规则生成（或保留云端），不强行全打到 localhost

### 2.2 宿主页面侧（saas-cc-web / 各 micro-app）

权威应用点在 `domain/domainEntry.js`（各包 `dev-only/domainEntry.ts` 同源逻辑）：

```text
parseCdnUrl / getDefaultEntry
        ↓
读 localStorage['domain-debug-helper-ccweb']
        ↓
若 enable && domainEntry[domain] → 覆盖 Entries[domain]
        ↓
对 remoteEntry.js 追加 ?timestamp
        ↓
window.__Domain_Entries__ = Entries
```

运行时加载：

```text
getRemoteModule('@remote/{domain}/...')
  → loadScript(window.__Domain_Entries__[domain])
  → window[`__cjet_domain_${domain}__`].get(...)
```

**结论**：真正生效的是 **浏览器同源 localStorage + 页面启动脚本**，不是油猴 UI 本身。油猴只是「控制面 UI + 写存储」。

### 2.3 my-desktop 侧已有相关能力

| 已有能力 | 与本次关系 |
|----------|------------|
| `config/projects.ts` 项目代号 / 路径 / `devCmd` | 可扩展 `mfDomain` + `devPort`，作为本地映射源 |
| `open_test_env` / `open_jice_env` | 打开环境 URL，但**不改** Domain Entry |
| 工作流启动本地工程 | 启动了进程，但**不会**自动指入口 |
| Express API `:41738` | 可作为 Domain Entry 控制面服务 |
| Electron + 系统浏览器打开 | 默认浏览器 ≠ 可控注入上下文 |

### 2.4 现有方案的问题

1. **控制面在油猴**：配置不可进仓库、难与「启动项目」联动、难做预设与审计  
2. **端口靠递减启发式**：领域顺序变化即错位  
3. **Dual UI**：插件与桌面各自管环境，认知分裂  
4. **无法从桌面直接写任意站点 localStorage**（安全隔离）——这是迁移的核心架构约束

---

## 3. 架构影响与约束

### 3.1 硬约束：控制面 ≠ 数据面

```text
┌─────────────────────┐         不能直接写          ┌──────────────────────┐
│  my-desktop UI/API  │  ───────────────────────X──▶│  cloud.chanjet.com   │
│  （控制面）          │                             │  localStorage        │
└─────────────────────┘                             └──────────────────────┘
         │                                                     ▲
         │ 必须经「数据面适配器」                                │
         ▼                                                     │
┌─────────────────────┐         同源写入 / 启动前覆盖            │
│  Injector / Host    │  ─────────────────────────────────────┘
│  （数据面）          │
└─────────────────────┘
```

因此：**把 UI 迁到 my-desktop ≠ 删除浏览器侧一切逻辑**。至少需要一个极薄的「应用器」。

### 3.2 推荐总体架构（To-Be）

采用 **Control Plane / Data Plane 分离**：

```text
用户 / Agent
    ↓
my-desktop UI（Domain Entry 面板）
    ↓
Domain Entry Domain Service（纯领域：生成映射、校验、预设）
    ↓
API + runtime 持久化（JSON）
    ↓
Data Plane Adapter（可选一种或并存）
    ├─ A. 兼容写入器：向目标 Origin 注入 localStorage 契约（迁移默认）
    ├─ B. 宿主拉取：domainEntry.js 请求 http://127.0.0.1:41738/...（中期）
    └─ C. 薄油猴 / 扩展：仅 sync，无业务 UI（兜底）
    ↓
既有 domainEntry.js → __Domain_Entries__ → MF 加载
```

**稳定点**：`domain-debug-helper-ccweb` 契约、`__Domain_Entries__`、`getRemoteModule`  
**变化点**：谁生成映射、谁存预设、谁触发应用、端口如何绑定项目

### 3.3 方案对比（ADR）

#### Context

需要把插件里的 Domain Entry 管理迁到 my-desktop，同时保证页面加载时覆盖仍生效。

#### Decision

**Phase 1**：my-desktop 成为唯一控制面；数据面用 **「契约兼容写入」**（保持 `domain-debug-helper-ccweb`）。  
控制面已与 **cc-helper UI 解耦**；key 名历史遗留，仅作页面 `domainEntry.js` 契约，不再以助手插件为验收依据。  
**Phase 2**：推进宿主 `domainEntry.js` 支持 **本地控制面拉取**（`http://127.0.0.1:${API_PORT}`），逐步去掉对油猴桥接的依赖。  
**Phase 3**：薄桥接降为可选兜底或移除。

#### Alternatives

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|------|------|------|------|------|
| A. 仅桌面配置，手动复制到插件 | 桌面生成 JSON，人粘贴 | 改动最小 | 体验差，易出错 | 否 |
| B. 桌面 + CDP/Playwright 注入 localStorage | 打开页前用自动化注入 | 无油猴 | 依赖浏览器调试协议、登录态复杂 | Phase1 可选通道 |
| C. 桌面 + 薄油猴 sync | 油猴只轮询桌面 API 写 LS | 兼容最好 | 仍依赖扩展 | **Phase1 推荐默认** |
| D. 改 domainEntry.js 拉本地 API | 宿主直接消费控制面 | 架构最干净 | 需改多仓 domainEntry | **Phase2 主路径** |
| E. 改 URL query 传入口 | `?domainEntry=...` | 无存储 | URL 过长、不安全、难维护 | 否 |

#### Trade-offs

- Phase1 仍有一丁点浏览器侧依赖，但 UI/智能编排已离开插件  
- Phase2 需要改 `saas-cc-web-2` 与各 micro-app 的 `domainEntry`，有发布节奏成本  
- 不把整包油猴搬进 Electron WebView：成本高且登录/Cookie 场景不如系统浏览器

---

## 4. 领域模型设计

### 4.1 核心对象

```ts
/** 支持的环境标签（可扩展） */
type MfEnvId =
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
  | `f${number}`; // 特性环境

/** 单个领域入口覆盖 */
interface IDomainEntryOverride {
  domain: string;
  /** 最终写入的 remoteEntry URL（无 query） */
  remoteEntryUrl: string;
  /** 覆盖来源：手动 / 环境批量 / 项目端口绑定 */
  source: 'manual' | 'env-batch' | 'project-port';
}

/** 一份可应用的方案（Profile） */
interface IDomainEntryProfile {
  id: string;
  name: string;
  env: MfEnvId;
  enable: boolean;
  overrides: IDomainEntryOverride[];
  /** 打开浏览器时的目标基址（可选） */
  openUrl?: string;
  updatedAt: string;
}

/** 项目 ↔ MF domain ↔ 本地端口 绑定（扩展 projects） */
interface IMfLocalBinding {
  projectCode: string;   // projects.ts codes
  mfDomain: string;      // __Domain_Entries__ key
  defaultPort: number;
  /** singleDomain 远程微应用 vs 壳内领域 */
  kind: 'shell' | 'remote';
}
```

### 4.2 与现有契约的适配器

```ts
function toPageConfigStorage(profile: IDomainEntryProfile): IDomainEntryPageConfig {
  return {
    enable: profile.enable,
    current: profile.env,
    domainEntry: Object.fromEntries(
      profile.overrides.map((o) => [o.domain, o.remoteEntryUrl.split('?')[0]])
    ),
  };
}
```

**原则**：Adapter 隔离契约；Domain Service 不直接依赖油猴字段名。

### 4.3 环境批量改写规则（对齐插件，可测）

输入：`baseEntries`（默认 CDN 入口快照）、`env`、`bindings`、`options`

| env | 规则 |
|-----|------|
| CDN 类（inte/test/prod…） | 将 URL 中 `/(test\|pre-test\|inte\|…\|f\d+)/` 替换为 `/${env}/`；remote 微应用优先用 `__RemoteDomains__` 的 `$env` 模板 |
| `local` | shell 领域：用 `bindings.defaultPort`（**禁止**再靠 8080 递减启发式作为唯一真相）；remote 领域：默认保持 CDN 或按配置切到本地 |
| 纯数字输入 | `http://localhost:{n}/remoteEntry.js`；若启用 cjet https 代理则 `https://{proxyIp}:8888/{n}/remoteEntry.js`（代理能力可二期） |

别名（单行编辑）：`t→test`，`pre→pre-test`，`i→inte`，`i2→inte2`，`p→prod`，`p2→prod2`。

---

## 5. my-desktop 内部分层

严格贴合现有 `view → viewmodel → domain → infrastructure`：

```text
ui/src/view/DomainEntryPanel.tsx          # 仅渲染与交互
ui/src/viewmodel/domainEntry/useDomainEntry.ts
ui/src/domain/domainEntry/
  models.ts                               # 类型（或 declare 约定时放到 declare.ts）
  profileCompiler.ts                      # env 批量 / 端口绑定 / 别名解析
  storageContract.ts                      # ↔ 页面 Domain Entry 契约转换
ui/src/infrastructure/domainEntry/domainEntryApi.ts

server/
  domain-entry-service.ts                 # 读写 runtime 配置、编译 profile
  api routes: /domain-entry/*

config/
  mf-domain-bindings.ts                   # domain↔port↔project 单一事实源
  projects.ts                             # 可引用 bindings，避免重复
```

**职责切分**：

| 层 | 做 | 不做 |
|----|----|------|
| View | 表格、环境按钮、应用/重置 | 改写 URL 规则 |
| ViewModel | 面板状态、调用 API、展示校验错误 | 持久化细节 |
| Domain | 编译 overrides、校验 URL、合并 preset | HTTP / 文件 IO |
| Infrastructure / Server | 存 JSON、触发 injector、打开浏览器 | 业务改写规则 |

---

## 6. API 设计

基址：既有 `API_PORT`（默认 `41738`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/domain-entry/profile` | 当前生效 profile |
| PUT | `/domain-entry/profile` | 更新当前 profile（含 overrides） |
| POST | `/domain-entry/compile` | Body `{ env, baseEntries? }` → 返回编译后的 overrides（不落盘） |
| POST | `/domain-entry/apply` | 落盘 + 触发数据面应用；可选 `{ openUrl, reloadHint }` |
| POST | `/domain-entry/reset` | 清空覆盖（enable=false 或删除契约）并提示刷新 |
| GET | `/domain-entry/bindings` | 返回 mf domain ↔ port ↔ project |
| GET | `/domain-entry/presets` | 预设列表 |
| POST | `/domain-entry/presets` | 另存为预设 |
| GET | `/domain-entry/export/page-config` | 导出页面契约 JSON（调试/手动粘贴兜底） |
| GET | `/domain-entry/bootstrap` | **给宿主/薄注入器用**：返回当前应写入的契约 JSON（CORS 开放给 localhost 页面） |

持久化建议：

- `runtime/domain-entry/current-profile.json`
- `runtime/domain-entry/presets/*.json`

Agent 口令（可挂 command-catalog）：

- 「切到本地联调」→ compile(local) + apply + 可选打开 URL  
- 「Domain Entry 指到 inte」→ compile(inte) + apply  
- 「apphub 用 8079」→ 单 domain 覆盖  

---

## 7. 数据面应用策略（分阶段）

### Phase 1 — 兼容写入（推荐先做）

**目标**：桌面管配置；浏览器仍走现有 `domainEntry.js`。

实现选择（可同时提供）：

1. **Thin Sync Userscript（推荐默认）**  
   - 删除/隐藏原 Domain Entry UI  
   - 仅：`fetch('http://127.0.0.1:41738/domain-entry/bootstrap')` → `localStorage.setItem(key, JSON.stringify(cfg))`  
   - `@run-at document-start`，尽量早于业务  
   - my-desktop「应用」后提示用户刷新目标页；或 thin script 监听 `BroadcastChannel` / 短轮询

2. **CDP 注入通道（可选）**  
   - 对「由桌面打开的 Chrome 调试实例」执行 `LocalStorage.setItems`  
   - 适合集成测试 / 专用调试浏览器，不适合作为全员默认

3. **一键复制契约 JSON**  
   - 兜底：复制后在控制台 `localStorage.setItem(...)`

### Phase 2 — 宿主主动拉取（架构主路径）

改 `domainEntry.js`（各仓同源文件需统一发布策略）：

```js
// 伪代码
async function tryLoadDesktopOverrides() {
  try {
    const res = await fetch('http://127.0.0.1:41738/domain-entry/bootstrap', {
      signal: AbortSignal.timeout(80),
    });
    if (!res.ok) return null;
    return await res.json(); // { enable, domainEntry, current }
  } catch {
    return null; // 桌面未启动则静默回退
  }
}
```

优先级建议：

```text
1. Desktop bootstrap（若 enable）
2. localStorage domain-debug-helper-ccweb（兼容油猴/旧流程）
3. 默认 CDN Entries
```

超时必须极短（≤100ms），避免拖慢首屏。

### Phase 3 — 插件 UI 下线

- 插件 Domain Entry 面板标注「已迁移至 my-desktop」并只读展示当前覆盖  
- 或完全移除；thin sync 可改为正式「ccweb-desktop-bridge」小脚本

---

## 8. UI 设计（my-desktop）

新增页签：**「MF 联调 / Domain Entry」**（名称可再定）。

布局对齐现有插件心智，但归属桌面：

1. **顶栏**：环境按钮组 + 应用 / 重置 / 导出兼容 JSON  
2. **表**：domain | 绑定项目 | 端口 | remoteEntry URL（可编辑） | 来源标签  
3. **操作**：从运行中的本地 dev 探测端口（可选二期）、保存预设、应用到浏览器  
4. **状态**：桌面 API 是否可达；数据面 last-applied 时间；目标 Origin 列表

与现有「打开测试/集测环境」关系：

- 打开 URL ≠ 切换 Domain Entry  
- 提供组合动作：**「打开 inte 并应用 inte 入口」**

---

## 9. 与项目启动联动

扩展 `config/mf-domain-bindings.ts`（示例）：

| mfDomain | projectCode | defaultPort | kind |
|----------|-------------|-------------|------|
| apphub | cc-web2 | 8079 | shell |
| components | cc-web2 | 8078 | shell |
| modules | cc-web2 | 8077 | shell |
| thirdlib | cc-web2 | 8076 | shell |
| voucher-common | cc-web2 | 8075 | shell |
| React18App | react18 | 8100 | remote |
| metapage | metapage | （配置） | remote |
| ccwebscm | scm | （配置） | remote |
| … | … | … | … |

工作流增强建议：

```text
启动 react18
  → run_workflow_step
  → DomainEntryService.pinDomain('React18App', port)
  → （可选）apply profile
```

这样「启动 + 指入口」成为一条可口令化能力，正是迁出插件的核心收益。

---

## 10. 安全与非功能

| 项 | 要求 |
|----|------|
| 绑定地址 | bootstrap 仅监听 `127.0.0.1`，禁止 0.0.0.0 对局域网暴露入口覆盖 |
| CORS | `/domain-entry/bootstrap` 允许 `*.chanjet.com` / localhost 页读取；只读 GET |
| 校验 | remoteEntry 仅允许 `http(s):`，禁止 `javascript:` / 任意 file |
| 超时 | 宿主拉取 ≤100ms，失败静默 |
| 可观测 | Logs 记录 compile/apply；可选写入 command-stats |
| 测试 | Domain 规则单测（env 替换、local 端口绑定、别名、契约转换）必须覆盖 |

---

## 11. 迁移分期与验收

### Phase 0 — 契约固化（0.5d）

- 文档化 `IDomainEntryPageConfig`  
- 从现网页面导出一份真实 `domainEntry` 作为 golden fixture  
- 单测：`toPageConfigStorage` / `fromPageConfigStorage` 往返一致

### Phase 1 — 桌面控制面 + 兼容应用（3～5d）

- bindings 配置 + Domain Service + API + Panel  
- Thin sync 或「导出 + 提示刷新」打通闭环  
- 口令：切 local / 切 inte  

**验收**：

1. 在 my-desktop 点 `local`，应用后刷新目标站，`apphub` 等指向配置端口  
2. 点 `inte`，入口 path 中 env 段变为 `inte`  
3. 重置后恢复 CDN 默认  
4. 不依赖打开原插件 Domain Entry UI

### Phase 2 — 宿主拉取（跨仓，按发布窗口）

- `domainEntry.js` 增加 desktop bootstrap  
- 桌面未启动时行为与现网一致  

**验收**：卸载油猴 Domain 功能后，仅开 my-desktop 仍可联调。

### Phase 3 — 插件收敛

- 移除或折叠插件内 Domain Entry 管理 UI  
- 更新《按领域构建开发指南》指向 my-desktop

---

## 12. 明确不迁 / 后续另案

| 能力 | 建议 |
|------|------|
| cjet 代理控制台 | 仍属网络代理域，可另做「代理面板」或继续用现有工具 |
| vConsole / 远程调试 | 可继续插件或独立开关，不与 Domain Entry 绑死 |
| 主题色板 / i18n 上报 | 与 MF 入口无关，留插件或其它工具 |
| 构建信息 ⏰ | Phase1 可用「打开 domain 构建 URL / 读 build meta」弱化实现；非阻塞 |

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| document-start 注入仍晚于 domainEntry | 覆盖无效 | Phase2 宿主拉取；Phase1 要求「先应用再硬刷新」+ 教育 |
| 多 profile 冲突（油猴与桌面同时写） | 入口抖动 | apply 时写 `current` 来源标记；文档约定桌面优先 |
| 端口绑定表过时 | 指错服务 | bindings 与 cjet/devServer 配置单测对齐；启动后健康检查 remoteEntry 200 |
| 改多仓 domainEntry 不一致 | 部分微应用无拉取 | 抽共享片段或生成脚本同步 |
| 特性环境 featEnvAppList | 与默认规则不一致 | compile 时允许「从页面 baseEntries 快照」导入，而不是桌面臆造 |

---

## 14. 建议落地顺序（执行清单）

1. 在 my-desktop 增加 `mf-domain-bindings` + `profileCompiler` 单测（先固化规则）  
2. 实现 `/domain-entry/*` API 与 `runtime` 持久化  
3. 实现 Domain Entry Panel（对齐现 UI 心智）  
4. 打通 Phase1 数据面（thin sync 或手动契约导出）  
5. 与「启动项目」工作流挂钩  
6. 推动 saas-cc-web `domainEntry.js` Phase2  
7. 收敛油猴 UI 并更新开发文档  

---

## 15. 一句话结论

**Domain Entry 的「决策与编排」应归属 my-desktop；「在页面启动瞬间覆盖 `__Domain_Entries__`」仍必须留在浏览器数据面。**  
正确迁移不是「把油猴面板搬进 Electron」，而是：**桌面成为控制面 + 保留/演进极薄的数据面适配器，并最终让 `domainEntry.js` 直接消费本地控制面。**
