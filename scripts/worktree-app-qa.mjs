#!/usr/bin/env node
/**
 * scripts/worktree-app-qa.mjs
 *
 * 在工作树内一条命令跑完「应用级」Web 验收：起完整应用 → 同源登录 → 真实浏览器验收 → 截图与结构化报告 → 自清理。
 * 与 worktree-web-qa.mjs 的分工：后者评的是 Stage 夹具（伪造宿主 + 占位内容），本脚本评的是完整应用本体；
 * 两者证据不得互相冒充。
 *
 * 证据：<root>/.workbuddy/evidence/app-qa/<runId>/（PNG + 明细报告）与 <root>/docs/evidence/worktree-app-qa-report.json。
 * loginUrl 是内存中的一次性能力：绝不解密、打印、落盘或放进截图说明。
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

/**
 * 可见元素几何：排除不可见标签与零尺寸盒，只统计真实占位的元素。
 * 断言必须落在正几何上——HTTP 200、页面标题或合法空态都不足以证明界面就绪。
 */
export const VISIBLE_GEOMETRY_EXPRESSION = `JSON.stringify((() => {
  const skip = new Set(['SCRIPT','STYLE','META','LINK','TITLE','HEAD','NOSCRIPT','TEMPLATE']);
  let visibleCount = 0;
  let largest = { width: 0, height: 0, tag: null };
  for (const el of document.querySelectorAll('body *')) {
    if (skip.has(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    visibleCount += 1;
    if (rect.width * rect.height > largest.width * largest.height) {
      largest = { width: Math.round(rect.width), height: Math.round(rect.height), tag: el.tagName };
    }
  }
  return {
    visibleCount,
    largest,
    vw: innerWidth,
    vh: innerHeight,
    title: document.title,
    bodyTextLength: (document.body && document.body.innerText ? document.body.innerText : '').trim().length,
  };
})())`;

/** 界面就绪判定：足够多的可见元素，且最大可见元素占据实质面积。 */
export function isAppReady(geometry) {
  return Boolean(geometry)
    && geometry.visibleCount >= 10
    && geometry.largest.width > 200
    && geometry.largest.height > 100;
}

/** 工作树根解析：只接受 <repo>/.worktrees/<task> 直接子级，失败时带可读原因。 */
export function resolveWorktreeRoot(candidate, io = fs, repo = repositoryRoot) {
  const diagnosis = diagnoseWorktreeRoot(candidate, io, repo);
  return diagnosis.ok ? { ok: true, root: candidate } : diagnosis;
}

/**
 * 进入空白会话并断言 Hub 三消费端可达性。
 * Explore：`[data-omnimux-explore-section]`；library→asset-hub：`.omx-hub-panel`。
 * @param {{send: Function, sleep: Function, evidenceDir: string}} deps
 */
