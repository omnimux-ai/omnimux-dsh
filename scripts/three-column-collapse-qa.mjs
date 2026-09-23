#!/usr/bin/env node
/**
 * @file scripts/three-column-collapse-qa.mjs
 * @description 三分栏「收起左侧栏保持会话栏比例、放大右侧工作台」真实内核验收（工单 #2074）
 *
 * 真实真源：CSS 一律从 `plugins/omnimux/src/client/conversation-box.js` 的
 * `PRODUCT_STAGE_CHROME` 常量抽取，几何变量由真实 `sidebar-toggle-topbar.js`
 * 模块导出函数写入。抽取不到即失败，绝不用字面量副本冒充生产规则。
 *
 * 另含「缩放档位」验收（Issue #2608）：用 CDP `Emulation.setDeviceMetricsOverride`
 * 真实切换 1920 / 2560 / 1440 三档视口，并由夹具页面自己 `import` 生产模块
 * `plugins/omnimux/src/client/conversation-ratio.js` 算出中间会话栏宽度。
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
// 生产比例算法真源：档位期望值与页面内算式都出自这一份模块，脚本内不另抄一份算式。
import {
  CONVERSATION_MIN_CHAT_PX,
  CONVERSATION_RATIO_DEFAULT,
  conversationStageWidthPx,
  conversationWidthFromRatio,
} from '../plugins/omnimux/src/client/conversation-ratio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

/** 生产样式真源（三分栏网格规则的唯一合法来源）。 */
export const COLLAPSE_STYLE_SOURCE_PATH = 'plugins/omnimux/src/client/conversation-box.js';
/** 生产几何真源（`--omnimux-conversation-width` 的唯一合法写入方）。 */
export const COLLAPSE_GEOMETRY_SOURCE_PATH = 'plugins/omnimux/src/client/sidebar-toggle-topbar.js';
/** 生产比例算法真源（缩放档位期望值与页面内算式的唯一合法来源）。 */
export const CONVERSATION_RATIO_SOURCE_PATH = 'plugins/omnimux/src/client/conversation-ratio.js';
/** 夹具页面内 `import` 生产比例模块时走的路由（与 HTML 共用同一台临时服务）。 */
export const CONVERSATION_RATIO_ROUTE = '/conversation-ratio.js';

const STYLE_ANCHOR = 'export const PRODUCT_STAGE_CHROME = `';

/** 夹具里左侧栏轨道宽度。 */
export const FIXTURE_SIDEBAR_PX = 280;
/** 夹具里右侧工作台轨道宽度。 */
export const FIXTURE_RIGHTBAR_PX = 1155;
/** 会话栏宽度地板（与 sidebar-toggle-topbar.js 的过滤下限一致）。 */
export const CONVERSATION_MIN_PX = 320;

/** 缩放档位断言容差（px）。 */
export const VIEWPORT_TIER_TOLERANCE_PX = 2;
/** 缩放档位的固定高度（只切换宽度，避免高度变化引入无关变量）。 */
export const VIEWPORT_TIER_HEIGHT = 1080;

/**
 * 缩放档位契约（Issue #2608）：三分栏展开态下，中间会话栏 = 舞台 × 比例，
 * 下限 360px、上限 min(舞台 × 72%, 舞台 − 320px)；`chat` / `rightbar` 是**声明值**。
 *
 * 期望值同时用生产纯函数算一遍并互相校验（见下方 `VIEWPORT_TIERS`）：
 * 只写字面量 → 生产算法被改这里不会红；只算不写字面量 → 契约被实现静默改写也看不出来。
 * 两者不一致立即抛错，让门禁变红。
 */
