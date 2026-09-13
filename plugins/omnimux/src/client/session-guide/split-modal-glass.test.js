import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { GUIDE_CSS } from './styles.js'

/**
 * 分栏弹窗（SplitModalDialog）右侧雾面毛玻璃契约。
 *
 * 契约基线：右侧是「24px 高斯雾化 + 82% 微透」，既透出底层页面，又守住表单文字/输入框可读性；
 * 容器自身不得再铺实色，否则右侧透出来的只是容器自己的灰底，看不见底层网页。
 * 暗色主题用用户确认的 82% 微透暗色，未打暗色标记时退回宿主浮层底色派生的玻璃，避免深色文字压在深色玻璃上。
 */

let cachedSheet = null

function loadSheet() {
  if (cachedSheet) return cachedSheet
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const style = dom.window.document.createElement('style')
  style.setAttribute('id', 'omnimux-session-guide-style')
  style.textContent = GUIDE_CSS
  dom.window.document.head.appendChild(style)
  cachedSheet = style.sheet
  assert.ok(cachedSheet, '注入的 <style> 必须暴露 CSSStyleSheet')
  assert.ok(cachedSheet.cssRules.length > 0, 'GUIDE_CSS 必须解析为真实 CSS 规则')
  return cachedSheet
}

function ruleFor(selector) {
  const rules = [...loadSheet().cssRules]
  const exact = rules.find((rule) => (rule.selectorText || '') === selector)
  if (exact) return exact
  const grouped = rules.find((rule) => (rule.selectorText || '').split(',').map((part) => part.trim()).includes(selector))
  assert.ok(grouped, `缺少 ${selector} 的样式规则`)
  return grouped
}

/** CSSOM 会丢弃 backdrop-filter 一类属性，语义断言之外还需要按源码文本核对（先剥注释再取声明块）。 */
const sourceWithoutComments = GUIDE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')

function declarationsOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = sourceWithoutComments.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))
  assert.ok(block, `缺少 ${selector} 的样式声明块`)
  return block[1]
}

function declared(selector, property) {
  const match = declarationsOf(selector).match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'))
  assert.ok(match, `${selector} 缺少 ${property} 声明`)
  return match[1].trim()
}

test('split modal: 右侧面板消费 24px 高斯雾化 + 82% 微透', () => {
  assert.equal(declared('.omnimux-split-modal-right', 'background'), 'var(--omnimux-surface-glass, var(--omnimux-surface-dialog))')
  assert.equal(declared('.omnimux-split-modal-right', 'backdrop-filter'), 'var(--omnimux-surface-glass-filter, blur(24px) saturate(160%))')
  assert.equal(declared('.omnimux-split-modal-right', '-webkit-backdrop-filter'), 'var(--omnimux-surface-glass-filter, blur(24px) saturate(160%))')
})

test('split modal: 毛玻璃 Token 挂在 :root，portal 到 body 的弹窗也取得到', () => {
  assert.equal(declared(':root', '--omnimux-surface-glass'), 'color-mix(in srgb, var(--dsw-alias-bg-layer-2, #2c2c2e) 82%, transparent)')
  assert.equal(declared(':root', '--omnimux-surface-glass-filter'), 'blur(24px) saturate(160%)')
  assert.doesNotMatch(declarationsOf(':root'), /--omnimux-surface-glass\s*:\s*rgba\(/, '默认值必须是主题自适应的玻璃，不能锁死深色')
})

test('split modal: 暗色主题用确认过的 82% 微透暗色', () => {
  assert.equal(declared('body[data-ds-dark-theme]', '--omnimux-surface-glass'), 'rgba(20, 22, 30, 0.82)')
})

test('split modal: 容器不铺实色，左栏保持实底可读性', () => {
  assert.equal(ruleFor('.omnimux-split-modal-container').style.getPropertyValue('background'), 'transparent')
  assert.equal(ruleFor('.omnimux-split-modal-left').style.getPropertyValue('background'), 'var(--dsw-alias-bg-layer-1)')
})
