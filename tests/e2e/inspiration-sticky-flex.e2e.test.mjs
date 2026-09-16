/**
 * tests/e2e/inspiration-sticky-flex.e2e.test.mjs
 * 灵感社区吸附栏容器高度自适应与深度滚动吸附回归用例（Issue #1977 跟进）。
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
.omnimux-inspiration-stage-body {
  flex: none; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box;
}
.omnimux-inspiration-root {
  flex: none; display: flex; flex-direction: column; min-height: 0; width: 100%; max-width: 100%;
  padding: 0 20px 24px; gap: 12px;
}
.omx-stage-sticky {
  position: sticky; top: 0; z-index: 20; background: var(--dsw-alias-bg-base, var(--dsw-bg, #111215));
}
.page-header { height: 72px; padding: 16px 20px; }
.action-row { height: 48px; padding: 8px 20px; }
.filter-bar { height: 48px; display: flex; align-items: center; justify-content: space-between; }
.subfilter-row { height: 40px; display: flex; align-items: center; gap: 8px; }
.omnimux-inspiration-grid {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; width: 100%;
  isolation: isolate; position: relative; z-index: 1;
}
.card {
  position: relative; aspect-ratio: 9/16; background: #18191e; border-radius: 10px;
}
</style>
</head>
<body>
<div class="omnimux-inspiration-stage omx-stage-scroll" id="stage">
  <div class="page-header"><h2>灵感社区</h2></div>
  <div class="omnimux-inspiration-stage-body">
    <div class="omnimux-inspiration-root">
      <div class="action-row"><button>+ 导入</button></div>
      <div class="omx-stage-sticky" id="stickyStack">
        <div class="filter-bar"><span>全部 本地 云端</span><input placeholder="搜索" /></div>
        <div class="subfilter-row"><span>国家 ▾</span><span>分类 ▾</span></div>
      </div>
      <div class="omnimux-inspiration-grid" id="grid"></div>
    </div>
  </div>
</div>
<script>
  let html = '';
  for (let i = 0; i < 40; i++) {
    html += '<div class="card" id="card-' + i + '"></div>';
  }
  document.getElementById('grid').innerHTML = html;
  window.__measure = function(scrollTop) {
    const stage = document.getElementById('stage');
    const sticky = document.getElementById('stickyStack');
    const body = document.querySelector('.omnimux-inspiration-stage-body');
    const root = document.querySelector('.omnimux-inspiration-root');
    stage.scrollTop = scrollTop;
    const stickyRect = sticky.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return JSON.stringify({
      scrollTop: stage.scrollTop,
      bodyHeight: body.clientHeight,
      rootHeight: root.clientHeight,
      stickyTop: Math.round(stickyRect.top),
      stageTop: Math.round(stageRect.top),
      diff: Math.round(stickyRect.top - stageRect.top),
      stuck: Math.round(stickyRect.top - stageRect.top) === 0
    });
  };
</script>
</body>
</html>`;

test('E2E: 灵感社区容器高度展开与多段滚动持续吸附校验', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('未找到 Chrome，跳过浏览器端断言');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'sticky-flex-e2e-'));
  const htmlPath = join(dir, 'index.html');
  writeFileSync(htmlPath, fixtureHtml, 'utf8');

  const profDir = mkdtempSync(join(tmpdir(), 'sticky-flex-prof-'));
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

    // 1. 验证包含块高度自适应展开，而不是被压扁在视口高度
    const initial = JSON.parse((await send('Runtime.evaluate', { expression: 'window.__measure(0)', returnByValue: true })).result.value);
    assert.ok(initial.bodyHeight > 2000, `body 容器高度应完整自适应展开，实际为: ${initial.bodyHeight}px`);
    assert.ok(initial.rootHeight > 2000, `root 容器高度应完整自适应展开，实际为: ${initial.rootHeight}px`);

    // 2. 深度滚动到 500px, 1000px, 1500px，验证持续吸附
    for (const pos of [500, 1000, 1500]) {
      const scrollRes = JSON.parse((await send('Runtime.evaluate', { expression: `window.__measure(${pos})`, returnByValue: true })).result.value);
      assert.equal(scrollRes.diff, 0, `在滚动至 ${pos}px 时吸附栏必须锁定在顶部 0px，实际偏移: ${scrollRes.diff}px`);
      assert.equal(scrollRes.stuck, true, `在滚动至 ${pos}px 时吸附状态必须为 true`);
    }

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    rmSync(profDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