const VIEWPORT_TIER_CONTRACT = [
  {
    viewport: 1920,
    rail: 280,
    chat: 492,
    rightbar: 1148,
    note: '比例生效：round((1920 − 280) × 30%) = 492，未被夹紧',
  },
  {
    viewport: 2560,
    rail: 280,
    chat: 684,
    rightbar: 1596,
    note: '大屏按比例分账：round((2560 − 280) × 30%) = 684，未被夹紧',
  },
  {
    viewport: 1440,
    rail: 280,
    chat: 360,
    rightbar: 800,
    note: '被 360px 下限夹住：round((1440 − 280) × 30%) = 348 → 360',
  },
];

/**
 * 三档缩放矩阵：每档含 `viewport / rail / chat / rightbar / note`，
 * 期望值由生产函数算出并与声明字面量逐项互校。
 */
export const VIEWPORT_TIERS = VIEWPORT_TIER_CONTRACT.map((tier) => {
  const stage = conversationStageWidthPx({ viewportWidth: tier.viewport, railVisiblePx: tier.rail });
  const computedChat = conversationWidthFromRatio(stage, CONVERSATION_RATIO_DEFAULT);
  const computedRightbar = tier.viewport - tier.rail - computedChat;
  assert.equal(
    computedChat,
    tier.chat,
    `档位 ${tier.viewport} 中栏：契约声明 ${tier.chat}px，生产算法算出 ${computedChat}px`,
  );
  assert.equal(
    computedRightbar,
    tier.rightbar,
    `档位 ${tier.viewport} 右栏：契约声明 ${tier.rightbar}px，生产算法算出 ${computedRightbar}px`,
  );
  return { ...tier, stage, computedChat, computedRightbar };
});

// 矩阵必须同时覆盖「比例生效」与「下限夹住」两条路径，否则三档只是同一个分支的重复测量。
assert.equal(
  VIEWPORT_TIERS[2].chat,
  CONVERSATION_MIN_CHAT_PX,
  `最窄档必须正好落在 ${CONVERSATION_MIN_CHAT_PX}px 下限上`,
);
assert.ok(
  Math.round(VIEWPORT_TIERS[2].stage * CONVERSATION_RATIO_DEFAULT) < CONVERSATION_MIN_CHAT_PX,
  '最窄档的原始比例值必须低于下限，否则「被下限夹住」并未被真实覆盖',
);
for (const tier of [VIEWPORT_TIERS[0], VIEWPORT_TIERS[1]]) {
  assert.equal(
    Math.round(tier.stage * CONVERSATION_RATIO_DEFAULT),
    tier.chat,
    `档位 ${tier.viewport} 必须由比例直接决定（未被夹紧）`,
  );
}

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

/**
 * 判定单个缩放档位：第二轨（会话栏）等于该档 chat，且三列之和等于该档视口。
 * 容差 ±2px。
 */
