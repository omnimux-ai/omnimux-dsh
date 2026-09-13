import test from 'node:test'
import assert from 'node:assert/strict'
import { GUIDE_CSS } from '../styles.js'

/**
 * 吸顶栏的回归护栏。
 *
 * 这三条各自对应一种「看不见但很难查」的退化：
 * 1. 少了 `position:sticky` → 页面滚动时头部直接滑走；
 * 2. 少了 `z-index` 或不透明底 → 下方卡片从吸顶栏里透出来，两层文字叠在一起；
 * 3. 少了 `backdrop-filter` → 边沿是硬切的，卡片在毛玻璃位置突然出现。
 *
 * 断言的是声明块原文而不是浏览器计算值：这里没有布局引擎，
 * 真实滚动验收仍以浏览器证据为准。
 */

/**
 * 取出包含 `selector` 的那条规则的声明块（支持一组选择器共用一个声明块）。
 * @param {string} css
 * @param {string} selector
 * @returns {string}
 */
function ruleBody(css, selector) {
  const index = css.indexOf(selector)
  assert.notEqual(index, -1, `样式表里找不到规则：${selector}`)
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  assert.ok(open !== -1 && close !== -1, `规则语法不完整：${selector}`)
  return css.slice(open + 1, close)
}

/** 取出 `.omnimux-trending` 自身的 CSS 变量声明块。 */
function trendingVarBlock(css) {
  return ruleBody(css, '.omnimux-trending {')
}

test('styles: 吸顶栏 sticky + 层级 + 毛玻璃三项齐全', () => {
  const body = ruleBody(GUIDE_CSS, '.omnimux-trending-sticky-header')

  assert.match(body, /position:sticky/, '吸顶栏必须是 sticky，滚动时才钉在视口顶边')
  assert.match(
    body,
    /top:var\(--omnimux-trending-sticky-top\)/,
    '吸附偏移走变量，宿主顶栏自带吸顶条时可让开高度',
  )
  assert.match(body, /z-index:30/, '吸顶层级必须高于卡片')
  assert.match(body, /backdrop-filter:blur\(/, '毛玻璃遮罩不能少')
  assert.match(body, /-webkit-backdrop-filter:blur\(/, 'WebKit 前缀同样不能少')
})

test('styles: 吸顶底色近乎不透明 —— 卡片穿行时不得透字', () => {
  const body = ruleBody(GUIDE_CSS, '.omnimux-trending-sticky-header')
  assert.match(
    body,
    /background:var\(--omnimux-trending-sticky-solid\)/,
    '吸顶底色必须是实心变量，不能用 transparent',
  )

  // 底色变量自身必须由页面主背景 Token 高比例混合而来：
  // 混合比例低于 90% 时，下方卡片的高对比文字会透上来。
  const vars = trendingVarBlock(GUIDE_CSS)
  const solid = vars.match(
    /--omnimux-trending-sticky-solid:color-mix\(in srgb, var\(--dsw-alias-bg-base\) (\d+)%, transparent\)/,
  )
  assert.ok(solid, '--omnimux-trending-sticky-solid 必须基于 --dsw-alias-bg-base 混合')
  assert.ok(Number(solid[1]) >= 90, `吸顶底色不透明度必须 ≥90%，当前 ${solid[1]}%`)

  const fade = vars.match(
    /--omnimux-trending-sticky-fade:color-mix\(in srgb, var\(--dsw-alias-bg-base\) (\d+)%, transparent\)/,
  )
  assert.ok(fade, '--omnimux-trending-sticky-fade 必须基于 --dsw-alias-bg-base 混合')
  // 渐隐层压在卡片之上，太实会变成一道灰条
  assert.ok(Number(fade[1]) <= 92, `渐隐层不透明度必须低于实心层，当前 ${fade[1]}%`)
})

test('styles: 下拉浮层必须压得住吸顶栏', () => {
  const header = ruleBody(GUIDE_CSS, '.omnimux-trending-sticky-header')
  const menu = ruleBody(GUIDE_CSS, '.omnimux-trending-select-menu')
  const headerZ = Number(header.match(/z-index:(\d+)/)[1])
  const menuZ = Number(menu.match(/z-index:(\d+)/)[1])
  assert.ok(
    menuZ > headerZ,
    `工具栏下拉浮层(${menuZ})必须高于吸顶栏(${headerZ})，否则弹层被自己的容器吃掉`,
  )
})

test('styles: 追加批次骨架复用首屏骨架的几何、微光与响应式列数', () => {
  const card = ruleBody(GUIDE_CSS, '.omnimux-trending-feed-skeleton-card')
  assert.match(card, /aspect-ratio:9\/16/, '追加骨架必须与真实卡片同几何，避免追加时跳版')

  const shimmer = ruleBody(GUIDE_CSS, '.omnimux-trending-feed-shimmer')
  assert.match(shimmer, /omnimux-skeleton-shimmer/, '微光动画必须复用既有 keyframes')

  // 列数必须与真实网格同断点演进，否则追加瞬间会横向重排
  for (const width of [640, 880, 1080]) {
    const marker = `@container trending (min-width:${width}px) {`
    assert.ok(GUIDE_CSS.includes(marker), `缺少容器断点 ${width}px`)
    const block = GUIDE_CSS.slice(GUIDE_CSS.indexOf(marker))
    assert.ok(
      block.slice(0, block.indexOf('}')).includes('.omnimux-trending-feed-skeleton'),
      `${width}px 断点里必须同时调整追加骨架的列数`,
    )
  }
})
