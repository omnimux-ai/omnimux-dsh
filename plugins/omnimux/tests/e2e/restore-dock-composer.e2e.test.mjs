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
        t: (k, fb) => (k === 'trending.undock' ? '收起' : (fb || k)),
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

    // 3. 验证顶部优先：顶部可见状态下点击使用技能优先保持在顶部 inline，绝不吸底
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '顶部可见时点击使用技能优先保持在顶部，不得吸底')
    assert.equal(document.querySelector('.omnimux-trending-undock'), null, '顶部可见时不渲染收起按钮')
    assert.ok(
      capturedDraft.includes('最佳使用方式') || capturedDraft.includes('explain the best way to use this skill'),
      '输入框草稿已在顶部原位预填自然语言说明请求'
    )

    // 断言绝无任何 Toast 弹窗
    const toastPill = document.querySelector('.omnimux-toast-pill')
    assert.ok(!toastPill, '使用技能后绝不得出现 Toast 提示弹窗')

    // 4. 模拟向下滚动超过离开阈值（> leaveThreshold 196px）：自动触发吸底
    scroller.scrollTop = 300
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '向下浏览超过离开阈值时输入框自动迁移吸底')
    const undockBtn = document.querySelector('.omnimux-trending-undock')
    assert.ok(undockBtn, '吸底后右上方必须浮现收起按钮')
    assert.equal(undockBtn.textContent.includes('收起'), true, '收起按钮文本必须包含国际化文案')

    // 5. 点击收起按钮：解除吸底，恢复到原位
    await act(async () => {
      undockBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '点击收起按钮后必须解除吸底')
    assert.equal(document.querySelector('.omnimux-trending-undock'), null, '解除吸底后收起按钮必须消失')

    // 6. 模拟偏下位置（例如 300px）再次点击使用卡片，此时因顶部不可见，一键触发底部吸底
    scroller.scrollTop = 300
    await act(async () => {
      useBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '偏下位置点击必须触发底部吸底')

    // 模拟向下滚动超过 leaveThreshold (例如 300px > 186px)
    scroller.scrollTop = 300
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '向下浏览超过离开阈值时输入框保持吸底')

    // 模拟向上滚动至顶部槽位露头阈值内 (例如 100px <= revealThreshold 166px)，无需滑到 0px 或 10px 即可解除吸底！
    scroller.scrollTop = 100
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '向上滚动至顶部槽位开始露头阈值内（100px）时立即解除吸底回流至原位')

    // 模拟向上滚动滑回最顶部 (0px)，保持解除吸底
    scroller.scrollTop = 0
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '向上滑回页面最顶部保持解除吸底')

    // 6. 验证普通模板复刻：在页面顶部可见时点击，优先在顶部原地填充交互（零吸底、零弹窗）
    const tplCard = document.querySelector('.omnimux-tpl-card[data-is-app="false"]:not(.is-skill-card)')
    if (tplCard) {
      const recreateBtn = tplCard.querySelector('.omnimux-trending-recreate-btn')
      if (recreateBtn) {
        await act(async () => {
          recreateBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        })
        assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '顶部可见时点击模板复刻优先在顶部原地交互，绝不吸底')
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
