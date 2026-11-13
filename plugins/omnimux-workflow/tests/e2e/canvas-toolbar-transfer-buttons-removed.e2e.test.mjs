/**
 * #4112 端到端：画布底部工具栏移除「导出工作流 / 导入工作流」后，其余 Dock 入口仍可用。
 *
 * 形态：插件自带的画布 harness（scripts/canvas-harness.mjs，W1 视觉验收事实源）
 * 在真实 Chrome 内核里渲染生产画布源码，断言两个入口与 transfer 面板不再渲染，
 * 且 添加节点/插入模板/指针模式/项目资产/快捷键帮助 仍在。
 * 证据：<root>/.workbuddy/evidence/canvas-toolbar-transfer-removal-4112/<runId>/
 *
 * 说明：画布在正式应用里挂载于 dsh-better-sidebar 面板宿主；harness 用同一份
 * src/canvas 产物独立渲染画布岛，因此本用例只覆盖画布与工具栏本身，不覆盖应用壳层。
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
  const toolbar = document.querySelector('.wf-canvas-toolbar');
  const buttons = toolbar ? [...toolbar.querySelectorAll('button')] : [];
  const titles = buttons.map(node => node.getAttribute('title')).filter(Boolean);
  const text = (toolbar?.innerText ?? '').replace(/\\s+/g, ' ');
  const findTitle = patterns => titles.findIndex(title => patterns.some(pattern => title.includes(pattern)));
  return {
    toolbar: Boolean(toolbar),
    buttonCount: buttons.length,
    titles,
    text,
    exportButton: findTitle(['导出工作流', 'Export workflow']),
    importButton: findTitle(['导入工作流', 'Import workflow']),
    transferPanel: document.querySelectorAll('.wf-transfer-panel').length,
    transferInput: document.querySelectorAll('.wf-transfer-input').length,
    flow: document.querySelectorAll('.react-flow').length,
    addNode: findTitle(['添加节点', 'Add Node']),
    insertTemplate: findTitle(['插入模板', 'Insert template']),
    pointerMode: findTitle(['选择模式', '抓手模式', 'Select Mode', 'Hand/Pan Mode']),
    assets: findTitle(['项目资产', 'Project Assets']),
    help: findTitle(['快捷键帮助', 'Keyboard Shortcuts']),
  };
})())`;

test('#4112 底部工具栏不再渲染导出/导入按钮，其余 Dock 入口保留', { timeout: 300000 }, async () => {
  const runId = randomUUID();
  const evidenceDir = join(root, '.workbuddy', 'evidence', 'canvas-toolbar-transfer-removal-4112', runId);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const port = 4900 + Math.floor(Math.random() * 200);
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
      if (probe.toolbar) break;
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    assertPng(png);
    fs.writeFileSync(join(evidenceDir, 'canvas-toolbar-after-removal.png'), png);

    assert.ok(probe, '页面必须返回工具栏探测结果');
    fs.writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify({ runId, origin, probe }, null, 2) + '\n');

    assert.equal(probe.toolbar, true, '画布底部工具栏必须挂载');
    assert.equal(probe.buttonCount, 5, `Dock 必须恰好保留 5 个按钮：${probe.titles.join(' | ')}`);
    assert.equal(probe.exportButton, -1, `工具栏不得再有「导出工作流」按钮：${probe.titles.join(' | ')}`);
    assert.equal(probe.importButton, -1, `工具栏不得再有「导入工作流」按钮：${probe.titles.join(' | ')}`);
    assert.equal(probe.transferPanel, 0, '不得渲染 wf-transfer-panel');
    assert.equal(probe.transferInput, 0, '不得保留 wf-transfer-input 文件选择器');
    assert.equal(probe.flow > 0, true, '创作页画布必须挂载');
    assert.equal(probe.addNode >= 0, true, '添加节点按钮必须保留');
    assert.equal(probe.insertTemplate >= 0, true, '插入模板按钮必须保留');
    assert.equal(probe.pointerMode >= 0, true, '指针模式按钮必须保留');
    assert.equal(probe.assets >= 0, true, '项目资产按钮必须保留');
    assert.equal(probe.help >= 0, true, '快捷键帮助按钮必须保留');
    assert.equal(
      probe.addNode < probe.insertTemplate && probe.insertTemplate < probe.pointerMode
        && probe.pointerMode < probe.assets && probe.assets < probe.help,
      true,
      `Dock 入口顺序必须保持：${probe.titles.join(' | ')}`,
    );
  } finally {
    try { socket?.close(); } catch { /* already closed */ }
    try { chrome?.kill('SIGKILL'); } catch { /* already gone */ }
    try { harness.kill('SIGKILL'); } catch { /* already gone */ }
  }
});
