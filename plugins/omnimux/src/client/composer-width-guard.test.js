import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  COMPOSER_ADAPTIVE_CEILING_PX,
  COMPOSER_ADAPTIVE_FLOOR_PX,
  COMPOSER_WIDTH_PREF_KEY,
  guardComposerWidthPreference,
  isStaleWidthPreference,
  resolveAdaptiveContentWidth,
} from './composer-width-guard.js'

/** 原生公式：max(680, min(列宽 × 0.64, 920))。 */
test('resolveAdaptiveContentWidth 与原生公式逐点一致', () => {
  assert.equal(resolveAdaptiveContentWidth(600), COMPOSER_ADAPTIVE_FLOOR_PX, '窄列落在地板 680')
  assert.equal(resolveAdaptiveContentWidth(0), COMPOSER_ADAPTIVE_FLOOR_PX, '无几何信息时不得低于地板')
  assert.equal(resolveAdaptiveContentWidth(1200), 768, '1200 × 0.64 = 768')
  assert.equal(resolveAdaptiveContentWidth(1437.5), COMPOSER_ADAPTIVE_CEILING_PX, '到达上限 920')
  assert.equal(resolveAdaptiveContentWidth(4000), COMPOSER_ADAPTIVE_CEILING_PX, '超宽列封顶 920')
})

test('isStaleWidthPreference 只判越界，合法区间内的偏好必须保留', () => {
  // 列宽 1200 → 自适应上限 768
  assert.equal(isStaleWidthPreference(null, 1200), false, '没有偏好不算越界')
  assert.equal(isStaleWidthPreference('', 1200), false)
  assert.equal(isStaleWidthPreference('640', 1200), false, '原生下限内保留')
  assert.equal(isStaleWidthPreference('768', 1200), false, '正好等于上限保留')
  assert.equal(isStaleWidthPreference('920.6796875', 1200), true, '实测残留偏好必须判越界')
  assert.equal(isStaleWidthPreference('abc', 1200), true, '写坏的值必须清掉')
  assert.equal(isStaleWidthPreference('-5', 1200), true, '非法值必须清掉')
})

/**
 * 带 localStorage 与可测量会话列的夹具。
 * @param {string | null} stored 存档原文
 * @param {number} columnWidth 会话列实测宽度
 */
function fixture(stored, columnWidth) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopConversationSurface"><div data-conversation-scroll></div></div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  const win = dom.window
  if (stored !== null) win.localStorage.setItem(COMPOSER_WIDTH_PREF_KEY, stored)
  const column = win.document.querySelector('[data-conversation-scroll]')
  column.getBoundingClientRect = () => ({ left: 280, right: 280 + columnWidth, top: 0, bottom: 900, width: columnWidth, height: 900 })
  return win
}

test('越界偏好被清除，让原生自适应复位', () => {
  const win = fixture('920.6796875', 1200)
  const result = guardComposerWidthPreference(win)
  assert.equal(result.cleared, true, '越界必须清除')
  assert.equal(result.value, '920.6796875')
  assert.equal(win.localStorage.getItem(COMPOSER_WIDTH_PREF_KEY), null, '键必须真的删掉')
})

test('合法偏好一律不动，原生宽度手柄的调整必须保留', () => {
  const win = fixture('700', 1200)
  const result = guardComposerWidthPreference(win)
  assert.equal(result.cleared, false, '合法值不得清除')
  assert.equal(win.localStorage.getItem(COMPOSER_WIDTH_PREF_KEY), '700')
})

test('列宽变宽后，原本合法的偏好若越界也会被纠正（防复发）', () => {
  // 宽列（上限 920）下 900 合法
  const wide = fixture('900', 2000)
  assert.equal(guardComposerWidthPreference(wide).cleared, false)
  // 列收窄（1200 → 上限 768）后同一个值已越界
  const narrow = fixture('900', 1200)
  assert.equal(guardComposerWidthPreference(narrow).cleared, true, '列宽变化后必须复检')
})

test('量不到列宽时放弃判断，绝不误删用户偏好', () => {
  const win = fixture('920.6796875', 0)
  const result = guardComposerWidthPreference(win)
  assert.equal(result.cleared, false)
  assert.equal(win.localStorage.getItem(COMPOSER_WIDTH_PREF_KEY), '920.6796875', '无几何信息时不得动手')
})
