import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { HUB_CSS } from './styles.js'
import {
  installAgentPresetAvatarEnhancer,
  findAgentPresetSeat,
  PRESET_SEAT_ATTR,
  PRESET_ID_ATTR,
} from './agent-preset-enhancer.js'

const SEAT_HTML = `
  <div data-phase="hero">
    <div class="hf7Js2_composerHero">
      <div data-composer-card>
        <div data-composer-seat data-slot="conversation.hero.agentPreset">
          <div class="hf7Js2_heroWorkspaceRow">
            <span class="PnBhwW_menuAnchor PnBhwW_root">
              <button type="button" class="PnBhwW_seat" aria-haspopup="menu" aria-expanded="false" title="切换专家">
                <svg class="PnBhwW_seatIcon" viewBox="0 0 16 16" aria-hidden="true"></svg>
                <span class="PnBhwW_seatLabel">TikTok运营专家团</span>
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>`

test('E2E: 验证会话上方切换 Agent 按钮与选择器不再被全局强制隐藏', () => {
  // 1. 验证 HUB_CSS 中不再包含强制隐藏 agentPreset 和 seat 的规则
  assert.equal(
    HUB_CSS.includes('[data-slot="conversation.hero.agentPreset"]') && HUB_CSS.includes('display: none !important;'),
    false,
    'HUB_CSS 严禁包含对 conversation.hero.agentPreset 的 display: none 规则'
  )
  assert.equal(
    HUB_CSS.includes('[data-omnimux-preset-seat]') && HUB_CSS.includes('display: none !important;'),
    false,
    'HUB_CSS 严禁包含对 [data-omnimux-preset-seat] 的 display: none 规则'
  )

  // 2. 验证真实 DOM 下 enhancer 能够正常感知并装配该席位
  const dom = new JSDOM(`<!DOCTYPE html><html><head><style>${HUB_CSS}</style></head><body>${SEAT_HTML}</body></html>`, { url: 'http://localhost/' })
  const doc = dom.window.document
  const seat = findAgentPresetSeat(doc)
  assert.ok(seat, '必须能够识别到会话顶部的 Agent 切换按钮')

  installAgentPresetAvatarEnhancer(doc)
  assert.equal(seat.getAttribute(PRESET_SEAT_ATTR), 'TikTok运营专家团', '席位应正确绑定当前专家标识')
})
