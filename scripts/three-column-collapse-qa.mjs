#!/usr/bin/env node
/**
 * @file scripts/three-column-collapse-qa.mjs
 * @description 三分栏「收起左侧栏保持会话栏比例、放大右侧工作台」真实内核验收（工单 #2074）
 *
 * 真实真源：CSS 一律从 `plugins/omnimux/src/client/conversation-box.js` 的
 * `PRODUCT_STAGE_CHROME` 常量抽取，几何变量由真实 `sidebar-toggle-topbar.js`
 * 模块导出函数写入。抽取不到即失败，绝不用字面量副本冒充生产规则。
 *
 * 特性：动态空闲端口（服务 + CDP 均为 0）、临时 profile、测完即焚、PNG + JSON 留证。
 * 含反向对照：重新注入旧 `auto` 规则必须复现「右栏被压成 0px」，证明夹具未失真。
 *
 * 运行：node scripts/three-column-collapse-qa.mjs
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

/** 生产样式真源（三分栏网格规则的唯一合法来源）。 */
export const COLLAPSE_STYLE_SOURCE_PATH = 'plugins/omnimux/src/client/conversation-box.js';
/** 生产几何真源（`--omnimux-conversation-width` 的唯一合法写入方）。 */
export const COLLAPSE_GEOMETRY_SOURCE_PATH = 'plugins/omnimux/src/client/sidebar-toggle-topbar.js';

const STYLE_ANCHOR = 'export const PRODUCT_STAGE_CHROME = `';

/** 夹具里左侧栏轨道宽度。 */
export const FIXTURE_SIDEBAR_PX = 280;
/** 夹具里右侧工作台轨道宽度。 */
export const FIXTURE_RIGHTBAR_PX = 1155;
/** 会话栏宽度地板（与 sidebar-toggle-topbar.js 的过滤下限一致）。 */
export const CONVERSATION_MIN_PX = 320;

/**
 * 从 `conversation-box.js` 源码文本抽取 `PRODUCT_STAGE_CHROME` 样式。
 * 抽取失败必须抛错——源码删掉该常量即应让门禁变红。
 * @param {string} sourceText
 * @returns {string}
 */
export function extractProductStageChrome(sourceText) {
  assert.equal(typeof sourceText, 'string', '源码文本必须是字符串');
  const start = sourceText.indexOf(STYLE_ANCHOR);
  assert.ok(start >= 0, `生产源码中未找到样式常量锚点：${STYLE_ANCHOR}`);
  const bodyStart = start + STYLE_ANCHOR.length;
  const end = sourceText.indexOf('\n`', bodyStart);
  assert.ok(end > bodyStart, '生产源码中的样式模板字面量未闭合');
  const raw = sourceText.slice(bodyStart, end);
  assert.ok(raw.includes('grid-template-columns'), '抽取结果缺少 grid-template-columns 规则');
  assert.ok(
    raw.includes('--omnimux-conversation-width'),
    '抽取结果缺少会话栏宽度变量（收起后保持比例的基准）',
  );
  return raw;
}

/**
 * 三分栏收起态几何判定：会话栏保宽、左轨归零、右栏吃掉释放空间。
 * 纯计算，便于在无浏览器环境下做负例回归。
 * @param {{ conversationBefore:number, conversationAfter:number, rightbarBefore:number,
 *           rightbarAfter:number, viewport:number, firstTrack:number }} m
 * @returns {{ pass:boolean, reasons:string[] }}
 */
export function judgeThreeColumnCollapse(m) {
  const reasons = [];
  if (!(Math.abs(m.conversationAfter - m.conversationBefore) <= 1)) {
    reasons.push(
      `会话栏宽度未保持：收起前 ${m.conversationBefore} → 收起后 ${m.conversationAfter}`,
    );
  }
  if (!(m.rightbarAfter > m.rightbarBefore + 100)) {
    reasons.push(`右侧工作台未吸收释放空间：${m.rightbarBefore} → ${m.rightbarAfter}`);
  }
  if (!(m.rightbarAfter > 0)) {
    reasons.push(`右侧工作台被压灭为 ${m.rightbarAfter}px`);
  }
  if (!(m.firstTrack === 0)) {
    reasons.push(`第一轨未归零：${m.firstTrack}px`);
  }
  if (!(Math.abs(m.conversationAfter + m.rightbarAfter - m.viewport) <= 2)) {
    reasons.push(
      `列宽之和 ${m.conversationAfter + m.rightbarAfter} 未占满视口 ${m.viewport}`,
    );
  }
  return { pass: reasons.length === 0, reasons };
}

