#!/usr/bin/env node
/**
 * verify-canvas-pricing-models — 创作画布「在售模型发现 + 参数一致性」真机 Web 验收。
 *
 * 回答本次任务的两个验收点：
 *   1) 画布能否正常发现官方价目表在售的模型；
 *   2) 画布拿到的模型可选参数是否与执行中枢契约逐字一致。
 *
 * 两条证据平面：
 *   数据平面：真实应用页面内、带同源登录态请求画布自己消费的目录端点
 *             （`/omnimux-workflow/api/capabilities`），与中枢契约深比较。
 *   DOM 平面：真实无头 Chrome 打开创作画布，展开型号级联菜单，读回渲染出来的型号项。
 *
 * 证据：<root>/.workbuddy/evidence/canvas-pricing-models/<runId>/（PNG + report.json）。
 * 自清理：测试环境与 Chrome 在 finally 回收；登录凭据只在内存传递，不落盘、不打印。
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startTestEnvironment } from './test-env-bootstrap.mjs';
import { findChromePath, assertPng } from './worktree-web-qa.mjs';
import { loadAll, DEFAULT_SPECS_DIR } from '../plugins/omnimux/src/catalog/contract/load.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 官方价目表（https://omnimux.ai/pricing）在售的生成式模型 —— 本次验收对象。 */
const PRICING_MODELS = Object.freeze({
  image: ['gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'],
  video: ['seedance-2-5', 'seedance-2-0', 'minimax-h3'],
  text: ['gemini-3.8-flash'],
  audio: ['seed-audio-1.0'],
});

function hubParameters() {
  const index = loadAll(DEFAULT_SPECS_DIR);
  const out = {};
  for (const model of index.all()) {
    out[model.id] = {
      model: model.parameters ?? null,
      operations: Object.fromEntries((model.operations ?? []).filter((op) => op.parameters).map((op) => [op.id, op.parameters])),
      listedOperations: (model.operations ?? []).filter((op) => op.listed === true).map((op) => op.id),
    };
  }
  return out;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${k}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** 在真实页面里、带同源登录态取回画布自己消费的目录端点。 */
const CATALOG_FETCH = `(async () => {
  const response = await fetch('/omnimux-workflow/api/capabilities', {
    headers: { accept: 'application/json' }, credentials: 'same-origin',
  });
  const text = await response.text();
  let body = null; try { body = JSON.parse(text); } catch { body = null; }
  return JSON.stringify({ ok: response.ok, status: response.status, sample: text.slice(0, 300), body: body ? {
    source: body.source, fingerprint: body.fingerprint,
    text: (body.text ?? []).map(r => r.id),
    image: (body.image ?? []).map(r => r.id),
    video: (body.video ?? []).map(r => r.id),
    audio: (body.audio ?? []).map(r => r.id),
    parameters: Object.fromEntries((body.models ?? []).map(m => [m.id, {
      model: m.parameters ?? null,
      operations: Object.fromEntries((m.operations ?? []).filter(o => o.parameters).map(o => [o.id, o.parameters])),
      listedOperations: (m.operations ?? []).filter(o => o.listed === true).map(o => o.id),
    }])),
  } : null });
})()`;

/** 创建工程夹具（含一个图像节点），供型号级联菜单挂载。 */
const SEED_WORKSPACE = `(async () => {
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  const created = await fetch('/omnimux-workflow/api/workspaces', {
    method: 'POST', headers, credentials: 'same-origin',
    body: JSON.stringify({ name: 'QA 在售模型验收' }),
  });
  const createdBody = await created.json().catch(() => ({}));
  const id = createdBody?.workspace?.id;
  if (!id) return JSON.stringify({ ok: false, step: 'create', status: created.status, body: JSON.stringify(createdBody).slice(0, 400) });
  const snapshot = {
    id,
    name: 'QA 在售模型验收',
    version: 1,
    expectedVersion: 0,
    nodes: [{
      id: 'qa-image-1', type: 'material',
      position: { x: 160, y: 160 }, width: 320, height: 420,
      data: { kind: 'image', materialType: 'image', title: '图片', params: { model: 'gpt-image-2.5' } },
    }],
    edges: [],
    settings: { maxParallel: 1 },
  };
  const saved = await fetch('/omnimux-workflow/api/workspaces/' + encodeURIComponent(id), {
    method: 'PUT', headers, credentials: 'same-origin', body: JSON.stringify(snapshot),
  });
  const savedBody = await saved.text();
  return JSON.stringify({ ok: saved.ok, id, status: saved.status, body: savedBody.slice(0, 400) });
})()`;

const DOM_PROBE = `JSON.stringify((() => {
  const trigger = document.querySelector('[data-testid="wf-model-cascade-trigger"]');
  const els = [...document.querySelectorAll('[data-testid^="wf-cascade-model-"]')];
  const items = els.map(el => ({
    id: el.getAttribute('data-testid').replace('wf-cascade-model-', ''),
    label: (el.textContent || '').trim(),
    width: Math.round(el.getBoundingClientRect().width),
    height: Math.round(el.getBoundingClientRect().height),
  }));
  return {
    triggerPresent: Boolean(trigger),
    triggerText: trigger ? (trigger.textContent || '').trim() : null,
    itemCount: items.length,
    items,
    visibleCount: items.filter(i => i.width > 0 && i.height > 0).length,
    emptyState: Boolean(document.querySelector('[data-testid="wf-model-empty"]')),
    bodyTextLength: (document.body?.innerText || '').trim().length,
    href: location.href,
    textSample: (document.body?.innerText || '').trim().slice(0, 300),
    canvasRootPresent: Boolean(document.querySelector('[data-testid="wf-canvas-root"], .wf-canvas, .react-flow')),
  };
})())`;

async function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((yes, no) => { socket.onopen = yes; socket.onerror = no; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: yes, reject: no } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) no(new Error(`cdp ${message.error.message}`)); else yes(message.result);
  };
  const send = (method, params) => new Promise((yes, no) => {
    const id = ++sequence;
    pending.set(id, { resolve: yes, reject: no });
    socket.send(JSON.stringify({ id, method, params: params ?? {} }));
  });
  return { socket, send };
}

