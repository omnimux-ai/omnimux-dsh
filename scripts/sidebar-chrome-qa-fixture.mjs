#!/usr/bin/env node
/**
 * @file scripts/sidebar-chrome-qa-fixture.mjs
 * @description 右侧栏 chrome 隔离验收的夹具、被测样式抽取与几何裁决（纯函数，可单测）
 *
 * 边界：
 * - 夹具页只负责摆出「真实结构与真实数值」，**不得包含任何修复规则字面量**；
 * - 被测样式一律从生产源码抽取（`extractRightbarChromeStyles`），抽取不到即失败；
 * - 裁决逻辑与浏览器解耦，便于反向用例在无浏览器环境下也能跑。
 *
 * 规格：specs/sidebar-chrome-geometry-gate.spec.md（工单 #1638）
 */

import assert from 'node:assert/strict'

/** 被测样式的生产真源。 */
export const SIDEBAR_CHROME_SOURCE_PATH = 'plugins/omnimux/src/client/sidebar-toggle-topbar.js'

/** 生产源码中的样式常量锚点。 */
const STYLE_ANCHOR = 'RIGHTBAR_CHROME_STYLES = `'

/** 修复后顶栏应有的高度（CSS 像素）。 */
export const EXPECTED_STRIP_HEIGHT = 40
/** 修复后顶栏应有的内边距。 */
export const EXPECTED_STRIP_PADDING = '6px 6px 6px 10px'
/** 修复后选项卡应有的上下位置。 */
export const EXPECTED_TAB_TOP = 6
export const EXPECTED_TAB_BOTTOM = 34
/** 修复后内容区应有的顶边。 */
export const EXPECTED_PANE_BODY_TOP = 40
/** 修复后应有的安全间距。 */
export const EXPECTED_GAP = 6

/**
 * 从生产源码文本中抽取右侧栏 chrome 样式。
 * 抽取失败必须抛错——源码删掉该规则即应让门禁变红。
 * @param {string} sourceText
 * @returns {string} 解码后的 CSS 文本
 */