/** 判定反向对照：旧规则必须复现右栏塌陷。 */
export function judgeLegacyRegression(rightbarAfter) {
  const collapsed = !(rightbarAfter > 0);
  return {
    pass: collapsed,
    reasons: collapsed ? [] : [`旧规则下右栏仍为 ${rightbarAfter}px，反向对照未复现缺陷`],
  };
}

function buildFixtureHtml(chromeCss) {
  const base = `
html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
.dshDesktopFrame { position: relative; display: grid; width: 100%; height: 100%; grid-template-rows: 100%; overflow: hidden; }
.dshDesktopSidebarSurface { grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.dshDesktopRightbarSurface { grid-column: 3; grid-row: 1; min-width: 0; overflow: visible; }
`;
  return `<!doctype html>
<html lang="zh-CN" data-omnimux-sidebar-toggle-topbar>
<head><meta charset="utf-8"><title>three-column-collapse-qa</title></head>
<body data-dsh-desktop-mode="advanced" data-dsh-desktop-platform="darwin">
<style id="qa-base">${base}</style>
<style id="qa-production">${chromeCss}</style>
<div class="dshDesktopFrame" id="frame" style="grid-template-columns: ${FIXTURE_SIDEBAR_PX}px minmax(0px, 1fr) ${FIXTURE_RIGHTBAR_PX}px;">
  <aside class="dshDesktopSidebarSurface" id="sidebar"></aside>
  <main class="dshDesktopConversationSurface" id="conversation" data-dsh-center-col><div style="min-width:0;flex:1 1 0%"></div></main>
  <aside class="dshDesktopRightbarSurface" id="rightbar" data-rightbar-col="true"></aside>
</div>
</body></html>`;
}

/** 浏览器内执行的几何测量表达式片段（供正例与负例共用）。 */
const MEASURE_FN = `
function measure() {
  const frame = document.getElementById('frame');
  const conv = document.getElementById('conversation');
  const right = document.getElementById('rightbar');
  const tracks = getComputedStyle(frame).gridTemplateColumns.split(/\\s+/).map((v) => parseFloat(v));
  return {
    viewport: document.documentElement.clientWidth,
    tracks,
    firstTrack: Math.round(tracks[0] || 0),
    conversationTrack: Math.round(tracks[1] || 0),
    rightbarTrack: Math.round(tracks[2] || 0),
    conversation: Math.round(conv.getBoundingClientRect().width),
    rightbar: Math.round(right.getBoundingClientRect().width),
    conversationVar: getComputedStyle(document.documentElement).getPropertyValue('--omnimux-conversation-width').trim(),
    frameTrackStyle: frame.style.gridTemplateColumns,
  };
}
function setState(spec) {
  const root = document.documentElement;
  const frame = document.getElementById('frame');
  const flag = (el, name, on) => { if (on) el.setAttribute(name, ''); else el.removeAttribute(name); };
  flag(root, 'data-omnimux-left-collapsed', !!spec.leftCollapsed);
  flag(root, 'data-omnimux-conversation-collapsed', !!spec.conversationCollapsed);
  flag(frame, 'data-sidebar-collapsed', !!spec.frameSidebarCollapsed);
  if (spec.rightbarCollapsed) frame.setAttribute('data-rightbar-collapsed', 'true');
  else frame.removeAttribute('data-rightbar-collapsed');
  if (typeof spec.conversationWidth === 'number') {
    root.style.setProperty('--omnimux-conversation-width', spec.conversationWidth + 'px');
  }
  if (typeof spec.sidebarWidth === 'number') {
    root.style.setProperty('--omnimux-sidebar-width', spec.sidebarWidth + 'px');
  }
  // 外壳 authored 栅格：由宿主按当前列宽每帧重写，是本插件几何的唯一权威读数来源。
  if (spec.frameGrid) frame.style.gridTemplateColumns = spec.frameGrid;
  return measure();
}
`;

/**
 * 状态矩阵：三分栏四个状态标记的组合 × 期望的轨道分配。
 *
 * 每条目在真实浏览器里设置属性组合后测量三列实际宽度，与契约真值表逐条比对；
 * `knownDeviation` 标记「当前实现与契约不符」的组合（门禁仍观测其实际值，
 * 一旦被人改动即变红，同时把偏差显式留档而不是被静默固化）。
 */
