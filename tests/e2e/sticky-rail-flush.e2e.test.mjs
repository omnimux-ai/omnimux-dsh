/**
 * tests/e2e/sticky-rail-flush.e2e.test.mjs
 * 吸附栏贴顶回归用例（Issue 1977 跟进）。
 *
 * 用户实测现象：技能/专家页吸附栏上方有一条露出卡片缩略图的横带（穿模）。
 * 根因：滚动容器自带 padding-top 时，`position: sticky; top: 0` 的吸附位置落在内边距之下，
 * 内边距那一条始终露出滚动中的内容。
 *
 * 本用例在真实 Chrome 内核里对照两种写法，锁死回归：
 *   1. 滚动容器带 18px 上内边距 → 吸附栏上方存在 > 10px 的缝（复现用户所见）；
 *   2. 内边距移到内容层 → 吸附栏贴顶（缝为 0px）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

const page = (padding) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #111215; color: #eee; font: 13px sans-serif; }
.omx-stage-sticky { position: sticky; top: 0; z-index: 3; background: #111215; }
#scroller { height: 100vh; overflow-y: auto; padding: ${padding}; }
.rail { padding: 10px 16px; border-bottom: 1px solid #333; }
.card { height: 90px; margin: 10px 0; background: #1d1f25; border-radius: 10px; }
</style></head><body>
<div id="scroller"><div class="rail omx-stage-sticky">TAB 行</div><div id="content"></div></div>
<script>
  let html = '';
  for (let i = 0; i < 60; i++) html += '<div class="card"></div>';
  document.getElementById('content').innerHTML = html;
  window.__measure = function () {
    const scroller = document.getElementById('scroller');
    const rail = document.querySelector('.rail');
    scroller.scrollTop = 300;
    return JSON.stringify({
      gap: Math.round(rail.getBoundingClientRect().top - scroller.getBoundingClientRect().top),
      scrolled: Math.round(scroller.scrollTop),
    });
  };
</script></body></html>`;

async function withChrome(fn) {
  const profileDir = mkdtempSync(join(tmpdir(), 'flush-e2e-'));
  const chrome = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    '--disable-gpu', `--user-data-dir=${profileDir}`, '--window-size=1280,900', 'about:blank',
  ]);
  try {
    const port = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Chrome 启动超时')), 15000);
      chrome.stderr.on('data', (chunk) => {
        const m = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) { clearTimeout(timer); res(Number(m[1])); }
      });
      chrome.on('error', (e) => { clearTimeout(timer); rej(e); });
    });
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    let id = 0;
    const send = (method, params = {}) => new Promise((res, rej) => {
      const cur = ++id;
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id !== cur) return;
        ws.removeEventListener('message', onMsg);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    await send('Page.enable');
    await send('Runtime.enable');
    try {
      return await fn({ send });
    } finally {
      try { ws.close(); } catch {}
    }
  } finally {
    chrome.kill('SIGKILL');
    rmSync(profileDir, { recursive: true, force: true });
  }
}

test('E2E: 吸附栏贴顶 —— 滚动容器带内边距会留缝，内边距下移后无缝', async (t) => {
  if (!findChrome()) {
    t.skip('未找到 Chrome / Chromium 可执行文件，跳过真实内核验收');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'flush-fixture-'));
  const withPad = join(dir, 'with-pad.html');
  const noPad = join(dir, 'no-pad.html');
  writeFileSync(withPad, page('18px 20px 32px'), 'utf8');
  writeFileSync(noPad, page('0 20px 32px'), 'utf8');

  try {
    await withChrome(async ({ send }) => {
      const run = async (file) => {
        await send('Page.navigate', { url: `file://${file}` });
        await new Promise((r) => setTimeout(r, 500));
        const res = await send('Runtime.evaluate', { expression: 'window.__measure()', returnByValue: true });
        return JSON.parse(res.result.value);
      };

      const padded = await run(withPad);
      assert.ok(padded.scrolled > 0, '页面应真的滚动了');
      assert.ok(padded.gap > 10, `反向对照：滚动容器带内边距时应留缝，实际 ${padded.gap}px`);

      const flush = await run(noPad);
      assert.ok(flush.scrolled > 0, '页面应真的滚动了');
      assert.equal(flush.gap, 0, `内边距下移后吸附栏应贴顶，实际缝 ${flush.gap}px`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
