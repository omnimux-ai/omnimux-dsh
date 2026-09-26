#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_VIEWER_CSS } from '../plugins/omnimux/src/client/media-viewer/styles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EVIDENCE_FILE = join(ROOT, 'docs', 'evidence', 'batch-wrap-fix-verified.png');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('no Chrome found');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createCdp(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const ready = new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', () => resolvePromise());
    socket.addEventListener('error', (event) => reject(new Error(`cdp socket error: ${event.message || 'unknown'}`)));
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const record = pending.get(message.id);
    if (!record) return;
    pending.delete(message.id);
    if (message.error) record.reject(new Error(message.error.message || 'cdp call failed'));
    else record.resolve(message.result);
  });
  return {
    ready,
    send(method, params = {}, sessionId = undefined) {
      const id = ++nextId;
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() {
      try { socket.close(); } catch {}
    },
  };
}

async function main() {
  mkdirSync(join(ROOT, 'docs', 'evidence'), { recursive: true });

  // 构造展示 HTML
  const demoHtml = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8">
  <title>Batch Wrap Fix Verification</title>
  <style>
    :root {
      --dsw-alias-bg-base: #141416;
      --dsw-alias-bg-elevated: #1c1c1f;
      --dsw-alias-bg-layer-1: rgba(255,255,255,0.04);
      --dsw-alias-bg-layer-2: rgba(255,255,255,0.06);
      --dsw-alias-bg-layer-3: rgba(255,255,255,0.08);
      --dsw-alias-border-l1: rgba(255,255,255,0.06);
      --dsw-alias-border-l2: rgba(255,255,255,0.12);
      --dsw-alias-border-l3: rgba(255,255,255,0.22);
      --dsw-alias-label-primary: #ffffff;
      --dsw-alias-label-secondary: rgba(255,255,255,0.72);
      --dsw-alias-label-tertiary: rgba(255,255,255,0.40);
    }
    body {
      margin: 0;
      padding: 32px;
      background: #0d0d0f;
      color: var(--dsw-alias-label-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .spec-header {
      width: 480px;
      border-bottom: 1px solid var(--dsw-alias-border-l1);
      padding-bottom: 12px;
    }
    .spec-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--dsw-alias-label-primary);
      margin: 0 0 6px 0;
    }
    .spec-subtitle {
      font-size: 12px;
      color: var(--dsw-alias-label-secondary);
      margin: 0;
    }
    .verification-card {
      width: 480px;
      background: var(--dsw-alias-bg-elevated);
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 12px;
      padding: 20px;
      box-sizing: border-box;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    ${MEDIA_VIEWER_CSS}
  </style>
</head>
<body>
  <div class="spec-header">
    <h2 class="spec-title">图像生成面板参数实测验证 · 紧凑无空格与防折行</h2>
    <p class="spec-subtitle">标的：「张数」统一标题 | 「1张 / 2张 / 4张」紧凑无空格 | flex:1; min-width:0; white-space:nowrap;</p>
  </div>

  <div class="verification-card">
    <div class="omx-param-group">
      <div class="omx-param-title">生成方式</div>
      <div class="omx-mode-track">
        <button type="button" class="omx-mode-pill is-active">文生图</button>
        <button type="button" class="omx-mode-pill">图生图</button>
        <button type="button" class="omx-mode-pill">多图参考</button>
      </div>
    </div>

    <div class="omx-param-group" style="margin-top: 14px;">
      <div class="omx-param-title">比例</div>
      <div class="omx-ratio-grid">
        <button type="button" class="omx-ratio-card is-active">
          <span class="omx-ratio-wire-box"><span class="omx-ratio-wire ratio-1-1"></span></span>
          <span class="omx-ratio-label">1:1</span>
        </button>
        <button type="button" class="omx-ratio-card">
          <span class="omx-ratio-wire-box"><span class="omx-ratio-wire ratio-16-9"></span></span>
          <span class="omx-ratio-label">16:9</span>
        </button>
        <button type="button" class="omx-ratio-card">
          <span class="omx-ratio-wire-box"><span class="omx-ratio-wire ratio-9-16"></span></span>
          <span class="omx-ratio-label">9:16</span>
        </button>
        <button type="button" class="omx-ratio-card">
          <span class="omx-ratio-wire-box"><span class="omx-ratio-wire ratio-4-3"></span></span>
          <span class="omx-ratio-label">4:3</span>
        </button>
        <button type="button" class="omx-ratio-card">
          <span class="omx-ratio-wire-box"><span class="omx-ratio-wire ratio-3-4"></span></span>
          <span class="omx-ratio-label">3:4</span>
        </button>
        <button type="button" class="omx-ratio-card">
          <span class="omx-ratio-wire-box"><span class="omx-ratio-wire ratio-21-9"></span></span>
          <span class="omx-ratio-label">21:9</span>
        </button>
      </div>
    </div>

    <div class="omx-clarity-sound-row" style="margin-top: 14px;">
      <div class="omx-param-subcol omx-subcol-clarity">
        <div class="omx-param-title">清晰度</div>
        <div class="omx-mode-track">
          <button type="button" class="omx-mode-pill">1K</button>
          <button type="button" class="omx-mode-pill is-active">2K</button>
          <button type="button" class="omx-mode-pill">4K</button>
        </div>
      </div>

      <div class="omx-param-subcol omx-subcol-sound">
        <div class="omx-param-title">张数</div>
        <div class="omx-mode-track">
          <button type="button" class="omx-mode-pill is-active">1张</button>
          <button type="button" class="omx-mode-pill">2张</button>
          <button type="button" class="omx-mode-pill">4张</button>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const tempHtmlPath = join(tmpdir(), `batch-wrap-fix-${Date.now()}.html`);
  writeFileSync(tempHtmlPath, demoHtml, 'utf8');

  const chrome = findChrome();
  const profileDir = mkdtempSync(join(tmpdir(), 'omnimux-evidence-'));

  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--window-size=1000,720',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp;
  try {
    const portFile = join(profileDir, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(100);
    if (!existsSync(portFile)) throw new Error('Chrome never opened a debugging port');
    const [port, browserPath] = readFileSync(portFile, 'utf8').split('\n');
    cdp = createCdp(`ws://127.0.0.1:${port}${browserPath}`);
    await cdp.ready;

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1000,
      height: 720,
      deviceScaleFactor: 2,
      mobile: false,
    });

    await send('Page.navigate', { url: `file://${tempHtmlPath}` });
    await sleep(600);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(EVIDENCE_FILE, Buffer.from(shot.data, 'base64'));
    console.log('✅ 实测证据截图已成功输出至:', EVIDENCE_FILE);
  } finally {
    if (cdp) cdp.close();
    try { child.kill('SIGKILL'); } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    try { rmSync(tempHtmlPath, { force: true }); } catch {}
  }
}

main().catch((err) => {
  console.error('Failed to generate evidence:', err);
  process.exit(1);
});
