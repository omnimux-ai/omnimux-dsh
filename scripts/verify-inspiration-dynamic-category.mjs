#!/usr/bin/env node
/**
 * @file scripts/verify-inspiration-dynamic-category.mjs
 * @description Issue #2497 任务专属真实浏览器验证：灵感社区分类下拉动态选项。
 *
 * 与 scripts/worktree-web-qa.mjs 相同的隔离纪律：动态空闲端口（port 0）、
 * 无头 Chrome 临时实例、测完即焚、零共享 profile 污染。差异在于本脚本真实
 * 渲染 InspirationSection（而非占位 Stage），并由本机 HTTP 服务扮演 Host：
 *   - GET /omnimux/inspiration/categories → 云端真实分类聚合（digital 等）
 *   - GET /omnimux/inspiration[/local]    → 少量云端/本地条目
 * 验证点：
 *   1. 分类下拉首项恰为「全部」；
 *   2. 其后的选项来自聚合端点（digital / Health & Wellness / 女装和内衣），
 *      不再是写死的 9 个中文电商类目；
 *   3. 聚合端点生产失败路径 `200 { data: [] }` 时下拉降级为仅「全部」，页面无报错；
 *   4. 切到「本地」后选项恰为 ['全部']，且不把云端分类值转发给本地查询；
 *   5. 截图证据落盘 docs/evidence/inspiration-dynamic-category-filter-verified.png。
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const TMP_DIR = join(REPO_ROOT, 'tmp', 'verify-inspiration-dynamic-category');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence');
const SHOT_PATH = join(EVIDENCE_DIR, 'inspiration-dynamic-category-filter-verified.png');
const REPORT_PATH = join(EVIDENCE_DIR, 'inspiration-dynamic-category-filter-verify.json');

/** 聚合端点返回的云端真实分类（自由文本，中英混杂，与实证一致）。 */
const CATEGORY_ROWS = [
  { name: 'digital', count: 1178 },
  { name: 'Health & Wellness', count: 300 },
  { name: '女装和内衣', count: 120 },
];

const CLOUD_ITEMS = [
  { id: 'c1', type: 'video', title: 'cloud digital item', category: 'digital', source_platform: 'tiktok' },
  { id: 'c2', type: 'video', title: 'cloud wellness item', category: 'Health & Wellness', source_platform: 'tiktok' },
];
const LOCAL_ITEMS = [
  { id: 'l1', type: 'video', title: 'local item', category: '', source_platform: 'tiktok' },
];

const ENTRY_SOURCE = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationSection } from '../../plugins/omnimux-inspiration/src/client/InspirationSection.jsx'
import { zh } from '../../plugins/omnimux-inspiration/src/client/locales.js'

window.__omnimuxAuth = { ensureLogin() {} }
const t = (key) => zh[key] || key
createRoot(document.getElementById('root')).render(React.createElement(InspirationSection, { t, active: true }))
`;

async function bundleEntry() {
  mkdirSync(TMP_DIR, { recursive: true });
  const entryPath = join(TMP_DIR, 'entry.jsx');
  writeFileSync(entryPath, ENTRY_SOURCE);
  const hubRequire = createRequire(join(REPO_ROOT, 'plugins/omnimux/package.json'));
  const { build } = hubRequire('esbuild');
  const result = await build({
    absWorkingDir: REPO_ROOT,
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    write: false,
    jsx: 'automatic',
    loader: {
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.css': 'empty',
      '.svg': 'text',
      '.png': 'empty',
    },
    outdir: 'dist',
    logLevel: 'silent',
  });
  const code = result.outputFiles?.[0]?.text;
  assert.ok(code, 'esbuild 未产出验证页 bundle');
  return code;
}

function harnessHtml(bundledJs) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Issue #2497 分类下拉动态化验证</title>
  <style>
    body { margin: 0; background: #111113; font-family: -apple-system, sans-serif; }
    #root { width: 100vw; min-height: 100vh; }
  </style>
</head>
<body>
  <script>
    window.__pageErrors = [];
    window.addEventListener('error', function (event) {
      window.__pageErrors.push(String(event.message || event.error || 'error'));
    });
    window.addEventListener('unhandledrejection', function (event) {
      window.__pageErrors.push(String(event.reason || 'unhandledrejection'));
    });
  </script>
  <div id="root"></div>
  <script>${bundledJs}</script>
</body>
</html>`;
}

