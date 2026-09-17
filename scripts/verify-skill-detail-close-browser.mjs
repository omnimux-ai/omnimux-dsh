#!/usr/bin/env node
/**
 * @file scripts/verify-skill-detail-close-browser.mjs
 * @description 技能详情弹窗外侧右上方关闭按钮真实无头浏览器（CDP）端到端验收脚本
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
const EVIDENCE_PNG = join(EVIDENCE_DIR, 'skill-detail-external-close-verified.png');
const EVIDENCE_JSON = join(EVIDENCE_DIR, 'skill-detail-external-close-verify.json');

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
  <title>Skill Detail External Close Verification</title>
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
    const createPortal = (children, container) => {
      // In standalone iframe/body without host document, direct render
      return children;
    };
    const fallbackPortal = null;
    const useTr = () => (k) => {
      if (k === "action.close") return "关闭";
      if (k === "workshop.try") return "去对话中试试";
      if (k === "action.install") return "安装";
      return k;
    };
    const lookup = useTr();
    const catLabel = () => "视觉与视频";
    const api = async () => ({ ok: true });
    const Button = ({ children, onClick, className = "", variant = "primary", size = "sm" }) =>
      h("button", { type: "button", onClick, className: "btn-" + variant }, children);
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
      const [open, setOpen] = useState(true);
      window.__SET_OPEN = setOpen;
      window.__IS_OPEN = open;

      if (!open) {
        return h("div", { id: "closed-state", style: { padding: "40px", color: "#fff" } }, "弹窗已平滑关闭");
      }

      return h(Drawer, {
        item: {
          slug: "hypit-setup",
          name: "Hypit 官方能力接入",
          summary: "会话内引导按官方渠道安装 Hypit；不捆绑引擎，需你确认后发送。",
          version: "1.0.0",
          badges: ["sk-visual / 短剧漫剧", "sk-visual / 商业广告", "sk-visual / 平台工具", "sk-visual / 第三方"]
        },
        onClose: () => {
          window.__TEST_LOGS.push("onClose triggered");
          setOpen(false);
        }
      });
    }

    ReactDOM.render(h(App), document.getElementById("root"));
  </script>
</body>
</html>`;

async function main() {
  console.log('== 开始技能详情弹窗外侧关闭按钮真实浏览器（CDP）端到端验收 ==');

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
  const userDataDir = join('/tmp', `dsh-close-qa-${randomUUID()}`);
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
  const consoleErrors = [];
  const onConsoleMsg = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params);
    }
  };
  cdpWs.addEventListener('message', onConsoleMsg);

  await sendCdp('Page.navigate', { url: targetUrl });

  // 等待页面渲染就绪
  await new Promise((r) => setTimeout(r, 1500));
  if (consoleErrors.length > 0) {
    console.log('浏览器页面控制台日志/报错:', JSON.stringify(consoleErrors, null, 2));
  }
  const bodyText = await sendCdp('Runtime.evaluate', { expression: 'document.body.innerHTML', returnByValue: true });
  console.log('页面当前 body innerHTML:', bodyText.result?.value);

  // 4. 执行测量与断言
  console.log('[3/5] 测量弹窗 DOM 结构与外悬浮关闭按钮几何位置...');
  const evalResult = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const wrapper = document.querySelector('.ws-detail-wrapper');
      const dialog = document.querySelector('.ws-detail-dialog');
      const externalClose = document.querySelector('.omnimux-modal-close-btn.is-external');
      const innerHeaderClose = document.querySelector('.ws-detail-header-row .modal-close-btn');

      if (!wrapper || !dialog || !externalClose) {
        return { ok: false, error: '关键元素缺失: wrapper=' + Boolean(wrapper) + ', dialog=' + Boolean(dialog) + ', externalClose=' + Boolean(externalClose) };
      }

      const wrapperRect = wrapper.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const closeRect = externalClose.getBoundingClientRect();

      return {
        ok: true,
        hasWrapper: Boolean(wrapper),
        hasExternalClose: Boolean(externalClose),
        hasInnerHeaderClose: Boolean(innerHeaderClose),
        closeClasses: externalClose.className,
        closeAriaLabel: externalClose.getAttribute('aria-label'),
        closeWidth: closeRect.width,
        closeHeight: closeRect.height,
        closeTop: closeRect.top,
        closeRight: closeRect.right,
        dialogTop: dialogRect.top,
        dialogRight: dialogRect.right,
        isExternalOnRight: closeRect.right >= dialogRect.right,
        deltaRight: Math.round(closeRect.right - dialogRect.right)
      };
    })()`,
    returnByValue: true,
  });

  assert.ok(evalResult.result.value.ok, `DOM 测量失败: ${JSON.stringify(evalResult.result.value)}`);
  const metrics = evalResult.result.value;
  console.log('几何与 DOM 测量结果:', metrics);

  assert.equal(metrics.hasWrapper, true, '必须存在 .ws-detail-wrapper 容器');
  assert.equal(metrics.hasExternalClose, true, '必须存在 .omnimux-modal-close-btn.is-external 外悬浮关闭按钮');
  assert.equal(metrics.hasInnerHeaderClose, false, '弹窗内部 Header 不得残留内嵌关闭按钮');
  assert.equal(metrics.closeWidth, 36, '外侧圆形关闭按钮宽度必须为 36px');
  assert.equal(metrics.closeHeight, 36, '外侧圆形关闭按钮高度必须为 36px');
  assert.equal(metrics.closeAriaLabel, '关闭', '外侧关闭按钮应具备明确的无障碍标签“关闭”');
  assert.ok(metrics.isExternalOnRight, '外侧关闭按钮必须位于弹窗卡片右侧边缘及外侧');

  // 5. 截取高质量屏幕截图留证
  console.log('[4/5] 截取真实浏览器视口 PNG 证据...');
  const screenshotResult = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const pngBuffer = Buffer.from(screenshotResult.data, 'base64');
  writeFileSync(EVIDENCE_PNG, pngBuffer);
  console.log(`✓ 验收截图已落盘: ${EVIDENCE_PNG} (${pngBuffer.length} 字节)`);

  // 6. 测试点击外悬浮关闭按钮关闭弹窗
  console.log('[5/5] 测试真实点击外悬浮按钮交互...');
  const clickResult = await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.omnimux-modal-close-btn.is-external');
      btn.click();
      return {
        isOpen: window.__IS_OPEN,
        closedStateElem: Boolean(document.getElementById('closed-state')),
        logs: window.__TEST_LOGS
      };
    })()`,
    returnByValue: true,
  });

  console.log('点击交互结果:', clickResult.result.value);
  assert.equal(clickResult.result.value.isOpen, false, '点击后弹窗状态应转为 closed');
  assert.ok(clickResult.result.value.logs.includes('onClose triggered'), 'onClose 回调应被触发');

  // 记录结构化证据 JSON
  const report = {
    test: 'skill-detail-external-close',
    issue: 2180,
    timestamp: new Date().toISOString(),
    status: 'PASSED',
    checks: {
      hasWrapper: metrics.hasWrapper,
      hasExternalClose: metrics.hasExternalClose,
      hasInnerHeaderClose: metrics.hasInnerHeaderClose,
      closeButtonGeometry: {
        width: metrics.closeWidth,
        height: metrics.closeHeight,
        isExternalOnRight: metrics.isExternalOnRight,
        deltaRight: metrics.deltaRight,
      },
      closeAriaLabel: metrics.closeAriaLabel,
      interactiveClickClosesModal: true,
    },
    evidencePng: 'docs/evidence/skill-detail-external-close-verified.png',
  };
  writeFileSync(EVIDENCE_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✓ 结构化证据报告已落盘: ${EVIDENCE_JSON}`);

  // 清理资源
  cdpWs.close();
  chromeProc.kill('SIGTERM');
  server.close();
  rmSync(userDataDir, { recursive: true, force: true });
  console.log('== 验收完成：所有项 100% 绿色通过，资源完全自清理 ==');
}

main().catch((err) => {
  console.error('验收失败:', err);
  process.exit(1);
});
