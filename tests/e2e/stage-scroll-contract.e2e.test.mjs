/**
 * tests/e2e/stage-scroll-contract.e2e.test.mjs
 * 一级页滚动归属契约的端到端验收（Issue 1977 / 契约 §二·补）。
 *
 * 契约行为：一级页**整体滚动**；页头随页面滚走；一级/二级 Tab 行滚到顶部后吸附不动。
 * 用真实 Chrome 内核加载一个使用**仓库真源契约类**的骨架页验证：
 *   1. 滚动页面时页头确实上移（页面真的在滚）；
 *   2. 同一时刻吸附栈停在 0 并且继续滚动仍停在 0；
 *   3. 反向对照：去掉吸附 → 该行被滚走（证明夹具未失真）。
 *
 * 契约类的声明直接从插件样式真源抽取比对，避免夹具与产品漂移。
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
  'plugins/omnimux-inspiration/src/client/styles.js',
  'plugins/omnimux-accounts/src/client/styles.js',
  'plugins/omnimux-publish/src/client/styles.js',
];

function extractRule(css, cls) {
  const match = css.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`));
  assert.ok(match, `未在样式真源中找到 .${cls}`);
  return match[0];
}

/** 各插件样式真源里的契约声明必须逐字一致（防漂移）。 */
function assertDeclarationsAligned() {
  const normalize = (s) => String(s).replace(/\s+/g, '').replace(/\s*,\s*/g, ',').replace(/;+$/, '').toLowerCase();
  const first = readFileSync(join(root, CONTRACT_SOURCES[0]), 'utf8');
  const baseline = {
    sticky: normalize(extractRule(first, 'omx-stage-sticky').match(/\{([^}]*)\}/)[1]),
    scroll: normalize(extractRule(first, 'omx-stage-scroll').match(/\{([^}]*)\}/)[1]),
  };
  for (const rel of CONTRACT_SOURCES.slice(1)) {
    const src = readFileSync(join(root, rel), 'utf8');
    for (const [cls, expected] of [['omx-stage-sticky', baseline.sticky], ['omx-stage-scroll', baseline.scroll]]) {
      const actual = normalize(extractRule(src, cls).match(/\{([^}]*)\}/)[1]);
      assert.equal(actual, expected, `${rel} 的 .${cls} 与真源不一致`);
    }
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
#stage { height: 100vh; display: block; }
#head { padding: 20px 16px; }
#rail { padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.12); }
#content { padding: 12px 16px; }
.card { height: 90px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: #1d1f25; }
</style></head>
<body>
<div id="stage" class="omx-stage-scroll">
  <div id="head"><h2 style="margin:0 0 6px">页面标题</h2><p style="margin:0;color:#8b8f98">副标题与动作行随页面一起滚走</p></div>
  <div id="rail" class="omx-stage-sticky">一级 / 二级 Tab 吸附行</div>
  <div id="content"></div>
</div>
<script>
  const stage = document.getElementById('stage');
  const rail = document.getElementById('rail');
  const head = document.getElementById('head');
  let html = '';
  for (let i = 0; i < 60; i++) html += '<div class="card">素材 ' + i + '</div>';
  document.getElementById('content').innerHTML = html;
  window.__fixtureReady = true;
  window.__measure = function (mode) {
    rail.classList.toggle('omx-stage-sticky', mode !== 'static');
    rail.style.position = mode === 'static' ? 'static' : '';
    stage.scrollTop = 0;
    const base = stage.getBoundingClientRect().top;
    stage.scrollTop = 300;
    const headAt300 = Math.round(head.getBoundingClientRect().top - base);
    const railAt300 = Math.round(rail.getBoundingClientRect().top - base);
    stage.scrollTop = 900;
    const railAt900 = Math.round(rail.getBoundingClientRect().top - base);
    return JSON.stringify({ scrolled: Math.round(stage.scrollTop), headAt300, railAt300, railAt900 });
  };
</script>
</body></html>`;
  writeFileSync(file, html, 'utf8');
}

async function withChrome(fn) {
  const profileDir = mkdtempSync(join(tmpdir(), 'stage-scroll-e2e-'));
  const chrome = spawn(findChrome(), [
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
      return await fn({ send });
    } finally {
      try { ws.close(); } catch {}
    }
  } finally {
    chrome.kill('SIGKILL');
    rmSync(profileDir, { recursive: true, force: true });
  }
}

test('E2E: 一级页整页滚动、Tab 到顶吸附，且反向对照可复现旧行为', async (t) => {
  if (!findChrome()) {
    t.skip('未找到 Chrome / Chromium 可执行文件，跳过真实内核验收');
    return;
  }

  assertDeclarationsAligned();

  const dir = mkdtempSync(join(tmpdir(), 'stage-scroll-fixture-'));
  const file = join(dir, 'fixture.html');
  buildFixture(extractRule(readFileSync(join(root, CONTRACT_SOURCES[0]), 'utf8'), 'omx-stage-sticky') + '\n' +
    extractRule(readFileSync(join(root, CONTRACT_SOURCES[0]), 'utf8'), 'omx-stage-scroll'), file);

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

      const sticky = await run('sticky');
      assert.ok(sticky.scrolled > 0, `页面应真的滚动了，实际 scrollTop=${sticky.scrolled}`);
      assert.ok(sticky.headAt300 < 0, `页头应随页面滚走，实际 top=${sticky.headAt300}`);
      assert.equal(sticky.railAt300, 0, `Tab 行应吸附在顶部，实际 top=${sticky.railAt300}`);
      assert.equal(sticky.railAt900, 0, `继续滚动后 Tab 行仍应吸附，实际 top=${sticky.railAt900}`);

      const staticRun = await run('static');
      assert.ok(staticRun.railAt300 < 0, `反向对照：去掉吸附后 Tab 行应被滚走，实际 top=${staticRun.railAt300}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 与其它 e2e 用例一致的证据目录约定。
mkdirSync(join(root, '.workbuddy/evidence'), { recursive: true });
