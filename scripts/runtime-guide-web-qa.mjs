#!/usr/bin/env node
/**
 * @file scripts/runtime-guide-web-qa.mjs
 * @description 首启模型渠道引导（RuntimeGuideGate）隔离工作树 Web 验收。
 *
 * 验证对象：plugins/omnimux/src/client/index.js 中挂在 shell.overlay 上的
 * omnimux-runtime-guide 常驻注册。与 Stage QA 共用原则：工作树源码打包、
 * 临时 HTTP 服务、无头 Chrome CDP、PNG 截图证据，零桌面依赖、零公共环境污染。
 *
 * 场景：
 *   empty      —— settings 为空 → 引导可见，三选一卡片 + 跳过入口，单列无右侧封面
 *   loggedin   —— 已登录 → 主按钮显示「继续（已登录）」，点击写 official 并关闭
 *   empty-cli  —— 点击「本机助手」→ CLI 面板（fetch 桩返回空列表 → 无可用提示）
 *   empty-key  —— 点击「自己的密钥」→ BYOK 表单字段渲染
 *   skip       —— 点击跳过 → PUT /omnimux/runtime/mode {mode:'official'}，随后引导消失
 *   save       —— BYOK 填文字模型并保存 → PUT 携带 scenarioBindings.text → onVerified → PUT {mode:'key'} → 引导消失
 *   configured —— 已存 runtimeMode → 引导不出现（升级用户不受打扰）
 *
 * 用法：node scripts/runtime-guide-web-qa.mjs [--root <worktree>]
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PNG } from 'pngjs';
import { findChromePath } from './worktree-web-qa.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const MODULE_URL = '/__qa_runtime_guide__.js';

/** esbuild virtual entry：真实 apply + 打包内 React 渲染桩。 */
const QA_ENTRY_SOURCE = `
import * as plugin from './plugins/omnimux/src/client/index.js';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
window.__qaPlugin = plugin;
window.__qaRenderSlot = (component, props) => {
  const host = document.createElement('div');
  host.id = 'qa-slot-root';
  document.body.appendChild(host);
  createRoot(host).render(createElement(component, props));
};
`;

async function bundleClient(root) {
  const hubRequire = createRequire(join(root, 'plugins/omnimux/package.json'));
  const { build } = hubRequire('esbuild');
  const result = await build({
    absWorkingDir: root,
    stdin: { contents: QA_ENTRY_SOURCE, loader: 'js', resolveDir: root, sourcefile: 'qa-entry.js' },
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    jsxImportSource: 'react',
    write: false,
    loader: {
      '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty',
      '.css': 'empty', '.svg': 'text', '.png': 'empty', '.webp': 'empty',
    },
    outdir: 'dist',
    logLevel: 'error',
  });
  assert.ok(result.outputFiles?.[0]?.text, '客户端打包产物为空');
  return result.outputFiles[0].text;
}

function buildHarnessHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><title>OmniMux Runtime Guide QA</title>
<style>body{margin:0;background:#0f1117;color:#e2e8f0;font-family:-apple-system,sans-serif}#qa-host{width:100vw;height:100vh;position:relative}</style>
</head>
<body><div id="qa-host"></div>
<script>
(function(){
  const params = new URLSearchParams(location.search);
  window.__qaSettings = {};
  window.__qaRequests = [];
  window.__qaErrors = [];
  window.__qaReady = false;
  window.__qaOverlay = [];
  const byokState = { revision: 0, providers: [], bindings: {}, providerRevisions: {}, credentialVersions: {} };
  let claudeSignedIn = false
  const demoAgents = params.get('agentauth') === '1'
    ? [
        { id: 'codex', name: 'Codex CLI', version: '0.167.0', installed: true, models: ['gpt-6.1-sol', 'gpt-6.1-codex'], auth: { state: 'signed-in', method: 'file', loginSupported: true } },
        { id: 'claude', name: 'Claude Code', version: '2.1.289 (Claude Code)', installed: true, models: ['claude-opus-5', 'claude-sonnet-5'], auth: { state: 'signed-out', method: 'file', loginSupported: true } },
        { id: 'kimi', name: 'Kimi CLI', version: '2.5.2', installed: true, models: ['kimi-k2.5'], auth: { state: 'signed-in', method: 'file', loginSupported: true } },
        { id: 'qwen', name: 'Qwen Code', version: '0.26.9', installed: true, models: [], auth: { state: 'signed-out', method: 'none', loginSupported: false } },
      ]
    : [];

  if (params.get('configured') === '1') window.__qaSettings.runtimeMode = 'official';

  const listeners = new Set();
  // useSyncExternalStore 要求快照引用稳定；每次写后重建缓存对象。
  let cachedSnapshot = { status: 'ready', value: window.__qaSettings };
  const rebuildSnapshot = () => { cachedSnapshot = { status: 'ready', value: window.__qaSettings }; };
  const notify = () => { rebuildSnapshot(); for (const fn of [...listeners]) { try { fn() } catch (e) { window.__qaErrors.push('listener:' + e.message) } } };
  const omnimuxController = {
    getSnapshot: () => cachedSnapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: async (field, v) => { window.__qaSettings[field] = v; notify() },
    unset: async (field) => { delete window.__qaSettings[field]; notify() },
  };
  const dicts = {};

  const json = (data) => ({ ok: true, status: 200, json: async () => data });
  window.fetch = async (url, init = {}) => {
    const path = String(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    window.__qaRequests.push({ path, method, body });
    if (path === '/omnimux/runtime/mode' && method === 'PUT') {
      if (window.__qaAuth.fail_mode === true) {
        return { ok: false, status: 500, json: async () => ({ error: 'mode write failed' }) };
      }
      if (window.__qaAuth.delay_mode === true) {
        window.setTimeout(() => { window.__qaSettings.runtimeMode = body.mode; notify(); }, 2000);
        return json({ ok: true });
      }
      window.__qaSettings.runtimeMode = body.mode;
      notify();
      return json({ ok: true });
    }
    if (path === '/omnimux/agents') {
      return json({ agents: demoAgents.map((item) => (item.id === 'claude' && claudeSignedIn
        ? { ...item, auth: { ...item.auth, state: 'signed-in' } }
        : item)) });
    }
    if (path === '/omnimux/agents/login' && method === 'POST') {
      claudeSignedIn = true;
      return json({ ok: true, launched: true, mode: 'background' });
    }
    if (path === '/omnimux/agents/updates') return json({ updates: {} });
    if (path === '/omnimux/agents/select' && method === 'POST') return json({ ok: true });
    // BYOK stubs honour the real contract in plugins/omnimux/src/byok/http.js:
    // PUT must answer { saved: true, revision: <int> } and the readback GET
    // must echo the same revision/providerRevision/credentialVersion, or the
    // panel's save-confirmation logic rejects the response.
    if (path === '/omnimux/byok/config' && method === 'GET') {
      return json({
        revision: byokState.revision,
        providers: byokState.providers,
        bindings: byokState.bindings,
      });
    }
    if (path === '/omnimux/byok/config' && method === 'PUT') {
      const provider = String(body.provider || 'custom');
      byokState.revision += 1;
      byokState.providerRevisions[provider] = (byokState.providerRevisions[provider] || 0) + 1;
      if (String(body.apiKey || '').trim()) byokState.credentialVersions[provider] = (byokState.credentialVersions[provider] || 0) + 1;
      const record = {
        provider,
        endpoint: String(body.endpoint || ''),
        models: body.models || {},
        capabilities: body.capabilities || Object.keys(body.models || {}),
        revision: byokState.providerRevisions[provider],
        credentialVersion: byokState.credentialVersions[provider] || 0,
        configured: Boolean(String(body.apiKey || '').trim()),
        verified: false,
      };
      byokState.providers = [...byokState.providers.filter((item) => item.provider !== provider), record];
      if (body.scenarioBindings && typeof body.scenarioBindings === 'object') {
        byokState.bindings = { ...byokState.bindings, ...body.scenarioBindings };
      }
      window.__qaSettings.byokProviders = byokState.providers;
      window.__qaSettings.scenarioBindings = byokState.bindings;
      notify();
      return json({
        saved: true,
        provider,
        providerRevision: record.revision,
        credential: record.configured ? 'confirmed' : 'unchanged',
        revision: byokState.revision,
        providers: byokState.providers,
        bindings: byokState.bindings,
      });
    }
    if (path === '/omnimux/byok/test' && method === 'POST') {
      const provider = String(body.provider || 'custom');
      const stored = byokState.providers.find((item) => item.provider === provider);
      return json({
        ok: true,
        checkType: 'offline-config',
        persisted: false,
        verified: false,
        revision: byokState.revision,
        providerRevision: stored?.revision || 0,
        credentialVersion: stored?.credentialVersion || 0,
        checkedAt: new Date().toISOString(),
      });
    }
    if (path.startsWith('/omnimux/byok/')) return json({ ok: true });
    return json({});
  };

  window.__qaAuth = {
    logged_in: params.get('loggedin') === '1',
    cached: params.get('loggedin') === '1',
    remote_logged_in: params.get('loggedin') === '1' || params.get('remoteauth') === '1',
    negative_cache: params.get('negativecache') === '1',
    delay_mode: params.get('delayskip') === '1',
    fail_mode: params.get('failmode') === '1',
    race_auth: params.get('raceauth') === '1',
    getStatusCalls: [],
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/omnimux/auth/status')) {
      return Promise.resolve(new Response(JSON.stringify({ logged_in: window.__qaAuth.remote_logged_in === true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return nativeFetch(input, init);
  };
  window.__omnimuxAuth = {
    ensureLogin: (opts) => { window.__qaRequests.push({ path: '__ensureLogin__', method: 'CALL', body: opts }) },
    isLoggedIn: () => window.__qaAuth.cached === true,
    peekCache: () => (window.__qaAuth.cached === true
      ? { ok: true, status: 200, body: { logged_in: true } }
      : (window.__qaAuth.negative_cache === true ? { ok: true, status: 200, body: { logged_in: false } } : null)),
    getStatus: (verify) => {
      window.__qaAuth.getStatusCalls.push(verify === true);
      if (window.__qaAuth.race_auth === true && window.__qaAuth.getStatusCalls.length === 1) {
        return new Promise((resolve) => window.setTimeout(() => resolve({ ok: true, status: 200, body: { logged_in: false } }), 700));
      }
      return Promise.resolve({ ok: true, status: 200, body: { logged_in: window.__qaAuth.remote_logged_in === true } });
    },
    subscribe: (cb) => { window.__qaAuth.subscribeCb = cb; return () => { window.__qaAuth.subscribeCb = undefined } },
  };

  const ctx = {
    locale: {
      register: (ns, dict) => { dicts[ns] = dict; return () => {} },
      bind: (ns) => (key, params) => {
        const dict = (dicts[ns] && dicts[ns].zh) || {};
        let s = dict[key] !== undefined ? dict[key] : key;
        if (params) for (const k of Object.keys(params)) s = s.replaceAll('{' + k + '}', params[k]);
        return s;
      },
    },
    slots: {
      inject: (name, fn) => { try { return fn() } catch (e) { window.__qaErrors.push('slots.inject[' + name + ']:' + e.message) } },
      register: (spec, component) => {
        if (spec && spec.name === 'shell.overlay') {
          window.__qaOverlay.push({ id: spec.id, order: spec.order, spec, component });
        }
        return () => {};
      },
    },
    inject: (deps, fn) => {
      const inner = {
        slots: ctx.slots,
        configForms: { get: () => omnimuxController, whileServed: (_ns, fn) => (typeof fn === 'function' ? fn() : undefined) },
        effect: (effectFn, label) => { try { const r = effectFn(); return typeof r === 'function' ? r : (() => {}) } catch (e) { window.__qaErrors.push('effect[' + (label || '?') + ']:' + e.message); return () => {} } },
        betterSidebar: { registerTab: () => () => {} },
        layout: {}, sessions: {}, sidebarRight: {}, commandUi: {},
        loader: {}, modules: {}, uiConversation: {},
      };
      try { return fn(inner) } catch (e) { window.__qaErrors.push('inject[' + deps.join(',') + ']:' + e.message) }
    },
    effect: (effectFn, label) => { try { const r = effectFn(); return typeof r === 'function' ? r : (() => {}) } catch (e) { window.__qaErrors.push('ctx.effect[' + (label || '?') + ']:' + e.message); return () => {} } },
  };

  window.__qaMountOverlays = () => {
    for (const entry of window.__qaOverlay) {
      try {
        const props = typeof entry.spec.inject === 'function' ? entry.spec.inject() : {};
        window.__qaRenderSlot(entry.component, props);
      } catch (e) { window.__qaErrors.push('mount:' + entry.id + ':' + e.message) }
    }
  };

  const boot = () => {
    try {
      const plugin = window.__qaPlugin;
      if (plugin && typeof plugin.apply === 'function') plugin.apply(ctx);
      window.__qaMountOverlays();
      window.__qaReady = true;
    } catch (e) {
      window.__qaErrors.push('apply:' + e.message);
      window.__qaReady = true;
    }
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>
<script src="__MODULE_URL__"></script>
</body></html>`;
}

async function runRuntimeGuideWebQa(options = {}) {
  const root = options.root || REPO_ROOT;
  const runId = randomUUID();
  const evidenceDir = options.evidenceDir
    || join(root, '.workbuddy/evidence/worktree-qa', `runtime-guide-${runId}`);
  mkdirSync(evidenceDir, { recursive: true });
  const gitValue = (args) => {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
  };
  const report = {
    runId, startedAt: new Date().toISOString(), completedAt: null,
    pass: false, serverPort: null, cdpPort: null,
    root, head: gitValue(['rev-parse', 'HEAD']), dirty: gitValue(['status', '--porcelain']),
    url: null, assertions: [], screenshots: {}, errors: [],
  };
  let server = null;
  let chromeProc = null;
  let cdpWs = null;
  const profileDir = join(root, 'tmp', `runtime-guide-qa-chrome-${process.pid}-${runId.slice(0, 8)}`);

  const check = (name, pass, detail) => {
    report.assertions.push({ name, pass: Boolean(pass), detail });
    if (!pass) report.errors.push(`${name}: ${detail || 'failed'}`);
  };

  try {
    const bundleText = await bundleClient(root);
    server = http.createServer((req, res) => {
      const path = (req.url || '/').split('?')[0];
      if (path === MODULE_URL) {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(bundleText);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildHarnessHtml().replace('__MODULE_URL__', MODULE_URL));
    });
    await new Promise((resolveListen) => { server.listen(0, '127.0.0.1', resolveListen); });
    report.serverPort = server.address().port;
    report.url = `http://127.0.0.1:${report.serverPort}/`;
    check('ephemeral-server-listen', true, `port ${report.serverPort}`);

    mkdirSync(profileDir, { recursive: true });
    const chromeArgs = [
      '--headless=new', '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu',
      '--hide-scrollbars', '--window-size=1440,900', 'about:blank',
    ];
    if (process.platform === 'linux') chromeArgs.push('--no-sandbox', '--disable-dev-shm-usage');
    chromeProc = spawn(findChromePath(), chromeArgs);
    const cdpPort = await new Promise((resolvePort, rejectPort) => {
      const portFile = join(profileDir, 'DevToolsActivePort');
      const tail = [];
      let settled = false;
      const finish = (fn, value) => { if (settled) return; settled = true; fn(value); };
      const poll = setInterval(() => {
        try {
          if (!existsSync(portFile)) return;
          const port = Number(readFileSync(portFile, 'utf8').split('\n')[0].trim());
          if (Number.isInteger(port) && port > 0) { clearInterval(poll); finish(resolvePort, port); }
        } catch {}
      }, 120);
      setTimeout(() => { clearInterval(poll); finish(rejectPort, new Error(`无头浏览器启动超时; ${tail.join('').slice(-400)}`)); }, 25000);
      chromeProc.stderr.on('data', (chunk) => { tail.push(chunk.toString()); if (tail.length > 20) tail.shift(); });
      chromeProc.on('error', (err) => finish(rejectPort, err));
    });
    report.cdpPort = cdpPort;
    check('ephemeral-cdp-listen', true, `port ${cdpPort}`);

    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
    const page = targets.find((t) => t.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, '未找到 Page 调试目标');
    cdpWs = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 0;
    const sendCdp = (method, params = {}) => new Promise((resolveCdp, rejectCdp) => {
      const id = ++msgId;
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === id) {
          cdpWs.removeEventListener('message', onMsg);
          if (m.error) rejectCdp(new Error(`CDP [${method}]: ${JSON.stringify(m.error)}`));
          else resolveCdp(m.result || m);
        }
      };
      cdpWs.addEventListener('message', onMsg);
      cdpWs.send(JSON.stringify({ id, method, params }));
    });
    await new Promise((res, rej) => { cdpWs.addEventListener('open', res); cdpWs.addEventListener('error', rej); });
    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('Log.enable');
    cdpWs.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error')) {
        const text = m.method === 'Runtime.exceptionThrown'
          ? (m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text)
          : m.params.entry.text;
        report.consoleErrors = report.consoleErrors || [];
        report.consoleErrors.push(String(text).slice(0, 500));
      }
    });

    const evaluate = async (expression) => {
      const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        throw new Error(`页面执行失败: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
      }
      return res.result?.value;
    };
    const waitFor = async (expression, timeoutMs = 6000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = await evaluate(expression).catch(() => false);
        if (value) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };
    const screenshot = async (name) => {
      const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
      const bytes = Buffer.from(shot.data, 'base64');
      const decoded = PNG.sync.read(bytes);
      const file = join(evidenceDir, `${name}.png`);
      (await import('node:fs')).writeFileSync(file, bytes);
      report.screenshots[name] = { file, width: decoded.width, height: decoded.height };
      return file;
    };
    const pageBodyIncludes = (text) => `(document.body && document.body.innerText || '').includes(${JSON.stringify(text)})`;
    const guideSelector = '[data-omnimux-runtime-guide]';
    const clickByText = (selector, text) => evaluate(`
      (() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .find((n) => (n.innerText || '').includes(${JSON.stringify(text)}));
        if (!el) return false;
        el.click();
        return true;
      })()
    `);

    // --- 场景 1：空设置 → 引导出现 ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    // stub 缺口的已知 effect 报错（与引导无关）放行；挂载/引导自身的错误必须为零。
    const GUIDE_RELEVANT = '(window.__qaErrors || []).filter((e) => !/reference storage|task model pickers|canvas generation|HMR client|composer add|user message|assistant message|attachments enhancer|prompt fence|auth gate|quota gate|login-gate|inject\\[/.test(e))';
    check('plugin-apply-clean', await evaluate(`${GUIDE_RELEVANT}.length === 0`), await evaluate(`${GUIDE_RELEVANT}.join(" | ")`));
    const overlay = await evaluate('window.__qaOverlay.map((e) => ({ id: e.id, order: e.order }))');
    const guideEntry = Array.isArray(overlay) ? overlay.find((e) => e.id === 'omnimux-runtime-guide') : null;
    check('overlay-registered', guideEntry && guideEntry.order === 29, JSON.stringify(overlay));
    check('guide-visible-empty', await waitFor(`Boolean(document.querySelector('${guideSelector}'))`), '');

    const checks = [
      ['choice-official', '登录 OmniMux'],
      ['choice-agent', '本地Agent'],
      ['choice-key', '使用自己的 Key'],
      ['choice-skip', '暂时跳过'],
    ];
    for (const [name, text] of checks) {
      check(name, await evaluate(pageBodyIncludes(text)), `missing "${text}"`);
    }
    await clickByText(`${guideSelector} button`, '登录 OmniMux');
    check('loggedout-ensure-login', await waitFor(`(window.__qaRequests || []).some((r) => r.path === '__ensureLogin__')`), JSON.stringify(await evaluate('window.__qaRequests')));
    // 首跑选择步骤为单列，不再有右侧装饰封面。
    const chooseLayout = await evaluate(`(() => {
      const sheet = document.querySelector('${guideSelector} .omnimux-runtime-guide-sheet');
      return {
        single: Boolean(sheet && sheet.classList.contains('omnimux-runtime-guide-sheet--single')),
        art: Boolean(document.querySelector('${guideSelector} .omnimux-runtime-guide-art')),
      };
    })()`);
    check('choose-single-column', Boolean(chooseLayout) && chooseLayout.single === true, JSON.stringify(chooseLayout));
    check('choose-no-cover', Boolean(chooseLayout) && chooseLayout.art === false, JSON.stringify(chooseLayout));
    await screenshot('empty-guide');

    // --- 场景 1b：已登录 → 主按钮显示「继续（已登录）」，点击直接写 official ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?loggedin=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('loggedin-guide-visible', await waitFor(`Boolean(document.querySelector('${guideSelector}'))`), '');
    check('loggedin-button-label', await waitFor(pageBodyIncludes('继续（已登录）'), 3000), '');
    await screenshot('loggedin-guide');
    await clickByText(`${guideSelector} button`, '继续（已登录）');
    check('loggedin-continue-put', await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/runtime/mode' && r.method === 'PUT' && r.body && r.body.mode === 'official')
    `), JSON.stringify(await evaluate('window.__qaRequests')));
    // --- 场景 1b2：延迟写入时按钮立即 loading，其它按钮禁用 ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?loggedin=1&delayskip=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('loading-guide-visible', await waitFor(`Boolean(document.querySelector('${guideSelector}'))`), '');
    await clickByText(`${guideSelector} button`, '继续（已登录）');
    check('loading-spinner', await waitFor(`Boolean(document.querySelector('${guideSelector} button[aria-busy="true"]'))`, 1000), '');
    check('loading-others-disabled', await evaluate(`[...document.querySelectorAll('${guideSelector} button')].every((el) => el.disabled || el.getAttribute('aria-busy') === 'true')`), '');
    await screenshot('guide-loading');
    await waitFor(`!document.querySelector('${guideSelector}')`, 5000);

    check('loggedin-guide-hidden', await waitFor(`!document.querySelector('${guideSelector}')`), '');
    await screenshot('loggedin-continue');
    // 缓存为空时回退 /omnimux/auth/status（remoteauth=1）。
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?remoteauth=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('remoteauth-button-label', await waitFor(pageBodyIncludes('继续（已登录）'), 3000), '');
    await screenshot('remoteauth-guide');
    // 负缓存不得阻止强制刷新：缓存明确 false 但服务端已登录时仍要显示已登录。
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?negativecache=1&remoteauth=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('negativecache-button-label', await waitFor(pageBodyIncludes('继续（已登录）'), 3000), '');
    await screenshot('negativecache-guide');
    // focus 时强制刷新：初始未登录，focus 前服务端变为已登录，按钮应更新。
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?focusauth=1&negativecache=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('focusauth-initial-loggedout', await waitFor(pageBodyIncludes('登录 OmniMux'), 3000), '');
    await evaluate(`(() => { window.__qaAuth.remote_logged_in = true; window.dispatchEvent(new Event('focus')); return true; })()`);
    check('focusauth-updated', await waitFor(pageBodyIncludes('继续（已登录）'), 3000), '');
    await screenshot('focusauth-guide');
    // 旧响应不得覆盖新响应：首个 getStatus 慢返回 false，focus 返回 true 后仍应保持已登录。
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?raceauth=1&negativecache=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await waitFor(`Boolean(document.querySelector('${guideSelector}'))`, 5000);
    await evaluate(`(() => { window.__qaAuth.remote_logged_in = true; window.dispatchEvent(new Event('focus')); return true; })()`);
    check('raceauth-updated', await waitFor(pageBodyIncludes('继续（已登录）'), 3000), '');
    await new Promise((r) => setTimeout(r, 900));
    check('raceauth-late-response-ignored', await evaluate(pageBodyIncludes('继续（已登录）')), '');
    await screenshot('raceauth-guide');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await waitFor(`Boolean(document.querySelector('${guideSelector}'))`, 5000);

    // --- 场景 2：点击「本机助手」→ CLI 面板（空列表提示） ---
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '本地Agent');
    check('agent-step', await waitFor(pageBodyIncludes('选择用来运行提示词的 CLI')), '');
    check('agent-step-title', await waitFor(`(document.querySelector('${guideSelector} #omnimux-runtime-guide-headline') || {}).innerText === '本地Agent'`, 2000), '');
    check('agent-empty-hint', await waitFor(pageBodyIncludes('你的 CLI (0)'), 5000), '');
    check('agent-no-cover', await evaluate(`!document.querySelector('${guideSelector} .omnimux-runtime-guide-art')`), '');
    await screenshot('empty-guide-cli');

    // --- 场景 2b：有 CLI 时选择 Codex → 默认模型下拉 → 继续先测试再保存 ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?agentauth=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await waitFor(`Boolean(document.querySelector('${guideSelector}'))`, 5000);
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '本地Agent');
    check('agent-grid-count', await waitFor(`document.querySelectorAll('${guideSelector} .omx-agent-card').length === 4`, 3000), '');
    await clickByText(`${guideSelector} .omx-agent-card`, 'Claude Code');
    check('agent-no-login-button', await evaluate(`![...document.querySelectorAll('${guideSelector} button')].some((el) => (el.innerText || '').trim() === '登录')`), '');
    const claudeContinue = await evaluate(`(() => {
      const el = [...document.querySelectorAll('${guideSelector} button')].find((node) => (node.innerText || '').trim() === '继续');
      return el ? Boolean(el.disabled) : null;
    })()`);
    check('agent-login-continue-enabled', claudeContinue === false, String(claudeContinue));
    await clickByText(`${guideSelector} .omx-agent-card`, 'Codex CLI');
    check('agent-model-label', await waitFor(pageBodyIncludes('模型 · Codex CLI'), 3000), '');
    check('agent-model-trigger', await waitFor(`Boolean(document.querySelector('${guideSelector} #omx-agent-model-codex'))`, 3000), '');
    await evaluate(`(() => { const el = document.querySelector('${guideSelector} #omx-agent-model-codex'); if (el) el.click(); return true; })()`);
    check('agent-model-options', await waitFor(pageBodyIncludes('gpt-6.1-sol'), 3000), '');
    await clickByText('[role="menuitem"]', 'gpt-6.1-sol');
    check('agent-model-selected', await waitFor(pageBodyIncludes('gpt-6.1-sol'), 3000), '');
    check('agent-model-not-written-before-continue', await evaluate('window.__qaSettings.runtimeAgentModel === undefined'), JSON.stringify(await evaluate('window.__qaSettings')));
    check('agent-guide-visible-after-model', await evaluate(`Boolean(document.querySelector('${guideSelector}'))`), '');
    const continueBox = await evaluate(`(() => {
      const el = [...document.querySelectorAll('${guideSelector} button')].find((node) => (node.innerText || '').trim() === '继续');
      return el ? { disabled: Boolean(el.disabled) } : null;
    })()`);
    check('agent-continue-enabled', Boolean(continueBox) && continueBox.disabled === false, JSON.stringify(continueBox));
    await screenshot('agent-selected-continue');
    await clickByText(`${guideSelector} button`, '继续');
    check('agent-continue-check-only', await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/agents/select' && r.method === 'POST' && r.body && r.body.checkOnly === true)
    `), JSON.stringify(await evaluate('window.__qaRequests')));
    check('agent-continue-saved', await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/agents/select' && r.method === 'POST' && r.body && r.body.checkOnly !== true)
    `), JSON.stringify(await evaluate('window.__qaRequests')));
    check('agent-model-written', await waitFor(`window.__qaSettings.runtimeAgentModel === 'gpt-6.1-sol'`, 3000), JSON.stringify(await evaluate('window.__qaSettings')));
    check('agent-continue-put', await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/runtime/mode' && r.method === 'PUT')
    `), '');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await waitFor(`Boolean(document.querySelector('${guideSelector}'))`, 5000);
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '本地Agent');

    // --- 场景 3：回退并点击「自己的密钥」→ BYOK 表单 ---
    await evaluate(`
      (() => {
        const el = [...document.querySelectorAll('${guideSelector} button')]
          .find((n) => (n.innerText || '').includes('上一步'));
        if (el) el.click();
      })()
    `);
    await waitFor(pageBodyIncludes('使用自己的 Key'), 3000);
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '使用自己的 Key');
    check('key-step', await waitFor(`Boolean(document.querySelector('${guideSelector} [data-omnimux-key-draft]'))`, 5000), '');
    check('key-step-title', await waitFor(`(document.querySelector('${guideSelector} #omnimux-runtime-guide-headline') || {}).innerText === '使用自己的 Key'`, 2000), '');
    // 新文本配置界面：7 家提供商、快速填充、API Key、Base URL、模型下拉；不得出现媒体字段。
    const keyProviderIds = await evaluate(`[...document.querySelectorAll('${guideSelector} [data-omnimux-key-draft] [data-provider]')].map((el) => el.getAttribute('data-provider'))`);
    check('key-provider-count', Array.isArray(keyProviderIds) && keyProviderIds.length === 7, JSON.stringify(keyProviderIds));
    check('key-api-key', await waitFor(`Boolean(document.querySelector('${guideSelector} input[aria-label="API Key"]'))`, 3000), '');
    check('key-base-url', await waitFor(`Boolean(document.querySelector('${guideSelector} input[aria-label="Base URL"]'))`, 3000), '');
    check('key-model-select', await waitFor(`Boolean(document.querySelector('${guideSelector} [aria-label="模型"]'))`, 3000), '');
    check('key-no-media-fields', await evaluate(`(() => {
      const guide = document.querySelector('${guideSelector}');
      const text = (guide && guide.innerText) || '';
      return !['素材理解','图片生成','视频生成','音频生成'].some((word) => text.includes(word));
    })()`), '');
    check('key-default-model', await waitFor(pageBodyIncludes('claude-opus-5'), 3000), '');
    check('key-no-cover', await evaluate(`!document.querySelector('${guideSelector} .omnimux-runtime-guide-art')`), '');
    // 显示/隐藏切换：密码框必须在 text 与 password 间切换。
    const keyType = () => evaluate(`(document.querySelector('${guideSelector} input[aria-label="API Key"]') || {}).type`);
    check('key-key-hidden', (await keyType()) === 'password', '');
    await clickByText(`${guideSelector} button`, '显示');
    check('key-key-shown', await waitFor(`document.querySelector('${guideSelector} input[aria-label="API Key"]').type === 'text'`, 2000), '');
    await clickByText(`${guideSelector} button`, '隐藏');
    check('key-key-hidden-again', await waitFor(`document.querySelector('${guideSelector} input[aria-label="API Key"]').type === 'password'`, 2000), '');
    // 切换提供商：Base URL 与模型下拉必须同步变更，再切回默认家。
    await clickByText(`${guideSelector} [data-provider]`, 'Google Gemini');
    check('key-provider-switch-endpoint', await waitFor(`document.querySelector('${guideSelector} input[aria-label="Base URL"]').value === 'https://generativelanguage.googleapis.com/v1beta/openai'`, 2000), '');
    check('key-provider-switch-model', await waitFor(pageBodyIncludes('gemini-3.8-flash'), 2000), '');
    await clickByText(`${guideSelector} [data-provider]`, 'Anthropic');
    await waitFor(pageBodyIncludes('claude-opus-5'), 2000);
    await screenshot('empty-guide-key');

    // --- 场景 4：回退 → 点击跳过 → PUT official → 引导消失 ---
    await evaluate(`
      (() => {
        const el = [...document.querySelectorAll('${guideSelector} button')]
          .find((n) => (n.innerText || '').includes('上一步'));
        if (el) el.click();
      })()
    `);
    await waitFor(pageBodyIncludes('暂时跳过'), 3000);
    const skipBox = await evaluate(`(() => {
      const el = document.querySelector('${guideSelector} .omnimux-runtime-guide-skip-button');
      const row = document.querySelector('${guideSelector} .omnimux-runtime-guide-skip');
      if (!el || !row) return null;
      const rect = el.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height), rowWidth: Math.round(rowRect.width) };
    })()`);
    check('skip-button-wide', Boolean(skipBox) && skipBox.width >= 300 && skipBox.width >= skipBox.rowWidth * 0.9 && skipBox.height >= 24, JSON.stringify(skipBox));
    await clickByText(`${guideSelector} button`, '暂时跳过');
    const putSeen = await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/runtime/mode' && r.method === 'PUT' && r.body && r.body.mode === 'official')
    `);
    check('skip-put-official', putSeen, JSON.stringify(await evaluate('window.__qaRequests')));
    check('guide-hidden-after-skip', await waitFor(`!document.querySelector('${guideSelector}')`), '');
    await screenshot('after-skip');

    // --- 场景 4b：慢快照 → 本地 dismissed 必须立即隐藏；失败 → 保留引导并显示错误 ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?delayskip=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await waitFor(`Boolean(document.querySelector('${guideSelector}'))`, 5000);
    await clickByText(`${guideSelector} button`, '暂时跳过');
    check('skip-local-dismiss', await waitFor(`!document.querySelector('${guideSelector}')`, 500), '');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?failmode=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await waitFor(`Boolean(document.querySelector('${guideSelector}'))`, 5000);
    await clickByText(`${guideSelector} button`, '暂时跳过');
    check('skip-failure-keeps-guide', await waitFor(pageBodyIncludes('mode write failed'), 3000), '');
    check('skip-failure-guide-visible', await evaluate(`Boolean(document.querySelector('${guideSelector}'))`), '');
    await screenshot('skip-failure');

    // --- 场景 5：重新进入空设置 → BYOK 保存 → 绑定 text → onVerified → PUT key → 引导消失 ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('guide-visible-revisit', await waitFor(`Boolean(document.querySelector('${guideSelector}'))`), '');
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '使用自己的 Key');
    await waitFor(`Boolean(document.querySelector('${guideSelector} [data-omnimux-key-draft]'))`, 5000);
    // 空 Key 必须被拒绝且不关闭引导。
    await clickByText(`${guideSelector} button`, '继续');
    check('save-empty-key-rejected', await waitFor(pageBodyIncludes('请填写 API Key'), 3000), '');
    check('save-empty-key-keeps-guide', await evaluate(`Boolean(document.querySelector('${guideSelector} [data-omnimux-key-draft]'))`), '');
    // React 受控输入需要原生 setter 派发 input 事件，onChange 才会收到。
    await evaluate(`
      (() => {
        const input = document.querySelector('${guideSelector} input[aria-label="API Key"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'qa-test-key');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await clickByText(`${guideSelector} button`, '继续');
    const byokPut = await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/byok/config' && r.method === 'PUT'
        && r.body && r.body.scenarioBindings && r.body.scenarioBindings.text
        && r.body.scenarioBindings.text.channel === 'byok')
    `);
    check('save-binds-text', byokPut, JSON.stringify(await evaluate('window.__qaRequests')));
    const textModelPut = await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/byok/config' && r.method === 'PUT'
        && r.body && r.body.provider === 'anthropic' && r.body.models && r.body.models.text === 'claude-opus-5'
        && Array.isArray(r.body.capabilities) && r.body.capabilities.includes('text'))
    `);
    check('save-text-model', textModelPut, JSON.stringify(await evaluate('window.__qaRequests')));
    const keyPut = await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/runtime/mode' && r.method === 'PUT' && r.body && r.body.mode === 'key')
    `);
    check('save-put-key', keyPut, JSON.stringify(await evaluate('window.__qaRequests')));
    check('guide-hidden-after-save', await waitFor(`!document.querySelector('${guideSelector}')`), '');
    await screenshot('after-save');

    // --- 场景 6：已配置 → 引导不出现 ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/?configured=1` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await new Promise((r) => setTimeout(r, 1200));
    check('guide-hidden-configured', await evaluate(`!document.querySelector('${guideSelector}')`), '');
    await screenshot('configured-no-guide');

    check('no-unexpected-page-errors', await evaluate(`${GUIDE_RELEVANT}.length === 0`), await evaluate(`${GUIDE_RELEVANT}.join(" | ")`));
    const consoleHardErrors = (report.consoleErrors || []).filter((entry) => !/WebSocket/.test(entry));
    check('no-render-exceptions', consoleHardErrors.length === 0, consoleHardErrors.join(' | '));
    report.pass = report.assertions.every((a) => a.pass);
  } catch (error) {
    report.errors.push(error instanceof Error ? error.stack : String(error));
  } finally {
    try { if (cdpWs) cdpWs.close(); } catch {}
    try { if (chromeProc) chromeProc.kill('SIGKILL'); } catch {}
    try { if (server) await new Promise((r) => server.close(r)); } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    report.completedAt = new Date().toISOString();
    mkdirSync(evidenceDir, { recursive: true });
    (await import('node:fs')).writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  return report;
}

async function main() {
  const { values } = parseArgs({ options: { root: { type: 'string' }, 'evidence-dir': { type: 'string' } } });
  const report = await runRuntimeGuideWebQa({ root: values.root, evidenceDir: values['evidence-dir'] });
  for (const a of report.assertions) {
    process.stdout.write(`  ${a.pass ? '✔' : '✖'} ${a.name}${a.detail ? `  (${String(a.detail).slice(0, 160)})` : ''}\n`);
  }
  process.stdout.write(`\n报告目录: ${join('.workbuddy/evidence/worktree-qa')}\n`);
  if (!report.pass) {
    process.stderr.write(`\n❌ runtime-guide QA 失败\n${report.errors.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('\n✅ runtime-guide QA 通过\n');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((err) => { process.stderr.write(`${err.stack || err}\n`); process.exit(1); });
}

export { runRuntimeGuideWebQa };
