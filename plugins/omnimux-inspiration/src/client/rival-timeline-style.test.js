// #3565：账号监控时间线左对齐、取消条目 hover 背景变化。
// 断言直接检查注入样式表，确保规则不会被后续样式改动悄悄回退。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RIVAL_CSS } from './rival-styles.js'

function ruleBlock(selector) {
  const match = RIVAL_CSS.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}'))
  return match === null ? '' : match[0]
}

describe('account timeline style (#3565)', () => {
  it('time line aligns left instead of centering itself', () => {
    const block = ruleBlock('.omnimux-rival-timeline')
    assert.equal(block.includes('margin: 0;'), true)
    assert.equal(block.includes('margin: 0 auto'), false)
  })

  it('hover no longer changes the item background', () => {
    assert.equal(/\.omnimux-rival-timeline-item:hover\s*[,{]/.test(RIVAL_CSS), false)
  })

  it('keyboard focus still shows a visible background', () => {
    const block = ruleBlock('.omnimux-rival-timeline-item:focus-visible')
    assert.equal(block.includes('background: var(--dsw-alias-bg-layer-2);'), true)
  })
})
