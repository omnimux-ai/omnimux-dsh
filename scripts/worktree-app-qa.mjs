#!/usr/bin/env node
/**
 * scripts/worktree-app-qa.mjs
 *
 * 在工作树内一条命令跑完「应用级」Web 验收：起完整应用 → 同源登录 → 真实浏览器验收 → 截图与结构化报告 → 自清理。
 * 与 worktree-web-qa.mjs 的分工：后者评的是 Stage 夹具（伪造宿主 + 占位内容），本脚本评的是完整应用本体；
 * 两者证据不得互相冒充。
 *
 * 显式请求证据：.workbuddy/evidence/contract/<taskId>/<runId>/；无请求的旧调用仅为无契约冒烟。
 * loginUrl 是内存中的一次性能力：绝不解密、打印、落盘或放进截图说明。
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { captureCandidate, sealEvidence, validateEvidence } from './evidence-contract.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startTestEnvironment, diagnoseWorktreeRoot } from './test-env-bootstrap.mjs';
import { findChromePath, assertPng } from './worktree-web-qa.mjs';
import { validateTaskPeerResolution } from './task-runtime-proof.mjs';

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

/** Complete the actual first-launch notice through its visible Continue button. */
export async function dismissFirstLaunchNotice({ send, sleep, now = Date.now, timeoutMs = 6000, settleMs = 1000 }) {
  const deadline = now() + timeoutMs;
  let absentSince = null, clicked = false;
  do {
    const response = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const visible = element => {
        const box = element.getBoundingClientRect(), style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };
      const dialogs = [...document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]')]
        .filter(dialog => visible(dialog) && [...dialog.querySelectorAll('h1,h2,h3,h4,[role="heading"]')]
          .some(heading => heading.textContent.trim() === '内测声明'));
      if (!dialogs.length) return { present: false };
      if (dialogs.length !== 1) return { present: true, actionable: false };
      const buttons = [...dialogs[0].querySelectorAll('button')]
        .filter(button => button.textContent.trim() === '继续' && !button.disabled && visible(button));
      if (buttons.length !== 1) return { present: true, actionable: false };
      const button = buttons[0], box = button.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { present: true, actionable: Boolean(hit && button.contains(hit)), x, y };
    })()` });
    const state = response?.result?.value;
    if (response.exceptionDetails || !state || typeof state.present !== 'boolean') return false;
    if (!state.present) {
      absentSince ??= now();
      if (now() - absentSince >= settleMs) return true;
    } else {
      absentSince = null;
      if (!clicked && state.actionable === true && Number.isFinite(state.x) && Number.isFinite(state.y)) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: state.x, y: state.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: state.x, y: state.y, button: 'left', clickCount: 1 });
        clicked = true;
      }
    }
    await sleep(150);
  } while (now() < deadline);
  return false;
}

/** Current inline Assets and material-workbench surfaces, with actual hit testing. */
export const ASSET_LIBRARY_VISIBLE_EXPRESSION = `(() => {
  const visible = element => {
    if (!element) return false;
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    const left = Math.max(0, box.left), top = Math.max(0, box.top), right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
    if (right <= left || bottom <= top || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return Boolean(hit && element.contains(hit));
  };
  if ([...document.querySelectorAll('[role="listbox"]')].some(visible)) return false;
  if ([...document.querySelectorAll('.omx-hub-panel, [aria-label="素材工作台顶栏"], [aria-label="素材筛选工具栏"]')].some(visible)) return true;
  for (const section of document.querySelectorAll('[data-omnimux-starter-guide] [data-omnimux-explore-section]')) {
    const primary = section.querySelectorAll('button[role="tab"][data-primary-tab="assets"][aria-selected="true"]');
    if (primary.length !== 1 || !visible(primary[0])) continue;
    const categories = ['all', 'local-upload', 'ai-generated', 'digital-human', 'product-images', 'character'];
    const tabs = [...section.querySelectorAll('button[role="tab"][data-sub-category]')];
    if (tabs.length !== categories.length || categories.some(id => tabs.filter(tab => tab.dataset.subCategory === id).length !== 1)
      || !tabs.every(visible) || tabs.find(tab => tab.dataset.subCategory === 'all')?.getAttribute('aria-selected') !== 'true') continue;
    const roots = section.querySelectorAll('.omnimux-explore-grid-view-wrap > .omx-library-flow-root');
    if (roots.length !== 1 || !visible(roots[0])) continue;
    const root = roots[0];
    if (root.querySelector('.omx-library-flow-spinner, .omx-library-flow-retry')) continue;
    const empty = root.querySelector('.omx-library-flow-status > p');
    if (empty?.textContent.trim() === '暂无素材' && visible(empty)) return true;
    const grid = root.matches('[data-flow-container]') && root.querySelector('[role="region"][aria-label="素材瀑布流网格"]');
    if (visible(grid) && [...grid.querySelectorAll('[data-library-lane="assets"]')].some(visible)) return true;
  }
  return false;
})()`;

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
  // 1) 点加号打开菜单 → 等待菜单项渲染 → 真实鼠标选择「从资产库选择」
  // 2) 菜单未命中时，用 window.__omnimuxWorkbench.openWorkbench 兜底（与 openLibrary 同路径）
  const findLibraryRowExpr = `(() => {
    const rows = [...document.querySelectorAll('[role="listbox"] button[role="option"], [role="menuitem"], [data-command-name], [data-name]')];
    const matches = rows.filter(el => {
      const name = el.getAttribute?.('data-command-name') || el.getAttribute?.('data-name') || '';
      const text = (el.querySelector('[class*="itemName"]')?.textContent || el.textContent || '').trim();
      const box = el.getBoundingClientRect(), style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
        && (name === 'add-from-library'
        || text === '从资产库选择'
        || text === '从资产库添加'
        || text === 'Choose from asset library'
        || text === 'Add from asset library');
    });
    return matches.length === 1 ? matches[0] : null;
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
        if (!library) return { found: false };
        const box = library.getBoundingClientRect(), style = getComputedStyle(library);
        const x = box.x + box.width / 2, y = box.y + box.height / 2, hit = document.elementFromPoint(x, y);
        return { found: true, actionable: box.width > 0 && box.height > 0 && style.display !== 'none'
          && style.visibility !== 'hidden' && style.opacity !== '0' && Boolean(hit && library.contains(hit)), x, y };
      })()`,
      returnByValue: true,
    });
    const row = clickLibrary?.result?.value;
    if (row?.found && row.actionable === true && Number.isFinite(row.x) && Number.isFinite(row.y)) {
      // Shipping input-trigger picks onMouseDown; HTMLElement.click() does not select it.
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: row.x, y: row.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: row.x, y: row.y, button: 'left', clickCount: 1 });
      clickedLibrary = true;
      await sleep(150);
      break;
    }
    if (Date.now() >= menuDeadline) break;
    await sleep(250);
  } while (Date.now() < menuDeadline);

  // 请求已注册工作台；其布尔返回只记诊断，实际 inline/split 可见性另核。
  {
    const fallback = await send('Runtime.evaluate', {
      expression: `(async () => {
        const wb = window.__omnimuxWorkbench;
        if (!wb || typeof wb.openWorkbench !== 'function') {
          return { ok: false, reason: 'no-workbench-api' };
        }
        const snap = typeof wb.getSnapshot === 'function' ? wb.getSnapshot() : null;
        const sessionId = snap?.sessionId
          || snap?.state?.sessionId
          || document.querySelector('[data-omnimux-starter-guide]')?.getAttribute('data-session-id')
          || null;
        const result = await wb.openWorkbench({
          tabId: 'omnimux:asset-hub',
          focus: 'split',
          sessionId: sessionId || undefined,
        });
        return {
          ok: result === true,
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
      expression: ASSET_LIBRARY_VISIBLE_EXPRESSION,
      returnByValue: true,
    });
    hubVisible = hubCheck?.result?.value === true;
    if (hubVisible) break;
    if (Date.now() >= hubDeadline) break;
    await sleep(400);
  } while (Date.now() < hubDeadline);
  detail.assetHubOpened = hubVisible;
  detail.librarySelected = clickedLibrary;
  detail.workbenchRequestAccepted = usedWorkbenchFallback;
  assertions.push({
    name: 'asset-hub-reachable-via-library',
    pass: hubVisible && clickedLibrary,
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

/**
 * 解析任务功能旅程（journey）路径：只允许工作树内的 .mjs/.js 文件，拒绝越界。
 * @returns {{ok:true, path:string}|{ok:false, reason:string}}
 */
export function resolveJourneyPath(candidate, root) {
  if (typeof candidate !== 'string' || !candidate.trim()) return { ok: false, reason: 'journey-path-empty' };
  const abs = resolve(root, candidate);
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) return { ok: false, reason: 'journey-path-outside-worktree' };
  if (!abs.endsWith('.mjs') && !abs.endsWith('.js')) return { ok: false, reason: 'journey-path-not-js' };
  return { ok: true, path: abs };
}

const FAILURE_SECRET = /token|bearer|api[-_]?key|password|secret/i;

/** Flatten one failure text value into a single bounded line; credential-shaped text is redacted.
 * `tail` keeps the end of the value, which is where an archive subprocess states its real reason. */
export function sanitizeFailureText(value, { tail = false, limit = 400 } = {}) {
  if (typeof value !== 'string') return value;
  const flat = value.replace(/\s+/g, ' ').trim();
  const bounded = tail ? flat.slice(-limit) : flat.slice(0, limit);
  return FAILURE_SECRET.test(bounded) ? '[redacted]' : bounded;
}

/** Bound and sanitize a structured failure so reports stay machine-readable without leaking.
 * Unsupported nested values become null rather than passing through unchecked. */
export function sanitizeFailureReport(code, reason, detail) {
  const scrub = (value, tail = false) => {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return sanitizeFailureText(value, { tail, limit: tail ? 1200 : 400 });
    if (Array.isArray(value)) return value.slice(0, 32).map(item => scrub(item));
    return null;
  };
  const raw = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : null;
  return {
    code,
    reason: typeof reason === 'string' ? reason : null,
    detail: raw ? Object.fromEntries(Object.entries(raw).slice(0, 8).map(([key, value]) => [key,
      key === 'stderrTail' ? scrub(value, true) : scrub(value)])) : null,
  };
}

/**
 * journey 断言名 = `journey:` 前缀 + 非空名称。runJourney 统一生成该形态；
 * 契约模式另按请求预声明集合校验，legacy 模式才用本判定放行自定义旅程断言。
 */
export function isJourneyAssertionName(name) {
  return typeof name === 'string' && name.startsWith('journey:') && name.slice(8).trim().length > 0;
}

/**
 * 断言名是否允许进入报告：契约模式只认请求预声明集合；legacy 模式额外放行
 * 本次传入 journey 的 `journey:<名称>` 断言，其余未知名一律拒绝。
 */
export function isAllowedAssertionName(name, allowedNames, { request = false, journey = null } = {}) {
  if (allowedNames.includes(name)) return true;
  return !request && Boolean(journey) && isJourneyAssertionName(name);
}

/**
 * 执行任务自定义功能旅程：模块默认导出 async ({send, sleep, evidenceDir, origin, io}) => {assertions:[...]}。
 * 断言缺 pass:true 或模块抛错都算 FAIL——journey 异常绝不静默 PASS。
 */
export async function runJourney(journeyPath, { send, sleep, evidenceDir, origin, io = fs }) {
  let journey;
  try {
    const module = await import(pathToFileURL(journeyPath).href);
    journey = module.default;
  } catch (error) {
    return [{ name: 'journey-load', pass: false, detail: error?.message ?? String(error) }];
  }
  if (typeof journey !== 'function') {
    return [{ name: 'journey-export-shape', pass: false, detail: 'journey 模块必须默认导出 async 函数' }];
  }
  try {
    const result = await journey({ send, sleep, evidenceDir, origin, io });
    const assertions = Array.isArray(result?.assertions) ? result.assertions : null;
    if (!assertions || assertions.length === 0) return [{ name: 'journey-result-shape', pass: false }];
    if (assertions.some(a => !a || typeof a.name !== 'string' || !a.name.trim() || a.name !== a.name.trim()
      || typeof a.pass !== 'boolean') || new Set(assertions.map(a => a.name)).size !== assertions.length) {
      return [{ name: 'journey-assertions-invalid', pass: false }];
    }
    return assertions.map(a => ({ name: `journey:${a.name}`, pass: a.pass }));
  } catch (error) {
    return [{ name: 'journey-error', pass: false, detail: error?.message ?? String(error) }];
  }
}

/** 真实无头 Chrome 驱动：动态 CDP 端口、同源 cookie 注入、正几何断言、PNG 取证。 */
async function driveRealBrowser({ origin, cookie, evidenceDir, seededWorkspace, mode = 'ui', journey = null, installation = null, io = fs, chromePath = findChromePath() }) {
  let chrome; let socket; let privateDir; let exited = false; let closed = false; let cleaning = false;
  const assertions = [];
  const state = { assertions, cleanup: [], observations: { events: [], rawOutputRetained: false } };
  const cdpPort = { value: null };
  try {
    privateDir = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'omnimux-app-qa-'));
    fs.chmodSync(privateDir, 0o700);
    chrome = spawn(chromePath, [
      '--headless=new', '--remote-debugging-port=0', '--no-first-run',
      `--user-data-dir=${privateDir}`, '--no-default-browser-check', '--disable-gpu', '--window-size=1280,800',
      'about:blank',
    ], { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: privateDir, TMPDIR: privateDir }, stdio: ['ignore', 'ignore', 'pipe'] });
    state.observations.events.push({ event: 'spawn', pid: chrome.pid ?? null, parentPid: process.pid });
    chrome.once('exit', (code, signal) => { exited = true; if (!cleaning) state.observations.unexpectedExit = true; state.observations.events.push({ event: 'exit', code: code ?? null, signal: signal ?? null }); });
    chrome.once('close', (code, signal) => { closed = true; state.observations.events.push({ event: 'close', code: code ?? null, signal: signal ?? null }); });
    chrome.on('error', () => { state.observations.events.push({ event: 'error' }); });
    cdpPort.value = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('chrome-start-timeout')), 15000);
      let buffer = '';
      const unavailable = () => { clearTimeout(timer); reject(new Error('chrome-start-failed')); };
      chrome.once('error', unavailable); chrome.once('exit', unavailable);
      chrome.stderr.on('data', chunk => {
        buffer += chunk.toString();
        if (buffer.length > 65536) { buffer = ''; clearTimeout(timer); reject(new Error('chrome-output-limit')); return; }
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    assertions.push({ name: 'chrome-cdp-listen', pass: true, port: cdpPort.value });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort.value}/json/list`, { signal: AbortSignal.timeout(15000) })).json();
    const page = targets.find(target => target.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((yes, no) => {
      const timer = setTimeout(() => no(new Error('cdp-open-timeout')), 15000);
      socket.onopen = () => { clearTimeout(timer); yes(); };
      socket.onerror = () => { clearTimeout(timer); no(new Error('cdp-open-failed')); };
    });

    let sequence = 0;
    let eventSequence = 0;
    let eventsTruncated = false;
    const scriptEvents = [];
    const readEvents = async ({ afterSequence = eventSequence, methods = ['Debugger.scriptParsed'], limit = 2000 } = {}) => {
      const events = scriptEvents.filter(event => event.sequence > afterSequence && methods.includes(event.method));
      return { cursor: eventSequence, events: events.slice(0, limit), hasMore: events.length > limit, truncated: eventsTruncated };
    };
    const pending = new Map();
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('cdp-command-timeout')); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Debugger.scriptParsed') {
        if (scriptEvents.length >= 2000) { scriptEvents.shift(); eventsTruncated = true; }
        scriptEvents.push({ sequence: ++eventSequence, method: message.method, params: message.params });
      }
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

    const noticeDismissed = await dismissFirstLaunchNotice({ send, sleep });
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
    assertions.push({ name: 'runtime-modal-bypassed', pass: noticeDismissed && !modalShowing });

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

    let taskProof;
    if (installation) {
      state.loadingPhase = 'before';
      taskProof = await import('./task-runtime-proof.mjs');
      state.runtimeLoading = { before: await taskProof.captureTaskClientProof({ send, readEvents, origin, installation }) };
      state.loadingPhase = null;
    }

    // 任务自定义功能旅程：保底断言通过后执行，断言并入总判定。
    if (journey) {
      const journeyAssertions = await runJourney(journey, { send, sleep, evidenceDir, origin, io });
      assertions.push(...journeyAssertions);
    }

    if (installation) {
      state.loadingPhase = 'after';
      state.runtimeLoading.after = await taskProof.captureTaskClientProof({ send, readEvents, origin, installation });
      taskProof.assertTaskProofStable(state.runtimeLoading.before, state.runtimeLoading.after);
      state.loadingPhase = null;
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
    if (exited || closed) throw qaFailure('TEST_APP_QA_BROWSER_EXIT');
    return Object.assign(state, {
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
    });
  } catch (error) {
    if (state.loadingPhase) state.loadingFailure = 'TEST_APP_QA_CLIENT_LOADING';
    throw Object.assign(new Error('TEST_APP_QA_BROWSER'), { code: 'TEST_APP_QA_BROWSER', browser: state });
  } finally {
    cleaning = true;
    const record = (name, status, reason = null) => state.cleanup.push({ name, owner: 'app-browser', status, reason });
    if (!socket) record('cdp-transport', 'not-applicable', 'not-created');
    else {
      try {
        if (socket.readyState !== 3) await new Promise((yes, no) => {
          const timer = setTimeout(() => no(new Error('close-timeout')), 5000);
          socket.addEventListener('close', () => { clearTimeout(timer); yes(); }, { once: true });
          socket.close();
        });
        record('cdp-transport', 'completed');
      } catch { record('cdp-transport', 'failed', 'cdp-close-unconfirmed'); }
    }
    const waitClosed = async () => {
      if (exited && closed) return true;
      return new Promise(yes => {
        const finish = value => { clearTimeout(timer); chrome.off('exit', check); chrome.off('close', check); yes(value); };
        const check = () => { if (exited && closed) finish(true); };
        const timer = setTimeout(() => finish(false), 5000);
        chrome.on('exit', check); chrome.on('close', check); check();
      });
    };
    let stopped = !chrome;
    if (!chrome) record('browser-child', 'not-applicable', 'not-created');
    else {
      try {
        if (!exited) chrome.kill('SIGTERM');
        stopped = await waitClosed();
        if (!stopped && !exited) { chrome.kill('SIGKILL'); stopped = await waitClosed(); }
      } catch { stopped = false; }
      record('browser-child', stopped ? 'completed' : 'failed', stopped ? null : 'exit-or-close-unconfirmed');
    }
    if (!privateDir) record('browser-private-directory', 'not-applicable', 'not-created');
    else if (!stopped) record('browser-private-directory', 'failed', 'owned-child-still-unconfirmed');
    else {
      try {
        if (dirname(privateDir) !== fs.realpathSync(tmpdir()) || !privateDir.startsWith(join(fs.realpathSync(tmpdir()), 'omnimux-app-qa-'))
          || fs.realpathSync(privateDir) !== privateDir || fs.lstatSync(privateDir).isSymbolicLink()) throw new Error('unsafe-private-directory');
        fs.rmSync(privateDir, { recursive: true, force: true });
        record('browser-private-directory', 'completed');
      } catch { record('browser-private-directory', 'failed', 'private-directory-remove-failed'); }
    }
  }
}

const ENV_ASSERTIONS = ['app-runtime-ready', 'same-origin-login'];
const BROWSER_ASSERTIONS = ['chrome-cdp-listen', 'auth-cookie-applied', 'app-dom-mounted', 'visible-geometry-positive', 'runtime-modal-bypassed', 'blank-session-guide-visible', 'explore-section-visible', 'explore-cards-present', 'asset-hub-reachable-via-library', 'screenshot-png-verified'];
const OWNER_RESOURCES = {
  'app-environment': ['app-child', 'mock-server', 'app-private-directory'],
  'app-browser': ['browser-child', 'cdp-transport', 'browser-private-directory'],
};
let contractJourneyConsumed = false;
const qaFailure = code => Object.assign(new Error(code), { code });
const namedList = values => Array.isArray(values) && values.length > 0
  && values.every(value => typeof value === 'string' && value.length > 0 && value === value.trim())
  && new Set(values).size === values.length;
const sameNames = (a, b) => namedList(a) && namedList(b) && [...a].sort().join('\0') === [...b].sort().join('\0');

function inputFile(root, path, io) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0')) throw qaFailure('TEST_APP_QA_INPUT_PATH');
  const absolute = resolve(root, path);
  const rel = relative(root, absolute).split(sep).join('/');
  if (!rel || rel.startsWith('../') || rel.startsWith('.workbuddy/evidence/contract/')
    || /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.ssh|\.test-env[^/]*|credentials?(?:\.(?:json|ya?ml|toml|ini|conf))?|secrets?(?:\.(?:json|ya?ml|toml|ini|conf))?|tokens?(?:\.(?:json|ya?ml|toml|ini|conf))?|passwords?(?:\.(?:json|ya?ml|toml|ini|conf))?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.[^/]*)?)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i.test(rel)) throw qaFailure('TEST_APP_QA_INPUT_PATH');
  const parts = rel.split('/');
  for (let index = 1; index <= parts.length; index++) {
    const current = resolve(root, ...parts.slice(0, index));
    const stat = io.lstatSync(current);
    if (stat.isSymbolicLink() || io.realpathSync(current) !== current
      || (index === parts.length ? !stat.isFile() : !stat.isDirectory())) throw qaFailure('TEST_APP_QA_INPUT_PATH');
  }
  return rel;
}

/** Fixed policy comes from the request, never from returned assertions. */
function contractRequest(options, io) {
  const fields = ['taskId', 'base', 'head', 'scope', 'requiredChecks', 'expectedAssertions', 'extraInputs', 'artifactNames', 'requestPath', 'taskPlugins'];
  if (!fields.some(key => Object.hasOwn(options, key))) return null;
  const { root, taskId, base, head, scope, journey = null, mode = 'ui' } = options;
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(taskId)
    || ![base, head].every(value => typeof value === 'string' && value.trim() === value && value.length > 0)
    || !['smoke', 'reproduction', 'task'].includes(scope) || mode !== 'ui') throw qaFailure('TEST_APP_QA_CONTRACT_REQUEST');
  if (scope !== 'smoke' && !journey) throw qaFailure('TEST_APP_QA_TASK_JOURNEY_REQUIRED');
  const taskPlugins = options.taskPlugins;
  if (taskPlugins !== undefined && (!namedList(taskPlugins) || taskPlugins.length > 8
    || taskPlugins.some(name => !/^omnimux(?:-[a-z0-9]+)*$/.test(name)))) throw qaFailure('TEST_APP_QA_TASK_PLUGINS');
  const checks = ['app-environment', 'app-browser', ...(journey ? ['task-journey'] : [])];
  const expected = options.expectedAssertions;
  if (!sameNames(options.requiredChecks, checks) || !expected || Object.getPrototypeOf(expected) !== Object.prototype
    || !sameNames(Object.keys(expected), checks)
    || !sameNames(expected['app-environment'], [...ENV_ASSERTIONS, ...(scope !== 'smoke' || taskPlugins ? ['task-source-installed-loaded'] : [])])
    || !sameNames(expected['app-browser'], BROWSER_ASSERTIONS)
    || (journey && (!namedList(expected['task-journey']) || expected['task-journey'].some(name => !isJourneyAssertionName(name))))) throw qaFailure('TEST_APP_QA_EXPECTED_POLICY');
  const allNames = checks.flatMap(name => expected[name]);
  if (new Set(allNames).size !== allNames.length) throw qaFailure('TEST_APP_QA_EXPECTED_POLICY');
  if (options.extraInputs !== undefined && !Array.isArray(options.extraInputs)) throw qaFailure('TEST_APP_QA_INPUT_PATH');
  if ((options.extraInputs ?? []).some(path => typeof path !== 'string' || path !== path.trim() || path.startsWith('/')
    || path.split('/').some(part => !part || part === '.' || part === '..' || part === '.git'))
    || new Set(options.extraInputs ?? []).size !== (options.extraInputs ?? []).length) throw qaFailure('TEST_APP_QA_INPUT_PATH');
  const extraInputs = (options.extraInputs ?? []).map(path => inputFile(root, path, io));
  if (journey) extraInputs.push(inputFile(root, journey, io));
  if (options.requestPath) extraInputs.push(inputFile(root, options.requestPath, io));
  const artifactNames = options.artifactNames ?? [];
  if (!Array.isArray(artifactNames) || new Set(artifactNames).size !== artifactNames.length
    || artifactNames.some(name => typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:json|log|txt|png)$/.test(name)
      || ['raw-run.json', 'evidence.json', 'app-home.png', 'hub-business-path.png'].includes(name))) throw qaFailure('TEST_APP_QA_ARTIFACT_NAMES');
  if (journey && contractJourneyConsumed) throw qaFailure('TEST_APP_QA_FRESH_PROCESS_REQUIRED');
  return Object.freeze({ taskId, base, head, scope, taskPlugins: taskPlugins ? Object.freeze([...taskPlugins]) : null,
    requiredChecks: Object.freeze([...checks]),
    expectedAssertions: Object.freeze(Object.fromEntries(checks.map(name => [name, Object.freeze([...expected[name]])]))),
    extraInputs: Object.freeze([...new Set(extraInputs)]), artifactNames: Object.freeze([...artifactNames]),
  });
}

/** Validate correspondence between independently observed facts, never create installation/loading evidence. */
export function validateTaskRuntimeBinding({ root, taskId, runId, taskPlugins, candidate, origin, installation, serverLoading, clientLoading }) {
  const reject = () => { throw qaFailure('TEST_APP_QA_TASK_BINDING'); };
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const namesEqual = (a, b) => Array.isArray(a) && Array.isArray(b) && new Set(a).size === a.length
    && [...a].sort().join('\0') === [...b].sort().join('\0');
  if (typeof root !== 'string' || !Array.isArray(taskPlugins) || !taskPlugins.length
    || !installation || installation.sourceRoot !== root || installation.taskId !== taskId || installation.runId !== runId
    || installation.origin !== origin || !Number.isSafeInteger(installation.pid) || installation.pid <= 0
    || typeof installation.runtimeExecutable !== 'string' || !installation.runtimeExecutable.startsWith('/')
    || resolve(installation.runtimeExecutable) !== installation.runtimeExecutable
    || installation.appAnchor !== resolve(dirname(installation.runtimeExecutable), '../Resources/app.asar/node_modules/@deepseek-ai/dsh/package.json')
    || installation.base !== candidate?.base?.resolvedSha || installation.head !== candidate?.head?.resolvedSha
    || !digest(installation.candidateDigest) || installation.candidateDigest !== candidate?.candidate?.contentDigest
    || !digest(installation.inputsDigest) || installation.inputsDigest !== candidate?.inputs?.contentDigest
    || typeof installation.privateRoot !== 'string' || dirname(installation.privateRoot) !== fs.realpathSync(tmpdir())
    || !basename(installation.privateRoot).startsWith('omnimux-task-')) reject();
  const privatePath = path => typeof path === 'string' && resolve(path) === path && path.startsWith(installation.privateRoot + sep);
  if (!privatePath(installation.profile) || !Array.isArray(installation.packages) || !installation.packages.length
    || installation.packages.some(pkg => !pkg || typeof pkg.name !== 'string')) reject();
  const expectedNames = [...new Set(['omnimux', ...taskPlugins])];
  const plugins = installation.packages.filter(pkg => pkg.serverEntry);
  if (!namesEqual(plugins.map(pkg => pkg.name), expectedNames)
    || new Set(installation.packages.map(pkg => pkg.installedRoot)).size !== installation.packages.length) reject();
  for (const pkg of installation.packages) {
    if (!privatePath(pkg.installedRoot) || !Array.isArray(pkg.payload) || !pkg.payload.length) reject();
    if (pkg.payload.some(file => !file || typeof file.path !== 'string' || file.path.startsWith('/')
      || file.path.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || !digest(file.sha256)
      || !Number.isSafeInteger(file.size) || file.size < 0)
      || new Set(pkg.payload.map(file => file.path)).size !== pkg.payload.length) reject();
    for (const entry of [pkg.serverEntry, pkg.clientBundle].filter(Boolean)) {
      if (typeof entry.path !== 'string' || entry.path.startsWith('/') || entry.path.includes('\\')
        || entry.path.split('/').some(part => !part || part === '.' || part === '..') || !digest(entry.sha256)) reject();
      const published = pkg.payload.find(file => file.path === entry.path);
      if (!published || published.sha256 !== entry.sha256 || (entry.bytes !== undefined && entry.bytes !== published.size)) reject();
    }
  }
  for (const proof of [serverLoading, clientLoading]) {
    if (!proof || ['taskId', 'runId', 'origin', 'pid', 'base', 'head', 'candidateDigest', 'inputsDigest']
      .some(key => proof[key] !== installation[key])) reject();
  }
  if (serverLoading.kind !== 'task-server-loading' || !Array.isArray(serverLoading.modules)
    || serverLoading.runtimeExecutable !== installation.runtimeExecutable
    || !namesEqual(serverLoading.modules.map(item => item.name), expectedNames)) reject();
  try { validateTaskPeerResolution(installation, serverLoading.peers); } catch { reject(); }
  if (installation.hostPeerExpectations.length) {
    const probe = installation.peerProbe, loaded = serverLoading.peerObserver;
    if (!probe || !privatePath(probe.path) || dirname(probe.path) !== installation.profile || !digest(probe.sha256)
      || !loaded || loaded.path !== probe.path || loaded.sha256 !== probe.sha256
      || loaded.loadedScriptSha256 !== probe.sha256 || loaded.matchingScriptCount !== 1
      || loaded.loadedScriptUrl !== pathToFileURL(probe.path).href) reject();
  } else if (serverLoading.peerObserver !== null) reject();
  for (const pkg of plugins) {
    const loaded = serverLoading.modules.find(item => item.name === pkg.name);
    if (loaded.path !== pkg.serverEntry.path || loaded.sha256 !== pkg.serverEntry.sha256
      || loaded.loadedScriptSha256 !== pkg.serverEntry.sha256 || loaded.matchingScriptCount !== 1
      || loaded.loadedScriptUrl !== pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href) reject();
  }
  const clientPackages = plugins.filter(pkg => pkg.clientBundle);
  if (!clientPackages.length || clientLoading.kind !== 'task-client-loading' || !Array.isArray(clientLoading.bundles)
    || !namesEqual(clientLoading.bundles.map(item => item.plugin), clientPackages.map(pkg => pkg.name))) reject();
  for (const pkg of clientPackages) {
    const loaded = clientLoading.bundles.find(item => item.plugin === pkg.name);
    let loadedUrl;
    try { loadedUrl = new URL(loaded.loadedScriptUrl); } catch { reject(); }
    if (loaded.bundlePath !== pkg.clientBundle.path || loaded.bundleSha256 !== pkg.clientBundle.sha256 || loaded.bundleBytes !== pkg.clientBundle.bytes
      || !digest(loaded.bundleCodeSha256) || loaded.bundleCodeSha256 !== loaded.loadedRegistrationCodeSha256
      || !digest(loaded.loadedScriptSha256)
      || loaded.matchingRegistrationCount !== 1 || loadedUrl.origin !== origin || !loadedUrl.pathname.startsWith('/plugins/')) reject();
  }
  return { installation: { taskId, runId, sourceRoot: root, privateRoot: installation.privateRoot, profile: installation.profile,
    base: installation.base, head: installation.head, candidateDigest: installation.candidateDigest, inputsDigest: installation.inputsDigest,
    pid: installation.pid, origin, runtimeExecutable: installation.runtimeExecutable, appAnchor: installation.appAnchor,
    dependencyCount: installation.packages.length - plugins.length,
    peerCount: installation.hostPeerExpectations.length,
    packages: plugins.map(({ name, version, installedRoot, payload, serverEntry, clientBundle }) => ({ name, version, installedRoot,
      publishedFiles: payload.length, serverEntry, ...(clientBundle ? { clientBundle } : {}) })) } };
}

function resourceResults(owner, result, invoked) {
  return OWNER_RESOURCES[owner].map(name => {
    if (!invoked) return { name, owner, status: 'not-applicable', reason: 'not-created' };
    const exactSet = Array.isArray(result) && result.length === OWNER_RESOURCES[owner].length
      && sameNames(result.map(item => item?.name), OWNER_RESOURCES[owner]);
    const found = exactSet ? result.filter(item => item?.name === name) : [];
    const item = found[0];
    if (found.length !== 1 || item.owner !== owner || !['completed', 'failed', 'not-applicable'].includes(item.status)
      || (item.status === 'completed' ? item.reason !== null : typeof item.reason !== 'string' || !item.reason.trim())
      || (item.status === 'not-applicable' && item.reason !== 'not-created')) {
      return { name, owner, status: 'failed', reason: 'cleanup-resource-unconfirmed' };
    }
    return { name, owner, status: item.status, reason: item.status === 'completed' ? null
      : item.status === 'not-applicable' && item.reason === 'not-created' ? 'not-created' : 'owned-cleanup-failed' };
  });
}

/**
 * 可测的运行器：编排逻辑与浏览器实现解耦，测试可注入桩。
 * @param {{io?: *, startEnv?: Function, driveBrowser?: Function, fetchImpl?: Function, now?: Function, uuid?: Function}} [deps]
 * Contract calls additionally require explicit taskId/base/head/scope/requiredChecks/expectedAssertions;
 * Task plugins opt into the fresh installation path; older requests keep their historical boundary.
 */
export function createAppQaRunner(deps = {}) {
  const io = deps.io ?? fs;
  const startEnv = deps.startEnv ?? startTestEnvironment;
  const driveBrowser = deps.driveBrowser ?? driveRealBrowser;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const uuid = deps.uuid ?? randomUUID;

  const producer = Object.keys(deps).length ? 'dependency-stub' : 'controlled-runner';
  return async function runAppQa(options = {}) {
    const { root, repo = repositoryRoot, mode = 'ui' } = options;
    let { journey = null } = options;
    if (!['ui', 'onboarding', 'live'].includes(mode)) throw qaFailure('TEST_APP_QA_MODE');
    if (journey !== null) {
      const jr = resolveJourneyPath(journey, root);
      if (!jr.ok) throw Object.assign(qaFailure('TEST_APP_QA_JOURNEY_PATH'), { message: jr.reason, hint: 'journey 必须位于任务工作树内。' });
      journey = jr.path;
    }
    const resolved = resolveWorktreeRoot(root, io, repo);
    if (!resolved.ok) throw Object.assign(qaFailure(resolved.code), { hint: resolved.hint, rootReason: resolved.reason });
    const request = contractRequest({ ...options, journey }, io);
    const runId = uuid();
    if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(runId)) throw qaFailure('TEST_APP_QA_RUN_ID');
    const startedAt = now().toISOString();
    const prefix = request ? `.workbuddy/evidence/contract/${request.taskId}/${runId}/` : `.workbuddy/evidence/app-qa/${runId}/`;
    const evidenceDir = join(root, prefix);
    const outputs = request ? ['raw-run.json', 'evidence.json', 'app-home.png', 'hub-business-path.png', ...request.artifactNames].map(name => prefix + name) : [];
    const captureOptions = request ? { root, base: request.base, head: request.head, taskId: request.taskId, runId, outputs, extraInputs: request.extraInputs } : null;
    let candidateBefore;
    const captureStarted = Date.now();
    if (request) candidateBefore = captureCandidate(captureOptions);
    const beforeCaptureMs = Date.now() - captureStarted;
    if (request) {
      // Create each ancestor without following links; a run directory is never reused.
      for (const leaf of ['.workbuddy', '.workbuddy/evidence', '.workbuddy/evidence/contract', `.workbuddy/evidence/contract/${request.taskId}`]) {
        const path = join(root, leaf);
        if (!io.existsSync(path)) io.mkdirSync(path);
        const stat = io.lstatSync(path);
        if (!stat.isDirectory() || stat.isSymbolicLink() || io.realpathSync(path) !== path) throw qaFailure('TEST_APP_QA_OUTPUT_PATH');
      }
      io.mkdirSync(evidenceDir);
      if (journey) contractJourneyConsumed = true;
    } else io.mkdirSync(evidenceDir, { recursive: true });
    const report = {
      runId, mode, root, origin: null, appPort: null, cdpPort: null,
      startedAt, completedAt: null, pass: false, scope: request?.scope ?? 'smoke', producer,
      contract: request ? 'candidate' : 'none', taskBinding: 'unknown', userFresh: 'unknown', inputClosure: 'unknown',
      summary: null, assertions: [], screenshot: null, errors: [], cleanup: null,
      observations: { rawOutputRetained: false }, beforeCaptureMs,
    };
    let env; let browser; let envCleanup; let prepareObservations; let prepareAttempted = false; let browserAttempted = false;
    const addAssertions = assertions => {
      if (!Array.isArray(assertions) || !assertions.length || assertions.some(item => !item || typeof item.name !== 'string'
        || !item.name.trim() || item.name !== item.name.trim() || typeof item.pass !== 'boolean')
        || new Set(assertions.map(item => item.name)).size !== assertions.length) {
        report.errors.push('TEST_APP_QA_ASSERTIONS_INVALID'); return;
      }
      const allowedNames = request ? request.requiredChecks.flatMap(name => request.expectedAssertions[name])
        : [...ENV_ASSERTIONS, ...BROWSER_ASSERTIONS, 'live-model-catalog-ready', 'live-image-generate-http-200', 'live-image-rendered-no-broken-img', 'journey-load', 'journey-export-shape', 'journey-result-shape', 'journey-assertions-invalid', 'journey-error'];
      // legacy `--journey` 的断言由 runJourney 统一加 `journey:` 前缀；契约模式仍严格按请求声明集合校验，
      // 非 `journey:` 前缀的未知名（含 legacy）继续判为集合不匹配。
      const allowed = item => isAllowedAssertionName(item.name, allowedNames, { request: Boolean(request), journey });
      if (assertions.some(item => !allowed(item))) report.errors.push('TEST_APP_QA_ASSERTION_SET_MISMATCH');
      report.assertions.push(...assertions.filter(allowed).map(({ name, pass }) => ({ name, pass })));
    };
    try {
      prepareAttempted = true;
      env = await startEnv({ root, mode, ...(request ? { evidenceContext: { taskId: request.taskId, runId },
        ...(request.taskPlugins ? { taskPlugins: request.taskPlugins,
          candidate: { base: request.base, head: request.head, outputs, extraInputs: request.extraInputs } } : {}) } : {}) });
      const origin = new URL(env.origin);
      if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || env.origin !== origin.origin
        || new URL(env.loginUrl).origin !== origin.origin) throw qaFailure('TEST_APP_QA_ORIGIN');
      env.assertAlive?.();
      report.origin = origin.origin;
      report.appPort = Number(origin.port);
      report.summary = { mode, evidenceLevel: ['core-only', 'full'].includes(env.summary?.evidenceLevel) ? env.summary.evidenceLevel : 'unknown',
        taskPluginsInstalled: env.summary?.taskPluginsInstalled === true, realModelRequest: false,
        seededWorkspace: env.summary?.seededWorkspace === 'ws_qa_media' ? 'ws_qa_media' : null };
      addAssertions([{ name: 'app-runtime-ready', pass: true }]);
      const loginResponse = await fetchImpl(env.loginUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const rawCookie = loginResponse.headers.getSetCookie()[0] ?? '';
      const cookieName = rawCookie.split('=')[0];
      const cookieValue = rawCookie.split(';')[0].slice(cookieName.length + 1);
      if (!cookieName || !cookieValue) throw qaFailure('TEST_APP_QA_LOGIN_COOKIE');
      addAssertions([{ name: 'same-origin-login', pass: loginResponse.status === 303 }]);
      if (loginResponse.status !== 303) throw qaFailure('TEST_APP_QA_LOGIN_COOKIE');
      if (request?.taskPlugins) {
        if (typeof env.assertInstalledIntegrity !== 'function' || typeof env.verifyServerLoading !== 'function') throw qaFailure('TEST_APP_QA_TASK_BINDING');
        await env.assertInstalledIntegrity();
      }
      browserAttempted = true;
      browser = await driveBrowser({ origin: origin.origin, cookie: { name: cookieName, value: cookieValue },
        evidenceDir, seededWorkspace: env.summary?.seededWorkspace, mode, journey, io,
        ...(request?.taskPlugins ? { installation: env.installation } : {}) });
      addAssertions(browser.assertions);
      report.cdpPort = Number.isInteger(browser.cdpPort) ? browser.cdpPort : null;
      if (browser.screenshot) report.screenshot = { path: join(evidenceDir, 'app-home.png'),
        width: Number(browser.screenshot.width) || 0, height: Number(browser.screenshot.height) || 0, bytes: Number(browser.screenshot.bytes) || 0 };
      if (browser.hubPath) report.hubPath = { clickedNewSession: browser.hubPath.clickedNewSession === true,
        exploreVisible: browser.hubPath.exploreVisible === true, assetHubOpened: browser.hubPath.assetHubOpened === true,
        librarySelected: browser.hubPath.librarySelected === true, workbenchRequestAccepted: browser.hubPath.workbenchRequestAccepted === true };
      if (request && report.assertions.some(item => item.name === 'screenshot-png-verified' && item.pass)) {
        try { assertPng(io.readFileSync(join(evidenceDir, 'app-home.png'))); }
        catch { report.errors.push('TEST_APP_QA_SCREENSHOT_MISSING_OR_INVALID'); }
      }
      if (mode === 'live' && browser.liveMedia) report.liveMedia = {
        httpStatus: Number(browser.liveMedia.httpStatus) || 0, generationMode: browser.liveMedia.generationMode === 'live' ? 'live' : 'unknown',
        naturalWidth: Number(browser.liveMedia.naturalWidth) || 0, naturalHeight: Number(browser.liveMedia.naturalHeight) || 0,
        destBytes: Number(browser.liveMedia.destBytes) || 0, brokenImageCount: Number(browser.liveMedia.brokenImageCount) || 0,
        screenshotPath: browser.liveMedia.screenshotPath ? join(evidenceDir, 'live-image-generated-success.png') : null,
      };
      if (request?.taskPlugins) {
        await env.assertInstalledIntegrity();
        const serverAfter = await env.verifyServerLoading();
        const { assertTaskProofStable } = await import('./task-runtime-proof.mjs');
        assertTaskProofStable(env.serverLoading, serverAfter);
        const proof = validateTaskRuntimeBinding({ root, taskId: request.taskId, runId, taskPlugins: request.taskPlugins,
          candidate: candidateBefore, origin: origin.origin, installation: env.installation,
          serverLoading: serverAfter, clientLoading: browser.runtimeLoading?.after });
        if (producer !== 'controlled-runner') throw qaFailure('TEST_APP_QA_TASK_PRODUCER');
        report.installation = proof.installation;
        report.runtimeLoading = { server: serverAfter, clientBefore: browser.runtimeLoading.before, clientAfter: browser.runtimeLoading.after };
        report.userFresh = true;
        report.taskBinding = 'installed-loaded';
        addAssertions([{ name: 'task-source-installed-loaded', pass: true }]);
      }
      env.assertAlive?.();
    } catch (error) {
      report.errors.push(typeof error?.code === 'string' && /^(?:TEST_ENV|TEST_APP_QA)_[A-Z_]+$/.test(error.code) ? error.code : 'TEST_APP_QA_EXECUTION');
      // Preparation failures carry an actionable hint (missing install command, archive stderr).
      // Dropping it left the standard entry point with a bare code, so keep a sanitized copy that
      // the CLI and report readers can act on. Never persist credential-shaped text.
      const hint = sanitizeFailureText(typeof error?.hint === 'string' ? error.hint.slice(0, 800) : '', { limit: 800 });
      if (hint && hint !== '[redacted]') report.hint = hint;
      // A bare code cannot be classified and the free-text hint is not a contract, so keep the
      // stable reason plus bounded structured detail alongside it.
      if (typeof error?.code === 'string' && /^(?:TEST_ENV|TEST_APP_QA)_[A-Z_]+$/.test(error.code)) {
        report.failure = sanitizeFailureReport(error.code, error.reason, error.detail);
      }
      if (error?.code === 'TEST_ENV_NOT_USER_FRESH_TASK_UNKNOWN') report.userFresh = false;
      if (!env && error?.cleanup) envCleanup = error.cleanup;
      if (!env && error?.observations) prepareObservations = error.observations;
      if (error?.browser) { browser = error.browser; addAssertions(browser.assertions); }
      if (browser?.loadingFailure) report.errors.push('TEST_APP_QA_CLIENT_LOADING');
    } finally {
      if (env) {
        try {
          if (typeof env.cleanup !== 'function') throw qaFailure('TEST_APP_QA_CLEANUP');
          envCleanup = await env.cleanup();
        } catch { report.errors.push('TEST_APP_QA_CLEANUP'); }
        if (env.observations?.unexpectedExit || env.observations?.interrupted || env.observations?.outputReleaseFailed) report.errors.push('TEST_APP_QA_RUNTIME_EXIT');
      }
      report.completedAt = now().toISOString();
    }
    const resources = [...resourceResults('app-environment', envCleanup?.resources, prepareAttempted),
      ...resourceResults('app-browser', browser?.cleanup, browserAttempted)];
    if (!request && envCleanup?.cleaned === true && !envCleanup.resources && producer === 'dependency-stub') {
      // Legacy dependency doubles predate per-resource receipts; never use this compatibility path in a contract run.
      report.cleanup = { cleaned: true, contract: 'none' };
    } else report.cleanup = { cleaned: envCleanup?.cleaned === true && resources.every(item => item.status !== 'failed'), resources };
    if (!report.cleanup.cleaned) report.errors.push('TEST_APP_QA_CLEANUP_INCOMPLETE');
    if (browserAttempted && (request || browser?.cleanup !== undefined) && (!Array.isArray(browser?.cleanup) || browser.cleanup.some(item => !item || item.status === 'failed'))) report.errors.push('TEST_APP_QA_BROWSER_CLEANUP');
    if (browser?.observations?.unexpectedExit) report.errors.push('TEST_APP_QA_BROWSER_EXIT');
    if ([(env?.observations ?? prepareObservations)?.events, browser?.observations?.events].some(events => Array.isArray(events) && events.length > 16)) report.errors.push('TEST_APP_QA_EVENT_LIMIT');
    const eventLists = [(env?.observations ?? prepareObservations)?.events, browser?.observations?.events];
    if (eventLists.some(events => events !== undefined && (!Array.isArray(events) || events.some(item => !item || typeof item !== 'object')))) report.errors.push('TEST_APP_QA_EVENTS_INVALID');
    const safeEvents = events => Array.isArray(events) ? events.slice(0, 16).filter(item => item && typeof item === 'object').map(item => ({
      event: ['spawn', 'exit', 'close', 'error'].includes(item.event) ? item.event : 'unknown',
      code: Number.isInteger(item.code) ? item.code : null,
      signal: ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV'].includes(item.signal) ? item.signal : null,
      pid: Number.isInteger(item.pid) ? item.pid : null,
      parentPid: Number.isInteger(item.parentPid) ? item.parentPid : null,
    })) : [];
    report.observations.appEvents = safeEvents((env?.observations ?? prepareObservations)?.events);
    report.observations.browserEvents = safeEvents(browser?.observations?.events);
    // Skip volume stays visible even though the preparation observation only keeps a bounded sample;
    // absent data is omitted rather than reported as a fake zero. A preparation that skipped inputs
    // and then failed carries the count on the raw preparation observation, so read both shapes.
    const observed = env?.observations ?? prepareObservations;
    const skippedInputCount = observed?.preparation?.skippedInputCount ?? observed?.skippedInputCount;
    if (Number.isInteger(skippedInputCount)) report.observations.skippedInputCount = skippedInputCount;
    if (request) {
      const allExpected = request.requiredChecks.flatMap(name => request.expectedAssertions[name]);
      if (new Set(report.assertions.map(item => item.name)).size !== report.assertions.length
        || report.assertions.some(item => !allExpected.includes(item.name))) report.errors.push('TEST_APP_QA_ASSERTION_SET_MISMATCH');
      const checks = request.requiredChecks.map(name => {
        const names = request.expectedAssertions[name];
        const actual = report.assertions.filter(item => names.includes(item.name));
        const complete = sameNames(actual.map(item => item.name), names);
        return { name, scope: request.scope, required: true, status: actual.length ? 'completed' : 'not-run',
          reason: actual.length ? null : 'not-executed', exitCode: actual.length ? (complete && actual.every(item => item.pass) && !report.errors.length ? 0 : 1) : null,
          tests: actual.filter(item => names.includes(item.name)).length, skipped: 0, assertions: names.map(assertion => ({ name: assertion,
            pass: actual.filter(item => item.name === assertion).length === 1 && actual.find(item => item.name === assertion)?.pass === true })) };
      });
      report.checks = checks;
      const executionPassed = checks.every(item => item.status === 'completed' && item.exitCode === 0 && item.tests > 0 && item.assertions.every(a => a.pass))
        && report.cleanup.cleaned && !report.errors.length;
      report.executionPassed = executionPassed;
      report.pass = false;
      report.evidenceStatus = 'unsealed';
      // Raw is fixed before after-capture and never amended with sealing/validation results.
      const rawPath = prefix + 'raw-run.json';
      io.writeFileSync(join(root, rawPath), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      let envelope; let validation; let afterCaptureMs = null;
      try {
        const afterStarted = Date.now();
        const candidateAfter = captureCandidate(captureOptions);
        afterCaptureMs = Date.now() - afterStarted;
        const artifactPaths = outputs.filter(path => path !== prefix + 'evidence.json' && io.existsSync(join(root, path)));
        envelope = sealEvidence({ taskId: request.taskId, runId, producer, scope: request.scope,
          candidateBefore, candidateAfter, checks, cleanup: resources, artifactPaths, reportPath: prefix + 'evidence.json' });
        io.writeFileSync(join(root, envelope.reportPath), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
        validation = validateEvidence(envelope, { purpose: 'candidate', root, taskId: request.taskId, runId,
          scope: request.scope, requiredChecks: request.requiredChecks, expectedAssertions: request.expectedAssertions, currentCandidate: candidateAfter });
      } catch { validation = { valid: false, pass: false, provenance: 'unknown', authorization: 'not-granted', errors: ['TEST_APP_QA_SEAL_FAILED'] }; }
      report.evidence = { rawPath, reportPath: envelope?.reportPath ?? null, reportDigest: envelope?.reportDigest ?? null,
        valid: validation.valid, pass: validation.pass, scope: request.scope, provenance: validation.provenance,
        authorization: validation.authorization, errors: validation.errors, beforeCaptureMs, afterCaptureMs,
        artifactBytes: envelope?.artifacts.reduce((sum, item) => sum + item.bytes, 0) ?? null };
      report.pass = executionPassed && validation.valid && validation.pass;
      report.evidenceStatus = validation.valid ? 'validated' : 'failed';
      // The old fixed summary is not ignored; return this projection rather than dirtying source after capture.
    } else {
      report.pass = report.assertions.length > 0 && report.assertions.every(item => item.pass) && !report.errors.length && report.cleanup.cleaned;
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
  const argv = process.argv.slice(2);
  const modeArg = argv.find(a => a.startsWith('--mode='))?.split('=')[1]
    || (argv.includes('--live') ? 'live' : 'ui');
  const journeyArg = argv.find(a => a.startsWith('--journey='))?.split('=')[1]
    ?? (argv.includes('--journey') ? argv[argv.indexOf('--journey') + 1] : null);
  try {
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index];
      if (arg === '--request' || arg === '--journey') {
        if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw qaFailure('TEST_APP_QA_CONTRACT_REQUEST');
        index++;
      } else if (arg !== '--live' && !arg.startsWith('--mode=') && !arg.startsWith('--journey=') && !arg.startsWith('--request=')) {
        throw qaFailure('TEST_APP_QA_CONTRACT_REQUEST');
      }
    }
    const requestArg = argv.find(a => a.startsWith('--request='))?.slice('--request='.length)
      ?? (argv.includes('--request') ? argv[argv.indexOf('--request') + 1] : null);
    let request = {};
    if (argv.includes('--request') && !requestArg) throw qaFailure('TEST_APP_QA_CONTRACT_REQUEST');
    if (requestArg !== null) {
      const requestPath = inputFile(sourceRoot, requestArg, fs);
      const bytes = fs.readFileSync(join(sourceRoot, requestPath));
      if (bytes.length > 65536) throw qaFailure('TEST_APP_QA_CONTRACT_REQUEST');
      request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const allowed = ['taskId', 'base', 'head', 'scope', 'requiredChecks', 'expectedAssertions', 'extraInputs', 'artifactNames', 'journey', 'taskPlugins'];
      if (!request || Object.getPrototypeOf(request) !== Object.prototype || Object.keys(request).some(key => !allowed.includes(key))) throw qaFailure('TEST_APP_QA_CONTRACT_REQUEST');
      request.requestPath = requestPath;
    }
    const report = await runWorktreeAppQa({ ...request, root: sourceRoot, mode: modeArg, journey: journeyArg ?? request.journey ?? null });
    const failed = report.assertions.filter(assertion => !assertion.pass).map(assertion => assertion.name);
    if (report.pass) {
      console.log(`✅ 应用级 ${report.scope} 检查通过（mode=${report.mode}，${report.assertions.length} 项断言，端口 ${report.appPort}，CDP ${report.cdpPort}）`);
      console.log(`   截图: ${report.screenshot?.path} (${report.screenshot?.width}x${report.screenshot?.height}, ${report.screenshot?.bytes} 字节)`);
      if (report.liveMedia?.screenshotPath) {
        console.log(`   真实生图验收截图: ${report.liveMedia.screenshotPath} (尺寸 ${report.liveMedia.naturalWidth}x${report.liveMedia.naturalHeight}, 落盘 ${report.liveMedia.destBytes} 字节)`);
      }
      console.log(`   证据: ${report.evidence?.reportPath ?? 'docs/evidence/worktree-app-qa-report.json'}`);
      console.log(`   范围: ${report.scope}；任务绑定: ${report.taskBinding}；实时在线: unsupported`);
      if (report.summary?.seededWorkspace) {
        console.log(`💡【测试工程夹具】：已自动预装带媒体素材的标准测试工程（ID: ${report.summary.seededWorkspace}）`);
        console.log(`   前置测试直达：${report.origin}/#/workspace/${report.summary.seededWorkspace}`);
        console.log('   说明：内置非空视频素材节点，悬浮工具栏「添加到会话」等按钮均已就绪，无需手动造数据。');
      }
    } else {
      console.error(`❌ 应用级 Web 验收未通过 -> ${[...report.errors, ...failed].join('; ')}`);
      if (report.failure?.reason) console.error(`   原因: ${report.failure.reason}${report.hint ? ` — ${report.hint}` : ''}`);
      else if (report.hint) console.error(`   原因: ${report.hint}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`❌ 无法开始：${typeof error?.code === 'string' && /^(?:TEST_APP_QA|TEST_ENV)_[A-Z_]+$/.test(error.code) ? error.code : 'TEST_APP_QA_REQUEST_FAILED'}`);
    if (typeof error?.hint === 'string' && error.hint && !/token|bearer|api[-_]?key|password|secret/i.test(error.hint)) console.error(`   原因: ${error.hint.replace(/\s+/g, ' ').trim().slice(0, 800)}`);
    process.exitCode = 1;
  }
}
