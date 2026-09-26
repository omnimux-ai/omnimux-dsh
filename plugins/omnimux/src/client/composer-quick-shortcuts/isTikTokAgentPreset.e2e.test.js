import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { isTikTokAgentPreset } from './isTikTokAgentPreset.js'

test('E2E: 会话预设切换与全局/DOM 探测绝对优先级隔离', async () => {
  // 模拟端到端页面环境：包含完整的席位 DOM 结构与全局状态
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>OmniMux Session</title></head>
      <body>
        <div data-phase="hero">
          <div class="hf7Js2_composerHero">
            <div data-composer-card>
              <div data-composer-seat>
                <div class="hf7Js2_heroWorkspaceRow">
                  <span class="PnBhwW_menuAnchor PnBhwW_root">
                    <button type="button" class="PnBhwW_seat" data-omnimux-preset-seat="tiktok-agent" data-omnimux-preset-id="tiktok-agent">
                      <span class="PnBhwW_seatLabel">TikTok运营专家团</span>
                    </button>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document

  try {
    globalThis.window = dom.window
    globalThis.document = dom.window.document

    // 设置全局残留状态
    dom.window.__omnimuxActivePreset = 'tiktok-agent'

    // 场景 1: 未提供显式预设入参时，回退链路正常生效并命中 DOM/全局状态
    assert.equal(
      isTikTokAgentPreset(null, {}),
      true,
      '无显式入参时，应正确命中当前环境的 TikTok 席位与全局状态',
    )

    // 场景 2: 切换到普通会话，显式传入 props.agentPreset = 'standard'
    // 即使 DOM 和全局 window 均残留 TikTok 席位，也必须严格判定为 false
    assert.equal(
      isTikTokAgentPreset(null, { agentPreset: 'standard' }),
      false,
      '显式 props.agentPreset="standard" 必须绝对优先，阻断全局与 DOM 穿透',
    )

    // 场景 3: 切换到全能操盘手会话 session.projectionValues.agentPreset = 'omni-agent'
    assert.equal(
      isTikTokAgentPreset(
        { projectionValues: { agentPreset: 'omni-agent' } },
        {},
      ),
      false,
      '显式 projectionValues="omni-agent" 必须严格返回 false',
    )

    // 场景 4: 切换到营销专家会话 session.agentPreset = 'marketing-agent'
    assert.equal(
      isTikTokAgentPreset({ agentPreset: 'marketing-agent' }, {}),
      false,
      '显式 session.agentPreset="marketing-agent" 必须严格返回 false',
    )

    // 场景 5: 显式切换为 TikTok 预设时，正常返回 true
    assert.equal(
      isTikTokAgentPreset({ agentPreset: 'tiktok-agent' }, {}),
      true,
      '显式 session.agentPreset="tiktok-agent" 应返回 true',
    )
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