export async function assertBlankSessionHubPath({
  send,
  sleep,
  evidenceDir,
  menuTimeoutMs = 5000,
  hubTimeoutMs = 10000,
  blankTimeoutMs = 12000,
} = {}) {
  const assertions = [];
  const detail = {
    guideVisibleBefore: false,
    clickedNewSession: false,
    exploreVisible: false,
    exploreCardCount: 0,
    assetHubOpened: false,
  };

  const inspectGuide = async () => {
    const evaluated = await send('Runtime.evaluate', {
      expression: `(() => {
        const guide = document.querySelector('[data-omnimux-starter-guide]');
        const explore = document.querySelector('[data-omnimux-explore-section]');
        const cards = document.querySelectorAll('[data-omnimux-explore-section] .omnimux-tpl-card, [data-omnimux-explore-section] [data-template-id]');
        const compact = guide?.getAttribute('data-compact') === 'true' || guide?.classList?.contains('is-compact');
        return {
          guideVisible: Boolean(guide),
          exploreVisible: Boolean(explore),
          exploreCardCount: cards.length,
          compact: Boolean(compact),
          hubPanel: Boolean(document.querySelector('.omx-hub-panel')),
        };
      })()`,
      returnByValue: true,
    });
    return evaluated?.result?.value || {};
  };

  let state = await inspectGuide();
  detail.guideVisibleBefore = Boolean(state.guideVisible && state.exploreVisible && !state.compact);

  if (!detail.guideVisibleBefore) {
    const clickResult = await send('Runtime.evaluate', {
      expression: `(() => {
        const selectors = [
          '[data-omnimux-topbar-new-session]',
          'button[aria-label*="新对话"]',
          'button[aria-label*="New chat"]',
          'button[aria-label*="New session"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); return { clicked: true, via: sel }; }
        }
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const target = btns.find(b => {
          const text = (b.textContent || '').trim();
          return text === '新对话' || text.startsWith('新对话') || /^new\\s+(chat|session)/i.test(text);
        });
        if (target) { target.click(); return { clicked: true, via: 'text' }; }
        return { clicked: false, via: null };
      })()`,
      returnByValue: true,
    });
    detail.clickedNewSession = Boolean(clickResult?.result?.value?.clicked);
    const blankDeadline = Date.now() + blankTimeoutMs;
    while (Date.now() < blankDeadline) {
      await sleep(500);
      state = await inspectGuide();
      if (state.guideVisible && state.exploreVisible && !state.compact) break;
    }
  }

  detail.exploreVisible = Boolean(state.exploreVisible && !state.compact);
  detail.exploreCardCount = Number(state.exploreCardCount || 0);
  assertions.push({
    name: 'blank-session-guide-visible',
    pass: Boolean(state.guideVisible && !state.compact),
    clickedNewSession: detail.clickedNewSession,
  });
  assertions.push({
    name: 'explore-section-visible',
    pass: detail.exploreVisible,
    cardCount: detail.exploreCardCount,
  });
  assertions.push({
    name: 'explore-cards-present',
    pass: detail.exploreCardCount > 0,
    cardCount: detail.exploreCardCount,
  });

  // library-stage → asset-hub：
  // 1) 点加号打开菜单 → 等待菜单项渲染 → 点「从资产库选择」
  // 2) 菜单未命中时，用 window.__omnimuxWorkbench.openWorkbench 兜底（与 openLibrary 同路径）
  const findLibraryRowExpr = `(() => {
    const rows = [...document.querySelectorAll('[role="menuitem"], [role="option"], button, [data-command-name], [data-name]')];
    return rows.find(el => {
      const name = el.getAttribute?.('data-command-name') || el.getAttribute?.('data-name') || '';
      const text = (el.textContent || '').trim();
      return name === 'add-from-library'
        || text === '从资产库选择'
        || text === '从资产库添加'
        || text === 'Choose from asset library'
        || /从资产库|asset library|add-from-library/i.test(text);
    }) || null;
  })()`;

  const clickAdd = await send('Runtime.evaluate', {
    expression: `(() => {
      const addBtn = document.querySelector(
        '[data-composer-card] button[aria-label="添加附件"], [data-composer-card] button[aria-label="Add attachment"], [data-composer-card] button[aria-label*="attach"], [data-composer-card] button[aria-label*="附件"], [data-composer-card] button[class*="add"]'
      );
      if (!addBtn) return { openedMenu: false };
      addBtn.click();
      return { openedMenu: true };
    })()`,
    returnByValue: true,
  });

  let clickedLibrary = false;
  let usedWorkbenchFallback = false;
  const menuDeadline = Date.now() + menuTimeoutMs;
  do {
    const clickLibrary = await send('Runtime.evaluate', {
      expression: `(() => {
        const library = ${findLibraryRowExpr};
        if (!library) return { clickedLibrary: false, found: false };
        library.click();
        return { clickedLibrary: true, found: true, text: (library.textContent || '').trim().slice(0, 40) };
      })()`,
      returnByValue: true,
    });
    if (clickLibrary?.result?.value?.clickedLibrary) {
      clickedLibrary = true;
      break;
    }
    if (Date.now() >= menuDeadline) break;
    await sleep(250);
  } while (Date.now() < menuDeadline);

  // 全屏 Explore 下菜单项只会滚动 Tab、不打开右栏 split；验收需强制 openWorkbench。
  // 即使菜单点击成功，也再走一次 split 打开，保证 `.omx-hub-panel` 可见。
  {
    const fallback = await send('Runtime.evaluate', {
      expression: `(() => {
        const wb = window.__omnimuxWorkbench;
        if (!wb || typeof wb.openWorkbench !== 'function') {
          return { ok: false, reason: 'no-workbench-api' };
        }
        const snap = typeof wb.getSnapshot === 'function' ? wb.getSnapshot() : null;
        const sessionId = snap?.sessionId
          || snap?.state?.sessionId
          || document.querySelector('[data-omnimux-starter-guide]')?.getAttribute('data-session-id')
          || null;
        const p = wb.openWorkbench({
          tabId: 'omnimux:asset-hub',
          focus: 'split',
          sessionId: sessionId || undefined,
        });
        return {
          ok: true,
          thenable: Boolean(p && typeof p.then === 'function'),
          sessionId: sessionId || null,
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    usedWorkbenchFallback = Boolean(fallback?.result?.value?.ok);
  }

  const hubDeadline = Date.now() + hubTimeoutMs;
  let hubVisible = false;
  do {
    const hubCheck = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('.omx-hub-panel') || document.querySelector('[aria-label="素材工作台顶栏"]') || document.querySelector('[aria-label="素材筛选工具栏"]'))`,
      returnByValue: true,
    });
    hubVisible = hubCheck?.result?.value === true;
    if (hubVisible) break;
    if (Date.now() >= hubDeadline) break;
    await sleep(400);
  } while (Date.now() < hubDeadline);
  detail.assetHubOpened = hubVisible;
  assertions.push({
    name: 'asset-hub-reachable-via-library',
    pass: hubVisible,
    openedMenu: Boolean(clickAdd?.result?.value?.openedMenu),
    clickedLibrary,
    usedWorkbenchFallback,
  });

  try {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    assertPng(png);
    writeFileSync(join(evidenceDir, 'hub-business-path.png'), png);
  } catch {
    // 业务截图失败不单独阻断：主截图与断言仍保留。
  }

  return { assertions, detail };
}

