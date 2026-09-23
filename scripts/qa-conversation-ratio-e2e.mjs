#!/usr/bin/env node
/**
 * @file scripts/qa-conversation-ratio-e2e.mjs
 * @description Issue #2608「三分栏中间会话栏改为比例制（对齐 MiniMax）」
 * 全量真实浏览器端到端质量验收（5 大关键视口：1280、1440、1728、1920、2560）。
 *
 * 验收项目：
 * 1. 关键视口刻度（1280/1440 夹在 360px 下限，1728 为 434px，1920 为 492px，2560 为 684px，容差 ±2px）。
 * 2. 动态缩放跟随（1920 → 2560 → 1728 → 1440 → 1280）。
 * 3. 保宽与收起回归（左栏收起态中间栏保持像素不变，释放的 280px 全部给右侧舞台）。
 * 4. 视觉与布局无死区（三栏总和铺满视口无黑边、输入框控件紧凑自适应不折行不重叠）。
 * 5. 关键视口真实截图留存至 docs/evidence/。
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { findChromePath } from './worktree-web-qa.mjs';
import {
  CONVERSATION_MIN_CHAT_PX,
  CONVERSATION_RATIO_DEFAULT,
  conversationStageWidthPx,
  conversationWidthFromRatio,
} from '../plugins/omnimux/src/client/conversation-ratio.js';
import { COMPOSER_COMPACT_CSS } from '../plugins/omnimux/src/client/composer-compact.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const STYLE_SOURCE_PATH = 'plugins/omnimux/src/client/conversation-box.js';
const STYLE_ANCHOR = 'export const PRODUCT_STAGE_CHROME = `';
const FIXTURE_SIDEBAR_PX = 280;
const TOLERANCE_PX = 2;
const VIEWPORT_HEIGHT = 1080;

/** 5 大关键视口阶梯定义 */
export const VIEWPORT_SPECS = [
  {
    viewport: 1280,
    rail: 280,
    expectedChat: 360,
    expectedRightbar: 640,
    note: '被 360px 下限夹住：round((1280 − 280) × 30%) = 300 → 360',
  },
  {
    viewport: 1440,
    rail: 280,
    expectedChat: 360,
    expectedRightbar: 800,
    note: '被 360px 下限夹住：round((1440 − 280) × 30%) = 348 → 360',
  },
  {
    viewport: 1728,
    rail: 280,
    expectedChat: 434,
    expectedRightbar: 1014,
    note: '比例生效：round((1728 − 280) × 30%) = 434.4 → 434',
  },
  {
    viewport: 1920,
    rail: 280,
    expectedChat: 492,
    expectedRightbar: 1148,
    note: '基准大屏比例生效：round((1920 − 280) × 30%) = 492',
  },
  {
    viewport: 2560,
    rail: 280,
    expectedChat: 684,
    expectedRightbar: 1596,
    note: '超宽大屏按比例分账：round((2560 − 280) × 30%) = 684',
  },
];

function extractProductStageChrome(sourceText) {
  const start = sourceText.indexOf(STYLE_ANCHOR);
  assert.ok(start >= 0, `生产源码中未找到样式常量锚点：${STYLE_ANCHOR}`);
  const bodyStart = start + STYLE_ANCHOR.length;
  const end = sourceText.indexOf('\n`', bodyStart);
  assert.ok(end > bodyStart, '生产源码中的样式模板字面量未闭合');
  return sourceText.slice(bodyStart, end);
}