/**
 * Host 扮演服务：页面与桩 API 同源，fetch('/omnimux/...') 直接命中。
 * @param {{ emptyCategories?: boolean, logLocal?: string[] }} options
 */
function startServer(html, options = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (url.pathname === '/omnimux/inspiration/categories') {
      // Production failure is 200 { data: [] } (SWR degrade), not 5xx.
      json(200, { data: options.emptyCategories ? [] : CATEGORY_ROWS });
      return;
    }
    if (url.pathname === '/omnimux/inspiration/local') {
      if (Array.isArray(options.logLocal)) options.logLocal.push(url.search);
      json(200, { success: true, data: { items: LOCAL_ITEMS, total: LOCAL_ITEMS.length, platforms: [{ name: 'tiktok', count: 1 }] } });
      return;
    }
    if (url.pathname === '/omnimux/inspiration') {
      json(200, { success: true, data: { items: CLOUD_ITEMS, total: CLOUD_ITEMS.length } });
      return;
    }
    json(404, { error: 'not found' });
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

async function launchChrome() {
  const { existsSync } = await import('node:fs');
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
  ].filter(Boolean);
  const bin = candidates.find((candidate) => existsSync(candidate));
  assert.ok(bin, '未找到 Chrome / Chromium，可用 CHROME_PATH 指定');
  const proc = spawn(bin, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,800',
    'about:blank',
  ]);
  const cdpPort = await new Promise((resolvePort, rejectPort) => {
    const timeout = setTimeout(() => rejectPort(new Error('启动无头 Chrome 超时')), 8000);
    proc.stderr.on('data', (chunk) => {
      const match = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolvePort(Number(match[1]));
      }
    });
    proc.on('error', (error) => {
      clearTimeout(timeout);
      rejectPort(error);
    });
  });
  return { proc, cdpPort };
}