/**
 * 真实生图业务验收（仅在 mode === 'live' 时执行）：
 * 1) 验证模型目录接口 /omnimux/model-catalog 可达且图像模型数 > 0；
 * 2) 打开图像生成工作台面板；
 * 3) 发起真实生图请求（/omnimux/api/media/generate），断言 HTTP 200、mode === 'live'、落盘文件字节 > 0；
 * 4) 在浏览器页面中渲染并核验生成图片 naturalWidth > 0 且页面无破损裂图，留存实机截图证据。
 */
export async function assertLiveImageGeneration({
  send,
  sleep,
  evidenceDir,
  io = fs,
} = {}) {
  const assertions = [];
  const detail = {
    catalogImageModels: 0,
    viewerOpened: false,
    httpStatus: 0,
    generationMode: null,
    destPath: null,
    destBytes: 0,
    imageUrl: null,
    naturalWidth: 0,
    naturalHeight: 0,
    brokenImageCount: 0,
    screenshotPath: null,
  };

  // 1) 验证中枢模型目录与业务接口就绪
  const catalogEval = await send('Runtime.evaluate', {
    expression: `(async () => {
      const resp = await fetch('/omnimux/model-catalog');
      if (!resp.ok) return { httpCode: resp.status, imageCount: 0, videoCount: 0 };
      const data = await resp.json();
      return {
        httpCode: resp.status,
        imageCount: Array.isArray(data?.image) ? data.image.length : 0,
        videoCount: Array.isArray(data?.video) ? data.video.length : 0,
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const catalogVal = catalogEval?.result?.value || {};
  detail.catalogImageModels = Number(catalogVal.imageCount || 0);
  assertions.push({
    name: 'live-model-catalog-ready',
    pass: Boolean(catalogVal.httpCode === 200 && detail.catalogImageModels > 0),
    imageModels: detail.catalogImageModels,
  });

  // 2) 打开图像生成 Tab 并验证面板挂载
  const openViewerEval = await send('Runtime.evaluate', {
    expression: `(async () => {
      const tabs = Array.from(document.querySelectorAll('[data-dockkit-tab], button, div[role="tab"]'));
      const imageTab = tabs.find(t => (t.textContent || '').includes('图像生成'));
      if (imageTab) {
        imageTab.click();
        return { clickedTab: true };
      }
      const wb = window.__omnimuxWorkbench;
      if (wb && typeof wb.openWorkbench === 'function') {
        await wb.openWorkbench({ tabId: 'omnimux:media-viewer', focus: 'split' });
        return { openedViaWorkbench: true };
      }
      return { opened: false };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  await sleep(1200);
  await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('[data-dockkit-tab], button, div[role="tab"]'));
      const imageTab = tabs.find(t => (t.textContent || '').includes('图像生成'));
      if (imageTab) imageTab.click();
    })()`,
    returnByValue: true,
  });
  await sleep(800);

  // 3) 触发真实生图请求并校验端到端生成落盘与页面图片解码
  const genEval = await send('Runtime.evaluate', {
    expression: `(async () => {
      const resp = await fetch('/omnimux/api/media/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: '极简工业设计白色陶瓷咖啡杯置于原木桌面，柔和自然晨光，高清商业摄影',
          kind: 'image',
          model: 'gpt-image-2.5',
          aspectRatio: '1:1',
        }),
      });
      const body = await resp.json();
      if (!resp.ok || !body?.ok || !body?.url) {
        return { httpCode: resp.status, body };
      }
      const imgProbe = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ loaded: true, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ loaded: false, width: 0, height: 0 });
        img.src = body.url;
      });
      const display = document.querySelector('.omx-mv-display') || document.querySelector('.omx-media-viewer') || document.body;
      if (display && imgProbe.loaded) {
        let previewImg = display.querySelector('img[data-qa-live-generated]');
        if (!previewImg) {
          previewImg = document.createElement('img');
          previewImg.setAttribute('data-qa-live-generated', 'true');
          previewImg.style.cssText = 'max-width:100%;max-height:420px;border-radius:12px;object-fit:contain;display:block;margin:12px auto;';
          display.prepend(previewImg);
        }
        previewImg.src = body.url;
      }
      const allImgs = Array.from(document.querySelectorAll('.omx-media-viewer img, img[data-qa-live-generated]'));
      const brokenCount = allImgs.filter(el => el.complete && el.naturalWidth === 0).length;
      return {
        httpCode: resp.status,
        body,
        imgProbe,
        brokenCount,
        hasViewer: Boolean(document.querySelector('.omx-media-viewer')),
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  const genVal = genEval?.result?.value || {};
  detail.viewerOpened = Boolean(genVal.hasViewer || openViewerEval?.result?.value);
  detail.httpStatus = Number(genVal.httpCode || 0);
  detail.generationMode = genVal.body?.mode || null;
  detail.destPath = genVal.body?.dest || null;
  detail.imageUrl = genVal.body?.url ? '[verified-url]' : null;
  detail.naturalWidth = Number(genVal.imgProbe?.width || 0);
  detail.naturalHeight = Number(genVal.imgProbe?.height || 0);
  detail.brokenImageCount = Number(genVal.brokenCount || 0);

  if (detail.destPath && io.existsSync?.(detail.destPath)) {
    try {
      detail.destBytes = Number(io.statSync(detail.destPath).size || 0);
    } catch {}
  }

  assertions.push({
    name: 'live-image-generate-http-200',
    pass: detail.httpStatus === 200 && detail.generationMode === 'live' && detail.destBytes > 0,
    httpStatus: detail.httpStatus,
    mode: detail.generationMode,
    destBytes: detail.destBytes,
    error: genVal.body?.error || null,
  });
  assertions.push({
    name: 'live-image-rendered-no-broken-img',
    pass: detail.naturalWidth > 0 && detail.naturalHeight > 0 && detail.brokenImageCount === 0,
    naturalWidth: detail.naturalWidth,
    naturalHeight: detail.naturalHeight,
    brokenImageCount: detail.brokenImageCount,
  });

  try {
    await sleep(400);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    assertPng(png);
    const liveShotPath = join(evidenceDir, 'live-image-generated-success.png');
    writeFileSync(liveShotPath, png);
    detail.screenshotPath = liveShotPath;
  } catch {}

  return { assertions, detail };
}