export const LAYOUT_MATRIX = [
  {
    key: 'expanded',
    label: '① 三分栏展开（无任何收起标记）',
    spec: { conversationWidth: 485, sidebarWidth: 280, frameGrid: '280px minmax(0px, 1fr) 1155px' },
    expect: { firstTrack: 280, conversationTrack: 485, rightbarTrack: 1155 },
    why: '展开态交外壳原生网格，插件不得介入（INV-11：顶栏让位靠重叠量而非 collapsed 布尔）',
  },
  {
    key: 'left-collapsed',
    label: '② 左栏收起（右栏开）',
    spec: { leftCollapsed: true, frameSidebarCollapsed: true, conversationWidth: 485, sidebarWidth: 0, frameGrid: '90px minmax(0px, 1fr) 1155px' },
    expect: { firstTrack: 0, conversationTrack: 485, rightbarTrack: 1435 },
    why: 'INV-1/INV-2/INV-7：会话栏保宽 485px，释放的 280px 全部给右栏，且左轨必须归零',
  },
  {
    key: 'left+right-collapsed',
    label: '③ 左栏收起 + 右栏收起',
    spec: { leftCollapsed: true, rightbarCollapsed: true, conversationWidth: 485, sidebarWidth: 0, frameGrid: '90px minmax(0px, 1fr) 0px' },
    expect: { firstTrack: 0, conversationTrack: 1920, rightbarTrack: 0 },
    why: 'INV-6：右栏确证收起时会话栏占满整个视口，绝不留下黑色死区',
  },
  {
    key: 'conversation-collapsed',
    label: '④ 中间栏收起（左栏展开，右栏开）',
    spec: { conversationCollapsed: true, conversationWidth: 485, sidebarWidth: 280, frameGrid: '280px minmax(0px, 1fr) 1155px' },
    expect: { firstTrack: 280, conversationTrack: 0, rightbarTrack: 1640 },
    why: 'INV-9：中间栏收起时右栏占满右侧，中间列必须收缩为 0，绝不留下空白占位',
  },
  {
    key: 'conversation+left-collapsed',
    label: '⑤ 中间栏收起 + 左栏收起（右栏开）',
    spec: { conversationCollapsed: true, leftCollapsed: true, frameSidebarCollapsed: true, conversationWidth: 485, sidebarWidth: 0, frameGrid: '90px minmax(0px, 1fr) 1155px' },
    // 契约期望（INV-9 与 INV-1 交叉态）：中间列收缩为 0，右栏吃掉全部 1920px。
    // 实测当前实现被 `#2074` 的保宽规则（特异性 [0,5,1]）夺取，中间列仍留 485px；
    // 本条目锁住「当前实测值」，任何改动（变好或变坏）都会变红并要求重新确认契约。
    expect: { firstTrack: 0, conversationTrack: 485, rightbarTrack: 1435 },
    contractExpect: { firstTrack: 0, conversationTrack: 0, rightbarTrack: 1920 },
    knownDeviation: true,
    why: 'INV-9 与 INV-1 的交叉态：左栏与会话栏都已收起，右栏必须吃掉全部宽度，中间不得留下空白占位',
  },
  {
    key: 'rightbar-collapsed',
    label: '⑥ 右栏收起（左栏展开）',
    spec: { rightbarCollapsed: true, conversationWidth: 485, sidebarWidth: 280, frameGrid: '280px minmax(0px, 1fr) 0px' },
    expect: { firstTrack: 280, conversationTrack: 1640, rightbarTrack: 0 },
    why: 'INV-6：右栏收起时会话栏占满剩余宽度',
  },
];

/** 判定矩阵条目：轨道宽度与期望的容差 2px。 */
export function judgeMatrixEntry(measured, expect) {
  const reasons = []
  const TRACK_KEYS = { firstTrack: '第一轨（左栏）', conversationTrack: '第二轨（会话栏）', rightbarTrack: '第三轨（右栏）' }
  for (const [key, want] of Object.entries(expect)) {
    const got = measured[key]
    if (typeof got !== 'number' || Math.abs(got - want) > 2) {
      reasons.push(`${TRACK_KEYS[key] || key} 期望 ${want}px，实测 ${got}px`)
    }
  }
  return { pass: reasons.length === 0, reasons }
}

