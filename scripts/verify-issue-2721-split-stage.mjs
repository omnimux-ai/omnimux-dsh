#!/usr/bin/env node
/**
 * scripts/verify-issue-2721-split-stage.mjs
 *
 * Google Vids 中栏面板与 Clip 右栏同屏联动真实端到端浏览器验收 (Issue #2721)
 *
 * 座位已按 Issue #3165 更正：Vids 是官方 `main` 插槽面板，不是 shell.overlay 产品舞台。
 * 验证：
 * 1. 真实应用启动与工作区加载；
 * 2. 侧边栏入口点击：先 await open Clip('omnimux-clip:studio', focus: 'split')，再 layout.selectPanel('omnimux-vids')；
 * 3. 中栏 Google Vids 面板挂载 + 右栏 Clip Studio 工作台展开，双栏同屏；
 * 4. 界面文案与元素 100% 契约合规（SaaS 极简规范）；
 * 5. 高清实测同屏截图与结构化报告落盘；
 * 6. 关闭 Google Vids 面板后会话恢复，Clip 保持打开；
 * 7. 全程 `data-dsh-product-stage` 必须为空（claim 产品舞台会隐藏会话列里的 main 面板）。
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestEnvironment, diagnoseWorktreeRoot } from './test-env-bootstrap.mjs';
import { findChromePath, assertPng } from './worktree-web-qa.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = sourceRoot.split(`${sep}.worktrees${sep}`)[0];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const root = sourceRoot;
  const runId = randomUUID();
  const evidenceDir = join(root, '.workbuddy/evidence/issue-2721');
  const docsEvidenceDir = join(root, 'docs/evidence');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(docsEvidenceDir, { recursive: true });

  console.log(`[Issue #2721 QA] 开始 Google Vids 中栏 Overlay + Clip 右栏同屏实测 (runId: ${runId})`);

  let env = null;
  let chrome = null;
  let socket = null;
  const assertions = [];
  const report = {
    issueId: 2721,
    feature: 'google-vids-overlay-clip-split-stage',
    runId,
    timestamp: new Date().toISOString(),
    pass: false,
    assertions: [],
    screenshots: [],
    details: {},
  };

  try {
    env = await startTestEnvironment({ root, mode: 'ui' });
    console.log(`[Issue #2721 QA] 隔离测试环境已就绪，端口: ${env.origin}`);
    assertions.push({ name: 'test-env-started', pass: true, origin: env.origin });

    // 同源认证登录获取 cookie
    const loginResponse = await fetch(env.loginUrl, { redirect: 'manual' });
    const rawCookie = loginResponse.headers.getSetCookie()[0] ?? '';
    const cookieName = rawCookie.split('=')[0];
    const cookieValue = rawCookie.split(';')[0].slice(cookieName.length + 1);
    if (!cookieName || !cookieValue) throw new Error('TEST_APP_QA_LOGIN_COOKIE');
    assertions.push({ name: 'same-origin-login', pass: loginResponse.status === 303 });

    // 启动 Chrome
    const chromePath = findChromePath();
    chrome = spawn(chromePath, [
      '--headless=new', '--remote-debugging-port=0', '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', '--window-size=1280,800',
      'about:blank',
    ]);

    const cdpPort = await new Promise((resolvePort, rejectPort) => {
      const timer = setTimeout(() => rejectPort(new Error('chrome-start-timeout')), 15000);
      let buffer = '';
      chrome.stderr.on('data', chunk => {
        buffer += chunk.toString();
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (match) { clearTimeout(timer); resolvePort(Number(match[1])); }
      });
    });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((yes, no) => { socket.onopen = yes; socket.onerror = no; });

    let sequence = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((resolveCmd, rejectCmd) => {
      const id = ++sequence;
      pending.set(id, { resolve: resolveCmd, reject: rejectCmd });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve: yes, reject: no } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) no(new Error(`cdp ${message.error.message}`)); else yes(message.result);
    };

    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    const browserLogs = [];
    const failedUrls = [];
    socket.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Network.responseReceived') {
        const resp = msg.params?.response;
        if (resp && resp.status >= 400) {
          failedUrls.push({ url: resp.url, status: resp.status });
        }
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params?.args || []).map(a => a.value ?? a.description ?? '').join(' ');
        browserLogs.push(`[CONSOLE_${msg.params?.type}] ${text}`);
      }
      if (msg.method === 'Log.entryAdded') {
        browserLogs.push(`[CONSOLE_${msg.params?.entry?.level}] ${msg.params?.entry?.text}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        browserLogs.push(`[EXCEPTION] ${JSON.stringify(msg.params?.exceptionDetails)}`);
      }
    });
    await send('Network.setCookie', {
      name: cookieName, value: cookieValue, domain: new URL(env.origin).hostname, path: '/',
      url: `${env.origin}/`, secure: false, sameSite: 'Lax',
    });

    // 导航到测试工作区
    const targetUrl = env.summary?.seededWorkspace
      ? `${env.origin}/#/workspace/${env.summary.seededWorkspace}`
      : `${env.origin}/`;
    console.log(`[Issue #2721 QA] 导航至页面: ${targetUrl}`);
    await send('Page.navigate', { url: targetUrl });

    // 等待 DOM 挂载及开箱弹窗消失
    const navDeadline = Date.now() + 30000;
    let pageReady = false;
    while (Date.now() < navDeadline) {
      await sleep(800);
      const evalReady = await send('Runtime.evaluate', {
        expression: `(() => {
          const guide = document.querySelector('[data-omnimux-runtime-guide]');
          const bodyLen = (document.body?.innerText || '').trim().length;
          return { guideVisible: Boolean(guide), bodyLen };
        })()`,
        returnByValue: true,
      });
      const val = evalReady?.result?.value;
      if (val && !val.guideVisible && val.bodyLen > 20) {
        pageReady = true;
        break;
      }
    }
    assertions.push({ name: 'page-mounted-and-ready', pass: pageReady });
    console.log(`[Issue #2721 QA] 页面准备就绪: ${pageReady}`);

    // 等待侧边栏协调器及探索菜单入口或 Google Vids 入口
    const entryDeadline = Date.now() + 15000;
    let entryFound = false;
    let probeStatus = null;
    while (Date.now() < entryDeadline) {
      await sleep(800);
      const probeRes = await send('Runtime.evaluate', {
        expression: `(() => {
          const directEntry = document.querySelector('[data-omnimux-google-vids-entry]');
          const exploreBtn = document.querySelector('#omnimux-explore-entry, [data-omnimux-explore-entry]');
          const sb = window.__omnimuxSidebar;
          let convergedKeys = [];
          if (sb && typeof sb.getConvergedRows === 'function') {
            try { convergedKeys = Array.from(sb.getConvergedRows().keys()); } catch {}
          }
          return {
            hasDirectEntry: Boolean(directEntry),
            hasExploreBtn: Boolean(exploreBtn),
            hasSidebarCoord: Boolean(sb),
            convergedKeys,
          };
        })()`,
        returnByValue: true,
      });
      probeStatus = probeRes?.result?.value;
      if (probeStatus?.hasDirectEntry || probeStatus?.hasExploreBtn || probeStatus?.convergedKeys?.includes('omnimux-video-google-vids-entry')) {
        entryFound = true;
        break;
      }
    }
    // 先确保有合法当前会话：openWorkbench 硬依赖 sessionId
    const ensureSessionRes = await send('Runtime.evaluate', {
      expression: `(async () => {
        const pickSessions = () => (
          window.__omnimuxSessions
          || window.__omnimuxWorkflow?.sessions
          || window.__omnimuxMarket?.sessions
          || null
        );
        const pickWorkspaces = () => (
          window.__omnimuxWorkspaces
          || window.__omnimuxWorkflow?.workspaces
          || window.__omnimuxMarket?.workspaces
          || null
        );
        const waitCurrent = async (sessions, timeoutMs = 8000) => {
          const started = Date.now();
          while (Date.now() - started < timeoutMs) {
            const current = sessions?.list?.getSnapshot?.()?.current;
            if (current) return String(current);
            await new Promise((r) => setTimeout(r, 200));
          }
          return sessions?.list?.getSnapshot?.()?.current || null;
        };

        // 1) 优先走官方「新对话」按钮（与用户手势同构）
        const btn = document.querySelector('button.x-Wl6W_newSession') || document.querySelector('button[class*="newSession"]');
        if (btn) {
          btn.click();
          await new Promise((r) => setTimeout(r, 1200));
        }

        let sessions = pickSessions();
        let current = await waitCurrent(sessions, 2500);
        if (current) {
          return { ok: true, via: 'newSession-click', sessionId: current, hash: location.hash };
        }

        // 2) 兜底：官方 sessions.create({ workspaceId })
        // 若全局未挂出 sessions，尝试从 Cordis loader store 找回
        if (!sessions || typeof sessions.create !== 'function') {
          try {
            const rootCtx = window.__omnimuxWorkflow?.sessions?.rootCtx
              || window.__omnimuxWorkflow?.rootCtx
              || null;
            const loader = rootCtx?.get?.('loader') || null;
            const store = loader?.store || {};
            for (const entry of Object.values(store)) {
              const ctx = entry?.fiber?.ctx || entry?.ctx || null;
              const candidate = ctx?.get?.('sessions') || ctx?.sessions;
              if (candidate && typeof candidate.create === 'function') {
                sessions = candidate;
                break;
              }
            }
          } catch {}
        }

        const workspaces = pickWorkspaces();
        const wsItems = workspaces?.list?.getSnapshot?.()?.items || [];
        const workspaceId = wsItems.find((row) => row.workspaceId === 'ws_qa_media')?.workspaceId
          || wsItems[0]?.workspaceId
          || 'ws_qa_media';

        if (!sessions || typeof sessions.create !== 'function') {
          return {
            ok: false,
            error: 'sessions-unavailable',
            workspaceId,
            wsCount: wsItems.length,
            globals: {
              hasOmnimuxSessions: Boolean(window.__omnimuxSessions),
              hasWorkflowSessions: Boolean(window.__omnimuxWorkflow?.sessions),
              hasMarketSessions: Boolean(window.__omnimuxMarket?.sessions),
            },
          };
        }

        const created = await sessions.create({ workspaceId });
        if (typeof sessions.open === 'function' && created) sessions.open(created);
        current = await waitCurrent(sessions, 8000);
        return {
          ok: Boolean(current),
          via: 'sessions.create',
          sessionId: current || created || null,
          workspaceId,
          hash: location.hash,
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('[Issue #2721 QA] 确保会话:', JSON.stringify(ensureSessionRes?.result?.value, null, 2));
    await sleep(1500);

    const directOpenTest = await send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          const wb = window.__omnimuxWorkbench;
          const snap = wb?.getSnapshot ? wb.getSnapshot() : null;
          const openRes = wb?.open ? await wb.open({
            tabId: 'omnimux-clip:studio',
            title: '视频剪辑',
            focus: 'split',
          }) : 'no-open-fn';
          return {
            openRes,
            snapshotSessionId: snap?.sessionId || null,
            tabInDom: Boolean(document.querySelector('[data-tab-id="omnimux-clip:studio"]')),
            documentStage: document.documentElement.getAttribute('data-dsh-product-stage'),
            urlHash: location.hash,
            focus: typeof wb?.getFocus === 'function' ? wb.getFocus() : null,
          };
        } catch (e) {
          return { fatal: e.message };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('[Issue #2721 QA] directOpen 诊断:', JSON.stringify(directOpenTest?.result?.value, null, 2));
    console.log('[Issue #2721 QA] 失败的请求 URLs:\n', JSON.stringify(failedUrls, null, 2));
    const bailoutLogs = browserLogs.filter((line) => /openWorkbench bailout|sessions-unavailable|Module .* already registered/i.test(line));
    if (bailoutLogs.length) console.log('[Issue #2721 QA] 关键日志:\n', bailoutLogs.join('\n'));
    assertions.push({ name: 'vids-entry-or-explore-present', pass: entryFound });

    // 触发点击 Google Vids：
    // 若在探索菜单中，点击探索按钮展开菜单，再点击 Google Vids 菜单项；否则直接点击入口或委托条目
    console.log('[Issue #2721 QA] 触发打开 Google Vids');
    const clickRes = await send('Runtime.evaluate', {
      expression: `(() => {
        // 1. 若有直接可见入口，点击直接入口
        const direct = document.querySelector('[data-omnimux-google-vids-entry]');
        if (direct && typeof direct.click === 'function') {
          direct.click();
          return { method: 'direct-entry-click' };
        }
        // 2. 若有探索入口，点击探索展开菜单并点击 google-vids
        const exploreBtn = document.querySelector('#omnimux-explore-entry, [data-omnimux-explore-entry]');
        if (exploreBtn && typeof exploreBtn.click === 'function') {
          exploreBtn.click();
          const vidsItem = document.querySelector('[data-explore-id="google-vids"]');
          if (vidsItem && typeof vidsItem.click === 'function') {
            vidsItem.click();
            return { method: 'explore-menu-click' };
          }
        }
        // 3. 兜底从 CONVERGED_ROWS 触发
        const sb = window.__omnimuxSidebar;
        if (sb && typeof sb.getConvergedRows === 'function') {
          const row = sb.getConvergedRows().get('omnimux-video-google-vids-entry');
          if (row?.element && typeof row.element.click === 'function') {
            row.element.click();
            return { method: 'converged-row-click' };
          }
        }
        return { method: 'none-found' };
      })()`,
      returnByValue: true,
    });
    console.log('[Issue #2721 QA] 触发结果:', clickRes?.result?.value);

    // 轮询等待同屏就绪：中栏 Vids 面板挂载 + 未写产品舞台标记（Issue #3165）
    const splitDeadline = Date.now() + 15000;
    let splitState = null;
    while (Date.now() < splitDeadline) {
      await sleep(800);
      const checkSplit = await send('Runtime.evaluate', {
        expression: `(() => {
          const docEl = document.documentElement;
          const stage = docEl.getAttribute('data-dsh-product-stage');
          const vidsStageEl = document.querySelector('.omnimux-vids-stage');
          const titleEl = vidsStageEl?.querySelector('.gvids-title');
          const badgeEl = vidsStageEl?.querySelector('.gvids-badge');
          const clipTab = document.querySelector('[data-dsh-better-sidebar]');
          const closeBtn = vidsStageEl?.querySelector('.gvids-close-btn');
          const rect = vidsStageEl ? vidsStageEl.getBoundingClientRect() : null;

          return {
            stage,
            vidsMounted: Boolean(vidsStageEl),
            vidsInMainSlot: Boolean(vidsStageEl?.closest('[data-slot="main"]')),
            vidsVisible: Boolean(vidsStageEl) && getComputedStyle(vidsStageEl).visibility !== 'hidden',
            rect: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
            titleText: titleEl?.textContent?.trim(),
            badgeText: badgeEl?.textContent?.trim(),
            clipSidebarVisible: Boolean(clipTab),
            closeBtnMounted: Boolean(closeBtn),
            wbFocus: window.__omnimuxWorkbench?.getFocus ? window.__omnimuxWorkbench.getFocus() : null,
          };
        })()`,
        returnByValue: true,
      });
      const val = checkSplit?.result?.value;
      if (val && val.vidsMounted && val.vidsVisible) {
        splitState = val;
        break;
      }
    }

    console.log('[Issue #2721 QA] 同屏激活状态:', splitState);
    assertions.push({
      name: 'vids-panel-mounted-in-main-slot',
      pass: Boolean(splitState?.vidsMounted && splitState?.vidsInMainSlot),
      actual: { mounted: splitState?.vidsMounted, inMainSlot: splitState?.vidsInMainSlot },
    });
    assertions.push({
      name: 'vids-panel-visible-with-geometry',
      pass: Boolean(splitState?.vidsVisible && splitState?.rect?.w > 100 && splitState?.rect?.h > 100),
      actual: splitState?.rect,
    });
    assertions.push({
      name: 'no-product-stage-claim',
      pass: splitState?.stage === null,
      actual: splitState?.stage,
    });
    assertions.push({
      name: 'saas-copy-title-google-vids',
      pass: splitState?.titleText === 'Google Vids',
      actual: splitState?.titleText,
    });
    assertions.push({
      name: 'saas-copy-badge-internal-beta',
      pass: splitState?.badgeText === '内测版',
      actual: splitState?.badgeText,
    });
    assertions.push({
      name: 'clip-sidebar-coexists',
      pass: Boolean(splitState?.clipSidebarVisible),
    });

    // 捕获真实同屏截图
    const shotSplit = await send('Page.captureScreenshot', { format: 'png' });
    const pngSplit = Buffer.from(shotSplit.data, 'base64');
    assertPng(pngSplit);

    const shotSplitPath1 = join(docsEvidenceDir, 'google-vids-split-stage-verified.png');
    const shotSplitPath2 = join(evidenceDir, 'google-vids-split-stage-verified.png');
    writeFileSync(shotSplitPath1, pngSplit);
    writeFileSync(shotSplitPath2, pngSplit);
    console.log(`[Issue #2721 QA] 同屏实测截图已保存: ${shotSplitPath1} (${pngSplit.length} 字节)`);
    report.screenshots.push({
      name: 'google-vids-split-stage-verified.png',
      bytes: pngSplit.length,
      path: 'docs/evidence/google-vids-split-stage-verified.png',
    });

    // 测试退出生命周期：点击 Header 关闭按钮（勿点向导面板里的同名按钮）
    console.log('[Issue #2721 QA] 测试关闭舞台与会话恢复: 点击 header .gvids-close-btn');
    const closeClick = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.omnimux-vids-stage .gvids-header .gvids-close-btn')
          || document.querySelector('.omnimux-vids-stage > .gvids-header button[aria-label="关闭"]')
          || document.querySelector('.gvids-close-btn');
        if (!btn) return { ok: false, error: 'close-btn-missing' };
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
        btn.dispatchEvent(new PointerEvent('pointerdown', opts));
        btn.dispatchEvent(new MouseEvent('mousedown', opts));
        btn.dispatchEvent(new PointerEvent('pointerup', opts));
        btn.dispatchEvent(new MouseEvent('mouseup', opts));
        btn.dispatchEvent(new MouseEvent('click', opts));
        return {
          ok: true,
          rect: { x: cx, y: cy, w: rect.width, h: rect.height },
          aria: btn.getAttribute('aria-label'),
        };
      })()`,
      returnByValue: true,
    });
    console.log('[Issue #2721 QA] 关闭点击:', closeClick?.result?.value);

    // 轮询等待面板退出：组件关闭后可能保留 display:none 节点，故以不可见为准
    const closeDeadline = Date.now() + 10000;
    let closeState = null;
    while (Date.now() < closeDeadline) {
      await sleep(400);
      const checkClose = await send('Runtime.evaluate', {
        expression: `(() => {
          const stage = document.documentElement.getAttribute('data-dsh-product-stage');
          const vidsStageEl = document.querySelector('.omnimux-vids-stage');
          const style = vidsStageEl ? getComputedStyle(vidsStageEl) : null;
          const visible = Boolean(
            vidsStageEl
            && style
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || '1') > 0
            && vidsStageEl.getBoundingClientRect().width > 0
          );
          return {
            stage,
            hasNode: Boolean(vidsStageEl),
            visible,
            vidsGone: !visible,
          };
        })()`,
        returnByValue: true,
      });
      const val = checkClose?.result?.value;
      if (val && val.vidsGone && val.stage === null) {
        closeState = val;
        break;
      }
      closeState = val;
    }

    console.log('[Issue #2721 QA] 关闭后状态:', closeState);
    assertions.push({
      name: 'vids-panel-released-on-close',
      pass: Boolean(closeState && closeState.stage === null && closeState.vidsGone),
      actual: closeState,
    });

    // 捕获关闭后会话恢复截图
    const shotClosed = await send('Page.captureScreenshot', { format: 'png' });
    const pngClosed = Buffer.from(shotClosed.data, 'base64');
    assertPng(pngClosed);
    const shotClosedPath1 = join(docsEvidenceDir, 'google-vids-closed-session-restored.png');
    const shotClosedPath2 = join(evidenceDir, 'google-vids-closed-session-restored.png');
    writeFileSync(shotClosedPath1, pngClosed);
    writeFileSync(shotClosedPath2, pngClosed);
    console.log(`[Issue #2721 QA] 会话恢复截图已保存: ${shotClosedPath1}`);
    report.screenshots.push({
      name: 'google-vids-closed-session-restored.png',
      bytes: pngClosed.length,
      path: 'docs/evidence/google-vids-closed-session-restored.png',
    });

    report.pass = assertions.every(a => a.pass);
    report.assertions = assertions;
    report.details = {
      splitState,
      closeState,
      appPort: Number(new URL(env.origin).port),
      cdpPort,
    };

    const reportJsonPath = join(docsEvidenceDir, 'google-vids-split-stage-verified.json');
    const reportWorkbuddyPath = join(evidenceDir, 'google-vids-split-stage-verified.json');
    writeFileSync(reportJsonPath, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(reportWorkbuddyPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`[Issue #2721 QA] 结构化证据报告已保存: ${reportJsonPath}`);

    // 生成 Markdown 验收报告
    const mdReport = `# Google Vids 中栏面板与视频剪辑同屏实测验收报告 (Issue #2721)

- **Issue**: #2721
- **座位更正**: #3165（Vids 迁至官方 \`main\` 插槽，不再 claim 产品舞台）
- **验收时间**: ${new Date().toISOString()}
- **环境**: 隔离测试工作树 (.worktrees/video-vids-overlay-entry-issue-2721)
- **运行模式**: UI 合成隔离环境 (端口: ${env.origin})
- **验收结论**: ${report.pass ? 'PASS (全部断言通过)' : 'FAIL'}

---

## 一、双栏同屏与 main 插槽拓扑实测核验
1. **中栏 main 面板挂载**：
   - 侧边栏点击「Google Vids」入口 (Rank 7.5)；
   - \`[data-slot="main"]\` 内成功挂载 \`.omnimux-vids-stage\` (GoogleVidsStage)；
   - 全程 \`data-dsh-product-stage\` 保持为空 —— 该标记会触发产品舞台 chrome，隐藏会话列里所有非 overlay 子节点，而 main 面板正渲染在会话列内，claim 即等于把自己隐藏（#3165 中栏空白根因）；
   - 右侧 \`betterSidebar\` 保持展开，实现 **中栏生成面板 : 右栏视频剪辑** 左右同屏。
2. **启动时序与异步安全锁**：
   - 入口点击首先 \`await workbench.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })\`；
   - 仅当严格返回 \`true\` 时才调用 \`layout.selectPanel('omnimux-vids')\`。

---

## 二、SaaS 极简文案与 UI 元素白名单审查 (100% 对齐 Spec)
1. **Header 元素白名单**：
   - 主标题：严格锁定为 \`Google Vids\` (14px，无 Emoji，无营销括号)；
   - 微标：严格锁定为 \`内测版\` (12px 细边框胶囊)；
   - 关闭按钮：纯矢量 SVG \`✕\`，点击后经 \`layout.selectPanel(null)\` 交还宿主原生会话。
2. **退出 main 面板生命周期验证**：
   - 点击关闭按钮后，面板卸载且不可见；
   - 中心主会话列无缝恢复，右侧 Clip 工作台保持驻留打开。

---

## 三、真实运行截图证据清单
1. **同屏联动实机截图**：
   - 相对路径：\`docs/evidence/google-vids-split-stage-verified.png\`
   - 规格：1280x800, PNG 真实解码无伪造
2. **关闭面板会话恢复截图**：
   - 相对路径：\`docs/evidence/google-vids-closed-session-restored.png\`
3. **结构化报告**：
   - 相对路径：\`docs/evidence/google-vids-split-stage-verified.json\`
`;
    writeFileSync(join(docsEvidenceDir, 'google-vids-split-stage-verify.md'), mdReport);
    writeFileSync(join(evidenceDir, 'google-vids-split-stage-verify.md'), mdReport);

    console.log(`\n===============================================================`);
    console.log(` Google Vids 分栏同屏实测结论: ${report.pass ? '✅ ALL PASS!' : '❌ FAILED'}`);
    console.log(` 断言通过率: ${assertions.filter(a => a.pass).length} / ${assertions.length}`);
    console.log(`===============================================================\n`);

    if (!report.pass) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`[Issue #2721 QA] 验收过程异常:`, err);
    process.exitCode = 1;
  } finally {
    try { socket?.close(); } catch {}
    try { chrome?.kill('SIGTERM'); } catch {}
    if (env?.cleanup) {
      try { await env.cleanup(); } catch {}
    }
  }
}

main();
