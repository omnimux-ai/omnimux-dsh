#!/usr/bin/env node
/**
 * 「快捷方式那一排 + 模型/参数控件」横向几何的真实浏览器量测（Issue #2588）。
 *
 * 由 `boot-app.mjs --scenario` 在同一进程内调用（与 `chip-scenario.mjs` 同一条约定：
 * 登录 URL 只在内存里换成同源 Cookie，不打印、不落盘）。
 *
 * 量什么（每个窗口宽度一组）：
 *   - 页面级横向溢出（documentElement.scrollWidth > clientWidth）；
 *   - 这一排（`[data-omnimux-quick-shortcuts]`）与输入框卡片（`[data-composer-card]`）的
 *     实测 left/right/width；
 *   - 控件行（`[data-omx-quick-shortcut-controls]`）与共享控件本体
 *     （`.omx-media-config-controls`）的实测宽与 scrollWidth/clientWidth；
 *   - 控件子树里**每一个**元素的右边缘，取最大值与卡片右边缘相减 = 溢出量；
 *   - 两个胶囊（模型 / 参数）与模型回执（`.omx-media-config-summary`）各自是否完整落在
 *     卡片内。
 *
 * 证据：`layout-geometry.json` + `layout-<宽度>.png`（整窗）与 `layout-<宽度>-composer.png`（聚焦输入框区域）。
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { findChromePath } from '../../scripts/worktree-web-qa.mjs';

/** 覆盖的窗口宽度：宽窗（接近上限）、用户截图那个宽度、以及更窄的临界值。 */
const WIDTHS = [1440, 1280, 1167, 1024, 900];
/** 扫描带宽：不解「某个宽度」，而是证明「任何宽度」——这一排恒等于卡片实测宽、内容恒不越界。 */
const SWEEP = { from: 720, to: 1600, step: 20 };
const VIEWPORT_HEIGHT = 900;