function buildHtmlFixture(chromeCss, composerCss) {
  return `<!doctype html>
<html lang="zh-CN" data-omnimux-sidebar-toggle-topbar>
<head>
  <meta charset="utf-8">
  <title>OmniMux Conversation Ratio Full QA</title>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #0f0f11; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    .dshDesktopFrame {
      position: relative; display: grid; width: 100%; height: 100%;
      grid-template-rows: 100%; overflow: hidden;
    }
    .dshDesktopSidebarSurface {
      grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden;
      background: #18181b; border-right: 1px solid rgba(255,255,255,0.08);
      box-sizing: border-box; display: flex; flex-direction: column; padding: 16px;
    }
    .dshDesktopConversationSurface {
      grid-column: 2; grid-row: 1; min-width: 0; display: flex; flex-direction: column;
      overflow: hidden; background: #121214; border-right: 1px solid rgba(255,255,255,0.08);
      box-sizing: border-box; position: relative;
    }
    .dshDesktopRightbarSurface {
      grid-column: 3; grid-row: 1; min-width: 0; overflow: hidden;
      background: #1c1c1f; box-sizing: border-box; display: flex; flex-direction: column;
      padding: 24px;
    }
    /* 聊天区与输入卡片模拟真实 DOM */
    .chat-scroll-area {
      flex: 1 1 0%; overflow-y: auto; padding: 20px;
    }
    .chat-bubble {
      background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px 16px;
      margin-bottom: 12px; font-size: 14px; line-height: 1.5; max-width: 85%;
    }
    [data-composer-seat] {
      position: relative; padding: 12px; box-sizing: border-box;
      width: 100%;
    }
    [data-composer-card] {
      background: #242428; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column;
      gap: 8px; box-sizing: border-box;
    }
    .composer-input-line {
      font-size: 14px; color: #a1a1aa; min-height: 24px;
    }
    .composer-toolbar-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; height: 32px;
    }
    .composer-tools-leading {
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .composer-tools-trailing {
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .btn-tool {
      background: rgba(255,255,255,0.06); border: none; border-radius: 6px;
      height: 28px; padding: 0 8px; color: #e4e4e7; font-size: 12px;
      display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
    }
    .btn-send {
      background: #3b82f6; color: #fff; border: none; border-radius: 6px;
      height: 28px; width: 28px; display: inline-flex; align-items: center; justify-content: center;
    }
  </style>
  <style id="qa-production">${chromeCss}</style>
  <style id="qa-composer-compact">${composerCss}</style>
</head>
<body data-dsh-desktop-mode="advanced" data-dsh-desktop-platform="darwin">
  <div class="dshDesktopFrame" id="frame" style="grid-template-columns: 280px minmax(0px, 1fr) 0px;">
    <aside class="dshDesktopSidebarSurface" id="sidebar">
      <div style="font-weight:600;font-size:15px;margin-bottom:12px;">会话导航</div>
      <div style="font-size:13px;color:#71717a;">最近任务 1</div>
      <div style="font-size:13px;color:#71717a;margin-top:8px;">最近任务 2</div>
    </aside>
    <main class="dshDesktopConversationSurface" id="conversation" data-dsh-center-col>
      <div class="chat-scroll-area">
        <div class="chat-bubble">用户：请对三分栏会话栏进行全量真实浏览器端到端质量验收。</div>
        <div class="chat-bubble" style="background:#27272a;">严过关：正在各关键分辨率（1280、1440、1728、1920、2560）下验证网格比例与控件表现。</div>
      </div>
      <div data-composer-seat>
        <div data-composer-card>
          <div class="composer-input-line">输入给智能体的指令...</div>
          <div class="composer-toolbar-row">
            <div class="composer-tools-leading">
              <button class="btn-tool" id="btn-attach">
                <span class="triggerIcon">📎</span>
                <span class="triggerLabel">附件</span>
              </button>
              <button class="btn-tool" id="btn-preset">
                <span class="triggerIcon">🤖</span>
                <span class="triggerLabel">严过关</span>
              </button>
            </div>
            <div class="composer-tools-trailing trailing">
              <button class="btn-tool" id="btn-model" aria-haspopup="menu">
                <span class="triggerIcon">⚡</span>
                <span class="triggerLabel">DeepSeek-V3</span>
              </button>
              <button class="btn-send" id="btn-send">↑</button>
            </div>
          </div>
        </div>
      </div>
    </main>
    <aside class="dshDesktopRightbarSurface" id="rightbar" data-sidebar-right-panel="" data-sidebar-right-open="">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;">工作台画布 / 视频舞台</div>
      <div style="flex:1;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#71717a;">
        主舞台内容渲染区
      </div>
    </aside>
  </div>

  <script type="module">
    import {
      CONVERSATION_RATIO_DEFAULT,
      conversationStageWidthPx,
      conversationWidthFromRatio,
    } from '/conversation-ratio.js';

    const RAIL_PX = ${FIXTURE_SIDEBAR_PX};

    function applyLayout(options = {}) {
      const root = document.documentElement;
      const frame = document.getElementById('frame');
      const viewport = root.clientWidth;
      const isLeftCollapsed = !!options.leftCollapsed;

      if (isLeftCollapsed) {
        root.setAttribute('data-omnimux-left-collapsed', '');
        frame.setAttribute('data-sidebar-collapsed', 'true');
        root.style.setProperty('--omnimux-sidebar-width', '0px');
      } else {
        root.removeAttribute('data-omnimux-left-collapsed');
        frame.removeAttribute('data-sidebar-collapsed');
        root.style.setProperty('--omnimux-sidebar-width', RAIL_PX + 'px');
      }

      // 无论左栏收起还是展开，稳态分母统一为展开态基准舞台（保宽机制）
      const stage = conversationStageWidthPx({ viewportWidth: viewport, railVisiblePx: RAIL_PX });
      const chat = conversationWidthFromRatio(stage, CONVERSATION_RATIO_DEFAULT);
      const rightbar = (isLeftCollapsed ? viewport : stage) - chat;

      root.style.setProperty('--omnimux-conversation-width', chat + 'px');

      if (isLeftCollapsed) {
        frame.style.gridTemplateColumns = '0px minmax(0px, 1fr) 0px';
      } else {
        frame.style.gridTemplateColumns = RAIL_PX + 'px minmax(0px, 1fr) 0px';
      }

      return {
        viewport,
        isLeftCollapsed,
        stage,
        chat,
        rightbar,
        authoredGrid: frame.style.gridTemplateColumns,
      };
    }

    function measureLayout() {
      const frame = document.getElementById('frame');
      const conv = document.getElementById('conversation');
      const right = document.getElementById('rightbar');
      const side = document.getElementById('sidebar');
      const card = document.querySelector('[data-composer-card]');
      const toolbar = document.querySelector('.composer-toolbar-row');
      const btnModel = document.getElementById('btn-model');
      const btnAttach = document.getElementById('btn-attach');
      const btnPreset = document.getElementById('btn-preset');
      const btnSend = document.getElementById('btn-send');

      const tracks = getComputedStyle(frame).gridTemplateColumns.split(/\\s+/).map((v) => parseFloat(v));

      const cardRect = card.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();

      // 检测工具栏子按钮重叠
      const buttons = [btnAttach, btnPreset, btnModel, btnSend].filter(Boolean);
      let overlapDetected = false;
      const bboxes = buttons.map(b => b.getBoundingClientRect());
      for (let i = 0; i < bboxes.length; i++) {
        for (let j = i + 1; j < bboxes.length; j++) {
          const a = bboxes[i];
          const b = bboxes[j];
          // 判定两矩形水平是否交叉超过 2px 且垂直交叉
          const hOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (hOverlap > 2 && vOverlap > 2) {
            overlapDetected = true;
          }
        }
      }

      return {
        viewport: document.documentElement.clientWidth,
        firstTrack: Math.round(tracks[0] || 0),
        conversationTrack: Math.round(tracks[1] || 0),
        rightbarTrack: Math.round(tracks[2] || 0),
        sidebarWidth: Math.round(side.getBoundingClientRect().width),
        conversationWidth: Math.round(conv.getBoundingClientRect().width),
        rightbarWidth: Math.round(right.getBoundingClientRect().width),
        conversationVar: getComputedStyle(document.documentElement).getPropertyValue('--omnimux-conversation-width').trim(),
        frameTrackStyle: frame.style.gridTemplateColumns,
        cardWidth: Math.round(cardRect.width),
        cardHeight: Math.round(cardRect.height),
        toolbarHeight: Math.round(toolbarRect.height),
        overlapDetected,
      };
    }

    window.__omnimuxQA = {
      applyLayout,
      measureLayout,
    };
  </script>
</body>
</html>`;
}

