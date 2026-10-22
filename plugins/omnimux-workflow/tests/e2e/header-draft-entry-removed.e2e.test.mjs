/**
 * #3619 端到端：创作页顶栏移除「检查生成输入」入口后，画布与顶栏控件仍可用。
 *
 * 形态：插件自带的画布 harness（scripts/canvas-harness.mjs，W1 视觉验收事实源）
 * 在真实 Chrome 内核里渲染生产画布源码，断言顶栏入口消失、其余控件与画布仍在。
 * 证据：<root>/.workbuddy/evidence/header-removal-3619/<runId>/
 *
 * 说明：画布在正式应用里挂载于 dsh-better-sidebar 面板宿主；harness 用同一份
 * src/canvas 产物独立渲染画布岛，因此本用例只覆盖画布与顶栏本身，不覆盖应用壳层。
 * 环境要求：本机 Chrome（或 Chromium）。缺环境即失败，不跳过。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromePath, assertPng } from '../../../../scripts/worktree-web-qa.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(pluginRoot, '../..');
const sleep = milliseconds => new Promise(yes => setTimeout(yes, milliseconds));

const PROBE = `JSON.stringify((() => {
  const header = document.querySelector('.wf-header-controls');
  const text = (document.body?.innerText ?? '').replace(/\\s+/g, ' ');
  return {
    header: Boolean(header),
    headerButtons: header ? header.querySelectorAll('button').length : 0,
    entry: document.querySelectorAll('.wf-generation-draft-entry').length,
    entryText: /检查生成输入|Check generation inputs/.test(text),
    draftModal: document.querySelectorAll('.wf-generation-draft').length,
    flow: document.querySelectorAll('.react-flow').length,
    nodes: document.querySelectorAll('.react-flow__node').length,
    titles: header ? [...header.querySelectorAll('button')].map(node => node.getAttribute('title')).filter(Boolean) : [],
  };
})())`;

test('#3619 顶栏不再渲染「检查生成输入」，画布与顶栏控件不变', { timeout: 300000 }, async () => {
  const runId = randomUUID();
  const evidenceDir = join(root, '.workbuddy', 'evidence', 'header-removal-3619', runId);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const port = 4700 + Math.floor(Math.random() * 200);
  const origin = `http://127.0.0.1:${port}`;
  const harness = spawn(process.execPath, [join('scripts', 'canvas-harness.mjs'), '--port', String(port)], {
    cwd: pluginRoot, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let chrome; let socket;
  try {
    const ready = await (async () => {
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${origin}/`);
          if (response.ok) return true;
        } catch { /* not up yet */ }
        await sleep(1000);
      }
      return false;
    })();
    assert.equal(ready, true, '画布 harness 必须在超时前就绪');

    chrome = spawn(findChromePath(), ['--headless=new', '--remote-debugging-port=0', '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const cdpPort = await new Promise((yes, no) => {
      const timer = setTimeout(() => no(new Error('chrome-start-timeout')), 20000);
      let buffer = '';
      chrome.stderr.on('data', chunk => {
        buffer += chunk.toString();
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (match) { clearTimeout(timer); yes(Number(match[1])); }
      });
    });
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((yes, no) => { socket.onopen = yes; socket.onerror = no; });
    let sequence = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((yes, no) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); no(new Error(`cdp-timeout:${method}`)); }, 20000);
      pending.set(id, { yes: value => { clearTimeout(timer); yes(value); }, no: error => { clearTimeout(timer); no(error); } });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.no(new Error(`cdp ${message.error.message}`)); else entry.yes(message.result);
    };
    await send('Page.enable');
    const evaluate = async expression => {
      const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (out.exceptionDetails) throw new Error(`evaluate-failed:${out.exceptionDetails.text}`);
      return out.result?.value;
    };
    await send('Page.navigate', { url: `${origin}/` });
    let probe = null;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await sleep(700);
      probe = JSON.parse(await evaluate(PROBE));
      if (probe.header) break;
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    assertPng(png);
    fs.writeFileSync(join(evidenceDir, 'canvas-header-after-removal.png'), png);
    fs.writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify({ runId, origin, probe }, null, 2) + '\n');

    assert.equal(probe.header, true, '画布顶栏必须挂载');
    assert.equal(probe.entry, 0, '顶栏不得再渲染 .wf-generation-draft-entry');
    assert.equal(probe.entryText, false, '页面不得再出现「检查生成输入」文案');
    assert.equal(probe.draftModal, 0, '不得存在草稿弹窗');
    assert.equal(probe.headerButtons >= 3, true, '顶栏其余控件必须保留');
    assert.equal(probe.titles.includes('自适应视图'), true, `顶栏必须仍是真实控件组（自适应视图）：${probe.titles.join(',')}`);
    assert.equal(probe.titles.includes('放大') && probe.titles.includes('缩小'), true, '缩放控件必须保留');
    assert.equal(probe.flow > 0, true, '创作页画布必须挂载');
  } finally {
    try { socket?.close(); } catch { /* already closed */ }
    try { chrome?.kill('SIGKILL'); } catch { /* already gone */ }
    try { harness.kill('SIGKILL'); } catch { /* already gone */ }
  }
});
