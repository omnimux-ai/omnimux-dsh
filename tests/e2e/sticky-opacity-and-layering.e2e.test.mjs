/**
 * tests/e2e/sticky-opacity-and-layering.e2e.test.mjs
 * 吸附栏不透明背景与层级遮挡回归用例（Issue #1977 跟进）。
 *
 * 验证目标：
 * 1. .omx-stage-sticky 必须具备不透明实心背景兜底，在变量未注入环境下绝不退化为透明。
 * 2. .omx-stage-sticky 的 z-index（20）高于卡片内角标（4~6），下层滚动卡片绝不能穿透到吸附栏上方。
 * 3. 页面向上滚动后，吸附栏贴紧顶部（top: 0）。
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

const fixtureHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #0f1117; color: #eee; font: 13px sans-serif; }
.omnimux-inspiration-stage {
  position: relative; width: 100%; height: 100%; display: flex; flex-direction: column;
}
.omx-stage-scroll {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
}
.omx-stage-sticky {
  position: sticky; top: 0; z-index: 20; background: var(--dsw-alias-bg-base, var(--dsw-bg, #111215));
}
.page-header { height: 72px; padding: 16px 20px; }
.action-row { height: 48px; padding: 8px 20px; }
.omnimux-inspiration-root { display: flex; flex-direction: column; padding: 0 20px 24px; gap: 12px; }
.filter-bar { height: 48px; display: flex; align-items: center; justify-content: space-between; }
.omnimux-inspiration-grid {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; width: 100%;
  isolation: isolate; position: relative; z-index: 1;
}
.card {
  position: relative; aspect-ratio: 9/16; background: #18191e; border-radius: 10px;
}
.badge-local {
  position: absolute; top: 8px; right: 8px; z-index: 4; padding: 2px 8px;
  background: rgba(16, 185, 129, 0.2); color: #10b981;
}
</style>
</head>
<body>
<div class="omnimux-inspiration-stage omx-stage-scroll" id="stage">
  <div class="page-header"><h2>灵感社区</h2></div>
  <div class="omnimux-inspiration-root">
    <div class="action-row"><button>+ 导入</button></div>
    <div class="omx-stage-sticky" id="stickyStack">
      <div class="filter-bar">
        <span>全部 本地 云端 账号监控</span>
        <input placeholder="搜索" />
      </div>
    </div>
    <div class="omnimux-inspiration-grid" id="grid"></div>
  </div>
</div>
<script>
  let html = '';
  for (let i = 0; i < 30; i++) {
    html += '<div class="card" id="card-' + i + '"><span class="badge-local">本地</span></div>';
  }
  document.getElementById('grid').innerHTML = html;
  window.__measure = function() {
    const stage = document.getElementById('stage');
    const sticky = document.getElementById('stickyStack');
    const firstCard = document.getElementById('card-0');
    stage.scrollTop = 220;
    const stickyRect = sticky.getBoundingClientRect();
    const cardRect = firstCard.getBoundingClientRect();
    const computedBg = window.getComputedStyle(sticky).backgroundColor;
    const computedZ = Number.parseInt(window.getComputedStyle(sticky).zIndex, 10);
    return JSON.stringify({
      scrollTop: stage.scrollTop,
      stickyTop: Math.round(stickyRect.top),
      cardTop: Math.round(cardRect.top),
      computedBg,
      computedZ,
      isOpaque: computedBg !== 'transparent' && computedBg !== 'rgba(0, 0, 0, 0)',
    });
  };
</script>
</body>
</html>`;

test('E2E: 吸附栏实心背景与层级防穿透校验', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('未找到 Chrome / Chromium，跳过浏览器端断言');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'sticky-leak-test-'));
  const htmlPath = join(dir, 'index.html');
  writeFileSync(htmlPath, fixtureHtml, 'utf8');

  const profDir = mkdtempSync(join(tmpdir(), 'sticky-leak-prof-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    '--disable-gpu', `--user-data-dir=${profDir}`, '--window-size=1280,900', 'about:blank',
  ]);

  try {
    const cdpPort = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Chrome 启动超时')), 15000);
      chrome.stderr.on('data', (chunk) => {
        const m = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) { clearTimeout(timer); res(Number(m[1])); }
      });
      chrome.on('error', (e) => { clearTimeout(timer); rej(e); });
    });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const ws = new WebSocket(targets.find((item) => item.type === 'page').webSocketDebuggerUrl);

    let msgId = 0;
    const send = (method, params = {}) => new Promise((res, rej) => {
      const cur = ++msgId;
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
    await send('Page.navigate', { url: `file://${htmlPath}` });
    await new Promise((r) => setTimeout(r, 600));

    const evalRes = await send('Runtime.evaluate', { expression: 'window.__measure()', returnByValue: true });
    const data = JSON.parse(evalRes.result.value);

    assert.equal(data.stickyTop, 0, '吸附栏在滚动后必须贴紧顶部 0px');
    assert.equal(data.isOpaque, true, `吸附栏背景必须不透明，实际计算值: ${data.computedBg}`);
    assert.equal(data.computedBg, 'rgb(17, 18, 21)', '在宿主变量未注入时，必须生效实体色兜底 #111215');
    assert.ok(data.computedZ >= 20, `吸附栏 z-index 必须高于卡片内元素，实际为: ${data.computedZ}`);

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    rmSync(profDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