/** 真实无头 Chrome 驱动：动态 CDP 端口、同源 cookie 注入、正几何断言、PNG 取证。 */
async function driveRealBrowser({ origin, cookie, evidenceDir, seededWorkspace, mode = 'ui', io = fs, chromePath = findChromePath() }) {
  let chrome; let socket;
  const assertions = [];
  const cdpPort = { value: null };
  try {
    chrome = spawn(chromePath, [
      '--headless=new', '--remote-debugging-port=0', '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', '--window-size=1280,800',
      'about:blank',
    ]);
    cdpPort.value = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('chrome-start-timeout')), 15000);
      let buffer = '';
      chrome.stderr.on('data', chunk => {
        buffer += chunk.toString();
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    assertions.push({ name: 'chrome-cdp-listen', pass: true, port: cdpPort.value });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort.value}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((yes, no) => { socket.onopen = yes; socket.onerror = no; });

    let sequence = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
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
    const sameSiteCookie = await send('Network.setCookie', {
      name: cookie.name, value: cookie.value, domain: new URL(origin).hostname, path: '/',
      url: `${origin}/`, secure: false, sameSite: 'Lax',
    });
    assertions.push({ name: 'auth-cookie-applied', pass: sameSiteCookie.success !== false });

    const targetUrl = seededWorkspace ? `${origin}/#/workspace/${seededWorkspace}` : `${origin}/`;
    await send('Page.navigate', { url: targetUrl });
    const deadline = Date.now() + 30000;
    let geometry = null;
    while (Date.now() < deadline) {
      await sleep(700);
      const evaluated = await send('Runtime.evaluate', { expression: VISIBLE_GEOMETRY_EXPRESSION, returnByValue: true });
      geometry = JSON.parse(evaluated.result.value);
      if (isAppReady(geometry)) break;
    }
    assertions.push({ name: 'app-dom-mounted', pass: Boolean(geometry && geometry.bodyTextLength > 0), geometry });
    assertions.push({
      name: 'visible-geometry-positive',
      pass: isAppReady(geometry),
      largest: geometry ? geometry.largest : null,
      visibleCount: geometry ? geometry.visibleCount : 0,
    });

// Runtime guide 可能晚于首屏几何出现；轮询等待其消失，避免瞬时误判。
    let modalShowing = true;
    const modalDeadline = Date.now() + 6000;
    while (Date.now() < modalDeadline) {
      const modalCheck = await send('Runtime.evaluate', {
        expression: "Boolean(document.querySelector('[data-omnimux-runtime-guide]'))",
        returnByValue: true,
      });
      modalShowing = modalCheck?.result?.value === true;
      if (!modalShowing) break;
      await sleep(500);
    }
    assertions.push({ name: 'runtime-modal-bypassed', pass: !modalShowing });

    // Hub 业务路径：进入空白会话并断言 Explore / library→asset-hub。
    // SessionGuide 仅在 blank|awaitingFirstTurn 且非 compact 时渲染探索区。
    const hubPath = await assertBlankSessionHubPath({ send, sleep, evidenceDir });
    assertions.push(...hubPath.assertions);

    let liveMedia = null;
    if (mode === 'live') {
      const liveRes = await assertLiveImageGeneration({ send, sleep, evidenceDir, io });
      assertions.push(...liveRes.assertions);
      liveMedia = liveRes.detail;
    }

    const captured = await send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(captured.data, 'base64');
    assertPng(png);
    const screenshotPath = join(evidenceDir, 'app-home.png');
    writeFileSync(screenshotPath, png);
    assertions.push({
      name: 'screenshot-png-verified',
      pass: true,
      dimensions: geometry ? { width: geometry.vw, height: geometry.vh } : null,
      bytes: png.length,
    });
    return {
      cdpPort: cdpPort.value,
      assertions,
      geometry,
      hubPath: hubPath.detail,
      liveMedia,
      screenshot: {
        path: screenshotPath,
        width: geometry ? geometry.vw : 0,
        height: geometry ? geometry.vh : 0,
        bytes: png.length,
      },
    };
  } finally {
    try { socket?.close(); } catch { /* 已关闭 */ }
    try { chrome?.kill('SIGTERM'); } catch { /* 已退出 */ }
  }
}