async function connectCdp(cdpPort) {
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, '未找到 Chrome Page 调试目标');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const send = (method, params = {}) => new Promise((resolveCdp, rejectCdp) => {
    const id = ++msgId;
    const onMsg = (event) => {
      const message = JSON.parse(event.data);
      if (message.id === id) {
        ws.removeEventListener('message', onMsg);
        if (message.error) rejectCdp(new Error(`CDP [${method}] 失败: ${JSON.stringify(message.error)}`));
        else resolveCdp(message.result || message);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((resolveWs, rejectWs) => {
    ws.addEventListener('open', resolveWs);
    ws.addEventListener('error', rejectWs);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`页面脚本执行失败: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}`);
    }
    return result.result?.value;
  };
  return { ws, send, evaluate };
}

/** 轮询页面表达式直到 truthy。 */
async function waitFor(evaluate, expression, budgetMs = 6000) {
  const start = Date.now();
  for (;;) {
    const value = await evaluate(expression);
    if (value) return value;
    if (Date.now() - start > budgetMs) return null;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

const CATEGORY_TRIGGER = '[aria-haspopup="listbox"][aria-label="商品分类"]';

const PAGE_ERROR_HOOK = `(function() {
  if (window.__pageErrorHooked) return true;
  window.__pageErrorHooked = true;
  window.__pageErrors = window.__pageErrors || [];
  window.addEventListener('error', function (event) {
    window.__pageErrors.push(String(event.message || event.error || 'error'));
  });
  window.addEventListener('unhandledrejection', function (event) {
    window.__pageErrors.push(String(event.reason || 'unhandledrejection'));
  });
  return true;
})()`;

/** Hang error hooks on every new document, then navigate. */
async function navigateWithErrorHooks(send, url) {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_ERROR_HOOK });
  await send('Page.navigate', { url });
}

async function scenarioDynamicOptions(bundledJs, report) {
  const server = await startServer(harnessHtml(bundledJs));
  const { proc, cdpPort } = await launchChrome();
  let client = null;
  try {
    client = await connectCdp(cdpPort);
    const { send, evaluate } = client;
    await navigateWithErrorHooks(send, `http://127.0.0.1:${server.address().port}/`);

    const mounted = await waitFor(evaluate, `(function() {
      const el = document.querySelector('${CATEGORY_TRIGGER}');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    })()`);
    assert.ok(mounted, '分类下拉触发器未渲染或尺寸为空');
    report.assertions.push({ name: 'category-trigger-mounted', pass: true, dimensions: mounted });

    await evaluate(`document.querySelector('${CATEGORY_TRIGGER}').click()`);
    // 聚合端点异步返回后选项实时重渲染：等菜单多于首项再断言。
    // dsh-ui-kit 的 DropdownSelect 菜单项用 role="menuitem"（listbox 契约的菜单形态）。
    const labels = await waitFor(evaluate, `(function() {
      const options = [...document.querySelectorAll('[role="option"], [role="menuitem"]')].map((node) => node.textContent.trim());
      return options.length > 1 ? options : null;
    })()`);
    assert.ok(labels, '分类下拉未展开动态选项（聚合未到达或菜单未打开）');
    assert.equal(labels[0], '全部', `首选项必须恰为「全部」，实际: ${JSON.stringify(labels)}`);
    for (const expected of CATEGORY_ROWS.map((row) => row.name)) {
      assert.ok(labels.includes(expected), `选项缺少云端真实分类 ${expected}: ${JSON.stringify(labels)}`);
    }
    for (const legacy of ['美妆护肤', '厨房用品', '数码科技']) {
      assert.ok(!labels.includes(legacy), `写死的旧分类 ${legacy} 仍在选项中: ${JSON.stringify(labels)}`);
    }
    report.assertions.push({ name: 'dynamic-category-options', pass: true, options: labels });

    // 截图前确保菜单处于展开态（重渲染可能将其合上）：不在则重新点开。
    await evaluate(`(function() {
      if (document.querySelector('[role="menuitem"], [role="option"]')) return true
      document.querySelector('${CATEGORY_TRIGGER}').click()
      return true
    })()`);
    await waitFor(evaluate, `document.querySelectorAll('[role="option"], [role="menuitem"]').length > 1`);
    // harness 剥离了组件 CSS（.module.css 无法内联），弹出层落在文档流底部：
    // 把它滚动进视野并等过渡动画稳定后再截图。
    await evaluate(`document.querySelector('[role="menu"], [role="listbox"]')?.scrollIntoView({ block: 'center' })`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    assert.ok(shot?.data, '截图数据为空');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(SHOT_PATH, Buffer.from(shot.data, 'base64'));
    report.assertions.push({ name: 'screenshot-saved', pass: true, path: SHOT_PATH });
  } finally {
    if (client) {
      try { client.ws.close(); } catch {}
    }
    try { proc.kill('SIGTERM'); } catch {}
    try { server.close(); } catch {}
  }
}

async function scenarioDegradeOnFailure(bundledJs, report) {
  const server = await startServer(harnessHtml(bundledJs), { emptyCategories: true });
  const { proc, cdpPort } = await launchChrome();
  let client = null;
  try {
    client = await connectCdp(cdpPort);
    const { send, evaluate } = client;
    await navigateWithErrorHooks(send, `http://127.0.0.1:${server.address().port}/`);
    const mounted = await waitFor(evaluate, `Boolean(document.querySelector('${CATEGORY_TRIGGER}'))`);
    assert.ok(mounted, '聚合失败场景下分类下拉未渲染');
    await evaluate(`document.querySelector('${CATEGORY_TRIGGER}').click()`);
    const labels = await waitFor(evaluate, `(function() {
      const options = [...document.querySelectorAll('[role="option"], [role="menuitem"]')].map((node) => node.textContent.trim());
      return options.length > 0 ? options : null;
    })()`);
    assert.deepEqual(labels, ['全部'], `聚合失败时下拉必须降级为仅「全部」，实际: ${JSON.stringify(labels)}`);
    const pageErrors = await evaluate(`(window.__pageErrors || []).length`);
    assert.equal(pageErrors || 0, 0, '页面出现未捕获错误');
    report.assertions.push({ name: 'degrade-on-aggregate-failure', pass: true, options: labels });
  } finally {
    if (client) {
      try { client.ws.close(); } catch {}
    }
    try { proc.kill('SIGTERM'); } catch {}
    try { server.close(); } catch {}
  }
}

async function scenarioLocalTabDropsCloudCategory(bundledJs, report) {
  const logLocal = [];
  const server = await startServer(harnessHtml(bundledJs), { logLocal });
  const { proc, cdpPort } = await launchChrome();
  let client = null;
  try {
    client = await connectCdp(cdpPort);
    const { send, evaluate } = client;
    await navigateWithErrorHooks(send, `http://127.0.0.1:${server.address().port}/`);
    const mounted = await waitFor(evaluate, `Boolean(document.querySelector('${CATEGORY_TRIGGER}'))`);
    assert.ok(mounted, '切本地场景下分类下拉未渲染');

    await evaluate(`document.querySelector('${CATEGORY_TRIGGER}').click()`);
    const cloudLabels = await waitFor(evaluate, `(function() {
      const options = [...document.querySelectorAll('[role="option"], [role="menuitem"]')].map((node) => node.textContent.trim());
      return options.includes('digital') ? options : null;
    })()`);
    assert.ok(cloudLabels, '切本地前必须先看到云端分类');
    await evaluate(`([...document.querySelectorAll('[role="option"], [role="menuitem"]')].find((node) => node.textContent.trim() === 'digital') || { click() {} }).click()`);
    // 全部 tab 的 loadData 身份变化会打两次本地库；先让它们落地再切 tab。
    const selectStarted = Date.now();
    while (Date.now() - selectStarted < 5000) {
      const withDigital = logLocal.filter((search) => /(?:^|[?&])category=digital(?:&|$)/.test(search));
      if (withDigital.length >= 1) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));

    const beforeSwitch = logLocal.length;
    const localClicked = await evaluate(`(function() {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const local = tabs.find((node) => (node.textContent || '').trim() === '本地');
      if (!local) return false;
      local.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    })()`);
    assert.ok(localClicked, '未找到「本地」tab');

    const localStarted = Date.now();
    let localTabQueries = [];
    while (Date.now() - localStarted < 6000) {
      localTabQueries = logLocal.slice(beforeSwitch).filter((search) => (
        /(?:^|[?&])sort=new(?:&|$)/.test(search) && !/(?:^|[?&])category=/.test(search)
      ));
      if (localTabQueries.length > 0) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.ok(
      localTabQueries.length > 0,
      `切到本地后未见无分类的 sort=new 查询。切后: ${JSON.stringify(logLocal.slice(beforeSwitch))} 全量: ${JSON.stringify(logLocal)}`,
    );

    await evaluate(`document.querySelector('${CATEGORY_TRIGGER}').click()`);
    const labels = await waitFor(evaluate, `(function() {
      const options = [...document.querySelectorAll('[role="option"], [role="menuitem"]')].map((node) => node.textContent.trim());
      return options.length === 1 && options[0] === '全部' ? options : null;
    })()`);
    assert.deepEqual(labels, ['全部'], `切到本地后选项必须恰为 ['全部']，实际: ${JSON.stringify(labels)}`);
    const pageErrors = await evaluate(`(window.__pageErrors || []).length`);
    assert.equal(pageErrors || 0, 0, '切本地时页面出现未捕获错误');
    report.assertions.push({ name: 'local-tab-drops-cloud-category', pass: true, options: labels, localQueries: localTabQueries });
  } finally {
    if (client) {
      try { client.ws.close(); } catch {}
    }
    try { proc.kill('SIGTERM'); } catch {}
    try { server.close(); } catch {}
  }
}

const report = {
  task: 'inspiration-dynamic-category-filter',
  issue: 2497,
  startedAt: new Date().toISOString(),
  pass: false,
  assertions: [],
  errors: [],
};

try {
  const bundledJs = await bundleEntry();
  await scenarioDynamicOptions(bundledJs, report);
  await scenarioDegradeOnFailure(bundledJs, report);
  await scenarioLocalTabDropsCloudCategory(bundledJs, report);
  report.pass = true;
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  report.completedAt = new Date().toISOString();
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  rmSync(TMP_DIR, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
