import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const output = await build({
  entryPoints: [new URL('../../src/client/session-guide/SessionGuide.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
)
const { SessionGuide } = module.exports

describe('E2E: 首页 Skill 点击使用只在技能按钮点亮名称，输入框不预填斜杠指令', () => {
  it('点击 Skills 货架上的技能卡片，输入框只出现说明请求', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>')
    global.window = dom.window
    global.document = dom.window.document

    const container = document.getElementById('root')
    const root = createRoot(container)

    let capturedDraft = ''
    const inputActions = {
      setDraft: (d) => { capturedDraft = d },
      focus: () => {},
    }
    const emptyState = {}
    const store = {
      subscribe: () => () => {},
      get: () => emptyState,
    }

    await act(async () => {
      root.render(React.createElement(SessionGuide, {
        sessionId: 'test-session',
        getCurrentSessionId: () => 'test-session',
        useSession: (fn) => fn({ id: 'test-session', title: '新会话', blank: true }),
        useConversation: (fn) => fn({ activeTargets: new Set() }),
        useInput: (fn) => fn({ draft: '' }),
        inputActions,
        store,
        t: (k, fb) => fb || k,
      }))
    })

    // 1. 定位 Skills 技能库货架行
    const skillsShelf = document.querySelector('[data-shelf-slug="skills"]')
    assert.ok(skillsShelf, '必须渲染 Skills 技能库货架行')

    // 2. 找到首张卡片（UGC 告白）的使用按钮
    const firstCard = skillsShelf.querySelector('.omnimux-tpl-card.is-skill-card')
    assert.ok(firstCard, '必须具备技能卡片')
    const useBtn = firstCard.querySelector('.omnimux-skill-card-btn')
    assert.ok(useBtn, '卡片内必须具备使用按钮')

    // 3. 模拟点击使用按钮
    await act(async () => {
      useBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })

    // 4. 输入框只剩说明请求；技能名称交给技能按钮旁的标签
    assert.equal(capturedDraft, '为我解释下这个技能的最佳使用方式。')
    assert.equal(capturedDraft.includes('/ugc-confessional'), false, '输入框不得出现斜杠指令')
    assert.equal(window.__omnimuxActiveSkill?.slug, 'ugc-confessional', '技能按钮必须点亮这款技能')
    assert.equal(window.__omnimuxActiveSkill?.name, 'UGC 告白')

    // 5. 断言绝不弹出「已激活技能」Toast 浮层
    const toastPill = document.querySelector('.omnimux-toast-pill')
    assert.ok(!toastPill || !toastPill.textContent.includes('已激活技能'), '点击使用技能后严禁弹出「已激活技能」提示框')
  })
})
