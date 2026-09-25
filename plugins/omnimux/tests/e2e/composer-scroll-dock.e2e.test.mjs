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

describe('E2E: 首页输入框滚动防抖定位状态机与交互收敛', () => {
  it('端到端全链路：默认顶部 -> 滚离吸底 -> 滚回归位 -> 功能按钮一键吸底 -> 点击收起归位', async () => {
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

    try {
      await act(async () => {
        root.render(React.createElement(SessionGuide, {
          sessionId: 'test-scroll-session',
          getCurrentSessionId: () => 'test-scroll-session',
          useSession: (fn) => fn({ id: 'test-scroll-session', title: '新会话', blank: true }),
          useConversation: (fn) => fn({ activeTargets: new Set() }),
          useInput: (fn) => fn({ draft: '' }),
          inputActions,
          store,
          t: (k, fb) => (k === 'trending.undock' ? '收起输入框' : (fb || k)),
        }))
      })

      // 1. 验证默认初始状态在顶部
      assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '默认初始状态下输入框在顶部，不得吸底')
      assert.equal(document.querySelector('.omnimux-trending-undock'), null, '初始状态下收起按钮不得渲染')

      // 2. 模拟向下滚动超过离开阈值（> leaveThreshold 196px）
      scroller.scrollTop = 320
      await act(async () => {
        scroller.dispatchEvent(new dom.window.Event('scroll'))
        await new Promise((r) => setTimeout(r, 15))
      })
      assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '向下滚动离开顶部不可见时必须自动吸底')
      const undockBtn = document.querySelector('.omnimux-trending-undock')
      assert.ok(undockBtn, '吸底时右上方必须浮现收起按钮')

      // 3. 模拟向上滚动回到顶部露头范围（<= revealThreshold 166px）
      scroller.scrollTop = 80
      await act(async () => {
        scroller.dispatchEvent(new dom.window.Event('scroll'))
        await new Promise((r) => setTimeout(r, 15))
      })
      assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '向上滚动回到露头范围必须自动归位')
      assert.equal(document.querySelector('.omnimux-trending-undock'), null, '归位后收起按钮必须消失')

      // 4. 点击 Skills 卡片「使用」按钮一键触发底部吸底
      const skillsShelf = document.querySelector('[data-shelf-slug="skills"]')
      assert.ok(skillsShelf, '页面必须包含 Skills 货架')
      const useBtn = skillsShelf.querySelector('.omnimux-skill-card-btn')
      assert.ok(useBtn, '卡片内必须有使用按钮')

      await act(async () => {
        useBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      })
      assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '点击使用按钮必须一键触发吸底')
      assert.ok(document.querySelector('.omnimux-trending-undock'), '激活后必须浮现收起按钮')

      // 5. 点击收起按钮解除吸底
      const activeUndockBtn = document.querySelector('.omnimux-trending-undock')
      await act(async () => {
        activeUndockBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      })
      assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), false, '点击收起按钮必须解除吸底')
      assert.equal(document.querySelector('.omnimux-trending-undock'), null, '解除后收起按钮消失')
    } finally {
      await act(async () => root.unmount())
    }
  })
})