export function extractRightbarChromeStyles(sourceText) {
  assert.equal(typeof sourceText, 'string', '源码文本必须是字符串')
  const start = sourceText.indexOf(STYLE_ANCHOR)
  assert.ok(start >= 0, `生产源码中未找到样式常量锚点：${STYLE_ANCHOR}`)
  const bodyStart = start + STYLE_ANCHOR.length
  const end = sourceText.indexOf('`', bodyStart)
  assert.ok(end > bodyStart, '生产源码中的样式模板字面量未闭合')
  const raw = sourceText.slice(bodyStart, end)
  assert.ok(raw.includes('[data-dockkit-strip]'), '抽取结果缺少 [data-dockkit-strip] 选择器')
  // 还原产物/源码中的 \uXXXX 转义（中文注释）
  return raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * 夹具页：镜像 ui-dockkit 真实数值 + 宿主全局 border-box 复位。
 *
 * 这里刻意**不含**任何修复规则——补丁只能由 `extractRightbarChromeStyles`
 * 从生产源码抽取后注入，避免「夹具自带答案」的自证式假绿。
 * @param {string} title
 * @returns {string}
 */
export function buildSidebarChromeHarnessHtml(title = '右侧栏 chrome 几何门禁') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  /* 缺陷真正成因：宿主全局 preflight 把所有元素改为 border-box */
  *, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; }
  html, body { margin: 0; padding: 0; background: #0d0d0f; }
  /* 以下数值镜像 ui-dockkit 的 dockkit.module.css 原值，非修复规则 */
  .qa-pane { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; height: 360px; background: #0d0d0f; }
  ._tabStrip_qa { display: flex; flex: none; gap: 4px; align-items: center; height: 28px; padding: 10px 6px 0 10px; touch-action: none; background: #0d0d0f; }
  ._tab_qa { position: relative; display: flex; flex: 0 1 auto; align-items: center; min-width: 80px; max-width: 170px; height: 28px; padding: 0 10px; color: #a1a1aa; font-size: 13px; line-height: 1; white-space: nowrap; border-radius: 12px; }
  ._tabActive_qa { color: #f4f4f5; background: #2c2c2e; }
  ._paneBody_qa { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; background: #0d0d0f; }
  .qa-page-header { padding: 12px 20px; min-height: 56px; }
  .qa-page-title { font-size: 20px; font-weight: 600; line-height: 28px; color: #f4f4f5; margin: 0; }
</style>
</head>
<body>
  <section class="qa-pane" id="qa-pane">
    <div class="_tabStrip_qa" id="qa-strip" data-dockkit-strip>
      <div class="_tab_qa _tabActive_qa" id="qa-tab" data-dockkit-tab="omnimux-products:library">
        <span>产品库</span>
      </div>
    </div>
    <div class="_paneBody_qa" id="qa-pane-body" data-dockkit-pane-body>
      <div class="qa-page-header">
        <h1 class="qa-page-title">商品与产品库</h1>
      </div>
    </div>
  </section>
</body>
</html>`
}

/** 页面内测量表达式（返回 JSON 字符串，便于 returnByValue 读取）。 */
export function sidebarChromeMeasureExpression() {
  return `(function () {
    var strip = document.getElementById('qa-strip');
    var tab = document.getElementById('qa-tab');
    var body = document.getElementById('qa-pane-body');
    if (!strip || !tab || !body) {
      return JSON.stringify({ error: 'fixture-missing' });
    }
    var rS = strip.getBoundingClientRect();
    var rT = tab.getBoundingClientRect();
    var rB = body.getBoundingClientRect();
    var cs = window.getComputedStyle(strip);
    return JSON.stringify({
      stripHeight: Math.round(rS.height * 100) / 100,
      stripBoxSizing: cs.boxSizing,
      stripPadding: cs.padding,
      tabHeight: Math.round(rT.height * 100) / 100,
      tabTop: Math.round(rT.top * 100) / 100,
      tabBottom: Math.round(rT.bottom * 100) / 100,
      paneBodyTop: Math.round(rB.top * 100) / 100,
      gap: Math.round((rB.top - rT.bottom) * 100) / 100,
      tabCoveredByContent: rB.top < rT.bottom
    });
  })()`
}

/**
 * 反向对照裁决：未注入被测样式时**必须复现缺陷**。
 * 夹具失真（例如被误当成已经修好）时这里会失败，防止「永远绿」。
 * @param {{ stripHeight:number, tabBottom:number, paneBodyTop:number, gap:number, tabCoveredByContent:boolean }} m
 * @returns {{ name:string, pass:boolean, detail?:unknown }[]}
 */
export function interpretNegativeControl(m) {
  return [
    { name: 'negative-control:strip-height-28', pass: m.stripHeight === 28, detail: m.stripHeight },
    { name: 'negative-control:tab-covered', pass: m.tabCoveredByContent === true, detail: m.tabCoveredByContent },
    { name: 'negative-control:gap-negative', pass: m.gap < 0, detail: m.gap },
  ]
}

/**
 * 正向裁决：注入被测样式后必须全部归位。
 * @param {Record<string, unknown>} m
 * @returns {{ name:string, pass:boolean, detail?:unknown }[]}
 */
export function interpretSidebarChromeGeometry(m) {
  return [
    { name: 'strip-height-expected', pass: m.stripHeight === EXPECTED_STRIP_HEIGHT, detail: m.stripHeight },
    { name: 'strip-box-sizing-border-box', pass: m.stripBoxSizing === 'border-box', detail: m.stripBoxSizing },
    { name: 'strip-padding-standard', pass: m.stripPadding === EXPECTED_STRIP_PADDING, detail: m.stripPadding },
    {
      name: 'tab-fits-inside-strip',
      pass: m.tabTop === EXPECTED_TAB_TOP && m.tabBottom === EXPECTED_TAB_BOTTOM,
      detail: { top: m.tabTop, bottom: m.tabBottom },
    },
    { name: 'content-starts-below-strip', pass: m.paneBodyTop === EXPECTED_PANE_BODY_TOP, detail: m.paneBodyTop },
    { name: 'positive-breathing-gap', pass: m.gap === EXPECTED_GAP, detail: m.gap },
    { name: 'tab-not-covered-by-content', pass: m.tabCoveredByContent === false, detail: m.tabCoveredByContent },
  ]
}

/**
 * 判定一次右侧栏 chrome 验收是否整体通过。
 * @param {{ negative: object[], positive: object[] }} input
 * @returns {{ pass:boolean, failed:string[] }}
 */
export function judgeSidebarChromeRun({ negative, positive }) {
  const all = [...negative, ...positive]
  const failed = all.filter((a) => !a.pass).map((a) => a.name)
  return { pass: failed.length === 0, failed }
}

/* ============================================================================
 * 右上角「收起/展开右侧边栏」落点门禁（工单 #1664）
 * ==========================================================================*/

/** 被测源码在验收页里的唯一正式模块地址（页面按此 import 生产模块，不复制逻辑）。 */
export const RIGHTBAR_SEAT_MODULE_URL = '/src/client/sidebar-toggle-topbar.js'

/** 框架标题行自带的行内间距（utilities gap / corner margin-left）。 */
export const EXPECTED_SEAT_GAP = 8
/** 图标按钮边长（框架 iconButton 尺寸）。 */
export const EXPECTED_SEAT_SIZE = 28
/** 旧实现写死的最右/最上偏移——反向对照必须复现压住相邻控件。 */
export const LEGACY_PIN_RIGHT = 8
export const LEGACY_PIN_TOP = 5

/**
 * 落点门禁夹具页：按开发版实测几何复刻外壳标题行。
 *
 * 视口 1728、标题行 left 300 / width 1400（右端距窗口 28）、utilities 组自带
 * `gap:8px; margin-left:20px`、corner 空槽位自带 `margin-left:8px; margin-right:-16px`
 * ——全部是外壳原值，夹具不含任何修复规则；被测行为只由页面 import 的生产模块产生。
 * @param {string} [title]
 * @returns {string}
 */
export function buildRightbarSeatHarnessHtml(title = '右上角收起态落点门禁') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  *, ::before, ::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0d0d0f; color: #f4f4f5; font: 13px/1.4 system-ui, sans-serif; }
  .shell-header { position: relative; height: 50px; }
  /* 开发版实测：标题行 left=300 / width=1400（1728 视口，右端留 28） */
  .shell-title-row { position: absolute; left: 300px; top: 10px; width: 1400px; height: 30px; display: flex; align-items: center; }
  .shell-title-cluster { display: flex; flex: 1 1 0%; min-width: 0; align-items: center; gap: 10px; }
  .crumbs { color: #a1a1aa; }
  .shell-header-utilities { display: flex; flex: none; align-items: center; gap: 8px; margin-left: 20px; }
  .finder-split { display: flex; align-items: stretch; }
  .icon-button { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 6px; background: #232326; color: #f4f4f5; }
  .caret-button { width: 22px; height: 28px; display: flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 0 6px 6px 0; background: #232326; color: #a1a1aa; }
  .glyph { display: block; width: 15px; height: 15px; border-radius: 4px; background: #3b82f6; }
  .glyph-caret { display: block; width: 8px; height: 8px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
  .glyph-panel { display: block; width: 16px; height: 12px; border: 1.5px solid currentColor; border-radius: 2px; }
  .shell-header-corner { display: flex; flex: none; align-items: center; margin-left: 8px; margin-right: -16px; }
  [data-dockkit-strip-chrome] { display: none; }
</style>
</head>
<body>
  <div class="dshDesktopFrame" data-rightbar-collapsed="true">
    <header class="shell-header">
      <div class="shell-title-row">
        <div class="shell-title-cluster"><nav class="crumbs">会话标题</nav></div>
        <div class="shell-header-utilities">
          <div class="finder-split">
            <button type="button" class="icon-button" aria-label="在 访达 中打开工作目录"><span class="glyph"></span></button>
            <button type="button" class="caret-button" aria-label="选择打开方式"><span class="glyph-caret"></span></button>
          </div>
        </div>
        <div class="shell-header-corner" data-conversation-header-corner="">
          <div data-slot="conversation.session.header.corner" style="display: contents;"></div>
        </div>
      </div>
    </header>
    <div data-dockkit-strip-chrome="true">
      <button type="button" class="icon-button" data-sidebar-right-toggle aria-label="收起右侧边栏"><span class="glyph-panel"></span></button>
    </div>
  </div>
  <script type="module">
    import { syncNativeRightbarControls } from '${RIGHTBAR_SEAT_MODULE_URL}'
    window.__qaSyncRightbarSeat = () => syncNativeRightbarControls(document)
    window.__qaRightbarSeatReady = true
  </script>
</body>
</html>`
}

/** 复现旧实现的写死固定定位（反向对照用，与旧代码逐字等价）。 */
export function legacyPinExpression() {
  return `(function () {
    var btn = document.querySelector('button[data-sidebar-right-toggle]');
    if (!btn) return JSON.stringify({ error: 'no-native-toggle' });
    btn.dataset.originalParent = '_stripChrome';
    document.body.appendChild(btn);
    btn.style.setProperty('position', 'fixed', 'important');
    btn.style.setProperty('right', '${LEGACY_PIN_RIGHT}px', 'important');
    btn.style.setProperty('top', '${LEGACY_PIN_TOP}px', 'important');
    btn.style.setProperty('z-index', '9999', 'important');
    btn.style.setProperty('display', 'flex', 'important');
    btn.style.setProperty('visibility', 'visible', 'important');
    btn.style.setProperty('cursor', 'pointer', 'important');
    btn.style.setProperty('pointer-events', 'auto', 'important');
    return JSON.stringify({ ok: true });
  })()`
}

/** 调用生产模块的同步函数（正向：真实实现，非夹具补丁）。 */
export function runProductionSeatExpression() {
  return `(function () {
    if (typeof window.__qaSyncRightbarSeat !== 'function') {
      return JSON.stringify({ error: 'production-module-not-loaded' });
    }
    window.__qaSyncRightbarSeat();
    return JSON.stringify({ ok: true });
  })()`
}

/** 落点几何测量表达式（返回 JSON 字符串）。 */
export function rightbarSeatMeasureExpression() {
  return `(function () {
    var util = document.querySelector('.shell-header-utilities');
    var btn = document.querySelector('button[data-sidebar-right-toggle], button[data-sidebar-right-expand]');
    if (!util || !btn) return JSON.stringify({ error: 'fixture-missing' });
    var rU = util.getBoundingClientRect();
    var rB = btn.getBoundingClientRect();
    var cs = window.getComputedStyle(btn);
    var overlapX = Math.min(rU.right, rB.right) - Math.max(rU.left, rB.left);
    var overlapY = Math.min(rU.bottom, rB.bottom) - Math.max(rU.top, rB.top);
    var round = function (n) { return Math.round(n * 100) / 100; };
    return JSON.stringify({
      viewportWidth: window.innerWidth,
      utilitiesRight: round(rU.right),
      buttonLeft: round(rB.left),
      buttonTop: round(rB.top),
      buttonWidth: round(rB.width),
      buttonHeight: round(rB.height),
      buttonRight: round(rB.right),
      gap: round(rB.left - rU.right),
      overlapArea: round(Math.max(0, overlapX) * Math.max(0, overlapY)),
      overlapX: round(Math.max(0, overlapX)),
      position: cs.position,
      inlineStyle: btn.getAttribute('style') || '',
      parentIsCornerSlot: Boolean(btn.parentElement && btn.parentElement.hasAttribute('data-conversation-header-corner')),
      parentIsBody: btn.parentElement === document.body,
      controlCount: document.querySelectorAll('button[data-sidebar-right-toggle], button[data-sidebar-right-expand]').length
    });
  })()`
}

/**
 * 反向对照裁决：旧写死固定定位**必须**压住相邻 utilities 组。
 * 复现不出压住即判定夹具失真（防止「永远绿」）。
 * @param {Record<string, any>} m
 * @returns {{ name:string, pass:boolean, detail?:unknown }[]}
 */
export function interpretRightbarSeatNegative(m) {
  return [
    { name: 'negative-control:legacy-pin-fixed', pass: m.position === 'fixed', detail: m.position },
    { name: 'negative-control:legacy-pin-overlaps-neighbour', pass: m.overlapArea > 0, detail: { overlapArea: m.overlapArea, gap: m.gap } },
  ]
}

/**
 * 正向裁决：生产实现必须让控件在标题行内与相邻控件留出标准间距、零重叠。
 * @param {Record<string, any>} m
 * @returns {{ name:string, pass:boolean, detail?:unknown }[]}
 */
export function interpretRightbarSeatPositive(m) {
  return [
    { name: 'positive:seated-in-header-corner', pass: m.parentIsCornerSlot === true, detail: m.parentIsCornerSlot },
    { name: 'positive:not-fixed-positioned', pass: m.position !== 'fixed' && !/position:\s*fixed/.test(m.inlineStyle), detail: { position: m.position, inline: m.inlineStyle } },
    { name: 'positive:no-hardcoded-right-offset', pass: !/right:\s*8px/.test(m.inlineStyle), detail: m.inlineStyle },
    { name: 'positive:standard-gap', pass: m.gap === EXPECTED_SEAT_GAP, detail: m.gap },
    { name: 'positive:no-overlap', pass: m.overlapArea === 0, detail: m.overlapArea },
    { name: 'positive:inside-window', pass: m.buttonRight <= m.viewportWidth - 8, detail: { buttonRight: m.buttonRight, viewportWidth: m.viewportWidth } },
    { name: 'positive:icon-size-stable', pass: m.buttonWidth === EXPECTED_SEAT_SIZE && m.buttonHeight === EXPECTED_SEAT_SIZE, detail: { w: m.buttonWidth, h: m.buttonHeight } },
    { name: 'positive:single-control', pass: m.controlCount === 1, detail: m.controlCount },
  ]
}

/**
 * 判定一次右上角落点验收是否整体通过。
 * @param {{ negative: object[], positive: object[] }} input
 * @returns {{ pass:boolean, failed:string[] }}
 */
export function judgeRightbarSeatRun({ negative, positive }) {
  const all = [...negative, ...positive]
  const failed = all.filter((a) => !a.pass).map((a) => a.name)
  return { pass: failed.length === 0, failed }
}
