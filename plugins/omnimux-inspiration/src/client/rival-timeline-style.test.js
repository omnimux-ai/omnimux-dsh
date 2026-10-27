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

describe('account timeline style (#3825)', () => {
  it('collapses the post body to an X-style line budget', () => {
    const block = ruleBlock('.omnimux-rival-timeline-body')
    assert.equal(block.includes('display: -webkit-box;'), true)
    assert.equal(block.includes('-webkit-line-clamp:'), true)
    assert.equal(block.includes('overflow: hidden;'), true)
  })

  it('restores the full body when the row is expanded', () => {
    const block = ruleBlock('.omnimux-rival-timeline-body.is-expanded')
    assert.equal(block.includes('display: block;'), true)
    assert.equal(block.includes('overflow: visible;'), true)
  })

  it('offers a text-link expand button, not a framed control', () => {
    const block = ruleBlock('.omnimux-rival-timeline-expand')
    assert.equal(block.includes('background: transparent;'), true)
    assert.equal(block.includes('border: 0;'), true)
  })

  it('does not draw a host frame around the official embed card', () => {
    const block = ruleBlock('.omnimux-rival-timeline-embed.is-card iframe')
    assert.equal(block.includes('border: 0;'), true)
    assert.equal(block.includes('background: transparent;'), true)
    assert.equal(/border-radius/.test(block), false)
  })

  it('hides the host expand link once the official embed replaces the row', () => {
    const block = RIVAL_CSS.match(/is-embed-card[^{]*\{[^}]*\}/g)?.[0] || ''
    assert.equal(block.includes('.omnimux-rival-timeline-expand'), true)
    assert.equal(block.includes('display: none;'), true)
  })
})
