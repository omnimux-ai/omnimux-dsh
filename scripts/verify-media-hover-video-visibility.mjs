#!/usr/bin/env node
/**
 * scripts/verify-media-hover-video-visibility.mjs
 * Real Chromium E2E verification for video hover toolbar visibility & controls avoidance.
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
const EVIDENCE_DIR = join(WT_ROOT, 'docs/evidence/media-hover-video-visibility');

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
  console.log('🚀 Starting Video Media Hover Toolbar Visibility Verification...');
  const contentJsPath = join(WT_ROOT, 'plugins/omnimux-browser/extension/dist/content.js');
  assert.ok(existsSync(contentJsPath), 'extension/dist/content.js missing, build first');
  const contentJs = readFileSync(contentJsPath, 'utf8');

  // Build test HTML matching user video scene (Dunhuang flying apsaras with 0:04 player controls)
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Video Hover Visibility Verification</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0b0d12; color: #fff; font-family: -apple-system, sans-serif; overflow: hidden; height: 100vh; }
    .player-window {
      position: relative;
      width: 1060px;
      height: 580px;
      margin: 30px auto;
      background: #1a1d26;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 16px 40px rgba(0,0,0,0.6);
    }
    .video-canvas {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #fbcfe8 0%, #a855f7 50%, #3b82f6 100%);
      position: relative;
    }
    .player-controls-bottom {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 54px;
      background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 14px;
      pointer-events: auto;
    }
    .time-tag {
      background: rgba(0,0,0,0.65);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      color: #fff;
    }
    .track {
      flex: 1;
      height: 4px;
      background: rgba(255,255,255,0.25);
      border-radius: 2px;
    }
    .track-fill {
      width: 25%;
      height: 100%;
      background: #818cf8;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div class="player-window">
    <div id="video-target" class="video-canvas">
      <div class="player-controls-bottom">
        <span class="time-tag">0:04</span>
        <div class="track"><div class="track-fill"></div></div>
      </div>
    </div>
  </div>
  <script>
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
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    };
  </script>
  <script>${contentJs}</script>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const overlay = window.__dshBrowserMediaOverlay;
        if (overlay) {
          const el = document.getElementById('video-target');
          overlay['handleCandidate']({
            element: el,
            payload: {
              id: 'video_nurse_01',
              type: 'video',
              src: 'https://example.com/video_fair.mp4',
              pageUrl: location.href,
              pageTitle: 'Video Media',
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
  console.log(`📡 Local server listening on port ${serverPort}`);

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
  });

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');
  await sendCdp('DOM.enable');

  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${serverPort}/` });
  await new Promise((r) => setTimeout(r, 1000));

  // Step 1: Capture initial video detected with collapsed capsule
  const initial = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const capsule = host?.shadowRoot?.querySelector('.omnimux-capsule-bar');
      const r = capsule?.getBoundingClientRect();
      const style = capsule ? getComputedStyle(capsule) : null;
      return {
        visible: capsule?.classList.contains('is-visible'),
        opacity: style?.opacity,
        collapsed: capsule?.classList.contains('is-collapsed'),
        rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 Step 1 (Initial Video Collapsed):', initial.result.value);
  assert.ok(initial.result.value?.visible, 'Capsule must be marked visible on video');
  assert.equal(initial.result.value?.opacity, '1', 'Opacity must be 1');

  const shot1 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '01-video-detected-collapsed.png'), Buffer.from(shot1.data, 'base64'));

  // Step 2: Hover over capsule to expand toolbar and verify BOTH toolbar and buttons are visible
  const capBox = initial.result.value.rect;
  const hoverX = Math.round(capBox.left + capBox.width / 2);
  const hoverY = Math.round(capBox.top + capBox.height / 2);

  console.log(`👉 Hovering over capsule at (${hoverX}, ${hoverY})...`);
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: hoverX,
    y: hoverY,
  });
  await new Promise((r) => setTimeout(r, 450));

  const expanded = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const capsule = host?.shadowRoot?.querySelector('.omnimux-capsule-bar');
      const actions = host?.shadowRoot?.querySelector('.omnimux-capsule-actions');
      const actionButtons = host?.shadowRoot?.querySelectorAll('.omnimux-capsule-icon');
      const r = capsule?.getBoundingClientRect();
      const style = capsule ? getComputedStyle(capsule) : null;
      const actStyle = actions ? getComputedStyle(actions) : null;
      return {
        expanded: capsule?.classList.contains('is-expanded'),
        visibleClass: capsule?.classList.contains('is-visible'),
        capsuleOpacity: style?.opacity,
        capsuleDisplay: style?.display,
        actionsOpacity: actStyle?.opacity,
        actionsVisibility: actStyle?.visibility,
        buttonsCount: actionButtons?.length,
        rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 Step 2 (Expanded Toolbar on Video):', expanded.result.value);
  assert.ok(expanded.result.value?.expanded, 'Capsule must be expanded');
  assert.ok(expanded.result.value?.visibleClass, 'Capsule must retain is-visible class');
  assert.equal(expanded.result.value?.capsuleOpacity, '1', 'Capsule opacity must be 1');
  assert.equal(expanded.result.value?.actionsOpacity, '1', 'Actions opacity must be 1');
  assert.equal(expanded.result.value?.actionsVisibility, 'visible', 'Actions must be visible');
  assert.equal(expanded.result.value?.buttonsCount, 3, 'Must have 3 action buttons');

  const shot2 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '02-video-toolbar-fully-visible.png'), Buffer.from(shot2.data, 'base64'));

  // Step 3: Hover on action button and verify BOTH tooltip and toolbar are visible together
  const btnTarget = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const btn = host?.shadowRoot?.querySelector('.omnimux-capsule-icon[data-action="inspiration"]');
      const r = btn?.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
    returnByValue: true,
  });

  console.log(`👉 Hovering on inspiration button at (${btnTarget.result.value.x}, ${btnTarget.result.value.y})...`);
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: btnTarget.result.value.x,
    y: btnTarget.result.value.y,
  });
  await new Promise((r) => setTimeout(r, 250));

  const coexisting = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const capsule = host?.shadowRoot?.querySelector('.omnimux-capsule-bar');
      const tooltip = host?.shadowRoot?.querySelector('.white-tooltip');
      const cStyle = capsule ? getComputedStyle(capsule) : null;
      const tStyle = tooltip ? getComputedStyle(tooltip) : null;
      return {
        capsuleVisible: capsule?.classList.contains('is-visible') && cStyle?.opacity === '1',
        tooltipVisible: tooltip?.classList.contains('is-visible') && tStyle?.opacity === '1',
        tooltipText: tooltip?.textContent?.trim(),
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 Step 3 (Coexisting Toolbar + Tooltip):', coexisting.result.value);
  assert.ok(coexisting.result.value?.capsuleVisible, 'Toolbar MUST be visible when tooltip is shown');
  assert.ok(coexisting.result.value?.tooltipVisible, 'Tooltip MUST be visible');
  assert.equal(coexisting.result.value?.tooltipText, '加入灵感库');

  const shot3 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '03-video-toolbar-and-tooltip-coexist.png'), Buffer.from(shot3.data, 'base64'));

  // Step 4: Move mouse into bottom control bar area (near 0:04 time tag) to verify NO accidental hide
  console.log('👉 Moving cursor into player bottom controls bar near 0:04...');
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 100,
    y: 565, // in the controls bar region
  });
  await new Promise((r) => setTimeout(r, 300));

  const controlBarHover = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById('omnimux-media-hover-root');
      const capsule = host?.shadowRoot?.querySelector('.omnimux-capsule-bar');
      const cStyle = capsule ? getComputedStyle(capsule) : null;
      return {
        isMounted: capsule !== null,
        isVisible: capsule?.classList.contains('is-visible'),
        opacity: cStyle?.opacity,
      };
    })()`,
    returnByValue: true,
  });

  console.log('📸 Step 4 (Controls Bar Tolerance):', controlBarHover.result.value);
  assert.ok(controlBarHover.result.value?.isMounted, 'Capsule must remain mounted');
  assert.ok(controlBarHover.result.value?.isVisible, 'Capsule must remain visible in controls area');

  const shot4 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EVIDENCE_DIR, '04-video-controls-tolerance.png'), Buffer.from(shot4.data, 'base64'));

  // Write structured evidence report
  const report = {
    test: 'media-hover-video-visibility',
    timestamp: new Date().toISOString(),
    status: 'PASSED',
    evidence: [
      '01-video-detected-collapsed.png',
      '02-video-toolbar-fully-visible.png',
      '03-video-toolbar-and-tooltip-coexist.png',
      '04-video-controls-tolerance.png',
    ],
    states: {
      initial: initial.result.value,
      expanded: expanded.result.value,
      coexisting: coexisting.result.value,
      controlsBarHover: controlBarHover.result.value,
    },
  };
  writeFileSync(join(EVIDENCE_DIR, 'report.json'), JSON.stringify(report, null, 2));

  // Cleanup
  cdpWs.close();
  chromeProc.kill('SIGKILL');
  server.close();
  console.log('✅ Video visibility verification completely passed! Evidence saved.');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