const GEOMETRY_EXPRESSION = `JSON.stringify((() => {
  const pick = (selector) => document.querySelector(selector);
  const box = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return {
      left: Math.round(r.left * 100) / 100,
      right: Math.round(r.right * 100) / 100,
      top: Math.round(r.top * 100) / 100,
      bottom: Math.round(r.bottom * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowX: node.scrollWidth - node.clientWidth,
    };
  };
  const doc = document.documentElement;
  const card = pick('[data-composer-card]');
  const row = pick('[data-omnimux-quick-shortcuts]');
  const controlsWrap = pick('[data-omx-quick-shortcut-controls]');
  const media = controlsWrap ? controlsWrap.querySelector('.omx-media-config-controls') : null;
  const capsules = [...document.querySelectorAll('.omx-capsule-trigger')];
  const summary = pick('[data-omx-media-config-summary]');
  const buttons = [...document.querySelectorAll('[data-omx-quick-shortcut]')];

  const cardBox = box(card);
  const descendants = [];
  if (controlsWrap) {
    for (const node of controlsWrap.querySelectorAll('*')) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      descendants.push({
        cls: String(node.className || node.tagName).slice(0, 60),
        left: Math.round(r.left * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        width: Math.round(r.width * 100) / 100,
      });
    }
  }
  const maxDescendantRight = descendants.length
    ? Math.max(...descendants.map((item) => item.right))
    : null;
  const minDescendantLeft = descendants.length
    ? Math.min(...descendants.map((item) => item.left))
    : null;

  const rowBox = box(row);
  const rowRightOverCard = (rowBox && cardBox) ? Math.round((rowBox.right - cardBox.right) * 100) / 100 : null;
  const rowLeftOverCard = (rowBox && cardBox) ? Math.round((cardBox.left - rowBox.left) * 100) / 100 : null;
  const contentRightOverCard = (maxDescendantRight !== null && cardBox)
    ? Math.round((maxDescendantRight - cardBox.right) * 100) / 100
    : null;
  const contentLeftOverCard = (minDescendantLeft !== null && cardBox)
    ? Math.round((cardBox.left - minDescendantLeft) * 100) / 100
    : null;

  const capsuleBoxes = capsules.map((node) => {
    const r = node.getBoundingClientRect();
    return {
      label: (node.textContent || '').trim().slice(0, 40),
      left: Math.round(r.left * 100) / 100,
      right: Math.round(r.right * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      fullyInsideCard: cardBox ? (r.left >= cardBox.left - 0.5 && r.right <= cardBox.right + 0.5) : null,
    };
  });
  const summaryRect = summary ? summary.getBoundingClientRect() : null;

  // 卡片实测宽由本插件自己写进根元素（composer-compact.js 的 syncHeroWorkspaceRowToCard）
  const rootStyle = getComputedStyle(document.documentElement);
  const cardStyle = card ? getComputedStyle(card) : null;
  // 卡片与这一排各向上四层：看清两者是不是同一个父宽下的两条分支（同宽是「跟随」的前提）
  const chain = (node) => {
    const out = [];
    let cur = node;
    for (let i = 0; i < 4 && cur; i += 1) {
      const s = getComputedStyle(cur);
      const r = cur.getBoundingClientRect();
      out.push({
        level: cur === node ? 'self' : 'parent' + i,
        tag: cur.tagName,
        cls: String(cur.className || '').slice(0, 48),
        width: Math.round(r.width * 100) / 100,
        left: Math.round(r.left * 100) / 100,
        paddingLeft: s.paddingLeft,
        paddingRight: s.paddingRight,
        maxWidth: s.maxWidth,
        display: s.display,
      });
      cur = cur.parentElement;
    }
    return out;
  };

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    vars: {
      measuredCardWidth: (rootStyle.getPropertyValue('--omnimux-composer-card-width') || '').trim(),
      cardMaxWidth: cardStyle ? cardStyle.getPropertyValue('--dsh-composer-card-max-width').trim() : null,
      sideClearance: cardStyle ? cardStyle.getPropertyValue('--dsh-composer-side-clearance').trim() : null,
      density: document.documentElement.getAttribute('data-omnimux-composer-density'),
    },
    cardChain: chain(card),
    rowChain: chain(row),
    document: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, pageOverflowX: doc.scrollWidth - doc.clientWidth },
    card: cardBox,
    row: rowBox,
    controlsWrap: box(controlsWrap),
    mediaControls: box(media),
    rowRightOverCard,
    rowLeftOverCard,
    contentRightOverCard,
    contentLeftOverCard,
    maxDescendantRight,
    minDescendantLeft,
    descendantCount: descendants.length,
    widestDescendants: descendants.slice().sort((a, b) => b.right - a.right).slice(0, 4),
    capsuleCount: capsules.length,
    capsules: capsuleBoxes,
    // 控件本体每个直接子项落在哪一行（按 top 归组）：折行后用来核对「每一行都放得下」，
    // 也能看清 1px 分隔线折行后落在哪一行的行尾。
    controlItems: media ? [...media.children].map((node) => {
      const r = node.getBoundingClientRect();
      return {
        cls: String(node.className || node.tagName).slice(0, 40),
        left: Math.round(r.left * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        top: Math.round(r.top),
        width: Math.round(r.width * 100) / 100,
      };
    }) : null,
    summary: summaryRect ? {
      text: (summary.textContent || '').trim(),
      left: Math.round(summaryRect.left * 100) / 100,
      right: Math.round(summaryRect.right * 100) / 100,
      width: Math.round(summaryRect.width * 100) / 100,
      fullyInsideCard: cardBox ? (summaryRect.right <= cardBox.right + 0.5) : null,
    } : null,
    shortcutButtons: buttons.map((node) => {
      const r = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-omx-quick-shortcut'),
        text: (node.textContent || '').trim(),
        left: Math.round(r.left * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        top: Math.round(r.top * 100) / 100,
        bottom: Math.round(r.bottom * 100) / 100,
      };
    }),
    // 四条按钮是否处在同一行（top 差 < 2px）且整组居中（左右留白差 < 2px）
    shortcutRowSameLine: (() => {
      const tops = buttons.map((node) => node.getBoundingClientRect().top);
      if (tops.length < 2) return null;
      return Math.round((Math.max(...tops) - Math.min(...tops)) * 100) / 100 < 2;
    })(),
    shortcutRowCentered: (() => {
      if (!buttons.length || !rowBox) return null;
      // 用四条按钮的**并集包围盒**衡量居中：换行后逐行居中同样成立（单行时就是首尾按钮）。
      const rects = buttons.map((node) => node.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const gapLeft = left - rowBox.left;
      const gapRight = rowBox.right - right;
      return { gapLeft: Math.round(gapLeft * 100) / 100, gapRight: Math.round(gapRight * 100) / 100, delta: Math.round(Math.abs(gapLeft - gapRight) * 100) / 100 };
    })(),
  };
})())`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 跑几何量测。
 * @param {{ origin: string, loginUrl: string, outDir: string, logLine?: (line: string) => void, timeoutMs?: number }} options
 */