async function main() {
  const runId = randomUUID();
  const evidenceDir = join(root, '.workbuddy/evidence/canvas-pricing-models', runId);
  mkdirSync(evidenceDir, { recursive: true });
  const report = {
    runId, root, startedAt: new Date().toISOString(), completedAt: null, pass: false,
    origin: null, cdpPort: null, assertions: [], screenshots: [], errors: [], cleanup: null,
  };
  let env; let chrome; let socket;
  try {
    env = await startTestEnvironment({ root, mode: 'ui' });
    report.origin = env.origin;
    report.assertions.push({ name: 'app-runtime-ready', pass: true, evidenceLevel: env.summary?.evidenceLevel });

    const login = await fetch(env.loginUrl, { redirect: 'manual' });
    const raw = login.headers.getSetCookie()[0] ?? '';
    const cookieName = raw.split('=')[0];
    const cookieValue = raw.split(';')[0].slice(cookieName.length + 1);
    if (!cookieName || !cookieValue) throw new Error('CANVAS_QA_LOGIN_COOKIE');
    const cookieHeader = `${cookieName}=${cookieValue}`;

    // 先在 Node 侧确认登录态可用：端点本身必须 200，否则浏览器侧失败无法归因。
    const preflight = await fetch(`${env.origin}/omnimux-workflow/api/capabilities`, { headers: { cookie: cookieHeader } });
    report.assertions.push({ name: 'catalog-endpoint-authenticated', pass: preflight.ok, status: preflight.status });

    chrome = spawn(findChromePath(), [
      '--headless=new', '--remote-debugging-port=0', '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank',
    ]);
    const cdpPort = await new Promise((yes, no) => {
      const timer = setTimeout(() => no(new Error('chrome-start-timeout')), 20000);
      let buffer = '';
      chrome.stderr.on('data', (chunk) => {
        buffer += chunk.toString();
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (match) { clearTimeout(timer); yes(Number(match[1])); }
      });
    });
    report.cdpPort = cdpPort;
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const cdp = await connectCdp(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    socket = cdp.socket;
    const send = cdp.send;
    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');

    // 先落到源站再写 Cookie：无文档上下文时 setCookie 可能静默失效。
    await send('Page.navigate', { url: `${env.origin}/` });
    await sleep(1500);
    const applied = await send('Network.setCookie', {
      name: cookieName, value: cookieValue, url: `${env.origin}/`, path: '/', secure: false, sameSite: 'Lax',
    });
    const cookieSeen = await send('Runtime.evaluate', {
      expression: `document.cookie.includes(${JSON.stringify(cookieName)})`, returnByValue: true,
    });
    report.assertions.push({ name: 'auth-cookie-applied', pass: applied.success !== false && cookieSeen.result.value === true });

    // ── 数据平面：画布自己消费的目录端点 ────────────────────────────────
    const catalogEval = await send('Runtime.evaluate', { expression: CATALOG_FETCH, awaitPromise: true, returnByValue: true });
    const planeA = JSON.parse(catalogEval.result.value);
    report.assertions.push({ name: 'catalog-endpoint-ok-in-page', pass: planeA.ok === true, status: planeA.status, sample: planeA.ok ? undefined : planeA.sample });
    if (!planeA.body) throw new Error('CANVAS_QA_CATALOG_BODY');

    const hub = hubParameters();
    const buckets = { image: planeA.body.image, video: planeA.body.video, text: planeA.body.text, audio: planeA.body.audio };
    report.catalog = { source: planeA.body.source, fingerprint: planeA.body.fingerprint, buckets, modelCount: Object.keys(planeA.body.parameters).length };

    for (const [kind, expected] of Object.entries(PRICING_MODELS)) {
      const actual = [...(buckets[kind] ?? [])].sort();
      const want = [...expected].sort();
      report.assertions.push({
        name: `canvas-discovers-${kind}-models`,
        pass: want.every((id) => actual.includes(id)),
        expected: want, actual, missing: want.filter((id) => !actual.includes(id)),
      });
    }

    const mismatches = []; const checked = [];
    for (const ids of Object.values(PRICING_MODELS)) {
      for (const id of ids) {
        const fromCanvas = planeA.body.parameters[id]; const fromHub = hub[id];
        if (!fromCanvas || !fromHub) { mismatches.push({ id, reason: 'model absent from one side' }); continue; }
        if (stable(fromCanvas.model) !== stable(fromHub.model)) mismatches.push({ id, reason: 'model-level parameters differ', canvas: fromCanvas.model, hub: fromHub.model });
        if (stable(fromCanvas.operations) !== stable(fromHub.operations)) mismatches.push({ id, reason: 'operation-level parameters differ', canvas: fromCanvas.operations, hub: fromHub.operations });
        if (stable([...fromCanvas.listedOperations].sort()) !== stable([...fromHub.listedOperations].sort())) mismatches.push({ id, reason: 'listed operations differ' });
        checked.push(id);
      }
    }
    report.parameters = { checked, mismatches };
    report.assertions.push({ name: 'canvas-parameters-match-hub-contract', pass: mismatches.length === 0, modelsChecked: checked.length, mismatches });

    // ── DOM 平面：真实画布渲染出来的型号项 ──────────────────────────────
    const seededEval = await send('Runtime.evaluate', { expression: SEED_WORKSPACE, awaitPromise: true, returnByValue: true });
    const seeded = JSON.parse(seededEval.result.value);
    report.dom = { seeded };
    if (seeded.ok) {
      await send('Page.navigate', { url: `${env.origin}/#/workspace/${seeded.id}` });
      const deadline = Date.now() + 40000;
      let probe = null;
      while (Date.now() < deadline) {
        await sleep(800);
        const r = await send('Runtime.evaluate', { expression: DOM_PROBE, returnByValue: true });
        probe = JSON.parse(r.result.value);
        if (probe.triggerPresent) break;
      }
      report.assertions.push({ name: 'canvas-config-panel-mounted', pass: Boolean(probe?.triggerPresent), detail: probe ? { bodyTextLength: probe.bodyTextLength, emptyState: probe.emptyState } : null });
      if (probe?.triggerPresent) {
        await send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="wf-model-cascade-trigger"]').click(); 'ok'`, returnByValue: true });
        await sleep(1000);
        const r = await send('Runtime.evaluate', { expression: DOM_PROBE, returnByValue: true });
        probe = JSON.parse(r.result.value);
      }
      report.dom = { ...report.dom, triggerText: probe?.triggerText, itemCount: probe?.itemCount ?? 0, visibleCount: probe?.visibleCount ?? 0, items: probe?.items ?? [], emptyState: probe?.emptyState ?? null };
      const catalogModelIds = new Set(Object.keys(planeA.body.parameters));
      const rendered = (probe?.items ?? []).map((i) => i.id);
      report.assertions.push({
        name: 'canvas-picker-renders-catalog-models',
        pass: rendered.length > 0 && rendered.every((id) => catalogModelIds.has(id)),
        rendered, unknown: rendered.filter((id) => !catalogModelIds.has(id)),
      });
    } else {
      report.assertions.push({ name: 'canvas-config-panel-mounted', pass: false, reason: 'workspace seed failed', detail: seeded });
    }

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    assertPng(png);
    const shotPath = join(evidenceDir, 'canvas-model-picker.png');
    writeFileSync(shotPath, png);
    report.screenshots.push({ path: shotPath, bytes: png.length });
    report.pass = report.assertions.every((a) => a.pass);
  } catch (error) {
    report.errors.push(error?.code ?? error?.message ?? 'unknown');
    if (error?.hint) report.hint = error.hint;
  } finally {
    try { socket?.close(); } catch { /* 已关闭 */ }
    try { chrome?.kill('SIGTERM'); } catch { /* 已退出 */ }
    if (env?.cleanup) { try { report.cleanup = await env.cleanup(); } catch (error) { report.errors.push(error?.code ?? 'CANVAS_QA_CLEANUP'); } }
    report.completedAt = new Date().toISOString();
    writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const summaryPath = join(root, 'docs/evidence/canvas-pricing-models-qa-report.json');
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, JSON.stringify(report, null, 2) + '\n');
  }

  const failed = report.assertions.filter((a) => !a.pass).map((a) => a.name);
  console.log(report.pass ? `✅ 画布在售模型发现与参数一致性真机验收通过（${report.assertions.length} 项断言）` : `❌ 未通过 -> ${[...report.errors, ...failed].join('; ')}`);
  for (const a of report.assertions) {
    if (a.name.startsWith('canvas-discovers')) console.log(`   ${a.pass ? '✔' : '✖'} ${a.name}: ${a.actual.join(', ')}`);
    if (a.name === 'canvas-parameters-match-hub-contract') console.log(`   ${a.pass ? '✔' : '✖'} 参数与中枢逐字一致：${a.modelsChecked} 款`);
    if (a.name === 'canvas-picker-renders-catalog-models') console.log(`   ${a.pass ? '✔' : '✖'} 画布渲染型号项：${(a.rendered ?? []).join(', ')}`);
  }
  console.log('   证据: docs/evidence/canvas-pricing-models-qa-report.json');
  if (!report.pass) process.exitCode = 1;
  return report;
}

export { main as runCanvasPricingModelsQa };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