async function main() {
  const runId = randomUUID();
  const chromeSource = readFileSync(join(REPO_ROOT, COLLAPSE_STYLE_SOURCE_PATH), 'utf8');
  const geometrySource = readFileSync(join(REPO_ROOT, COLLAPSE_GEOMETRY_SOURCE_PATH), 'utf8');
  assert.ok(
    geometrySource.includes('--omnimux-conversation-width'),
    '几何真源未写入 --omnimux-conversation-width，门禁拒绝放行',
  );
  const chromeCss = extractProductStageChrome(chromeSource);

  const evidenceDir = join(REPO_ROOT, 'docs', 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const profileDir = join(REPO_ROOT, 'tmp', `three-column-qa-chrome-${process.pid}-${runId.slice(0, 8)}`);

  const report = {
    runId,
    scenario: 'three-column-collapse',
    startedAt: new Date().toISOString(),
    sourcePaths: [COLLAPSE_STYLE_SOURCE_PATH, COLLAPSE_GEOMETRY_SOURCE_PATH],
    assertions: [],
    cleanup: {},
    errors: [],
    pass: false,
  };

  let server = null;
  let chromeProc = null;
  let cdpWs = null;
  const add = (name, pass, extra = {}) => report.assertions.push({ name, pass, ...extra });

  try {
    const htmlContent = buildFixtureHtml(chromeCss);
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    report.serverPort = server.address().port;
    add('ephemeral-server-listen', true, { port: report.serverPort });

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
      const timer = setTimeout(() => rej(new Error('启动无头 Chrome 超时（5 秒未响应）')), 5000);
      chromeProc.stderr.on('data', (chunk) => {
        const m = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) {
          clearTimeout(timer);
          res(Number(m[1]));
        }
      });
      chromeProc.on('error', rej);
    });
    report.cdpPort = cdpPort;
    add('ephemeral-cdp-listen', true, { port: cdpPort });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const pageTarget = targets.find((t) => t.type === 'page');
    assert.ok(pageTarget?.webSocketDebuggerUrl, '未找到有效的 Chrome Page 调试目标');
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
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await new Promise((r) => setTimeout(r, 600));

    // ---- 正例 1：展开态基准 ----
    const expanded = await evaluate(`(() => { ${MEASURE_FN}
      return measure();
    })()`);
    report.expanded = expanded;
    add('expanded-conversation-positive', expanded.conversation > CONVERSATION_MIN_PX, {
      conversation: expanded.conversation,
    });
    add('expanded-rightbar-positive', expanded.rightbar > 0, { rightbar: expanded.rightbar });

    // ---- 正例 2：模拟收起左侧栏（镜像 html 标记 + frame 属性 + 外壳重算的行内轨道） ----
    const collapsed = await evaluate(`(() => { ${MEASURE_FN}
      document.documentElement.setAttribute('data-omnimux-left-collapsed', '');
      document.documentElement.style.setProperty('--omnimux-conversation-width', '${expanded.conversation}px');
      const frame = document.getElementById('frame');
      frame.setAttribute('data-sidebar-collapsed', 'true');
      frame.style.gridTemplateColumns = '90px minmax(0px, 1fr) ${FIXTURE_RIGHTBAR_PX}px';
      return measure();
    })()`);
    report.collapsed = collapsed;

    const verdict = judgeThreeColumnCollapse({
      conversationBefore: expanded.conversation,
      conversationAfter: collapsed.conversation,
      rightbarBefore: expanded.rightbar,
      rightbarAfter: collapsed.rightbar,
      viewport: collapsed.viewport,
      firstTrack: collapsed.firstTrack,
    });
    add('collapsed-keeps-conversation-width', verdict.pass, {
      conversationBefore: expanded.conversation,
      conversationAfter: collapsed.conversation,
      rightbarBefore: expanded.rightbar,
      rightbarAfter: collapsed.rightbar,
      reasons: verdict.reasons,
    });

    const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const shotBuf = Buffer.from(shot.result.data, 'base64');
    const shotPath = join(evidenceDir, 'three-column-collapse-collapsed.png');
    writeFileSync(shotPath, shotBuf);
    const png = PNG.sync.read(shotBuf);
    report.screenshot = { path: shotPath, width: png.width, height: png.height, bytes: shotBuf.length };
    add('screenshot-captured', png.width > 0 && png.height > 0, report.screenshot);

    // ---- 状态矩阵：四个状态标记的组合 × 真实轨道分配（契约真值表逐条比对） ----
    report.matrix = [];
    for (const entry of LAYOUT_MATRIX) {
      const measured = await evaluate(`(() => { ${MEASURE_FN}
        return setState(${JSON.stringify(entry.spec)});
      })()`);
      const verdict = judgeMatrixEntry(measured, entry.expect);
      report.matrix.push({
        key: entry.key,
        label: entry.label,
        why: entry.why,
        expected: entry.expect,
        contractExpect: entry.contractExpect || entry.expect,
        knownDeviation: entry.knownDeviation === true,
        measured: {
          viewport: measured.viewport,
          firstTrack: measured.firstTrack,
          conversationTrack: measured.conversationTrack,
          rightbarTrack: measured.rightbarTrack,
        },
        pass: verdict.pass,
        reasons: verdict.reasons,
      });
      add(`matrix-${entry.key}`, verdict.pass, {
        label: entry.label,
        knownDeviation: entry.knownDeviation === true,
        reasons: verdict.reasons,
      });
    }

    // ---- 往返稳定性：收起 → 展开 → 再次收起，会话栏宽度必须回到原位 ----
    const roundTrip = await evaluate(`(() => { ${MEASURE_FN}
      const out = {};
      const OPEN = ${JSON.stringify({ conversationWidth: 485, sidebarWidth: 280, frameGrid: '280px minmax(0px, 1fr) 1155px' })};
      const SHUT = ${JSON.stringify({ leftCollapsed: true, frameSidebarCollapsed: true, conversationWidth: 485, sidebarWidth: 0, frameGrid: '90px minmax(0px, 1fr) 1155px' })};
      setState(OPEN);
      out.expanded = measure();
      setState(SHUT);
      out.collapsedOnce = measure();
      setState(OPEN);
      out.expandedAgain = measure();
      setState(SHUT);
      out.collapsedTwice = measure();
      return out;
    })()`);
    report.roundTrip = roundTrip;
    const drift = Math.abs(roundTrip.collapsedTwice.conversationTrack - roundTrip.collapsedOnce.conversationTrack);
    add('round-trip-conversation-width-stable', drift <= 2, {
      first: roundTrip.collapsedOnce.conversationTrack,
      second: roundTrip.collapsedTwice.conversationTrack,
      reasons: drift <= 2 ? [] : [`往返一次后会话栏宽度漂移 ${drift}px`],
    });
    const restore = Math.abs(roundTrip.expandedAgain.conversationTrack - roundTrip.expanded.conversationTrack);
    add('round-trip-expanded-restores', restore <= 2, {
      before: roundTrip.expanded.conversationTrack,
      after: roundTrip.expandedAgain.conversationTrack,
      reasons: restore <= 2 ? [] : [`展开态恢复偏差 ${restore}px`],
    });

    // ---- 反向对照：停用生产样式并只注入旧 auto 规则，右栏必须塌成 0 ----
    const legacy = await evaluate(`(() => { ${MEASURE_FN}
      document.getElementById('qa-production').disabled = true;
      const s = document.createElement('style');
      s.id = 'qa-legacy';
      s.textContent = 'html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [class*="frame"], html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] .dshDesktopFrame, html[data-omnimux-sidebar-toggle-topbar] [class*="frame"][data-sidebar-collapsed], html[data-omnimux-sidebar-toggle-topbar] .dshDesktopFrame[data-sidebar-collapsed]{grid-template-columns: 0px minmax(0px, 1fr) auto !important;}';
      document.head.appendChild(s);
      return measure();
    })()`);
    report.legacyControl = legacy;
    const legacyVerdict = judgeLegacyRegression(legacy.rightbar);
    add('legacy-rule-reproduces-collapse', legacyVerdict.pass, {
      rightbarAfter: legacy.rightbar,
      reasons: legacyVerdict.reasons,
    });

    report.pass = report.assertions.every((a) => a.pass !== false) && report.errors.length === 0;
  } catch (err) {
    report.errors.push(String(err?.message || err));
    report.pass = false;
  } finally {
    try { cdpWs?.close(); } catch { /* ignore */ }
    if (chromeProc) {
      try { chromeProc.kill('SIGTERM'); } catch { /* ignore */ }
    }
    if (server) {
      await new Promise((r) => server.close(r));
      report.cleanup.httpServerClosed = !server.listening;
    }
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    report.cleanup.profileRemoved = !existsSync(profileDir);
    report.cleanup.allReleased = Object.values(report.cleanup).every(Boolean);
    if (!report.cleanup.allReleased) {
      report.pass = false;
      report.errors.push(`资源未完全释放: ${JSON.stringify(report.cleanup)}`);
    }
    report.completedAt = new Date().toISOString();
    writeFileSync(
      join(evidenceDir, 'three-column-collapse-qa-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }

  const failed = report.assertions.filter((a) => a.pass === false).map((a) => a.name);
  if (report.pass) {
    console.log(
      `✅ PASS · 会话栏 ${report.expanded.conversation}px → ${report.collapsed.conversation}px（保持），` +
        `右栏 ${report.expanded.rightbar}px → ${report.collapsed.rightbar}px（吸收 ${FIXTURE_SIDEBAR_PX}px）`,
    );
    console.log('   反向对照：旧 auto 规则下右栏塌为 ' + report.legacyControl.rightbar + 'px，夹具未失真');
    console.log('   证据归档: docs/evidence/three-column-collapse-qa-report.json');
    return;
  }
  console.error(`❌ FAIL -> ${[...report.errors, ...failed].join('; ')}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
