#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_VIEWER_CSS } from '../plugins/omnimux/src/client/media-viewer/styles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EVIDENCE_FILE = join(ROOT, 'docs', 'evidence', 'batch-digits-opmode-verified.png');

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

  const demoHtml = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8">
  <title>Batch Digits & OpMode Trigger Verification</title>
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
      gap: 20px;
    }
    .spec-header {
      width: 520px;
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
      line-height: 1.5;
    }
    .section-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--dsw-alias-label-secondary);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .preview-box {
      width: 520px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .trigger-demo-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--dsw-alias-bg-layer-1);
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: 10px;
    }
    .verification-card {
      width: 520px;
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
    <h2 class="spec-title">媒体生成面板 UI 实测验证 · 底栏回显生成方式与张数纯数字</h2>
    <p class="spec-subtitle">
      1. 底栏参数胶囊回显：<code>参数 文生图 · 1:1 · 1K · 1</code>（最前补上生成方式，尾部无“张”字）<br>
      2. 面板「张数」分段选项：纯数字 <code>1</code> / <code>2</code> / <code>4</code>（严禁后缀单位）
    </p>
  </div>

  <div class="preview-box">
    <div>
      <div class="section-label">一、底栏触发器参数胶囊（静止态与展开态）</div>
      <div class="trigger-demo-row">
        <!-- 默认状态 -->
        <button id="paramSummaryTriggerBtn" type="button" class="omx-capsule-trigger" title="配置模型参数：文生图 · 1:1 · 1K · 1">
          <span class="omx-param-compact-label" aria-hidden="true">参数</span>
          <span>文生图</span>
          <span class="omx-dot">·</span>
          <span>1:1</span>
          <span class="omx-dot">·</span>
          <span>1K</span>
          <span class="omx-dot">·</span>
          <span>1</span>
          <svg class="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
            <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- 激活选中状态 -->
        <button type="button" class="omx-capsule-trigger is-active" title="配置模型参数：图生图 · 16:9 · 2K · 4">
          <span class="omx-param-compact-label" aria-hidden="true">参数</span>
          <span>图生图</span>
          <span class="omx-dot">·</span>
          <span>16:9</span>
          <span class="omx-dot">·</span>
          <span>2K</span>
          <span class="omx-dot">·</span>
          <span>4</span>
          <svg class="omx-chevron-icon" width="12" height="12" viewBox="0 0 16 16">
            <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <div>
      <div class="section-label">二、参数配置展开面板（MediaParamsPanel）</div>
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
              <button type="button" class="omx-mode-pill is-active">1K</button>
              <button type="button" class="omx-mode-pill">2K</button>
              <button type="button" class="omx-mode-pill">4K</button>
            </div>
          </div>

          <div class="omx-param-subcol omx-subcol-sound">
            <div class="omx-param-title">张数</div>
            <div class="omx-mode-track">
              <button type="button" class="omx-mode-pill is-active">1</button>
              <button type="button" class="omx-mode-pill">2</button>
              <button type="button" class="omx-mode-pill">4</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const tempHtmlPath = join(tmpdir(), `batch-digits-opmode-${Date.now()}.html`);
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
    '--window-size=1080,780',
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
      width: 1080,
      height: 780,
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
