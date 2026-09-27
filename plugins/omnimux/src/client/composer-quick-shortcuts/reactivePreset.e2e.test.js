import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  isTikTokAgentPreset,
  subscribeActivePreset,
  AGENT_PRESET_CHANGED_EVENT,
} from './isTikTokAgentPreset.js'

test('E2E: TikTok Agent 快捷指令响应式感知预设变动与角色限定联动', async () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>OmniMux Role Gating</title></head>
      <body>
        <div data-composer-seat>
          <button type="button" data-omnimux-preset-seat="omni-agent">
            <span class="seatLabel">全域社媒操盘手</span>
          </button>
        </div>
        <div data-slot="conversation.input.dock"></div>
      </body>
    </html>
  `
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document

  try {
    globalThis.window = dom.window
    globalThis.document = dom.window.document

    let changeNotifiedCount = 0
    const unsubscribe = subscribeActivePreset(() => {
      changeNotifiedCount++
    })

    // 场景 1：初始状态为「全域社媒操盘手」，断言不是 TikTok Agent
    dom.window.__omnimuxActivePreset = 'omni-agent'
    assert.equal(isTikTokAgentPreset(null, {}), false, '全域社媒操盘手必须返回 false')

    // 场景 2：用户在界面中切换为「TikTok运营专家团」
    dom.window.__omnimuxActivePreset = 'tiktok-agent'
    const seatBtn = dom.window.document.querySelector('[data-omnimux-preset-seat]')
    seatBtn.setAttribute('data-omnimux-preset-seat', 'tiktok-agent')
    const label = dom.window.document.querySelector('.seatLabel')
    label.textContent = 'TikTok运营专家团'

    // 派发切换事件
    dom.window.dispatchEvent(
      new dom.window.CustomEvent(AGENT_PRESET_CHANGED_EVENT, {
        detail: { id: 'tiktok-agent' },
      })
    )

    assert.equal(changeNotifiedCount, 1, '切换到 TikTok 时应收到 1 次变动通知')
    assert.equal(isTikTokAgentPreset(null, {}), true, '切换到 TikTok 运营专家团后必须判定为 true')

    // 场景 3：用户切换为「Instagram视觉增长专家」
    dom.window.__omnimuxActivePreset = 'Instagram视觉增长专家'
    seatBtn.setAttribute('data-omnimux-preset-seat', 'Instagram视觉增长专家')
    label.textContent = 'Instagram视觉增长专家'

    dom.window.dispatchEvent(
      new dom.window.CustomEvent(AGENT_PRESET_CHANGED_EVENT, {
        detail: { id: 'Instagram视觉增长专家' },
      })
    )

    assert.equal(changeNotifiedCount, 2, '切换到 Instagram 时应收到第 2 次变动通知')
    assert.equal(isTikTokAgentPreset(null, {}), false, '切换到 Instagram视觉增长专家后必须返回 false')

    // 场景 4：用户切换为「X (推特) 流量运营专家」
    dom.window.__omnimuxActivePreset = 'X (推特) 流量运营专家'
    seatBtn.setAttribute('data-omnimux-preset-seat', 'X (推特) 流量运营专家')
    label.textContent = 'X (推特) 流量运营专家'

    dom.window.dispatchEvent(
      new dom.window.CustomEvent(AGENT_PRESET_CHANGED_EVENT, {
        detail: { id: 'X (推特) 流量运营专家' },
      })
    )

    assert.equal(changeNotifiedCount, 3, '切换到 X (推特) 时应收到第 3 次变动通知')
    assert.equal(isTikTokAgentPreset(null, {}), false, '切换到 X (推特) 流量运营专家后必须返回 false')

    // 场景 5：再次切回「TikTok运营专家团」
    dom.window.__omnimuxActivePreset = 'tiktok-agent'
    seatBtn.setAttribute('data-omnimux-preset-seat', 'tiktok-agent')
    label.textContent = 'TikTok运营专家团'

    dom.window.dispatchEvent(
      new dom.window.CustomEvent(AGENT_PRESET_CHANGED_EVENT, {
        detail: { id: 'tiktok-agent' },
      })
    )

    assert.equal(changeNotifiedCount, 4, '再次切回 TikTok 时应收到第 4 次变动通知')
    assert.equal(isTikTokAgentPreset(null, {}), true, '再次切回 TikTok 运营专家团后必须恢复判定为 true')

    unsubscribe()
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
