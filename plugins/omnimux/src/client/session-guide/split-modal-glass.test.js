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

/** 同一选择器可以出现在多条规则里，单条规则里也能重复声明同一属性；CSS 后者胜，
    所以必须收齐全部声明块并按级联取最后一条。只认首个匹配会把「规则内后置覆盖」和
    「文末再补一条同权重规则」这两类回退直接放行，用例照样全绿、毛玻璃却已经没了。 */
function declarationBlocksOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g')
  const blocks = [...sourceWithoutComments.matchAll(pattern)].map((match) => match[1])
  assert.ok(blocks.length > 0, `缺少 ${selector} 的样式声明块`)
  return blocks
}

function declarationsOf(selector) {
  return declarationBlocksOf(selector).join(';')
}

function declared(selector, property) {
  const matches = [...declarationsOf(selector).matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'gi'))]
    .map((match) => match[1].trim())
  assert.ok(matches.length > 0, `${selector} 缺少 ${property} 声明`)
  // !important 无视源码顺序压过普通声明，所以先挑出带 !important 的一组，再在组内取最后一条。
  const important = matches.filter((value) => /!\s*important\s*$/i.test(value))
  const winner = important.length > 0 ? important.at(-1) : matches.at(-1)
  return winner.replace(/\s*!\s*important\s*$/i, '')
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
  ruleFor('.omnimux-split-modal-container')
  ruleFor('.omnimux-split-modal-left')
  assert.equal(declared('.omnimux-split-modal-container', 'background'), 'transparent')
  assert.equal(declared('.omnimux-split-modal-left', 'background'), 'var(--dsw-alias-bg-layer-1)')
})

test('split modal: 其它规则不得改写右栏背景或滤镜', () => {
  const overrides = [...sourceWithoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => /\.omnimux-split-modal-right(?![\w-])/.test(selector))
    .filter(([, selector]) => selector.trim() !== '.omnimux-split-modal-right')
    .filter(([, , body]) => /(?:^|;)\s*(?:background|backdrop-filter|-webkit-backdrop-filter)\s*:/.test(body))
    .map(([, selector]) => selector.trim())
  assert.deepEqual(overrides, [], '右栏的背景与滤镜只能由 .omnimux-split-modal-right 自己声明，后面的同权重规则同样会胜出')
})
