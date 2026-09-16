#!/usr/bin/env node
/**
 * scripts/verify-media-hover-toolbar.mjs
 * Real Chromium E2E verification of media hover toolbar expansion fix.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WT_ROOT = resolve(__dirname, '..');
const EVIDENCE_DIR = join(WT_ROOT, 'docs/evidence/media-hover-toolbar');

mkdirSync(EVIDENCE_DIR, { recursive: true });

function findChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const defaultMacPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(defaultMacPath)) return defaultMacPath;
  const brewChromium = '/opt/homebrew/bin/chromium';
  if (existsSync(brewChromium)) return brewChromium;
  throw new Error('Chrome / Chromium executable not found');
}

async function runVerification() {
  console.log('🚀 Starting Media Hover Toolbar Real Browser Verification...');
  const contentJsPath = join(WT_ROOT, 'plugins/omnimux-browser/extension/dist/content.js');
  assert.ok(existsSync(contentJsPath), 'extension/dist/content.js missing, build first');
  const contentJs = readFileSync(contentJsPath, 'utf8');

  // 1. Build test HTML matching user scene
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Media Hover Verification</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f1117; color: #fff; font-family: -apple-system, sans-serif; overflow: hidden; height: 100vh; }
    .player-container {
      position: relative;
      width: 1000px;
      height: 560px;
      margin: 40px auto;
      background: #181a20;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .video-mock {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1e222d 0%, #111318 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .video-title {
      font-size: 20px;
      font-weight: 600;
      color: #e2e8f0;
      margin-bottom: 8px;
    }
    .video-sub {
      font-size: 13px;
      color: #94a3b8;
    }
    .player-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 52px;
      background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 16px;
    }
    .progress-bar {
      flex: 1;
      height: 4px;
      background: rgba(255,255,255,0.2);
      border-radius: 2px;
      position: relative;
    }
    .progress-fill {
      width: 45%;
      height: 100%;
      background: #6366f1;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div class="player-container">
    <div id="test-video" class="video-mock">
      <div class="video-title">网页视频媒体检测场景还原</div>
      <div class="video-sub">对标真实媒体播放与图像悬浮检测场景</div>
      <div class="player-controls">
        <span style="font-size: 12px; color: #cbd5e1;">00:42 / 01:30</span>
        <div class="progress-bar"><div class="progress-fill"></div></div>
      </div>
    </div>
  </div>
  <script>
    // Mock chrome runtime for extension content script
    window.chrome = {
      runtime: {
        getURL: (p) => 'chrome-extension://mock/' + p,
        onMessage: { addListener: () => {}, removeListener: () => {} },
        sendMessage: async () => ({}),
      },
      storage: {
        local: {
          get: async (key) => ({ [key]: true, omnimux_media_hover_enabled: true }),
          set: async () => {},
        },
        onChanged: {
          addListener: () => {},
          removeListener: () => {},
        },
      },
    };
  </script>
  <script>${contentJs}</script>
  <script>
    // Explicitly initialize overlay and mount candidate for visual E2E verification
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const overlay = window.__dshBrowserMediaOverlay;
        if (overlay) {
          const el = document.getElementById('test-video');
          overlay['handleCandidate']({
            element: el,
            payload: {
              id: 'media_test_01',
              type: 'video',
              src: 'https://example.com/video.mp4',
              pageUrl: location.href,
              pageTitle: 'Test Video',
            }
          });
        }
      }, 300);
    });
  </script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const serverPort = server.address().port;
  console.log(`📡 Local verification server running on port ${serverPort}`);

  const chromeBin = findChromePath();
  const chromeProc = spawn(chromeBin, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1200,800',
    'about:blank',
  ]);

  const cdpPort = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 5000);
    chromeProc.stderr.on('data', (chunk) => {
      const match = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    chromeProc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  console.log(`🔌 CDP port: ${cdpPort}`);
  const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const cdpWs = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 0;
  const sendCdp = (method, params = {}) =>
    new Promise((resolveCdp, rejectCdp) => {
      const id = ++msgId;
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === id) {
          cdpWs.removeEventListener('message', onMsg);
          if (m.error) rejectCdp(new Error(`CDP [${method}] failed: ${JSON.stringify(m.error)}`));
          else resolveCdp(m.result || m);
        }
      };
      cdpWs.addEventListener('message', onMsg);
      cdpWs.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((res, rej) => {
    cdpWs.addEventListener('open', res);
    cdpWs.addEventListener('error', rej);
  });

  cdpWs.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('🖥️ Browser Console:', m.params.type, m.params.args.map(a => a.value || a.description));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('💥 Browser Exception:', m.params.exceptionDetails);
    }
  });

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');
  await sendCdp('DOM.enable');

  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${serverPort}/` });
  await new Promise((r) => setTimeout(r, 1000));

  // Step 1: Verify capsule is detected & mounted in collapsed state
  const state1 = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      if (!host || !host.shadowRoot) return null;
      const capsule = host.shadowRoot.querySelector('.omnimux-capsule-bar');
      if (!capsule) return null;
      const r = capsule.getBoundingClientRect();
      return {
        visible: capsule.classList.contains('is-visible'),
        collapsed: capsule.classList.contains('is-collapsed'),
        expanded: capsule.classList.contains('is-expanded'),
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 State 1 (Collapsed):', state1.result.value);
  assert.ok(state1.result.value?.visible, 'Capsule must be visible');
  assert.ok(state1.result.value?.collapsed, 'Capsule must be collapsed initially');

  const shot1 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '01-media-detected-collapsed.png'), Buffer.from(shot1.data, 'base64'));

  // Step 2: Move mouse to hover directly over the capsule
  const capBox = state1.result.value.rect;
  const hoverX = Math.round(capBox.left + capBox.width / 2);
  const hoverY = Math.round(capBox.top + capBox.height / 2);

  console.log(`👉 Moving cursor to capsule at (${hoverX}, ${hoverY})...`);
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: hoverX,
    y: hoverY,
  });
  await new Promise((r) => setTimeout(r, 500));

  // Verify expansion to stage two
  const state2 = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const capsule = host.shadowRoot.querySelector('.omnimux-capsule-bar');
      const r = capsule.getBoundingClientRect();
      const actions = host.shadowRoot.querySelectorAll('.omnimux-capsule-icon');
      return {
        visible: capsule.classList.contains('is-visible'),
        collapsed: capsule.classList.contains('is-collapsed'),
        expanded: capsule.classList.contains('is-expanded'),
        actionButtonsCount: actions.length,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 State 2 (Expanded Toolbar):', state2.result.value);
  assert.ok(state2.result.value?.expanded, 'Capsule MUST be expanded on hover');
  assert.equal(state2.result.value?.actionButtonsCount, 3, 'Must have 3 action shortcut buttons');

  const shot2 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '02-hover-toolbar-expanded.png'), Buffer.from(shot2.data, 'base64'));

  // Step 3: Hover over the first action button (inspiration) to reveal white tooltip
  const btnBox = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const btn = host.shadowRoot.querySelector('.omnimux-capsule-icon[data-action="inspiration"]');
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
    returnByValue: true,
  });

  console.log(`👉 Hovering over inspiration button at (${btnBox.result.value.x}, ${btnBox.result.value.y})...`);
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: btnBox.result.value.x,
    y: btnBox.result.value.y,
  });
  await new Promise((r) => setTimeout(r, 300));

  const state3 = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const tooltip = host.shadowRoot.querySelector('.white-tooltip');
      return {
        tooltipVisible: tooltip?.classList.contains('is-visible'),
        tooltipText: tooltip?.textContent?.trim(),
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 State 3 (Tooltip Revealed):', state3.result.value);
  assert.ok(state3.result.value?.tooltipVisible, 'Tooltip must be visible on button hover');

  const shot3 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '03-hover-button-tooltip-revealed.png'), Buffer.from(shot3.data, 'base64'));

  // Step 4: Move mouse away to page blank area and verify collapse
  console.log('👉 Moving cursor away to page blank area...');
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 600,
    y: 100,
  });
  // Wait for 320ms collapseGrace + buffer
  await new Promise((r) => setTimeout(r, 600));

  const state4 = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const capsule = host.shadowRoot.querySelector('.omnimux-capsule-bar');
      return {
        collapsed: capsule?.classList.contains('is-collapsed'),
        expanded: capsule?.classList.contains('is-expanded'),
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 State 4 (Folded Back):', state4.result.value);
  assert.ok(state4.result.value?.collapsed, 'Capsule must collapse after pointer leaves');

  const shot4 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '04-pointer-leave-folded.png'), Buffer.from(shot4.data, 'base64'));

  // Write structured report
  const report = {
    test: 'media-hover-toolbar-expansion',
    timestamp: new Date().toISOString(),
    status: 'PASSED',
    evidence: [
      '01-media-detected-collapsed.png',
      '02-hover-toolbar-expanded.png',
      '03-hover-button-tooltip-revealed.png',
      '04-pointer-leave-folded.png',
    ],
    states: {
      initialCollapsed: state1.result.value,
      hoverExpanded: state2.result.value,
      tooltipRevealed: state3.result.value,
      leaveFolded: state4.result.value,
    },
  };
  writeFileSync(join(EVIDENCE_DIR, 'report.json'), JSON.stringify(report, null, 2));

  // Cleanup
  cdpWs.close();
  chromeProc.kill('SIGKILL');
  server.close();
  console.log('✅ All verification steps passed! Evidence written to docs/evidence/media-hover-toolbar/');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
