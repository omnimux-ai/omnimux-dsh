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
 *   empty      —— settings 为空 → 引导可见，三选一卡片 + 跳过入口；右栏封面须带深海照片/水母图层且照片真实解码
 *   cover-offline —— 屏蔽 unsplash → 封面确定性退回深海 SVG + 水母，尺寸不塌陷
 *   narrow     —— 1024x760 窄视口 → 封面随卡片收缩且尺寸有效
 *   empty-cli  —— 点击「本机助手」→ CLI 面板（fetch 桩返回空列表 → 无可用提示）
 *   empty-key  —— 点击「自己的密钥」→ BYOK 表单字段渲染
 *   skip       —— 点击跳过 → PUT /omnimux/runtime/mode {mode:'official'}，随后引导消失
 *   save       —— BYOK 填文字模型并保存 → PUT 携带 scenarioBindings.text → onVerified → PUT {mode:'key'} → 引导消失
 *   configured —— 已存 runtimeMode → 引导不出现（升级用户不受打扰）
 *
 * 用法：node scripts/runtime-guide-web-qa.mjs [--root <worktree>]
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
      window.__qaSettings.runtimeMode = body.mode;
      notify();
      return json({ ok: true });
    }
    if (path === '/omnimux/agents') return json({ agents: [] });
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

  window.__omnimuxAuth = { ensureLogin: (opts) => { window.__qaRequests.push({ path: '__ensureLogin__', method: 'CALL', body: opts }) } };

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
  const report = {
    runId, startedAt: new Date().toISOString(), completedAt: null,
    pass: false, serverPort: null, cdpPort: null,
    assertions: [], screenshots: {}, errors: [],
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
    // 封面照片层显式加载证明：超时/失败必须让断言变红，而不是静默退回 SVG 兜底。
    const COVER_PHOTO_URL = 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80';
    const waitForCoverPhoto = async (timeoutMs = 15000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const ok = await evaluate(`new Promise((resolve) => {
          const img = new Image();
          const done = (value) => resolve(value);
          img.onload = () => (img.decode
            ? img.decode().then(() => done(img.naturalWidth > 0)).catch(() => done(img.naturalWidth > 0))
            : done(img.naturalWidth > 0));
          img.onerror = () => done(false);
          img.src = ${JSON.stringify(COVER_PHOTO_URL)};
          setTimeout(() => done(false), 4000);
        })`).catch(() => false);
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 300));
      }
      return false;
    };
    const artBoxExpression = `(() => {
      const el = document.querySelector('[data-omnimux-runtime-guide] .omnimux-runtime-guide-art');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    })()`;
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
      ['choice-agent', '本机助手'],
      ['choice-key', '自己的密钥'],
      ['choice-skip', '暂时跳过'],
    ];
    for (const [name, text] of checks) {
      check(name, await evaluate(pageBodyIncludes(text)), `missing "${text}"`);
    }
    // 右栏封面：必须同时带登录窗同款深海 SVG 与水母图层，否则退化成灰雾占位。
    const coverLayers = await evaluate(`(() => {
      const el = document.querySelector('${guideSelector} .omnimux-runtime-guide-art');
      if (!el) return null;
      return {
        base: getComputedStyle(el).backgroundImage,
        jellyfish: getComputedStyle(el, '::before').backgroundImage,
      };
    })()`);
    check(
      'cover-poster-layers',
      Boolean(coverLayers)
        && /images\.unsplash\.com/.test(coverLayers.base)
        && /data:image\/svg\+xml/.test(coverLayers.base)
        && /data:image\/svg\+xml/.test(coverLayers.jellyfish),
      JSON.stringify(coverLayers).slice(0, 240),
    );
    // 照片层必须真实解码成功；失败即红，禁止静默退回 SVG 兜底还报绿。
    const photoLoaded = await waitForCoverPhoto();
    check('cover-photo-loaded', photoLoaded, photoLoaded ? '' : 'unsplash cover photo failed to load within timeout');
    await new Promise((r) => setTimeout(r, 400));
    await screenshot('empty-guide');

    // --- 场景 1b：断网 → 封面必须确定性退回深海 SVG + 水母，不得塌陷成空白 ---
    await sendCdp('Network.enable', {});
    await sendCdp('Network.setBlockedURLs', { urls: ['*images.unsplash.com*'] });
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('cover-offline-visible', await waitFor(`Boolean(document.querySelector('${guideSelector} .omnimux-runtime-guide-art'))`), '');
    const offlineCover = await evaluate(`(() => {
      const el = document.querySelector('${guideSelector} .omnimux-runtime-guide-art');
      if (!el) return null;
      return { base: getComputedStyle(el).backgroundImage, jellyfish: getComputedStyle(el, '::before').backgroundImage };
    })()`);
    check(
      'cover-offline-fallback',
      Boolean(offlineCover)
        && /data:image\/svg\+xml/.test(offlineCover.base)
        && /data:image\/svg\+xml/.test(offlineCover.jellyfish),
      JSON.stringify(offlineCover).slice(0, 240),
    );
    const offlineBox = await evaluate(artBoxExpression);
    check('cover-offline-box', Boolean(offlineBox) && offlineBox.width >= 300 && offlineBox.height >= 400, JSON.stringify(offlineBox));
    await screenshot('cover-offline');
    await sendCdp('Network.setBlockedURLs', { urls: [] });

    // --- 场景 1c：窄视口 → 封面随卡片收缩但不变形、不塌陷 ---
    await sendCdp('Emulation.setDeviceMetricsOverride', { width: 1024, height: 760, deviceScaleFactor: 1, mobile: false });
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('narrow-guide-visible', await waitFor(`Boolean(document.querySelector('${guideSelector} .omnimux-runtime-guide-art'))`), '');
    const narrowBox = await evaluate(artBoxExpression);
    check('narrow-cover-box', Boolean(narrowBox) && narrowBox.width >= 300 && narrowBox.height >= 400, JSON.stringify(narrowBox));
    await screenshot('narrow-guide');
    await sendCdp('Emulation.clearDeviceMetricsOverride', {});
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    await waitFor(`Boolean(document.querySelector('${guideSelector}'))`, 5000);

    // --- 场景 2：点击「本机助手」→ CLI 面板（空列表提示） ---
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '本机助手');
    check('agent-step', await waitFor(pageBodyIncludes('选择用来运行提示词的 CLI')), '');
    check('agent-empty-hint', await waitFor(pageBodyIncludes('你的 CLI (0)'), 5000), '');
    await screenshot('empty-guide-cli');

    // --- 场景 3：回退并点击「自己的密钥」→ BYOK 表单 ---
    await evaluate(`
      (() => {
        const el = [...document.querySelectorAll('${guideSelector} button')]
          .find((n) => (n.innerText || '').includes('上一步'));
        if (el) el.click();
      })()
    `);
    await waitFor(pageBodyIncludes('自己的密钥'), 3000);
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '自己的密钥');
    check('key-step', await waitFor(`Boolean(document.querySelector('${guideSelector} input[placeholder*="粘贴密钥"]'))`, 5000), '');
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
    await clickByText(`${guideSelector} button`, '暂时跳过');
    const putSeen = await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/runtime/mode' && r.method === 'PUT' && r.body && r.body.mode === 'official')
    `);
    check('skip-put-official', putSeen, JSON.stringify(await evaluate('window.__qaRequests')));
    check('guide-hidden-after-skip', await waitFor(`!document.querySelector('${guideSelector}')`), '');
    await screenshot('after-skip');

    // --- 场景 5：重新进入空设置 → BYOK 保存 → 绑定 text → onVerified → PUT key → 引导消失 ---
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await waitFor('Boolean(window.__qaReady)', 10000);
    check('guide-visible-revisit', await waitFor(`Boolean(document.querySelector('${guideSelector}'))`), '');
    await clickByText(`${guideSelector} button, ${guideSelector} [role="button"], ${guideSelector} .omnimux-runtime-guide-card`, '自己的密钥');
    await waitFor(`Boolean(document.querySelector('${guideSelector} input[placeholder*="粘贴密钥"]'))`, 5000);
    // React 受控输入需要原生 setter 派发 input 事件，onChange 才会收到。
    await evaluate(`
      (() => {
        const rows = [...document.querySelectorAll('${guideSelector} .omx-form-row')];
        const row = rows.find((r) => (r.innerText || '').includes('文字工具'));
        const input = row && row.querySelector('input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'qa-test-model');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await clickByText(`${guideSelector} button`, '保存');
    const byokPut = await waitFor(`
      (window.__qaRequests || []).some((r) => r.path === '/omnimux/byok/config' && r.method === 'PUT'
        && r.body && r.body.scenarioBindings && r.body.scenarioBindings.text
        && r.body.scenarioBindings.text.channel === 'byok')
    `);
    check('save-binds-text', byokPut, JSON.stringify(await evaluate('window.__qaRequests')));
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
    // 场景 1b 主动屏蔽 unsplash，浏览器会记一条 ERR_BLOCKED_BY_CLIENT；属预期，放行。
    const consoleHardErrors = (report.consoleErrors || []).filter((e) => !/WebSocket|ERR_BLOCKED_BY_CLIENT/.test(e));
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
