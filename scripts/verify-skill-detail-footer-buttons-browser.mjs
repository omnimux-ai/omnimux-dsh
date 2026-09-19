#!/usr/bin/env node
/**
 * @file scripts/verify-skill-detail-footer-buttons-browser.mjs
 * @description 技能详情弹窗底栏按钮水平排列与防折行真实无头浏览器（CDP）端到端验收脚本
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromePath } from './worktree-web-qa.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence');
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'skill-detail-footer-buttons-verified.png');
const EVIDENCE_JSON = join(EVIDENCE_DIR, 'skill-detail-footer-buttons-verify.json');

const cssSource = readFileSync(join(REPO_ROOT, 'plugins/omnimux-market/src/client/css.js'), 'utf8');
const skillsUiSource = readFileSync(join(REPO_ROOT, 'plugins/omnimux-market/src/client/skills-ui.js'), 'utf8');
const reactJs = readFileSync(join(REPO_ROOT, 'node_modules/react/umd/react.production.min.js'), 'utf8');
const reactDomJs = readFileSync(join(REPO_ROOT, 'node_modules/react-dom/umd/react-dom.production.min.js'), 'utf8');

function extractCssString(src) {
  const firstTick = src.indexOf('`');
  const lastTick = src.lastIndexOf('`');
  if (firstTick >= 0 && lastTick > firstTick) {
    return src.slice(firstTick + 1, lastTick);
  }
  return src;
}

const rawCss = extractCssString(cssSource);

const HARNESS_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skill Detail Footer Buttons Verification</title>
  <style>
    :root {
      --dsw-alias-bg-base: #0c0f17;
      --dsw-alias-bg-elevated: #191a20;
      --dsw-alias-bg-layer-1: #141721;
      --dsw-alias-bg-layer-2: #20222a;
      --dsw-alias-bg-layer-3: #2b2d37;
      --dsw-alias-border-l1: rgba(255, 255, 255, 0.08);
      --dsw-alias-border-l2: rgba(255, 255, 255, 0.16);
      --dsw-alias-border-subtle: rgba(255, 255, 255, 0.06);
      --dsw-alias-label-primary: #ffffff;
      --dsw-alias-label-secondary: #9da1ab;
      --dsw-alias-label-tertiary: #84878f;
      --dsw-alias-label-caption: #686b74;
      --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.06);
      --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.12);
      --dsw-alias-brand-primary: #6f59ff;
      --dsw-alias-button-primary-fill: #ffffff;
      --dsw-alias-label-primary-foreground: #000000;
    }
    /* 模拟宿主 Tailwind Preflight 关键干扰特征：svg 为 block */
    svg {
      display: block;
      vertical-align: middle;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      background: #090a0f;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
    }
    /* dsh-ui-kit Button 核心样式 */
    .dshUk-Button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      gap: 6px;
      box-sizing: border-box;
      margin: 0;
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      line-height: 18px;
      white-space: nowrap;
      color: var(--dsw-alias-label-primary);
      background: transparent;
      padding: 0 12px;
      height: 32px;
      user-select: none;
    }
    .dshUk-Button.btn-sm {
      height: 28px;
      padding: 0 10px;
      border-radius: 6px;
      font-size: 12px;
      line-height: 16px;
    }
    .dshUk-Button.btn-primary {
      background: var(--dsw-alias-button-primary-fill);
      color: var(--dsw-alias-label-primary-foreground);
    }
    .dshUk-Button.btn-outline {
      background: transparent;
      border-color: var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-primary);
    }
    .dshUk-Button.dshUk-IconButton {
      padding: 0;
      width: 28px;
      height: 28px;
    }
    .dshUk-Button-slot {
      display: inline-flex;
      width: 16px;
      height: 16px;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    .dshUk-Button-label {
      min-width: 0;
    }
    ${rawCss}
  </style>
  <script>${reactJs}</script>
  <script>${reactDomJs}</script>
</head>
<body>
  <div id="root"></div>
  <script>
    window.__TEST_LOGS = [];
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;
    const createPortal = (children) => children;
    const fallbackPortal = null;
    const useTr = () => (k) => {
      if (k === "action.close") return "关闭";
      if (k === "workshop.try") return "去对话中试试";
      if (k === "action.install") return "安装";
      if (k === "action.more") return "更多操作";
      return k;
    };
    const lookup = useTr();
    const catLabel = () => "视觉与视频";
    const api = async () => ({ ok: true });

    // 真实对齐 dsh-ui-kit Button
    const Button = ({ children, leadingIcon, trailingIcon, onClick, className = "", variant = "secondary", size = "default", loading }) => {
      return h("button", {
        type: "button",
        onClick,
        className: "dshUk-Button btn-" + variant + (size === "sm" ? " btn-sm" : "") + " " + className,
      },
        leadingIcon ? h("span", { className: "dshUk-Button-slot", "aria-hidden": "true" }, leadingIcon) : null,
        children ? h("span", { className: "dshUk-Button-label" }, children) : null,
        trailingIcon ? h("span", { className: "dshUk-Button-slot", "aria-hidden": "true" }, trailingIcon) : null,
      );
    };

    const IconButton = ({ children, onClick, className = "", variant = "outline", size = "default", "aria-label": ariaLabel, title }) => {
      return h("button", {
        type: "button",
        onClick,
        "aria-label": ariaLabel,
        title: title || ariaLabel,
        className: "dshUk-Button dshUk-IconButton btn-" + variant + (size === "sm" ? " btn-sm" : "") + " " + className,
      },
        h("span", { className: "dshUk-Button-slot", "aria-hidden": "true" }, children),
      );
    };

    const TRACE = [
      ["t", "T", "目标达成", "5", "#3b82f6"],
      ["r", "R", "响应速度", "5", "#10b981"],
      ["a", "A", "准确性", "5", "#f59e0b"],
      ["c", "C", "可控性", "5", "#8b5cf6"],
      ["e", "E", "用户体验", "5", "#ec4899"]
    ];
    const DETAIL_TABS = [{ id: "overview", labelKey: "tab.overview" }];
    const trySkillInSession = async () => {};
    const iconSrc = () => null;
    const initials = (s) => (s ? s[0] : "");
    const fmt = (n) => String(n);
    const fmtTime = () => "";

    ${skillsUiSource}

    function App() {
      return h(Drawer, {
        item: {
          slug: "hypit-setup",
          name: "Hypit 官方能力接入",
          summary: "会话内引导按官方渠道安装 Hypit；不捆绑引擎，需你确认后发送。",
          version: "1.0.0",
          badges: ["sk-visual / 短剧漫剧", "sk-visual / 商业广告"]
        },
        onClose: () => {
          window.__TEST_LOGS.push("onClose triggered");
        }
      });
    }

    ReactDOM.render(h(App), document.getElementById("root"));
  </script>
</body>
</html>`;

async function main() {
  console.log('== 开始技能详情弹窗底栏按钮真实浏览器（CDP）端到端验收 ==');

  if (!existsSync(EVIDENCE_DIR)) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  // 1. 启动临时静态服务
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HARNESS_HTML);
  });

  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const serverPort = server.address().port;
  const targetUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`[1/5] 本地测试服务已在动态端口启动: ${targetUrl}`);

  // 2. 启动无头 Chrome
  const chromePath = findChromePath();
  const userDataDir = join('/tmp', `dsh-footer-qa-${randomUUID()}`);
  mkdirSync(userDataDir, { recursive: true });

  let cdpPort = 0;
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const cdpPortPromise = new Promise((resolveTimeout, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP 端口监听超时')), 10000);
    chromeProc.stderr.on('data', (chunk) => {
      const line = chunk.toString();
      const m = line.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        cdpPort = Number(m[1]);
        resolveTimeout(cdpPort);
      }
    });
  });

  await cdpPortPromise;
  console.log(`[2/5] 无头 Chrome 启动成功，CDP 监听端口: ${cdpPort}`);

  // 3. 连接 CDP Page WebSocket
  const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');
  assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, '未找到有效的 Chrome Page 调试目标');

  const cdpWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 0;
  const sendCdp = (method, params = {}) => new Promise((resolveCdp, rejectCdp) => {
    const id = ++msgId;
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) {
        cdpWs.removeEventListener('message', onMsg);
        if (m.error) rejectCdp(new Error(`CDP [${method}] 失败: ${JSON.stringify(m.error)}`));
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

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');
  await sendCdp('Page.navigate', { url: targetUrl });

  // 等待页面渲染就绪
  await new Promise((r) => setTimeout(r, 1500));

  // 4. 执行测量与断言
  console.log('[3/5] 测量底栏按钮 DOM 结构、几何位置与对齐状态...');
  const evalResult = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const footer = document.querySelector('.ws-detail-footer');
      const actions = document.querySelector('.ws-footer-actions');
      const shareBtn = document.querySelector('.ws-footer-share-btn');
      const installBtn = document.querySelector('.ws-footer-install-btn');
      const moreBtn = document.querySelector('.ws-footer-more-btn');

      if (!footer || !actions || !shareBtn || !installBtn || !moreBtn) {
        return { ok: false, error: '关键底栏元素缺失: footer=' + Boolean(footer) + ', actions=' + Boolean(actions) + ', share=' + Boolean(shareBtn) + ', install=' + Boolean(installBtn) + ', more=' + Boolean(moreBtn) };
      }

      // 分享按钮内部 slot 和 label 几何
      const shareSlot = shareBtn.querySelector('.dshUk-Button-slot');
      const shareLabel = shareBtn.querySelector('.dshUk-Button-label');
      const shareBtnRect = shareBtn.getBoundingClientRect();
      const shareSlotRect = shareSlot ? shareSlot.getBoundingClientRect() : null;
      const shareLabelRect = shareLabel ? shareLabel.getBoundingClientRect() : null;

      // 安装按钮内部 slot 和 label 几何
      const installSlot = installBtn.querySelector('.dshUk-Button-slot');
      const installLabel = installBtn.querySelector('.dshUk-Button-label');
      const installBtnRect = installBtn.getBoundingClientRect();
      const installSlotRect = installSlot ? installSlot.getBoundingClientRect() : null;
      const installLabelRect = installLabel ? installLabel.getBoundingClientRect() : null;

      const moreBtnRect = moreBtn.getBoundingClientRect();

      // 判断是否水平并排排列：slot在左、label在右，且垂直中心对齐良好
      const shareIsHorizontal = shareSlotRect && shareLabelRect &&
        (shareSlotRect.left < shareLabelRect.left) &&
        (Math.abs((shareSlotRect.top + shareSlotRect.height / 2) - (shareLabelRect.top + shareLabelRect.height / 2)) < 4);

      const installIsHorizontal = installSlotRect && installLabelRect &&
        (installSlotRect.left < installLabelRect.left) &&
        (Math.abs((installSlotRect.top + installSlotRect.height / 2) - (installLabelRect.top + installLabelRect.height / 2)) < 4);

      return {
        ok: true,
        shareBtn: {
          width: shareBtnRect.width,
          height: shareBtnRect.height,
          text: shareLabel ? shareLabel.textContent.trim() : '',
          isHorizontal: shareIsHorizontal,
          slotLeft: shareSlotRect ? shareSlotRect.left : 0,
          labelLeft: shareLabelRect ? shareLabelRect.left : 0,
        },
        installBtn: {
          width: installBtnRect.width,
          height: installBtnRect.height,
          text: installLabel ? installLabel.textContent.trim() : '',
          isHorizontal: installIsHorizontal,
          slotLeft: installSlotRect ? installSlotRect.left : 0,
          labelLeft: installLabelRect ? installLabelRect.left : 0,
        },
        moreBtn: {
          width: moreBtnRect.width,
          height: moreBtnRect.height,
          ariaLabel: moreBtn.getAttribute('aria-label') || '',
        },
        heightAligned: Math.abs(shareBtnRect.height - installBtnRect.height) < 2 && Math.abs(shareBtnRect.height - moreBtnRect.height) < 2,
      };
    })()`,
    returnByValue: true,
  });

  assert.ok(evalResult.result.value.ok, `底栏测量失败: ${JSON.stringify(evalResult.result.value)}`);
  const metrics = evalResult.result.value;
  console.log('底栏按钮测量结果:', JSON.stringify(metrics, null, 2));

  // 断言
  assert.equal(metrics.shareBtn.isHorizontal, true, '分享按钮内部图标与文案必须为单行水平排列（图标在左，文字在右）');
  assert.equal(metrics.shareBtn.text, '分享', '分享按钮文案正确');
  assert.equal(metrics.installBtn.isHorizontal, true, '安装按钮内部图标与文案必须为单行水平排列（图标在左，文字在右）');
  assert.equal(metrics.installBtn.text, '安装', '安装按钮文案正确');
  assert.equal(metrics.heightAligned, true, '底栏所有操作按钮高度必须一致对齐');
  assert.equal(metrics.moreBtn.ariaLabel, '更多操作', '更多按钮必须具备清晰的无障碍名称');

  // 5. 截取高质量屏幕截图留证
  console.log('[4/5] 截取真实浏览器视口 PNG 证据...');
  const screenshotResult = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const pngBuffer = Buffer.from(screenshotResult.data, 'base64');
  writeFileSync(EVIDENCE_PNG, pngBuffer);
  console.log(`✓ 验收截图已落盘: ${EVIDENCE_PNG} (${pngBuffer.length} 字节)`);

  // 6. 保存结构化证据 JSON
  console.log('[5/5] 保存结构化验收证据 JSON...');
  const evidenceData = {
    test: 'skill-detail-footer-buttons-layout',
    issue: 2418,
    timestamp: new Date().toISOString(),
    status: 'PASSED',
    checks: {
      shareBtnHorizontal: metrics.shareBtn.isHorizontal,
      shareBtnGeometry: {
        width: metrics.shareBtn.width,
        height: metrics.shareBtn.height,
      },
      installBtnHorizontal: metrics.installBtn.isHorizontal,
      installBtnGeometry: {
        width: metrics.installBtn.width,
        height: metrics.installBtn.height,
      },
      moreBtnGeometry: {
        width: metrics.moreBtn.width,
        height: metrics.moreBtn.height,
      },
      heightsUniform: metrics.heightAligned,
      moreAriaLabel: metrics.moreBtn.ariaLabel,
    },
    evidencePng: 'docs/evidence/skill-detail-footer-buttons-verified.png',
  };
  writeFileSync(EVIDENCE_JSON, JSON.stringify(evidenceData, null, 2));
  console.log(`✓ 验收报告已落盘: ${EVIDENCE_JSON}`);

  // 清理
  cdpWs.close();
  chromeProc.kill('SIGTERM');
  server.close();
  rmSync(userDataDir, { recursive: true, force: true });
  console.log('== 技能详情弹窗底栏按钮真实浏览器验收全量 PASSED 顺利闭环 ==');
}

main().catch((err) => {
  console.error('验收执行失败:', err);
  process.exit(1);
});