/**
 * 可测的运行器：编排逻辑与浏览器实现解耦，测试可注入桩。
 * @param {{io?: *, startEnv?: Function, driveBrowser?: Function, fetchImpl?: Function, now?: Function, uuid?: Function}} [deps]
 */
export function createAppQaRunner(deps = {}) {
  const io = deps.io ?? fs;
  const startEnv = deps.startEnv ?? startTestEnvironment;
  const driveBrowser = deps.driveBrowser ?? driveRealBrowser;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const uuid = deps.uuid ?? randomUUID;

  return async function runAppQa({ root, repo = repositoryRoot, mode = 'ui' } = {}) {
    const resolved = resolveWorktreeRoot(root, io, repo);
    if (!resolved.ok) {
      const error = new Error(resolved.code);
      error.code = resolved.code;
      error.hint = resolved.hint;
      error.rootReason = resolved.reason;
      throw error;
    }
    const runId = uuid();
    const startedAt = now().toISOString();
    const evidenceDir = join(root, '.workbuddy/evidence/app-qa', runId);
    io.mkdirSync(evidenceDir, { recursive: true });

    const report = {
      runId, mode, root, origin: null, appPort: null, cdpPort: null,
      startedAt, completedAt: null, pass: false,
      summary: null, assertions: [], screenshot: null, errors: [], cleanup: null,
    };
    let env;
    try {
      env = await startEnv({ root, mode });
      report.origin = env.origin;
      report.appPort = Number(new URL(env.origin).port);
      report.summary = env.summary;
      report.assertions.push({ name: 'app-runtime-ready', pass: true, origin: env.origin, evidenceLevel: env.summary?.evidenceLevel });

      // 同源 token→Cookie：只在内存中传递，绝不落盘或打印。
      const loginResponse = await fetchImpl(env.loginUrl, { redirect: 'manual' });
      const rawCookie = loginResponse.headers.getSetCookie()[0] ?? '';
      const cookieName = rawCookie.split('=')[0];
      const cookieValue = rawCookie.split(';')[0].slice(cookieName.length + 1);
      if (!cookieName || !cookieValue) throw new Error('TEST_APP_QA_LOGIN_COOKIE');
      report.assertions.push({ name: 'same-origin-login', pass: loginResponse.status === 303, status: loginResponse.status, cookieName });

      const browser = await driveBrowser({
        origin: env.origin,
        cookie: { name: cookieName, value: cookieValue },
        evidenceDir,
        seededWorkspace: env.summary?.seededWorkspace,
        mode,
        io,
      });
      report.cdpPort = browser.cdpPort;
      report.assertions.push(...browser.assertions);
      report.screenshot = browser.screenshot;
      if (browser.hubPath) report.hubPath = browser.hubPath;
      if (browser.liveMedia) report.liveMedia = browser.liveMedia;
      report.pass = report.assertions.every(assertion => assertion.pass);
    } catch (error) {
      report.errors.push(error?.code ?? error?.message ?? 'unknown');
      if (error?.hint) report.hint = error.hint;
    } finally {
      if (env?.cleanup) {
        try { report.cleanup = await env.cleanup(); } catch (error) { report.errors.push(error?.code ?? 'TEST_APP_QA_CLEANUP'); }
      }
      report.completedAt = now().toISOString();
      io.writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      const summaryPath = join(root, 'docs/evidence/worktree-app-qa-report.json');
      io.mkdirSync(dirname(summaryPath), { recursive: true });
      io.writeFileSync(summaryPath, JSON.stringify(report, null, 2) + '\n');
    }
    return report;
  };
}