export function judgeViewportTier(measured, tier) {
  const reasons = [];
  if (Math.abs(measured.conversationTrack - tier.chat) > VIEWPORT_TIER_TOLERANCE_PX) {
    reasons.push(`第二轨（会话栏）期望 ${tier.chat}px，实测 ${measured.conversationTrack}px`);
  }
  const sum = measured.firstTrack + measured.conversationTrack + measured.rightbarTrack;
  if (Math.abs(sum - tier.viewport) > VIEWPORT_TIER_TOLERANCE_PX) {
    reasons.push(`三列之和 ${sum}px 未占满 ${tier.viewport}px 视口`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** 判定单个缩放档位的右栏（第三轨）等于该档 rightbar，容差 ±2px。 */
export function judgeViewportTierRightbar(measured, tier) {
  const reasons = [];
  if (Math.abs(measured.rightbarTrack - tier.rightbar) > VIEWPORT_TIER_TOLERANCE_PX) {
    reasons.push(`右栏（第三轨）期望 ${tier.rightbar}px，实测 ${measured.rightbarTrack}px`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** 判定缩放过渡：切换前中栏等于上一档、切换后等于本档，容差 ±2px。 */
export function judgeViewportResize({ before, expectedBefore, after, expectedAfter }) {
  const reasons = [];
  if (Math.abs(before - expectedBefore) > VIEWPORT_TIER_TOLERANCE_PX) {
    reasons.push(`缩放前中栏期望 ${expectedBefore}px，实测 ${before}px`);
  }
  if (Math.abs(after - expectedAfter) > VIEWPORT_TIER_TOLERANCE_PX) {
    reasons.push(`缩放后中栏期望 ${expectedAfter}px，实测 ${after}px`);
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * 夹具未失真的判定：第二轨的宽度必须出自生产 CSS 的钉宽规则，而不是夹具自己写死的栅格。
 *
 * 夹具 authored 栅格刻意写成 `${rail}px minmax(0px, 1fr) ${stage - chat}px` —— 中轨是弹性值，
 * 若生产规则没命中，它会被撑成「视口 − 左栏 − 右栏」；只有 `PRODUCT_STAGE_CHROME` 里那条
 * `:has([data-sidebar-right-panel][data-sidebar-right-open])` 规则能把第二轨钉成
 * `var(--omnimux-conversation-width)`。因此这里同时校验两件事：
 * (1) authored 栅格第二轨仍是弹性值（说明实测的 chat 不可能是从栅格读回来的）；
 * (2) 页面内生产模块自算的 chat 与实测第二轨一致（说明这个值确实出自页面里的生产算法）。
 */
export function judgeViewportTierProductionPinned({ measured, bridge, authoredGrid }) {
  const reasons = [];
  // 注意：`\)` 后面不能加 `\b` —— 右括号与紧随的空格都是非单词字符，之间不存在单词边界。
  if (!/\bminmax\(0px,\s*1fr\)/.test(String(authoredGrid || ''))) {
    reasons.push(`夹具 authored 栅格第二轨不是弹性值，测到的宽度可能是读回来的：${authoredGrid}`);
  }
  if (!bridge || typeof bridge.chat !== 'number') {
    reasons.push('页面内比例桥未返回自算的会话栏宽度');
  } else if (Math.abs(bridge.chat - measured.conversationTrack) > VIEWPORT_TIER_TOLERANCE_PX) {
    reasons.push(
      `页面内生产算法自算 ${bridge.chat}px 与实测第二轨 ${measured.conversationTrack}px 不一致`,
    );
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * 等待夹具页面内的比例桥就绪。
 *
 * `<script type="module">` 是异步执行的：路由 404、导出名写错、模块语法坏掉时桥永远不会出现。
 * 这里必须轮询到超时上限并判 FAIL，绝不静默跳过——否则「页面根本没跑生产算法」会被伪装成
 * 「档位测量通过」。
 */
async function waitForRatioBridge(evaluate, timeoutMs = 4000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ready = await evaluate('Boolean(window.__omnimuxRatio && window.__omnimuxRatio.ready === true)');
    if (ready === true) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** 等一帧（双 rAF）并留一点沉降时间，确保缩放后的布局已经落定再测。 */
async function waitForLayoutFrame(evaluate) {
  await evaluate(
    'new Promise(function (done) { requestAnimationFrame(function () { requestAnimationFrame(function () { done(true); }); }); })',
  );
  await new Promise((r) => setTimeout(r, 120));
}

/** 只留档三列轨道与元素宽度，避免把整个 measure() 结果（含内部字段）写进证据。 */
function pickTracks(measured) {
  return {
    viewport: measured.viewport,
    firstTrack: measured.firstTrack,
    conversationTrack: measured.conversationTrack,
    rightbarTrack: measured.rightbarTrack,
    conversation: measured.conversation,
    rightbar: measured.rightbar,
    conversationVar: measured.conversationVar,
  };
}

/**
 * 夹具页面内运行生产比例算法的桥（`<script type="module">`）。
 *
 * 为什么必须让页面自己跑生产算法，而不是 Node 算好再喂进来：
 * 本段断言的对象是「生产 CSS 把第二轨钉在 `--omnimux-conversation-width` 上」，而该变量的值
 * 在生产里由 `conversation-ratio.js` 依**当前视口**算出。若由 Node 预先算好写死，缩放档位就
 * 退化成「把 Node 的算术结果读回来」：既测不到视口变化后的重算，也测不到生产模块能否在浏览器
 * 里被加载执行（模块语法、导出名、纯函数语义任一坏掉都看不出来）。
 * 因此这里把生产模块原文按 `/conversation-ratio.js` 路由送进页面 `import`，
 * 页面用 `document.documentElement.clientWidth` 当视口自己算、自己写变量。
 *
 * 桥是**惰性**的：加载时只注册自己，不碰夹具状态——前面的收起/往返/反向对照各段都在
 * 「外壳 authored 栅格为准」的前提下测量，必须等到缩放档位段调用 `arm()` 才武装三分栏展开态。
 */
const RATIO_BRIDGE_SCRIPT = `<script type="module">
import {
  CONVERSATION_RATIO_DEFAULT,
  conversationStageWidthPx,
  conversationWidthFromRatio,
} from '${CONVERSATION_RATIO_ROUTE}';

const RAIL_PX = ${FIXTURE_SIDEBAR_PX};
let armed = false;

// 页面自己算：视口取自 document.documentElement.clientWidth，左栏 280，其余全走生产纯函数。
function apply() {
  const root = document.documentElement;
  const frame = document.getElementById('frame');
  const viewport = root.clientWidth;
  const stage = conversationStageWidthPx({ viewportWidth: viewport, railVisiblePx: RAIL_PX });
  const chat = conversationWidthFromRatio(stage, CONVERSATION_RATIO_DEFAULT);
  const rightbar = stage - chat;
  root.style.setProperty('--omnimux-conversation-width', chat + 'px');
  root.style.setProperty('--omnimux-sidebar-width', RAIL_PX + 'px');
  // 外壳 authored 栅格：宿主每帧按当前列宽重写；中轨刻意留弹性值，
  // 这样实测到的第二轨只可能来自生产 CSS 的钉宽规则（见 judgeViewportTierProductionPinned）。
  frame.style.gridTemplateColumns = RAIL_PX + 'px minmax(0px, 1fr) ' + rightbar + 'px';
  window.__omnimuxRatio.last = {
    viewport: viewport,
    rail: RAIL_PX,
    stage: stage,
    chat: chat,
    rightbar: rightbar,
    authoredGrid: frame.style.gridTemplateColumns,
  };
  return window.__omnimuxRatio.last;
}

// 武装三分栏展开态：清掉全部收起标记 + 让右侧栏带上 :has() 命中所需的两个属性。
// 为什么必须让 :has() 命中：PRODUCT_STAGE_CHROME 里只有
// :has([data-sidebar-right-panel][data-sidebar-right-open]) 这条三分栏规则会把第二轨钉成
// var(--omnimux-conversation-width)；不命中就只剩夹具 authored 的弹性栅格，
// 测到的中栏会变成「视口 − 左栏 − 右栏」，比例档位等于没测。
function arm() {
  const root = document.documentElement;
  root.removeAttribute('data-omnimux-left-collapsed');
  root.removeAttribute('data-omnimux-conversation-collapsed');
  const frame = document.getElementById('frame');
  frame.removeAttribute('data-sidebar-collapsed');
  frame.removeAttribute('data-rightbar-collapsed');
  frame.removeAttribute('data-details-collapsed');
  const right = document.getElementById('rightbar');
  right.setAttribute('data-sidebar-right-panel', '');
  right.setAttribute('data-sidebar-right-open', '');
  // 反向对照段停用过生产样式，这里必须恢复，否则测到的是夹具自己的行内栅格。
  const production = document.getElementById('qa-production');
  if (production) production.disabled = false;
  const legacy = document.getElementById('qa-legacy');
  if (legacy) legacy.remove();
  armed = true;
  return apply();
}

window.__omnimuxRatio = { ready: true, apply: apply, arm: arm, last: null };
window.addEventListener('resize', function () { if (armed) apply(); });
</script>`;

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
${RATIO_BRIDGE_SCRIPT}
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
  // 页面内 import 的生产模块原文：路由送出的就是这份文本，抽取不到即失败。
  const ratioModuleSource = readFileSync(join(REPO_ROOT, CONVERSATION_RATIO_SOURCE_PATH), 'utf8');
  assert.ok(
    ratioModuleSource.includes('export function conversationWidthFromRatio'),
    '比例真源未导出 conversationWidthFromRatio，门禁拒绝放行',
  );
  assert.ok(
    ratioModuleSource.includes('export const CONVERSATION_RATIO_DEFAULT'),
    '比例真源缺少默认比例常量，门禁拒绝放行',
  );
  const chromeCss = extractProductStageChrome(chromeSource);

  const evidenceDir = join(REPO_ROOT, 'docs', 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const profileDir = join(REPO_ROOT, 'tmp', `three-column-qa-chrome-${process.pid}-${runId.slice(0, 8)}`);

  const report = {
    runId,
    scenario: 'three-column-collapse',
    startedAt: new Date().toISOString(),
    sourcePaths: [
      COLLAPSE_STYLE_SOURCE_PATH,
      COLLAPSE_GEOMETRY_SOURCE_PATH,
      CONVERSATION_RATIO_SOURCE_PATH,
    ],
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
    server = http.createServer((req, res) => {
      // 生产比例模块按**原文**送出：页面里 `import` 的就是生产文件本身，不是脚本内的副本。
      if (String(req.url).split('?')[0] === CONVERSATION_RATIO_ROUTE) {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(ratioModuleSource);
        return;
      }
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

    // ---- 缩放档位：CDP 真实视口切换 × 页面内跑生产比例算法（Issue #2608） ----
    // 本段必须放在最后：它会武装三分栏展开态（让 :has() 命中）并改写视口。前面的收起/往返/
    // 反向对照各段都在「外壳 authored 栅格为准」的前提下测量，不能被本段污染。
    report.viewportTiers = [];
    const bridgeReady = await waitForRatioBridge(evaluate);
    add('viewport-tier-bridge-ready', bridgeReady, {
      reasons: bridgeReady
        ? []
        : ['等待 window.__omnimuxRatio 就绪超时（页面内生产模块未加载成功）'],
    });
    if (!bridgeReady) {
      throw new Error(
        '页面内比例桥未就绪：window.__omnimuxRatio 超时未出现，缩放档位验收无法执行',
      );
    }

    const armed = await evaluate(`(() => { ${MEASURE_FN}
      window.__omnimuxRatio.arm();
      return { bridge: window.__omnimuxRatio.last, measured: measure() };
    })()`);
    report.viewportTierArm = { bridge: armed.bridge, measured: pickTracks(armed.measured) };

    let previousTier = null;
    for (const tier of VIEWPORT_TIERS) {
      // 缩放前快照：此刻视口仍是上一档（首档为夹具初始视口），用于「缩放过渡」断言。
      const before = await evaluate(`(() => { ${MEASURE_FN} return measure(); })()`);
      await sendCdp('Emulation.setDeviceMetricsOverride', {
        width: tier.viewport,
        height: VIEWPORT_TIER_HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForLayoutFrame(evaluate);
      const after = await evaluate(`(() => { ${MEASURE_FN}
        const bridge = window.__omnimuxRatio.apply();
        return { bridge, measured: measure() };
      })()`);

      const tierVerdict = judgeViewportTier(after.measured, tier);
      const rightbarVerdict = judgeViewportTierRightbar(after.measured, tier);
      const pinnedVerdict = judgeViewportTierProductionPinned({
        measured: after.measured,
        bridge: after.bridge,
        authoredGrid: after.measured.frameTrackStyle,
      });
      const trackSum =
        after.measured.firstTrack + after.measured.conversationTrack + after.measured.rightbarTrack;

      report.viewportTiers.push({
        key: `viewport-tier-${tier.viewport}`,
        viewport: tier.viewport,
        note: tier.note,
        rail: tier.rail,
        expected: {
          stage: tier.stage,
          chat: tier.chat,
          rightbar: tier.rightbar,
          source: 'conversationWidthFromRatio(viewport - rail, CONVERSATION_RATIO_DEFAULT)',
        },
        bridge: after.bridge,
        authoredGrid: after.measured.frameTrackStyle,
        before: pickTracks(before),
        after: pickTracks(after.measured),
        trackSum,
        pass: tierVerdict.pass && rightbarVerdict.pass && pinnedVerdict.pass,
        reasons: [...tierVerdict.reasons, ...rightbarVerdict.reasons, ...pinnedVerdict.reasons],
      });

      add(`viewport-tier-${tier.viewport}`, tierVerdict.pass, {
        viewport: tier.viewport,
        expectedChat: tier.chat,
        measuredChat: after.measured.conversationTrack,
        trackSum,
        reasons: tierVerdict.reasons,
      });
      add(`viewport-tier-${tier.viewport}-rightbar`, rightbarVerdict.pass, {
        viewport: tier.viewport,
        expectedRightbar: tier.rightbar,
        measuredRightbar: after.measured.rightbarTrack,
        reasons: rightbarVerdict.reasons,
      });
      add(`viewport-tier-${tier.viewport}-production-pinned`, pinnedVerdict.pass, {
        authoredGrid: after.measured.frameTrackStyle,
        bridgeChat: after.bridge?.chat,
        measuredChat: after.measured.conversationTrack,
        reasons: pinnedVerdict.reasons,
      });

      if (previousTier) {
        const resizeVerdict = judgeViewportResize({
          before: before.conversationTrack,
          expectedBefore: previousTier.chat,
          after: after.measured.conversationTrack,
          expectedAfter: tier.chat,
        });
        add(`viewport-resize-${previousTier.viewport}-to-${tier.viewport}`, resizeVerdict.pass, {
          before: before.conversationTrack,
          after: after.measured.conversationTrack,
          expectedBefore: previousTier.chat,
          expectedAfter: tier.chat,
          reasons: resizeVerdict.reasons,
        });
      }
      previousTier = tier;
    }

    // ---- 缩放档位证据截图：回到最宽档（大屏按比例分账）留档，沿用既有截图写法 ----
    const widestTier = VIEWPORT_TIERS.reduce((a, b) => (b.viewport > a.viewport ? b : a));
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: widestTier.viewport,
      height: VIEWPORT_TIER_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await waitForLayoutFrame(evaluate);
    await evaluate('window.__omnimuxRatio.apply()');
    const tierShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const tierShotBuf = Buffer.from(tierShot.result.data, 'base64');
    const tierShotPath = join(evidenceDir, 'three-column-collapse-viewport-tiers.png');
    writeFileSync(tierShotPath, tierShotBuf);
    const tierPng = PNG.sync.read(tierShotBuf);
    report.viewportTierScreenshot = {
      path: tierShotPath,
      viewport: widestTier.viewport,
      width: tierPng.width,
      height: tierPng.height,
      bytes: tierShotBuf.length,
    };
    add('viewport-tier-screenshot-captured', tierPng.width > 0 && tierPng.height > 0, report.viewportTierScreenshot);

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
    console.log(
      '✅ 缩放档位：' +
        report.viewportTiers
          .map((t) => `${t.viewport}→${t.after.conversationTrack}`)
          .join(' / ') +
        `（±${VIEWPORT_TIER_TOLERANCE_PX}px）`,
    );
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