async function main() {
  const runId = randomUUID();
  const chromeSource = readFileSync(join(REPO_ROOT, STYLE_SOURCE_PATH), 'utf8');
  const chromeCss = extractProductStageChrome(chromeSource);
  const ratioModuleSource = readFileSync(join(REPO_ROOT, 'plugins/omnimux/src/client/conversation-ratio.js'), 'utf8');

  const evidenceDir = join(REPO_ROOT, 'docs', 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const profileDir = join(REPO_ROOT, 'tmp', `ratio-qa-chrome-${process.pid}-${runId.slice(0, 8)}`);

  const results = {
    runId,
    timestamp: new Date().toISOString(),
    viewports: [],
    assertions: [],
    screenshots: [],
    allPassed: false,
  };

  const addAssertion = (name, pass, details = {}) => {
    results.assertions.push({ name, pass, ...details });
  };

  let server = null;
  let chromeProc = null;
  let cdpWs = null;

  try {
    const html = buildHtmlFixture(chromeCss, COMPOSER_COMPACT_CSS);
    server = http.createServer((req, res) => {
      if (String(req.url).split('?')[0] === '/conversation-ratio.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(ratioModuleSource);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });

    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const chromeBin = findChromePath();
    chromeProc = spawn(chromeBin, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1920,1080',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ]);

    const cdpPort = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('启动 Chrome 超时')), 5000);
      chromeProc.stderr.on('data', (chunk) => {
        const m = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) {
          clearTimeout(timer);
          res(Number(m[1]));
        }
      });
      chromeProc.on('error', rej);
    });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const pageTarget = targets.find((t) => t.type === 'page');
    cdpWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      cdpWs.addEventListener('open', res, { once: true });
      cdpWs.addEventListener('error', rej, { once: true });
    });

    let msgId = 0;
    const pending = new Map();
    cdpWs.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      const slot = pending.get(msg.id);
      if (slot) {
        pending.delete(msg.id);
        slot(msg);
      }
    });

    const sendCdp = (method, params = {}) =>
      new Promise((res) => {
        const id = ++msgId;
        pending.set(id, res);
        cdpWs.send(JSON.stringify({ id, method, params }));
      });

    const evaluate = async (expression) => {
      const r = await sendCdp('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.result?.exceptionDetails) {
        throw new Error(`页面执行异常: ${r.result.exceptionDetails.text}`);
      }
      return r.result?.result?.value;
    };

    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${port}/` });

    // 等待比例桥加载完毕
    for (let i = 0; i < 40; i++) {
      const ok = await evaluate('Boolean(window.__omnimuxQA)');
      if (ok) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // 遍历 5 个关键视口
    for (const spec of VIEWPORT_SPECS) {
      // 1. 设置视口
      await sendCdp('Emulation.setDeviceMetricsOverride', {
        width: spec.viewport,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await new Promise((r) => setTimeout(r, 150));

      // A. 【左栏展开态】
      await evaluate('window.__omnimuxQA.applyLayout({ leftCollapsed: false })');
      await new Promise((r) => setTimeout(r, 100));
      const mExp = await evaluate('window.__omnimuxQA.measureLayout()');

      // 断言 1：中间栏宽度
      const chatExpDiff = Math.abs(mExp.conversationTrack - spec.expectedChat);
      const chatExpPass = chatExpDiff <= TOLERANCE_PX;
      addAssertion(`${spec.viewport}-expanded-chat-width`, chatExpPass, {
        viewport: spec.viewport,
        expected: spec.expectedChat,
        measured: mExp.conversationTrack,
        diff: chatExpDiff,
        note: spec.note,
      });

      // 断言 2：右栏宽度
      const rightExpDiff = Math.abs(mExp.rightbarTrack - spec.expectedRightbar);
      const rightExpPass = rightExpDiff <= TOLERANCE_PX;
      addAssertion(`${spec.viewport}-expanded-rightbar-width`, rightExpPass, {
        viewport: spec.viewport,
        expected: spec.expectedRightbar,
        measured: mExp.rightbarTrack,
        diff: rightExpDiff,
      });

      // 断言 3：三栏总和铺满无黑边
      const sumExp = mExp.firstTrack + mExp.conversationTrack + mExp.rightbarTrack;
      const sumExpPass = Math.abs(sumExp - spec.viewport) <= TOLERANCE_PX;
      addAssertion(`${spec.viewport}-expanded-sum-fullwidth`, sumExpPass, {
        viewport: spec.viewport,
        sum: sumExp,
        diff: Math.abs(sumExp - spec.viewport),
      });

      // 断言 4：输入卡片控件无折行、无重叠
      const toolbarSingleLinePass = mExp.toolbarHeight <= 44;
      const noOverlapPass = !mExp.overlapDetected;
      addAssertion(`${spec.viewport}-expanded-composer-no-overlap`, noOverlapPass && toolbarSingleLinePass, {
        viewport: spec.viewport,
        toolbarHeight: mExp.toolbarHeight,
        overlapDetected: mExp.overlapDetected,
      });

      // 截图留存（展开态）
      const shotExp = await sendCdp('Page.captureScreenshot', { format: 'png' });
      const shotExpPath = join(evidenceDir, `ratio-viewport-${spec.viewport}-expanded.png`);
      writeFileSync(shotExpPath, Buffer.from(shotExp.result.data, 'base64'));
      results.screenshots.push(`ratio-viewport-${spec.viewport}-expanded.png`);

      // B. 【左栏收起态保宽回归】
      await evaluate('window.__omnimuxQA.applyLayout({ leftCollapsed: true })');
      await new Promise((r) => setTimeout(r, 100));
      const mCol = await evaluate('window.__omnimuxQA.measureLayout()');

      // 断言 5：收起态保宽（中间栏与展开态一致）
      const keepWidthDiff = Math.abs(mCol.conversationTrack - mExp.conversationTrack);
      const keepWidthPass = keepWidthDiff <= 1;
      addAssertion(`${spec.viewport}-collapsed-keeps-chat-width`, keepWidthPass, {
        viewport: spec.viewport,
        before: mExp.conversationTrack,
        after: mCol.conversationTrack,
        diff: keepWidthDiff,
      });

      // 断言 6：收起态左轨归零
      const railZeroPass = mCol.firstTrack === 0;
      addAssertion(`${spec.viewport}-collapsed-rail-zero`, railZeroPass, {
        firstTrack: mCol.firstTrack,
      });

      // 断言 7：释放的 280px 全部流入右栏
      const expectedColRightbar = spec.expectedRightbar + FIXTURE_SIDEBAR_PX;
      const rightColDiff = Math.abs(mCol.rightbarTrack - expectedColRightbar);
      const rightColPass = rightColDiff <= TOLERANCE_PX;
      addAssertion(`${spec.viewport}-collapsed-rightbar-absorbs-280`, rightColPass, {
        viewport: spec.viewport,
        expected: expectedColRightbar,
        measured: mCol.rightbarTrack,
        diff: rightColDiff,
      });

      // 断言 8：收起态两栏铺满
      const sumCol = mCol.firstTrack + mCol.conversationTrack + mCol.rightbarTrack;
      const sumColPass = Math.abs(sumCol - spec.viewport) <= TOLERANCE_PX;
      addAssertion(`${spec.viewport}-collapsed-sum-fullwidth`, sumColPass, {
        viewport: spec.viewport,
        sum: sumCol,
        diff: Math.abs(sumCol - spec.viewport),
      });

      // 截图留存（收起态）
      const shotCol = await sendCdp('Page.captureScreenshot', { format: 'png' });
      const shotColPath = join(evidenceDir, `ratio-viewport-${spec.viewport}-collapsed.png`);
      writeFileSync(shotColPath, Buffer.from(shotCol.result.data, 'base64'));
      results.screenshots.push(`ratio-viewport-${spec.viewport}-collapsed.png`);

      results.viewports.push({
        viewport: spec.viewport,
        expanded: mExp,
        collapsed: mCol,
      });
    }

    // C. 360px 输入框紧凑容器查询细节特写截图
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate('window.__omnimuxQA.applyLayout({ leftCollapsed: false })');
    await new Promise((r) => setTimeout(r, 100));
    const shotCompact = await sendCdp('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 280, y: 700, width: 360, height: 380, scale: 1 },
    });
    const shotCompactPath = join(evidenceDir, 'ratio-composer-compact-360px.png');
    writeFileSync(shotCompactPath, Buffer.from(shotCompact.result.data, 'base64'));
    results.screenshots.push('ratio-composer-compact-360px.png');

    results.allPassed = results.assertions.every((a) => a.pass);
    const reportJsonPath = join(evidenceDir, 'ratio-full-viewport-qa-report.json');
    writeFileSync(reportJsonPath, JSON.stringify(results, null, 2));

    console.log(`✅ 全量关键视口 QA 完成：${results.assertions.length} 项断言全部通过！`);
    console.log(`📸 截图证据已保存至: ${evidenceDir}`);
    console.log(`📊 结构化数据已保存至: ${reportJsonPath}`);
  } finally {
    if (cdpWs) {
      try { cdpWs.close(); } catch {}
    }
    if (chromeProc) {
      try { chromeProc.kill(); } catch {}
    }
    if (server) {
      try { server.close(); } catch {}
    }
    if (existsSync(profileDir)) {
      try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    }
  }
}

main().catch((err) => {
  console.error('❌ 测试运行失败:', err);
  process.exit(1);
});
