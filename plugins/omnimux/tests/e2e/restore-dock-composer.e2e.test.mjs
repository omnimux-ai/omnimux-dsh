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

describe('E2E: 恢复使用技能或复刻按钮触发输入框吸底与交互逻辑', () => {
  it('点击 Skills 卡片使用按钮触发吸底、收起按钮交互及滚回顶部自动归还', async () => {
    const html = `<!DOCTYPE html>
    <html>
      <body>
        <div id="host-root" data-phase="conversation" data-omnimux-starter-host="">
          <div class="hero-band">
            <div data-composer-card="" style="height: 120px;"></div>
          </div>
          <div class="scrollBody" style="height: 600px; overflow-y: auto;">
            <div id="mount-point"></div>
          </div>
        </div>
      </body>
    </html>`

    const dom = new JSDOM(html, { url: 'http://localhost/' })
    dom.window.Element.prototype.getBoundingClientRect = function stub() {
      return {
        x: 394, y: 100, left: 394, top: 100, width: 1200, height: 166,
        right: 1594, bottom: 266, toJSON() { return this },
      }
    }
    global.window = dom.window
    global.document = dom.window.document
    global.CustomEvent = dom.window.CustomEvent
    global.IS_REACT_ACT_ENVIRONMENT = true

    const hostRoot = document.getElementById('host-root')
    const container = document.getElementById('mount-point')
    const scroller = hostRoot.querySelector('.scrollBody')
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
        t: (k, fb) => (k === 'trending.undock' ? '收起输入框' : (fb || k)),
      }))
    })

    // 1. 初始状态：宿主未吸底，页面上无收起按钮
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '初始状态下输入框不应吸底')
    assert.equal(document.querySelector('.omnimux-trending-undock'), null, '初始状态下不应渲染收起按钮')

    // 2. 找到 Skills 货架第一张技能卡片的使用按钮并点击
    const skillsShelf = document.querySelector('[data-shelf-slug="skills"]')
    assert.ok(skillsShelf, '必须渲染 Skills 技能货架行')
    const firstSkillCard = skillsShelf.querySelector('.omnimux-tpl-card.is-skill-card')
    assert.ok(firstSkillCard, '必须渲染技能卡片')
    const useBtn = firstSkillCard.querySelector('.omnimux-skill-card-btn')
    assert.ok(useBtn, '卡片内必须有使用按钮')

    await act(async () => {
      useBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })

    // 3. 验证吸底生效：宿主被打上 data-omnimux-dock-open，且出现收起按钮
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '点击使用技能后宿主必须打上吸底标记')
    const undockBtn = document.querySelector('.omnimux-trending-undock')
    assert.ok(undockBtn, '输入框吸底时右上方必须浮现收起按钮')
    assert.equal(undockBtn.textContent.includes('收起输入框'), true, '收起按钮文本必须包含国际化文案')
    assert.ok(capturedDraft.includes('/ugc-confessional'), '输入框草稿已预填对应技能指令')

    // 断言绝无任何 Toast 弹窗
    const toastPill = document.querySelector('.omnimux-toast-pill')
    assert.ok(!toastPill, '使用技能后绝不得出现 Toast 提示弹窗')

    // 4. 点击收起按钮：解除吸底，恢复到原位
    await act(async () => {
      undockBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '点击收起按钮后必须解除吸底')
    assert.equal(document.querySelector('.omnimux-trending-undock'), null, '解除吸底后收起按钮必须消失')

    // 5. 再次点击使用触发吸底，然后模拟滚回顶部归还
    await act(async () => {
      useBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true)

    // 模拟向下滚动超过 20px
    scroller.scrollTop = 150
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '向下浏览时输入框保持吸底')

    // 模拟向上滚动滑回最顶部 (0px)
    scroller.scrollTop = 0
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '向上滑回页面最顶部必须自动解除吸底回流至原位')

    // 6. 验证普通模板复刻：吸底且严禁弹出任何 Toast 气泡
    const tplCard = document.querySelector('.omnimux-tpl-card[data-is-app="false"]:not(.is-skill-card)')
    if (tplCard) {
      const recreateBtn = tplCard.querySelector('.omnimux-trending-recreate-btn')
      if (recreateBtn) {
        await act(async () => {
          recreateBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        })
        assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '点击模板复刻后必须吸底')
        const tplToast = document.querySelector('.omnimux-toast-pill')
        assert.ok(!tplToast || !tplToast.textContent.includes('已装配'), '点击模板复刻严禁弹出「已装配」Toast 提示')
      }
    }

    // 7. 防跳动核心测试：页面偏下位置点击卡片，视口必须 0 像素位移保持完全静止
    scroller.scrollTop = 420
    await act(async () => {
      useBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true)
    assert.equal(scroller.scrollTop, 420, '偏下位置点击卡片视口必须保持 420px 原地不动，绝不跳顶')

    await act(async () => root.unmount())
  })
})
