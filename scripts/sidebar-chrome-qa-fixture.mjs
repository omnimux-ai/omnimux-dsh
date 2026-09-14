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
