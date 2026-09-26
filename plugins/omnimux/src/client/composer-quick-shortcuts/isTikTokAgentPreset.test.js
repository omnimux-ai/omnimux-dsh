import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  isTikTokAgentPreset,
  TIKTOK_AGENT_PRESET_WHITELIST,
} from './isTikTokAgentPreset.js'

describe('isTikTokAgentPreset: TikTok Agent 角色预设探测与判定门禁', () => {
  let dom
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
    globalThis.window = dom.window
    globalThis.document = dom.window.document
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  })

  it('白名单严格包含 6 种官方及别名定义', () => {
    const expected = [
      'tiktok-agent',
      'tiktokagent',
      'tiktok-ops-team',
      'TikTok运营专家团',
      'TikTok 运营操盘手',
      'TikTok Ops Team',
    ]
    assert.deepEqual([...TIKTOK_AGENT_PRESET_WHITELIST], expected)
  })

  it('优先级 1: 从 props.agentPreset 探测命中', () => {
    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'tiktok-agent' }), true)
    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'TikTok运营专家团' }), true)
    assert.equal(isTikTokAgentPreset(null, { agentPreset: '  tiktok-ops-team  ' }), true)
    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'standard' }), false)
  })

  it('优先级 2: 从 session.projectionValues.agentPreset 探测命中', () => {
    const session = { projectionValues: { agentPreset: 'TikTok 运营操盘手' } }
    assert.equal(isTikTokAgentPreset(session, {}), true)
  })

  it('优先级 3: 从 session.agentPreset 探测命中', () => {
    const session = { agentPreset: 'tiktokagent' }
    assert.equal(isTikTokAgentPreset(session, {}), true)
  })

  it('优先级 4: 从 session.meta.agentPreset 探测命中', () => {
    const session = { meta: { agentPreset: 'TikTok Ops Team' } }
    assert.equal(isTikTokAgentPreset(session, {}), true)
  })

  it('优先级 5: 从 window.__omnimuxActivePreset 全局缓存探测命中', () => {
    window.__omnimuxActivePreset = 'tiktok-agent'
    assert.equal(isTikTokAgentPreset(null, {}), true)
    window.__omnimuxActivePreset = 'omni-agent'
    assert.equal(isTikTokAgentPreset(null, {}), false)
  })

  it('优先级 6: 从 DOM 席位 [data-omnimux-preset-seat] 属性探测命中', () => {
    const seat = document.createElement('div')
    seat.setAttribute('data-omnimux-preset-seat', 'tiktok-agent')
    document.body.appendChild(seat)

    assert.equal(isTikTokAgentPreset(null, {}), true)
  })

  it('优先级 7: 从 DOM 席位 [class*="seatLabel"] 文本探测命中', () => {
    const label = document.createElement('span')
    label.className = 'PnBhwW_seatLabel'
    label.textContent = 'TikTok运营专家团'
    document.body.appendChild(label)

    assert.equal(isTikTokAgentPreset(null, {}), true)
  })

  it('非 TikTok 预设严格返回 false，零 DOM 误判', () => {
    assert.equal(isTikTokAgentPreset(null, {}), false)
    assert.equal(isTikTokAgentPreset({ agentPreset: 'standard' }, {}), false)
    assert.equal(isTikTokAgentPreset({ agentPreset: 'omni-agent' }, {}), false)
    assert.equal(isTikTokAgentPreset({ agentPreset: 'software-company' }, {}), false)
    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'minimal' }), false)
  })

  it('显式非 TikTok 预设绝对优先，绝不受全局 window.__omnimuxActivePreset 污染穿透', () => {
    window.__omnimuxActivePreset = 'tiktok-agent'

    // 显式 props
    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'standard' }), false)
    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'omni-agent' }), false)

    // 显式 session.projectionValues
    assert.equal(
      isTikTokAgentPreset({ projectionValues: { agentPreset: 'omni-agent' } }, {}),
      false,
    )
    assert.equal(
      isTikTokAgentPreset({ projectionValues: { agentPreset: 'standard' } }, {}),
      false,
    )

    // 显式 session.agentPreset
    assert.equal(isTikTokAgentPreset({ agentPreset: 'standard' }, {}), false)
    assert.equal(isTikTokAgentPreset({ agentPreset: 'software-company' }, {}), false)

    // 显式 session.meta.agentPreset
    assert.equal(
      isTikTokAgentPreset({ meta: { agentPreset: 'standard' } }, {}),
      false,
    )
  })

  it('显式非 TikTok 预设绝对优先，绝不受 DOM 席位属性或文本残留污染穿透', () => {
    // 构造 DOM TikTok 席位
    const seat = document.createElement('div')
    seat.setAttribute('data-omnimux-preset-seat', 'tiktok-agent')
    document.body.appendChild(seat)

    const label = document.createElement('span')
    label.className = 'PnBhwW_seatLabel'
    label.textContent = 'TikTok运营专家团'
    document.body.appendChild(label)

    // 显式 props
    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'standard' }), false)

    // 显式 session.projectionValues
    assert.equal(
      isTikTokAgentPreset({ projectionValues: { agentPreset: 'omni-agent' } }, {}),
      false,
    )

    // 显式 session.agentPreset
    assert.equal(isTikTokAgentPreset({ agentPreset: 'standard' }, {}), false)

    // 显式 session.meta.agentPreset
    assert.equal(
      isTikTokAgentPreset({ meta: { agentPreset: 'software-company' } }, {}),
      false,
    )
  })

  it('全局变量与 DOM 席位同时存在 TikTok 残留时，显式指定非 TikTok 预设依然严格隔离返回 false', () => {
    window.__omnimuxActivePreset = 'tiktok-agent'

    const seat = document.createElement('div')
    seat.setAttribute('data-omnimux-preset-seat', 'tiktok-agent')
    document.body.appendChild(seat)

    assert.equal(isTikTokAgentPreset(null, { agentPreset: 'standard' }), false)
    assert.equal(
      isTikTokAgentPreset({ projectionValues: { agentPreset: 'omni-agent' } }, {}),
      false,
    )
    assert.equal(isTikTokAgentPreset({ agentPreset: 'standard' }, {}), false)
  })
})
