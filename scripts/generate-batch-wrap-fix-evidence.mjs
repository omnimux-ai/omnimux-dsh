#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_VIEWER_CSS } from '../plugins/omnimux/src/client/media-viewer/styles.js';
import { runEgoSteps } from './lib/ego-browser-steps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EVIDENCE_FILE = join(ROOT, 'docs', 'evidence', 'batch-wrap-fix-verified.png');

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

  try {
    const run = await runEgoSteps({
      spaceName: `batch-wrap-fix-${Date.now()}`,
      width: 1000,
      height: 720,
      deviceScaleFactor: 2,
      steps: [
        { type: 'goto', url: `file://${tempHtmlPath}`, settleMs: 600 },
        { type: 'screenshot', path: EVIDENCE_FILE },
      ],
    });
    for (const shot of run.shots) {
      if (shot.bytes < 20_000) throw new Error(`screenshot looks empty: ${shot.path} (${shot.bytes} bytes)`);
    }
    console.log('✅ 实测证据截图已成功输出至:', EVIDENCE_FILE);
  } finally {
    rmSync(tempHtmlPath, { force: true });
  }
}

main().catch((err) => {
  console.error('Failed to generate evidence:', err);
  process.exit(1);
});