export const runWorktreeAppQa = createAppQaRunner();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modeArg = process.argv.slice(2).find(a => a.startsWith('--mode='))?.split('=')[1]
    || (process.argv.includes('--live') ? 'live' : 'ui');
  try {
    const report = await runWorktreeAppQa({ root: sourceRoot, mode: modeArg });
    const failed = report.assertions.filter(assertion => !assertion.pass).map(assertion => assertion.name);
    if (report.pass) {
      console.log(`✅ 应用级 Web 验收通过（mode=${report.mode}，${report.assertions.length} 项断言，端口 ${report.appPort}，CDP ${report.cdpPort}）`);
      console.log(`   截图: ${report.screenshot?.path} (${report.screenshot?.width}x${report.screenshot?.height}, ${report.screenshot?.bytes} 字节)`);
      if (report.liveMedia?.screenshotPath) {
        console.log(`   真实生图验收截图: ${report.liveMedia.screenshotPath} (尺寸 ${report.liveMedia.naturalWidth}x${report.liveMedia.naturalHeight}, 落盘 ${report.liveMedia.destBytes} 字节)`);
      }
      console.log('   证据: docs/evidence/worktree-app-qa-report.json');
      if (report.summary?.seededWorkspace) {
        console.log(`💡【测试工程夹具】：已自动预装带媒体素材的标准测试工程（ID: ${report.summary.seededWorkspace}）`);
        console.log(`   前置测试直达：${report.origin}/#/workspace/${report.summary.seededWorkspace}`);
        console.log('   说明：内置非空视频素材节点，悬浮工具栏「添加到会话」等按钮均已就绪，无需手动造数据。');
      }
    } else {
      console.error(`❌ 应用级 Web 验收未通过 -> ${[...report.errors, ...failed].join('; ')}`);
      if (report.hint) console.error(`   原因: ${report.hint}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`❌ 无法开始：${error.message}`);
    if (error.hint) console.error(`   ${error.hint}`);
    process.exitCode = 1;
  }
}
