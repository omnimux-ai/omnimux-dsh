import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  isTikTokAgentPreset,
  subscribeActivePreset,
  AGENT_PRESET_CHANGED_EVENT,
} from './isTikTokAgentPreset.js'

describe('TikTok Agent 快捷指令响应式预设变动监听契约', () => {
  let dom
  let originalWindow
  let originalDocument

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div data-omnimux-preset-seat="omni-agent"><span class="seatLabel">全域社媒操盘手</span></div></body></html>')
    originalWindow = globalThis.window
    originalDocument = globalThis.document
    globalThis.window = dom.window
    globalThis.document = dom.window.document
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  })

  it('AGENT_PRESET_CHANGED_EVENT 事件常量定义正确', () => {
    assert.equal(AGENT_PRESET_CHANGED_EVENT, 'omnimux:agent-preset-changed')
  })

  it('当派发 AGENT_PRESET_CHANGED_EVENT 时，subscribeActivePreset 监听回调被触发', () => {
    let callCount = 0
    const unsubscribe = subscribeActivePreset(() => {
      callCount++
    })

    assert.equal(callCount, 0)

    window.dispatchEvent(
      new window.CustomEvent(AGENT_PRESET_CHANGED_EVENT, {
        detail: { id: 'tiktok-agent' },
      })
    )

    assert.equal(callCount, 1)

    // 退订后不再触发
    unsubscribe()
    window.dispatchEvent(
      new window.CustomEvent(AGENT_PRESET_CHANGED_EVENT, {
        detail: { id: 'omni-agent' },
      })
    )
    assert.equal(callCount, 1)
  })

  it('角色切换前后 isTikTokAgentPreset 准确响应全局与 DOM 状态', () => {
    // 初始状态：全域社媒操盘手
    window.__omnimuxActivePreset = 'omni-agent'
    assert.equal(isTikTokAgentPreset(null, {}), false)

    // 切换为 TikTok 运营专家团
    window.__omnimuxActivePreset = 'tiktok-agent'
    assert.equal(isTikTokAgentPreset(null, {}), true)

    // 再次切换为 Instagram视觉增长专家
    window.__omnimuxActivePreset = 'instagram-agent'
    assert.equal(isTikTokAgentPreset(null, {}), false)
  })
})
