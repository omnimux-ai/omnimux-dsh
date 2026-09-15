import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  installAgentPresetAvatarEnhancer,
  findAgentPresetSeat,
  applyAgentPresetAvatars,
  PRESET_SEAT_ATTR,
  PRESET_ID_ATTR,
  PRESET_SEAT_AVATAR_CLASS,
} from './agent-preset-enhancer.js'
import { getPresetFallbackCopy } from './agent-presets-i18n.js'
import { getPresetSkillBinding, hasPresetSkillBinding } from '../../../omnimux-market/src/client/skill-picker-logic.js'

const SEAT_HTML = `
  <div data-phase="hero">
    <div class="hf7Js2_composerHero">
      <div data-composer-card>
        <div data-composer-seat>
          <div class="hf7Js2_heroWorkspaceRow">
            <span class="PnBhwW_menuAnchor PnBhwW_root">
              <button type="button" class="PnBhwW_seat" aria-haspopup="menu" aria-expanded="false" title="切换专家">
                <svg class="PnBhwW_seatIcon" viewBox="0 0 16 16" aria-hidden="true"></svg>
                <span class="PnBhwW_seatLabel">全能社媒操盘手</span>
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>`

test('E2E: omni-agent, marketing-agent, drama-agent 端到端预设渲染与货架闭环', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${SEAT_HTML}</body></html>`, { url: 'http://localhost/' })
  const doc = dom.window.document
  installAgentPresetAvatarEnhancer(doc)

  // 1. 验证社媒操盘手 omni-agent 芯片渲染
  const seat = findAgentPresetSeat(doc)
  assert.ok(seat, '必须找到操盘手芯片')
  assert.equal(seat.getAttribute(PRESET_SEAT_ATTR), 'omni-agent')
  const avatar = seat.querySelector(`img.${PRESET_SEAT_AVATAR_CLASS}`)
  assert.ok(avatar, '芯片必须注入全能操盘手头像')
  assert.equal(avatar.getAttribute(PRESET_ID_ATTR), 'omni-agent')

  // 2. 切换至全能营销操盘手
  seat.querySelector('.PnBhwW_seatLabel').textContent = '全能营销操盘手'
  applyAgentPresetAvatars(doc)
  assert.equal(seat.getAttribute(PRESET_SEAT_ATTR), 'marketing-agent')

  // 3. 切换至全能短剧操盘手
  seat.querySelector('.PnBhwW_seatLabel').textContent = '全能短剧操盘手'
  applyAgentPresetAvatars(doc)
  assert.equal(seat.getAttribute(PRESET_SEAT_ATTR), 'drama-agent')

  // 4. 验证国际化文案
  const mktZh = getPresetFallbackCopy('marketing-agent', 'zh')
  const mktEn = getPresetFallbackCopy('marketing-agent', 'en')
  assert.equal(mktZh.name, '全能营销操盘手')
  assert.equal(mktEn.name, 'Marketing Lead')

  const drmZh = getPresetFallbackCopy('drama-agent', 'zh')
  const drmEn = getPresetFallbackCopy('drama-agent', 'en')
  assert.equal(drmZh.name, '全能短剧操盘手')
  assert.equal(drmEn.name, 'Short Drama Showrunner')

  // 5. 验证技能货架深度绑定
  const omniShelf = getPresetSkillBinding('omni-agent')
  assert.ok(omniShelf, 'omni-agent 货架必须存在')
  assert.equal(omniShelf.skills.length, 45)

  const mktShelf = getPresetSkillBinding('marketing-agent')
  assert.ok(mktShelf, 'marketing-agent 货架必须存在')
  assert.equal(mktShelf.categories.length, 5)

  const drmShelf = getPresetSkillBinding('drama-agent')
  assert.ok(drmShelf, 'drama-agent 货架必须存在')
  assert.equal(drmShelf.categories.length, 6)

  // 6. 验证兼容性
  assert.equal(hasPresetSkillBinding('tiktok-agent'), true)
  assert.equal(hasPresetSkillBinding('omni-agent'), true)
  assert.equal(hasPresetSkillBinding('marketing-agent'), true)
  assert.equal(hasPresetSkillBinding('drama-agent'), true)
})
