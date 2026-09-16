#!/usr/bin/env node
/**
 * 任务专用浏览器验收：设置页「默认生成模式」与画布视频节点卡槽（Issue #2003）。
 *
 * 复用 worktree-app-qa 的测试环境引导与真实 Chrome/CDP 基建，但场景是本任务
 * 自己的：导航到设置页断言新增下拉，再导航到预置画布工程截图卡槽区。
 * 证据落 <root>/.workbuddy/evidence/default-mode-qa/<runId>/。
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestEnvironment } from './test-env-bootstrap.mjs';
import { findChromePath, assertPng } from './worktree-web-qa.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `JSON.stringify((() => {
  const text = (document.body?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 1500);
  const hits = [...document.querySelectorAll('*')].filter((el) => {
    const t = (el.innerText ?? '').trim();
    return t && t.length < 12 && /设置|插件|可配置|默认模型|生成模式/.test(t);
  }).slice(0, 25).map((el) => ({
    tag: el.tagName,
    cls: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
    text: (el.innerText ?? '').trim().slice(0, 20),
    rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
  }));
  const selects = [...document.querySelectorAll('[data-testid^="omnimux-default"], .omnimux-models-card select, .omnimux-models-card')].map((el) => ({
    testid: el.getAttribute('data-testid'),
    cls: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
  }));
  return { href: location.href, text, hits, selects, wells: document.querySelectorAll('[data-testid="wf-slot-wells"]').length };
})())`;

async function main() {
  const runId = randomUUID();
  const evidenceDir = join(sourceRoot, '.workbuddy', 'evidence', 'default-mode-qa', runId);
  mkdirSync(evidenceDir, { recursive: true });
  const env = await startTestEnvironment({ root: sourceRoot, mode: 'ui' });
  let chrome; let socket;
  const report = { runId, steps: [], assertions: [], errors: [] };
  try {
    const { origin } = env;
    report.origin = origin;
    // 同源 token→Cookie：只在内存中传递，绝不落盘或打印。
    const loginResponse = await fetch(env.loginUrl, { redirect: 'manual' });
    const rawCookie = loginResponse.headers.getSetCookie()[0] ?? '';
    const cookieName = rawCookie.split('=')[0];
    const cookieValue = rawCookie.split(';')[0].slice(cookieName.length + 1);
    if (!cookieName || !cookieValue) throw new Error('login-cookie-missing');
    chrome = spawn(findChromePath(), ['--headless=new', '--remote-debugging-port=0', '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank']);
    const cdpPort = await new Promise((yes, no) => {
      const timer = setTimeout(() => no(new Error('chrome-start-timeout')), 15000);
      let buffer = '';
      chrome.stderr.on('data', (chunk) => {
        buffer += chunk.toString();
        const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (m) { clearTimeout(timer); yes(Number(m[1])); }
      });
    });
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((yes, no) => { socket.onopen = yes; socket.onerror = no; });
    let seq = 0; const pending = new Map();
    const send = (method, params) => new Promise((yes, no) => {
      const id = ++seq; pending.set(id, { yes, no });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const { yes, no } = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) no(new Error(`cdp ${msg.error.message}`)); else yes(msg.result);
    };
    await send('Network.enable'); await send('Page.enable');
    await send('Network.setCookie', { name: cookieName, value: cookieValue,
      domain: new URL(origin).hostname, path: '/', url: `${origin}/`, secure: false, sameSite: 'Lax' });
    const evaluate = async (expression) => {
      const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return out.result?.value;
    };
    const shoot = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const png = Buffer.from(shot.data, 'base64');
      assertPng(png);
      const file = join(evidenceDir, name);
      writeFileSync(file, png);
      return { path: file, bytes: png.length };
    };

    // 1) 应用根：探测设置入口
    await send('Page.navigate', { url: `${origin}/` });
    await sleep(4000);
    const home = JSON.parse(await evaluate(PROBE));
    report.steps.push({ step: 'home', href: home.href, textHead: home.text.slice(0, 400), hits: home.hits });
    report.homeShot = await shoot('01-home.png');

    // 2) 点击侧栏「设置」按钮进入设置面板（hash 路由不生效，入口是按钮）
    const clicked = await evaluate(`(() => {
      const el = [...document.querySelectorAll('button, [role="button"], a')]
        .find((node) => (node.innerText || '').trim() === '设置');
      if (!el) return 'not-found';
      el.click();
      return 'clicked';
    })()`);
    report.settingsClick = clicked;
    await sleep(3000);
    let probe = JSON.parse(await evaluate(PROBE));
    report.steps.push({ step: 'after-settings-click', href: probe.href, textHead: probe.text.slice(0, 400), selects: probe.selects });
    report.settingsShot = await shoot('02-settings.png');

    // 2b) 设置面板里继续下钻「插件 / 可配置」
    for (const label of ['插件', '可配置']) {
      const hit = await evaluate(`(() => {
        const el = [...document.querySelectorAll('button, [role="button"], a, div, span')]
          .filter((node) => (node.innerText || '').trim() === ${JSON.stringify(label)})
          .sort((a, b) => a.childElementCount - b.childElementCount)[0];
        if (!el) return 'not-found';
        el.click();
        return 'clicked';
      })()`);
      report.steps.push({ step: `click:${label}`, result: hit });
      await sleep(2000);
    }
    probe = JSON.parse(await evaluate(PROBE));
    report.settingsProbe = probe;
    report.steps.push({ step: 'settings-panel', href: probe.href, textHead: probe.text.slice(0, 500), selects: probe.selects });
    if (probe.selects.length > 0 || /默认模型|生成模式/.test(probe.text)) report.settingsRoute = 'settings-button';
    report.settingsShot2 = await shoot('03-settings-panel.png');

    // 3) 预置画布工程：卡槽证据
    await send('Page.navigate', { url: `${origin}/#/workspace/ws_qa_media` });
    await sleep(5000);
    const canvas = JSON.parse(await evaluate(PROBE));
    report.steps.push({ step: 'canvas', href: canvas.href, textHead: canvas.text.slice(0, 300), wells: canvas.wells });
    report.canvasShot = await shoot('03-canvas.png');
  } catch (error) {
    report.errors.push(String(error && error.stack ? error.stack : error));
  } finally {
    try { socket?.close(); } catch { /* closed */ }
    try { chrome?.kill('SIGKILL'); } catch { /* killed */ }
    try { await env?.cleanup?.(); } catch (error) { report.errors.push(`cleanup: ${error}`); }
    writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ evidenceDir, settingsRoute: report.settingsRoute ?? null,
      settingsSelects: report.settingsProbe?.selects ?? [], canvasWells: report.steps.at(-1)?.wells ?? null,
      errors: report.errors }, null, 2));
  }
}

await main();