export async function runScenario({ origin, loginUrl, outDir, logLine = () => {} }) {
  const checks = [];
  const record = (id, pass, detail) => {
    checks.push({ id, pass: pass === true, detail });
    logLine(`${pass === true ? '通过' : '失败'} ${id}${detail === undefined ? '' : `：${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}`}`);
    return pass === true;
  };
  const shots = [];
  let chrome;
  let socket;

  const login = await fetch(loginUrl, { redirect: 'manual' });
  const rawCookie = login.headers.getSetCookie()[0] ?? '';
  const cookieName = rawCookie.split('=')[0];
  const cookieValue = rawCookie.split(';')[0].slice(cookieName.length + 1);
  const resultPath = join(outDir, 'layout-geometry.json');
  if (!cookieName || !cookieValue) {
    const result = { pass: false, error: 'LOGIN_COOKIE_MISSING', checks, at: new Date().toISOString() };
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    return { pass: false, resultPath, checks };
  }
  logLine(`同源登录完成（HTTP ${login.status}）`);

  try {
    chrome = spawn(findChromePath(), [
      '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
      '--disable-gpu', `--window-size=${WIDTHS[0]},${VIEWPORT_HEIGHT}`, 'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const port = await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('CHROME_START_TIMEOUT')), 20000);
      let buffer = '';
      chrome.stderr.on('data', (chunk) => {
        buffer += chunk.toString();
        const matched = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (matched) { clearTimeout(timer); done(Number(matched[1])); }
      });
    });
    logLine(`无头 Chrome 调试端口 ${port}`);

    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find((item) => item.type === 'page');
    if (!target) throw new Error('CHROME_PAGE_TARGET_MISSING');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });

    let sequence = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((done, fail) => {
      const id = ++sequence;
      pending.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { done, fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(`cdp ${message.method} 失败：${message.error.message}`)); else done(message.result);
    };

    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Network.setCookie', {
      name: cookieName, value: cookieValue, domain: new URL(origin).hostname, path: '/',
      url: `${origin}/`, secure: false, sameSite: 'Lax',
    });
    const version = await send('Browser.getVersion');
    await send('Network.setUserAgentOverride', { userAgent: version.userAgent, acceptLanguage: 'zh-CN,zh;q=0.9' });
    try { await send('Emulation.setLocaleOverride', { locale: 'zh-CN' }); } catch { /* 旧版忽略 */ }

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      const raw = result?.result?.value;
      if (typeof raw !== 'string') return null;
      try { return JSON.parse(raw); } catch { return raw; }
    };
    // 整窗截图是硬证据；聚焦截图单独兜错：裁剪区一旦越出视口 Chrome 会直接拒绝 clip 参数，
    // 拿不到聚焦图也不影响这一轮的量测与整窗证据。
    const screenshot = async (name, clip) => {
      const params = { format: 'png', captureBeyondViewport: Boolean(clip) };
      if (clip) params.clip = { ...clip, scale: 1 };
      const result = await send('Page.captureScreenshot', params);
      const file = join(outDir, name);
      fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
      shots.push(name);
      return file;
    };
    const tryScreenshot = async (name, clip) => {
      try {
        return await screenshot(name, clip);
      } catch (error) {
        logLine(`截图 ${name} 失败（不影响量测）：${error?.message ?? error}`);
        return null;
      }
    };
    const waitFor = async (expression, label, budgetMs = 15000) => {
      const deadline = Date.now() + budgetMs;
      for (;;) {
        const value = await evaluate(expression);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`WAIT_TIMEOUT: ${label}`);
        await sleep(200);
      }
    };

    await send('Page.navigate', { url: `${origin}/` });
    await waitFor(
      `JSON.stringify((() => Boolean(document.querySelector('[data-composer-input="true"]')))())`,
      '输入框就绪',
    );
    await waitFor(
      `JSON.stringify((() => Boolean(document.querySelector('[data-omx-quick-shortcut="clone"]')))())`,
      '四条快捷方式就绪',
    );
    // 点「复刻爆款视频」：这是唯一能出现模型 / 参数控件的两条之一。
    await evaluate(`(() => { const node = document.querySelector('[data-omx-quick-shortcut="clone"]'); if (node) node.click(); return JSON.stringify({ ok: true }); })()`);
    await waitFor(
      `JSON.stringify((() => Boolean(document.querySelector('[data-omx-quick-shortcut-controls] .omx-media-config-controls')))())`,
      '模型 / 参数控件就绪',
    );
    // 模型目录是异步拉的：等回执文字出现，量到的才是真实内容宽。
    await waitFor(
      `JSON.stringify((() => { const node = document.querySelector('[data-omx-media-config-summary]'); return Boolean(node && (node.textContent || '').trim() && (node.textContent || '').indexOf('选择模型') === -1); })())`,
      '模型回执就绪',
      20000,
    );

    // 首次启动的内测声明浮层（带「继续」按钮）会盖住输入框这一片，取证前先关掉它：
    // 浮层只是遮罩，不参与几何量测（各轮实测数字逐点一致即为证），但截图必须能看清被验对象。
    const overlay = await evaluate(`JSON.stringify((() => {
      const labels = ['继续', '我知道了', '我已知晓', '知道了', '同意', '开始使用', '确定', '关闭'];
      const nodes = [...document.querySelectorAll('button, [role="button"], a')];
      const hit = nodes.find((node) => labels.includes((node.textContent || '').trim()));
      if (hit) { hit.click(); return { closed: (hit.textContent || '').trim() }; }
      return { closed: null };
    })())`);
    await sleep(400);
    if (!overlay?.closed) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(300);
    }
    const overlayState = await evaluate(`JSON.stringify((() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
        .filter((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return { remainingDialogs: dialogs.length, closed: ${JSON.stringify(overlay?.closed ?? null)} };
    })())`);
    logLine(`浮层处理：${overlayState?.closed ? `点了「${overlayState.closed}」` : '未找到可点按钮，已发 Esc'}；剩余可见浮层 ${overlayState?.remainingDialogs}`);

    // 一）扫描带：不解「1167 这一个宽度」，而是证明**任何宽度**下两条不变量都成立。
    //     不变量 A：这一排的实测宽恒等于输入框卡片实测宽（跟随，不是各算各的公式）。
    //     不变量 B：控件子树里没有任何元素的边缘越出卡片。
    const sweep = [];
    for (let width = SWEEP.from; width <= SWEEP.to; width += SWEEP.step) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false,
      });
      await sleep(220);
      const geometry = await evaluate(GEOMETRY_EXPRESSION);
      if (!geometry?.card || !geometry?.row) continue;
      sweep.push({
        width,
        cardWidth: geometry.card.width,
        rowWidth: geometry.row.width,
        rowWidthDelta: Math.round((geometry.row.width - geometry.card.width) * 100) / 100,
        rowRightOverCard: geometry.rowRightOverCard,
        contentRightOverCard: geometry.contentRightOverCard,
        contentLeftOverCard: geometry.contentLeftOverCard,
        contentOverflow: geometry.controlsWrap?.overflowX ?? null,
        pageOverflow: geometry.document?.pageOverflowX ?? null,
        measuredCardVar: geometry.vars?.measuredCardWidth ?? null,
        density: geometry.vars?.density ?? null,
        capsuleCount: geometry.capsuleCount,
        buttonsSameLine: geometry.shortcutRowSameLine,
        centerDelta: geometry.shortcutRowCentered?.delta ?? null,
        mediaControlsWidth: geometry.mediaControls?.width ?? null,
      });
    }
    const worstSweep = {
      maxAbsRowWidthDelta: sweep.reduce((max, item) => Math.max(max, Math.abs(item.rowWidthDelta)), 0),
      maxRowRightOverCard: sweep.reduce((max, item) => Math.max(max, item.rowRightOverCard ?? -999), -999),
      maxContentRightOverCard: sweep.reduce((max, item) => Math.max(max, item.contentRightOverCard ?? -999), -999),
      maxContentLeftOverCard: sweep.reduce((max, item) => Math.max(max, item.contentLeftOverCard ?? -999), -999),
      maxPageOverflow: sweep.reduce((max, item) => Math.max(max, item.pageOverflow ?? 0), 0),
      maxCenterDelta: sweep.reduce((max, item) => Math.max(max, item.centerDelta ?? 0), 0),
      minCardWidth: sweep.reduce((min, item) => Math.min(min, item.cardWidth), 1e9),
      maxCardWidth: sweep.reduce((max, item) => Math.max(max, item.cardWidth), 0),
      widths: sweep.length,
    };
    logLine(`扫描 ${SWEEP.from}–${SWEEP.to}px（步长 ${SWEEP.step}，${sweep.length} 个宽度）：卡片宽 ${worstSweep.minCardWidth}–${worstSweep.maxCardWidth}／这一排与卡片最大宽差 ${worstSweep.maxAbsRowWidthDelta}／内容右溢卡片最大 ${worstSweep.maxContentRightOverCard}／左溢最大 ${worstSweep.maxContentLeftOverCard}／页面横溢最大 ${worstSweep.maxPageOverflow}`);

    const measured = [];
    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false,
      });
      await sleep(600);
      const geometry = await evaluate(GEOMETRY_EXPRESSION);
      const cardBox = geometry?.card;
      // 聚焦图要覆盖「卡片 + 卡片下方这一排」的整块区域，并夹进视口：
      // clip 越出视口时 Chrome 直接拒绝参数（这正是上一轮聚焦图一直拿不到的原因）。
      const clip = (cardBox && geometry?.row) ? (() => {
        const top = Math.max(0, Math.round(Math.min(cardBox.top, geometry.row.top) - 24));
        const bottom = Math.min(VIEWPORT_HEIGHT, Math.round(Math.max(cardBox.bottom, geometry.row.bottom) + 24));
        const left = Math.max(0, Math.round(cardBox.left) - 48);
        const right = Math.min(width, Math.round(cardBox.right) + 48);
        if (!(bottom > top) || !(right > left)) return null;
        return { x: left, y: top, width: right - left, height: bottom - top };
      })() : null;
      measured.push({ width, geometry });
      logLine(`宽度 ${width}：卡片 ${cardBox?.left}→${cardBox?.right}（${cardBox?.width}）/ 这一排 ${geometry?.row?.left}→${geometry?.row?.right}（${geometry?.row?.width}）/ 控件行溢出 ${geometry?.controlsWrap?.overflowX} / 内容右溢卡片 ${geometry?.contentRightOverCard} / 页面横溢 ${geometry?.document?.pageOverflowX}`);
      await screenshot(`layout-${width}.png`, null);
      await tryScreenshot(`layout-${width}-composer.png`, clip);
    }

    const byWidth = Object.fromEntries(measured.map((item) => [String(item.width), item.geometry]));
    const wide = byWidth['1440'];
    const user = byWidth['1167'];
    const narrow = byWidth['900'];
    const wideLineWidths = ['1440', '1280', '1167'];

    record('S1 扫描带内这一排恒等于卡片实测宽（跟随，≤1px 舍入）', worstSweep.widths > 20 && worstSweep.maxAbsRowWidthDelta <= 1,
      `最大宽差 ${worstSweep.maxAbsRowWidthDelta}（${worstSweep.widths} 个宽度）`);
    record('S2 扫描带内这一排从不超出卡片', worstSweep.maxRowRightOverCard <= 0.5,
      `最大右溢 ${worstSweep.maxRowRightOverCard}；最大左溢 ${worstSweep.maxContentLeftOverCard < 0 ? '无' : worstSweep.maxContentLeftOverCard}`);
    record('S3 扫描带内控件内容从不越出卡片', worstSweep.maxContentRightOverCard <= 0.5,
      `内容右溢卡片最大 ${worstSweep.maxContentRightOverCard}`);
    record('S4 扫描带内没有页面级横向滚动条', worstSweep.maxPageOverflow <= 0,
      `页面横溢最大 ${worstSweep.maxPageOverflow}`);
    record('S5 扫描带内四条按钮整组（并集包围盒）居中', worstSweep.maxCenterDelta < 2,
      `左右留白最大差 ${worstSweep.maxCenterDelta}`);
    record('G1 证据宽度下都没有页面级横向滚动条', measured.every((item) => (item.geometry?.document?.pageOverflowX ?? 1) <= 0),
      measured.map((item) => `${item.width}:${item.geometry?.document?.pageOverflowX}`).join(' '));
    record('G2 这一排整体不超出输入框卡片', measured.every((item) => (item.geometry?.rowRightOverCard ?? 1) <= 0.5 && (item.geometry?.rowLeftOverCard ?? 1) <= 0.5),
      measured.map((item) => `${item.width}:右${item.geometry?.rowRightOverCard}/左${item.geometry?.rowLeftOverCard}`).join(' '));
    record('G3 控件行内容不超出卡片边界', measured.every((item) => (item.geometry?.contentRightOverCard ?? 1) <= 0.5 && (item.geometry?.contentLeftOverCard ?? 1) <= 0.5),
      measured.map((item) => `${item.width}:右${item.geometry?.contentRightOverCard}/左${item.geometry?.contentLeftOverCard}`).join(' '));
    record('G4 两个胶囊在所有宽度都完整落在卡片内', measured.every((item) => (item.geometry?.capsules ?? []).length === 2 && item.geometry.capsules.every((capsule) => capsule.fullyInsideCard === true)),
      measured.map((item) => `${item.width}:${(item.geometry?.capsules ?? []).map((c) => (c.fullyInsideCard ? 'in' : 'OUT')).join(',')}`).join(' '));
    record('G5 模型回执完整落在卡片内且未被压成零宽', measured.every((item) => item.geometry?.summary?.fullyInsideCard === true && (item.geometry?.summary?.width ?? 0) > 40),
      measured.map((item) => `${item.width}:${item.geometry?.summary?.right}<=${item.geometry?.card?.right}(宽${item.geometry?.summary?.width})`).join(' '));
    record('G6 宽窗与用户截图宽度下四条仍整行不换行', wideLineWidths.every((key) => byWidth[key]?.shortcutRowSameLine === true),
      wideLineWidths.map((key) => `${key}:${byWidth[key]?.shortcutRowSameLine}`).join(' '));
    record('G7 四条快捷方式整组居中（并集包围盒左右留白差 < 2px）', measured.every((item) => (item.geometry?.shortcutRowCentered?.delta ?? 99) < 2),
      measured.map((item) => `${item.width}:左${item.geometry?.shortcutRowCentered?.gapLeft}/右${item.geometry?.shortcutRowCentered?.gapRight}`).join(' '));
    record('G8 宽窗下这一排与卡片等宽（不倒退成更窄）', !!wide && Math.abs((wide.row?.width ?? 0) - (wide.card?.width ?? 0)) <= 1,
      wide ? `row ${wide.row?.width} vs card ${wide.card?.width}` : 'missing');
    record('G9 窄窗下卡片自适应收缩（卡片宽 < 窗口宽）', !!narrow && !!user && (narrow.card?.width ?? 0) < 900 && (user.card?.width ?? 0) < 1167,
      `1167:${user?.card?.width} 900:${narrow?.card?.width}`);

    const result = {
      pass: checks.every((check) => check.pass),
      at: new Date().toISOString(),
      sweepRange: SWEEP,
      sweepWorst: worstSweep,
      sweep,
      widths: WIDTHS,
      measurements: measured,
      byWidth,
      shots,
      checks,
    };
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    return { pass: result.pass, resultPath, checks };
  } catch (error) {
    const result = { pass: false, error: error?.code ?? error?.message ?? 'unknown', shots, checks, at: new Date().toISOString() };
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    logLine(`场景异常：${error?.message ?? error}`);
    return { pass: false, resultPath, checks };
  } finally {
    try { socket?.close(); } catch { /* 忽略 */ }
    try { chrome?.kill('SIGTERM'); } catch { /* 忽略 */ }
  }
}
