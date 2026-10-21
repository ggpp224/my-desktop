// ==UserScript==
// @name         ccweb-desktop-bridge
// @namespace    ai-dev-control-center
// @version      1.8.10
// @description  桌面 MF 联调 → Domain Entry LS（启用桥接开关；安装助手；API 代理）
// @author       AI Dev Control Center
// @run-at       document-end
// @include      /^https?:\/\/(.+-)?cloud(\d+)?\.chanjet\.com\/.+/
// @include      /^https?:\/\/(.+-)?app\.chanjet\.com\.cn\/.+/
// @match        *://*.chanjet.com/*
// @match        *://*.chanjet.com.cn/*
// @match        https://app.chanjet.com.cn/
// @match        https://test-app.chanjet.com.cn/
// @include      /^https?:\/\/tyy\.citicbank\.com(:\d+)?\/.+/
// @include      /^http:\/\/localhost:(8080|9001|9002|8855)\/.*/
// @connect      127.0.0.1
// @connect      localhost
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// ==/UserScript==

/**
 * 注意：document-start 时部分油猴环境 GM_xhr 尚未注入，会导致「已安装但桌面显示未连接」。
 * 改为 document-end，并在 GM 未就绪时短重试。
 * 页面可读标记：window.__CCWEB_DESKTOP_BRIDGE__（用于确认脚本是否注入）
 *
 * v1.8+：默认不吵——长轮询 wait-sync；桌面 save 后服务端唤醒再推；空闲约 25s 心跳。
 * v1.8.6：API 代理对齐助手——EnableCjetProxy + 页面 sw → https://{ip}:8888。
 * v1.8.7：开启时自动把 cpxy 环境切到 local:{nodePort}（默认 7001），REST 才打到本地 node。
 * v1.8.8：安装助手外部开关 → LS ccweb-helper-enable（键存在=外部管控；未写键者走页面原逻辑）。
 * v1.8.9：仅调试开关、无 MF 覆盖时不写空 domainEntry:{}，避免助手 DomainEntries 列表被清空。
 * v1.8.10：bridgeEnable 默认 true；关闭后不写入 domain-debug / 代理 / 助手开关，便于只用 cc-helper。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'domain-debug-helper-ccweb';
  var ENABLE_CJET_PROXY_KEY = 'EnableCjetProxy';
  /**
   * 与 saas-cc-web-2 installCCWebHelper.ts 约定（外部开关，本桥接只是写入方之一）：
   * 键存在=外部管控；'true' 装 / 'false' 不装。无此键则页面保持原安装逻辑。
   */
  var CCWEB_HELPER_ENABLE_KEY = 'ccweb-helper-enable';
  /** 桥接写入开关：缺省/无键视为 true；'false' 时不改页面 domain-debug */
  var BRIDGE_ENABLE_KEY = 'ccweb-desktop-bridge-enable';
  /** 页面 sw.js 对 IP 主机固定拼 :8888（与助手一致） */
  var CJET_PROXY_PORT = 8888;
  /** 本地 node 默认端口（cpxy 目标 env） */
  var DEFAULT_NODE_PORT = 7001;
  var API_BASE = 'http://127.0.0.1:41738';
  var BRIDGE_VERSION = '1.8.10';
  // 尽早打标：即便后续 GM 失败，也能用 window.__CCWEB_DESKTOP_BRIDGE__ 确认已注入
  var TIMEOUT_MS = 5000;
  /** 与服务端 DEFAULT_WAIT_SYNC_MS 对齐 */
  var WAIT_TIMEOUT_MS = 25000;
  /** xhr 略长于服务端挂起，避免误判超时 */
  var WAIT_XHR_MS = 30000;
  /** 请求失败后退避，避免狂打桌面 API */
  var ERROR_BACKOFF_MS = 3000;
  var lastAppliedFp = '';
  var lastSince = '';
  var loopRunning = false;
  var started = false;

  function pageWindow() {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
    } catch (e) {}
    return window;
  }

  function setBridgeMarker(extra) {
    try {
      var w = pageWindow();
      w.__CCWEB_DESKTOP_BRIDGE__ = Object.assign(
        {
          version: BRIDGE_VERSION,
          host: location.hostname,
          href: location.href,
          at: new Date().toISOString(),
        },
        extra || {}
      );
    } catch (e) {}
  }

  setBridgeMarker({ phase: 'script-loaded' });
  try {
    console.log('[ccweb-desktop-bridge]', BRIDGE_VERSION, 'boot', location.hostname);
  } catch (e) {}

  function log() {
    try {
      var args = ['[ccweb-desktop-bridge]', BRIDGE_VERSION].concat([].slice.call(arguments));
      console.log.apply(console, args);
    } catch (e) {}
  }

  function warn() {
    try {
      var args = ['[ccweb-desktop-bridge]', BRIDGE_VERSION].concat([].slice.call(arguments));
      console.warn.apply(console, args);
    } catch (e) {}
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getGmXhr() {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
      return GM.xmlHttpRequest;
    }
    // Tampermonkey 有时挂在 unsafeWindow / globalThis
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow.GM_xmlhttpRequest) {
        return unsafeWindow.GM_xmlhttpRequest;
      }
    } catch (e) {}
    return null;
  }

  function detectPageContext() {
    try {
      var info = window.APPINFO || {};
      if (info.cc_server_env) return String(info.cc_server_env);
      if (info.feat_env) return String(info.feat_env);
    } catch (e) {}

    var host = (location.hostname || '').toLowerCase();
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return 'local';

    var m = host.match(/^(?:(.+?)-)?(?:cloud|app)/);
    if (m && m[1]) {
      var prefix = m[1];
      if (/^f\d+$/i.test(prefix)) return prefix;
      return prefix;
    }

    // inte-cloud.chanjet.com / cloud.chanjet.com
    if (/^inte/i.test(host)) return 'inte';
    if (/^test/i.test(host)) return 'test';
    if (/^pre-?test/i.test(host)) return 'pre-test';
    if (/^moni/i.test(host)) return 'moni';
    if (/^prod/i.test(host)) return 'prod';
    if (/cloud\.chanjet\.com$/i.test(host)) return 'prod';
    return '';
  }

  function readPageConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var cfg = JSON.parse(raw);
      return cfg && typeof cfg === 'object' ? cfg : null;
    } catch (e) {
      return null;
    }
  }

  function fingerprint(cfg) {
    if (!cfg) return '';
    try {
      return JSON.stringify({
        enable: !!cfg.enable,
        current: String(cfg.current || ''),
        domainEntry: cfg.domainEntry || {},
        logEnable: !!cfg.logEnable,
        bridgeEnable: cfg.bridgeEnable !== false,
        installCCWebHelper: !!cfg.installCCWebHelper,
        isCjetProxy: !!cfg.isCjetProxy,
        proxyIp: String(cfg.proxyIp || ''),
        proxyPort: Number(cfg.proxyPort) || 0,
      });
    } catch (e) {
      return '';
    }
  }

  function hasDebugFlags(cfg) {
    return !!(cfg && (cfg.logEnable || cfg.isCjetProxy || cfg.installCCWebHelper));
  }

  /** 缺省开启；仅显式 false 关闭 */
  function normalizeBridgeEnable(raw) {
    return raw !== false;
  }

  function readLocalBridgeEnable() {
    try {
      var raw = localStorage.getItem(BRIDGE_ENABLE_KEY);
      if (raw === null || raw === '') return true;
      return raw === 'true';
    } catch (e) {
      return true;
    }
  }

  function syncBridgeEnableFlag(cfg) {
    try {
      if (!cfg || typeof cfg !== 'object') return readLocalBridgeEnable();
      var on = normalizeBridgeEnable(cfg.bridgeEnable);
      localStorage.setItem(BRIDGE_ENABLE_KEY, on ? 'true' : 'false');
      return on;
    } catch (e) {
      warn('bridge-enable 写入失败', e);
      return readLocalBridgeEnable();
    }
  }

  function isBridgeWriteEnabled(cfg) {
    if (cfg && typeof cfg === 'object' && 'bridgeEnable' in cfg) {
      return normalizeBridgeEnable(cfg.bridgeEnable);
    }
    return readLocalBridgeEnable();
  }

  function normalizeNodePort(raw) {
    var n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n < 65536) return Math.floor(n);
    return DEFAULT_NODE_PORT;
  }

  /** cpxy 控制台切换环境的 query：7000→local，其它→local:{port} */
  function cpxyEnvKey(nodePort) {
    var p = normalizeNodePort(nodePort);
    return p === 7000 ? 'local' : 'local:' + p;
  }

  function isEmptyDomainEntry(domainEntry) {
    return !domainEntry || typeof domainEntry !== 'object' || Object.keys(domainEntry).length === 0;
  }

  /**
   * 助手 DomainEntries：`domainEntry || __Domain_Entries__`
   * 空对象 {} 为真值会盖住默认表 → 列表空白。无 MF 覆盖时禁止写入空 domainEntry。
   */
  function buildStorageObject(cfg) {
    var existing = readPageConfig() || {};
    var incoming = cfg.domainEntry || {};
    var flagsOnly = cfg.enable !== true && isEmptyDomainEntry(incoming);
    var nextObj;

    if (flagsOnly) {
      nextObj = {
        enable: existing.enable === true,
        current: existing.current || cfg.current || 'local',
      };
      // 保留已有 MF 表供助手展示；没有则不写该字段，助手回退 __Domain_Entries__
      if (!isEmptyDomainEntry(existing.domainEntry)) {
        nextObj.domainEntry = existing.domainEntry;
      }
    } else {
      nextObj = {
        enable: !!cfg.enable,
        current: cfg.current || 'local',
        domainEntry: incoming,
      };
    }

    if (cfg.logEnable) nextObj.logEnable = true;
    if (cfg.installCCWebHelper) nextObj.installCCWebHelper = true;
    if (cfg.isCjetProxy) {
      nextObj.isCjetProxy = true;
      nextObj.proxyIp = String(cfg.proxyIp || '127.0.0.1');
      nextObj.proxyPort = normalizeNodePort(cfg.proxyPort);
    }
    return nextObj;
  }

  function syncHelperInstallFlag(cfg) {
    try {
      // 推送配置时写入 true/false（键存在=外部开关管控，避免仅 MF 写 domain-debug 误装助手）
      // syncClear / cfg==null 时删除键，交还「无外部开关」时的页面原逻辑
      if (!cfg) {
        localStorage.removeItem(CCWEB_HELPER_ENABLE_KEY);
        log('ccweb-helper-enable removed（恢复无外部开关原逻辑）');
        return;
      }
      var on = !!cfg.installCCWebHelper;
      localStorage.setItem(CCWEB_HELPER_ENABLE_KEY, on ? 'true' : 'false');
      log('ccweb-helper-enable=' + (on ? 'true' : 'false'), '（外部开关；硬刷后 preload 生效）');
    } catch (e) {
      warn('ccweb-helper-enable 写入失败', e);
    }
  }

  /**
   * 对齐 ccweb-helper：写 EnableCjetProxy + postMessage 页面 sw.js。
   * sw → https://{ip}:8888；再调 cpxy 把环境切到 local:{nodePort}，REST 才到本地 node。
   */
  function postEnableCjetProxy(enabled, host) {
    try {
      var ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!ctrl) return false;
      if (enabled) {
        ctrl.postMessage({
          type: 'EnableCjetProxy',
          payload: {
            EnableCjetProxy: 'true',
            CjetProxyHost: String(host || '127.0.0.1').trim() || '127.0.0.1',
          },
        });
      } else {
        ctrl.postMessage({ type: 'EnableCjetProxy', payload: 'false' });
      }
      return true;
    } catch (e) {
      warn('API proxy postMessage failed', e);
      return false;
    }
  }

  function notifyPageSwApiProxy(enabled, host) {
    if (postEnableCjetProxy(enabled, host)) return true;
    if (!enabled) return false;
    warn(
      'API proxy: 页面尚无 serviceWorker.controller，等待 SW 就绪后补发（需业务页 /sw.js）'
    );
    try {
      if (!navigator.serviceWorker) return false;
      var onReady = function () {
        if (postEnableCjetProxy(enabled, host)) {
          log('API proxy：SW 就绪后已补发 EnableCjetProxy →', host);
        }
      };
      navigator.serviceWorker.ready.then(onReady).catch(function () {});
      navigator.serviceWorker.addEventListener('controllerchange', function once() {
        navigator.serviceWorker.removeEventListener('controllerchange', once);
        onReady();
      });
    } catch (e) {}
    return false;
  }

  /** 调用 cpxy 控制台切换代理目标（与手动点控制台环境按钮等价） */
  function switchCpxyNodeTarget(ip, nodePort) {
    var host = String(ip || '127.0.0.1').trim() || '127.0.0.1';
    var envKey = cpxyEnvKey(nodePort);
    // querystring 必须原样 local:7001（cpxy 用 ctx.querystring 精确匹配，勿 encode :）
    var url = 'https://' + host + ':' + CJET_PROXY_PORT + '/?' + envKey;
    return fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(function (res) {
        return res.text().then(function (text) {
          log('cpxy env →', String(text || '').trim() || envKey, '⇒ http://localhost:' + normalizeNodePort(nodePort));
          return true;
        });
      })
      .catch(function (err) {
        warn('切换 cpxy 失败：请确认已启动 cpxy，且可访问 https://' + host + ':' + CJET_PROXY_PORT, err);
        return false;
      });
  }

  function syncApiProxyState(cfg) {
    if (cfg && cfg.isCjetProxy) {
      var ip = String(cfg.proxyIp || '127.0.0.1').trim() || '127.0.0.1';
      var nodePort = normalizeNodePort(cfg.proxyPort);
      try {
        localStorage.setItem(ENABLE_CJET_PROXY_KEY, 'true');
      } catch (e) {}
      var ok = notifyPageSwApiProxy(true, ip);
      switchCpxyNodeTarget(ip, nodePort);
      log(
        'API proxy ON → SW → https://' +
          ip +
          ':' +
          CJET_PROXY_PORT +
          ' → cpxy → localhost:' +
          nodePort,
        ok ? '(Network 可见)' : '(等待 SW)'
      );
    } else {
      try {
        localStorage.removeItem(ENABLE_CJET_PROXY_KEY);
      } catch (e2) {}
      notifyPageSwApiProxy(false);
      log('API proxy OFF');
    }
  }

  function notifyHelper() {
    try {
      window.dispatchEvent(
        new CustomEvent('ccweb-desktop-domain-entry-updated', { detail: { key: STORAGE_KEY } })
      );
    } catch (e) {}
    try {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: localStorage.getItem(STORAGE_KEY),
          storageArea: localStorage,
        })
      );
    } catch (e) {}
  }

  function applyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    try {
      var bridgeOn = syncBridgeEnableFlag(cfg);
      if (!bridgeOn) {
        log('bridgeEnable=false，跳过写入 domain-debug（可只用 cc-helper）');
        return false;
      }
      var debugOn = hasDebugFlags(cfg);
      // 无 MF 覆盖且无调试开关 → 清空；有调试开关时保留 LS（供 rewriteConsole 等读取）
      if (cfg.syncClear === true && !debugOn && cfg.enable !== true) {
        if (!localStorage.getItem(STORAGE_KEY)) return false;
        localStorage.removeItem(STORAGE_KEY);
        lastAppliedFp = '';
        syncApiProxyState(null);
        syncHelperInstallFlag(null);
        notifyHelper();
        log('cleared storage');
        return true;
      }
      var nextObj = buildStorageObject(cfg);
      // 有 MF 覆盖时以桌面为准；flags-only 已在 buildStorageObject 里处理，勿再写空 domainEntry
      if (cfg.enable === true) {
        nextObj.enable = true;
        nextObj.domainEntry = cfg.domainEntry || {};
        nextObj.current = cfg.current || nextObj.current;
      }
      var fp = fingerprint(nextObj);
      if (fp && fp === lastAppliedFp && fp === fingerprint(readPageConfig())) {
        syncApiProxyState(nextObj);
        syncHelperInstallFlag(nextObj);
        return false;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextObj));
      lastAppliedFp = fp;
      syncApiProxyState(nextObj);
      syncHelperInstallFlag(nextObj);
      notifyHelper();
      log(
        'applied',
        cfg.current,
        Object.keys(nextObj.domainEntry || {}).length,
        'domains',
        'log=',
        !!nextObj.logEnable,
        'helper=',
        !!nextObj.installCCWebHelper,
        'proxy=',
        nextObj.isCjetProxy
          ? 'https://' + nextObj.proxyIp + ':' + CJET_PROXY_PORT + ' (page SW)'
          : false
      );
      return true;
    } catch (e) {
      warn('apply failed', e);
    }
    return false;
  }

  function gmRequest(method, urlPath, bodyObj, timeoutMs) {
    return new Promise(function (resolve) {
      var xhr = getGmXhr();
      if (!xhr) {
        resolve(null);
        return;
      }
      xhr({
        method: method,
        url: API_BASE + urlPath,
        headers: bodyObj ? { 'Content-Type': 'application/json' } : {},
        data: bodyObj ? JSON.stringify(bodyObj) : undefined,
        timeout: timeoutMs || TIMEOUT_MS,
        onload: function (res) {
          if (!res || res.status < 200 || res.status >= 300) {
            warn('http', method, urlPath, res && res.status);
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(res.responseText));
          } catch (e) {
            resolve(null);
          }
        },
        onerror: function (err) {
          warn('xhr error', method, urlPath, err);
          resolve(null);
        },
        ontimeout: function () {
          // wait-sync 正常挂起结束时服务端会先返回；此处超时多半是 API 挂了
          warn('xhr timeout', method, urlPath);
          resolve(null);
        },
      });
    });
  }

  function postHeartbeat(context, host) {
    return gmRequest('POST', '/domain-entry/bridge-heartbeat', {
      contextEnv: context,
      pageHost: host,
      bridgeVersion: BRIDGE_VERSION,
    });
  }

  function postPageEcho(context, host) {
    var existing = readPageConfig();
    if (!existing) return Promise.resolve(null);
    return gmRequest('POST', '/domain-entry/page-echo', {
      contextEnv: context,
      config: existing,
      pageHost: host,
    });
  }

  function handleSyncPayload(sync) {
    if (!sync || !sync.success) return false;
    var applied = false;
    if (sync.pushToPage && sync.config) {
      // 先落 bridgeEnable，关闭时 applyConfig 内部会跳过 domain-debug 写入
      applied = applyConfig(sync.config);
    } else if (sync.config) {
      // 即使不 push，也同步桥接开关（例如桌面关掉桥接）
      syncBridgeEnableFlag(sync.config);
    }
    if (sync.storeUpdatedAt) {
      lastSince = sync.storeUpdatedAt;
    }
    return applied;
  }

  /** 首轮：立即 sync 一次，保证打开页就能拿到当前配置 */
  function initialSync(context, host) {
    return postHeartbeat(context, host).then(function (hb) {
      if (!hb) {
        warn('heartbeat 失败：桌面 API 未开或油猴未授权 127.0.0.1');
        return null;
      }
      return gmRequest('GET', '/domain-entry/sync?context=' + encodeURIComponent(context), null);
    }).then(function (sync) {
      if (!sync) return false;
      var applied = handleSyncPayload(sync);
      return postPageEcho(context, host).then(function () {
        return applied;
      });
    });
  }

  /**
   * 长轮询一轮：心跳 → wait-sync(since) → 有变更则写 LS + echo
   * 空闲时请求挂起至 WAIT_TIMEOUT_MS，不打短间隔轮询。
   */
  function waitCycle(context, host) {
    return postHeartbeat(context, host).then(function (hb) {
      if (!hb) {
        warn('heartbeat 失败：桌面 API 未开或油猴未授权 127.0.0.1');
        return null;
      }
      var q =
        '/domain-entry/wait-sync?context=' +
        encodeURIComponent(context) +
        '&since=' +
        encodeURIComponent(lastSince || '') +
        '&timeoutMs=' +
        WAIT_TIMEOUT_MS;
      return gmRequest('GET', q, null, WAIT_XHR_MS);
    }).then(function (wait) {
      if (!wait) return false;
      var applied = handleSyncPayload(wait);
      var afterEcho = function () {
        if (wait.reloadPage) {
          if (!readLocalBridgeEnable()) {
            log('bridgeEnable=false，跳过 refresh RemoteEntry reload');
            return applied || wait.changed || wait.pushToPage;
          }
          log('refresh RemoteEntry → location.reload()');
          try {
            location.reload();
          } catch (e) {
            warn('reload failed', e);
          }
          return true;
        }
        return applied || wait.changed || wait.pushToPage;
      };
      if (applied || wait.changed || wait.pushToPage || wait.reloadPage) {
        return postPageEcho(context, host).then(afterEcho);
      }
      // 超时无变更：仍偶尔回传页面配置，便于桌面侧感知仍在线
      if (wait.timedOut) {
        return postPageEcho(context, host).then(function () {
          return false;
        });
      }
      return false;
    });
  }

  function runLoop(context) {
    if (loopRunning) return;
    loopRunning = true;
    var host = location.hostname || '';

    function next(errBackoff) {
      var delay = errBackoff ? ERROR_BACKOFF_MS : 0;
      sleep(delay)
        .then(function () {
          return waitCycle(context, host);
        })
        .then(function () {
          next(false);
        })
        .catch(function (e) {
          warn('loop error', e);
          next(true);
        });
    }

    initialSync(context, host)
      .then(function () {
        setBridgeMarker({ phase: 'long-poll', context: context, since: lastSince });
        log('long-poll start context=', context, 'since=', lastSince || '(empty)');
        next(false);
      })
      .catch(function (e) {
        warn('initial sync failed', e);
        next(true);
      });
  }

  function startWhenReady(attempt) {
    var n = attempt || 0;
    var xhr = getGmXhr();
    var context = detectPageContext();
    if (!xhr) {
      if (n < 40) {
        if (n === 0 || n % 10 === 0) warn('等待 GM_xmlhttpRequest…', n);
        setTimeout(function () {
          startWhenReady(n + 1);
        }, 250);
        return;
      }
      warn('放弃：GM_xmlhttpRequest 不可用。请在油猴脚本设置中确认已授权，并允许访问 127.0.0.1');
      return;
    }
    if (!context) {
      if (n < 20) {
        setTimeout(function () {
          startWhenReady(n + 1);
        }, 250);
        return;
      }
      warn('放弃：无法识别业务环境 host=', location.hostname);
      return;
    }
    if (started) return;
    started = true;
    setBridgeMarker({ phase: 'ready', context: context });
    log('ready context=', context, 'host=', location.hostname);
    // 页面已有 LS 时立即挂上 API 代理 / 助手开关，不等首轮 sync
    try {
      var existing = readPageConfig();
      syncApiProxyState(existing);
      syncHelperInstallFlag(existing);
    } catch (e) {}
    runLoop(context);
  }

  startWhenReady(0);
})();
