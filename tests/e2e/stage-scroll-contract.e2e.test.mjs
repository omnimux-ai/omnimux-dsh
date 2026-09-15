/**
 * tests/e2e/stage-scroll-contract.e2e.test.mjs
 * 一级页滚动归属契约的端到端验收（Issue 1977 / 契约 §二·补）。
 *
 * 用真实 Chrome 内核加载一个使用**仓库真源契约类**的骨架页，验证：
 *   1. 滚动内容区时，固定栈（.omx-stage-pinned）在视口内的 y 坐标不变；
 *   2. 反向对照：把固定栈放进滚动区（旧行为）→ 它确实会被滚走（证明夹具未失真）。
 *
 * 契约类的声明直接从插件样式真源里抽出来比对，避免夹具与产品漂移。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '../..');

const CONTRACT_SOURCES = [
  'plugins/omnimux-assets/src/client/styles.js',
  'plugins/omnimux-market/src/client/css.js',
];

/** 从插件样式真源里抽出契约类声明，作为夹具使用的那一份。 */
function extractContractCss() {
  const text = readFileSync(join(root, CONTRACT_SOURCES[0]), 'utf8');
  const pinned = text.match(/\.omx-stage-pinned\s*\{[^}]*\}/);
  const scroll = text.match(/\.omx-stage-scroll\s*\{[^}]*\}/);
  assert.ok(pinned, '未在插件样式真源中找到 .omx-stage-pinned');
  assert.ok(scroll, '未在插件样式真源中找到 .omx-stage-scroll');
  return `${pinned[0]}\n${scroll[0]}\n`;
}

/** 各插件样式真源里的契约声明必须逐字一致（防漂移）。 */
function assertDeclarationsAligned() {
  const normalize = (s) => String(s).replace(/\s+/g, '').replace(/;+$/, '').toLowerCase();
  const first = extractContractCss();
  const baseline = {
    pinned: normalize(first.match(/\.omx-stage-pinned\s*\{[^}]*\}/)[0].match(/\{([^}]*)\}/)[1]),
    scroll: normalize(first.match(/\.omx-stage-scroll\s*\{[^}]*\}/)[0].match(/\{([^}]*)\}/)[1]),
  };
  for (const rel of CONTRACT_SOURCES.slice(1)) {
    const src = readFileSync(join(root, rel), 'utf8');
    const p = src.match(/\.omx-stage-pinned\s*\{[^}]*\}/);
    const s = src.match(/\.omx-stage-scroll\s*\{[^}]*\}/);
    assert.ok(p && s, `${rel} 缺少契约类`);
    assert.equal(normalize(p[0].match(/\{([^}]*)\}/)[1]), baseline.pinned, `${rel} 的 .omx-stage-pinned 与真源不一致`);
    assert.equal(normalize(s[0].match(/\{([^}]*)\}/)[1]), baseline.scroll, `${rel} 的 .omx-stage-scroll 与真源不一致`);
  }
}

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

function buildFixture(contractCss, file) {
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>stage scroll contract</title>
<style>
${contractCss}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #111215; color: #f2f3f5; font: 13px/1.5 sans-serif; }
#stage { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
#pinned { padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.12); background: #17181c; }
#main { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 12px 16px; }
#scroll { display: block; }
.card { height: 90px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: #1d1f25; }
</style></head>
<body>
<div id="stage">
  <div id="pinned">一级 / 二级 Tab 固定栈</div>
  <div id="main"><div id="scroll" class="omx-stage-scroll"></div></div>
</div>
<script>
  const scroll = document.getElementById('scroll');
  let html = '';
  for (let i = 0; i < 40; i++) html += '<div class="card">素材 ' + i + '</div>';
  scroll.innerHTML = html;
  window.__fixtureReady = true;
  window.__measure = function (mode) {
    const stage = document.getElementById('stage');
    const pinned = document.getElementById('pinned');
    if (mode === 'before') scroll.insertBefore(pinned, scroll.firstChild);
    else if (pinned.parentElement !== stage) stage.insertBefore(pinned, document.getElementById('main'));
    scroll.scrollTop = 0;
    const base = stage.getBoundingClientRect().top;
    const before = Math.round(pinned.getBoundingClientRect().top - base);
    scroll.scrollTop = 220;
    const after = Math.round(pinned.getBoundingClientRect().top - base);
    return JSON.stringify({ before, after, delta: after - before, scrolled: Math.round(scroll.scrollTop) });
  };
</script>
</body></html>`;
  writeFileSync(file, html, 'utf8');
}

async function withChrome(fn) {
  const chromePath = findChrome();
  const profileDir = mkdtempSync(join(tmpdir(), 'stage-scroll-e2e-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-gpu',
    `--user-data-dir=${profileDir}`, '--window-size=1280,900', 'about:blank',
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
    const page = targets.find((t) => t.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, '未找到 Chrome page 目标');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
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
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    await send('Page.enable');
    await send('Runtime.enable');
    try {
      return await fn({ send, ws });
    } finally {
      try { ws.close(); } catch {}
    }
  } finally {
    chrome.kill('SIGKILL');
    rmSync(profileDir, { recursive: true, force: true });
  }
}

test('E2E: 一级页固定栈在内容滚动时保持不动，且反向对照可复现旧行为', async (t) => {
  if (!findChrome()) {
    t.skip('未找到 Chrome / Chromium 可执行文件，跳过真实内核验收');
    return;
  }

  assertDeclarationsAligned();

  const dir = mkdtempSync(join(tmpdir(), 'stage-scroll-fixture-'));
  const file = join(dir, 'fixture.html');
  buildFixture(extractContractCss(), file);

  try {
    await withChrome(async ({ send }) => {
      await send('Page.navigate', { url: `file://${file}` });
      await new Promise((r) => setTimeout(r, 700));

      const ready = await send('Runtime.evaluate', { expression: 'window.__fixtureReady === true', returnByValue: true });
      assert.equal(ready.result?.value, true, '夹具未就绪');

      const run = async (mode) => {
        const res = await send('Runtime.evaluate', { expression: `window.__measure(${JSON.stringify(mode)})`, returnByValue: true });
        return JSON.parse(res.result.value);
      };

      const after = await run('after');
      assert.ok(after.scrolled > 0, `内容区应真的滚动了，实际 scrollTop=${after.scrolled}`);
      assert.equal(after.delta, 0, `修复后固定栈不应位移，实际位移 ${after.delta}px`);

      const before = await run('before');
      assert.ok(before.scrolled > 0, `反向对照内容区应滚动，实际 scrollTop=${before.scrolled}`);
      assert.ok(before.delta <= -200, `反向对照固定栈应被滚走约 220px，实际 ${before.delta}px`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 保留一个供 CI 产物落盘的目录约定（与其它 e2e 用例一致），无需额外断言。
mkdirSync(join(root, '.workbuddy/evidence'), { recursive: true });
