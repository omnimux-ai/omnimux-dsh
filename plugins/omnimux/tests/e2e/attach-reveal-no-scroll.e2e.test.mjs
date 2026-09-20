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

describe('E2E: 吸底先手——附件挂载提醒的强制滚动定位天然失效', () => {
  it('点击模板复刻：停靠态先于附件提醒同步落地，页面位置纹丝不动', async () => {
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

    // 1. 用户浏览至页面深处
    scroller.scrollTop = 640

    // 2. 监听宿主附件挂载提醒事件：记录触发当刻停靠态与视口位置
    const revealSnapshots = []
    dom.window.addEventListener('omnimux:attachments:reveal', () => {
      revealSnapshots.push({
        dockOpenAtReveal: hostRoot.hasAttribute('data-omnimux-dock-open'),
        scrollTopAtReveal: scroller.scrollTop,
      })
    })

    // 3. 找到一张普通模板卡片并点击复刻
    const tplCard = document.querySelector('.omnimux-tpl-card[data-is-app="false"]:not(.is-skill-card)')
    assert.ok(tplCard, '必须存在普通模板卡片')
    const recreateBtn = tplCard.querySelector('.omnimux-trending-recreate-btn')
    assert.ok(recreateBtn, '模板卡片必须有复刻按钮')

    await act(async () => {
      recreateBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })

    // 4. 核心断言：附件挂载提醒触发当刻，停靠态必须早已同步落地（吸底先手）
    assert.ok(revealSnapshots.length > 0, '模板复刻必须触发附件挂载提醒')
    for (const snap of revealSnapshots) {
      assert.equal(
        snap.dockOpenAtReveal,
        true,
        '附件挂载提醒触发时，输入框必须已是停靠形态（滚动定位天然失效）',
      )
      assert.equal(snap.scrollTopAtReveal, 640, '附件挂载提醒触发时视口必须原地不动')
    }

    // 5. 最终状态：吸底完成、草稿预填、视口 0 位移、无弹窗
    assert.equal(hostRoot.hasAttribute('data-omnimux-dock-open'), true, '最终必须处于吸底态')
    assert.equal(scroller.scrollTop, 640, '最终视口位置必须保持 640px，严禁跳动')
    assert.ok(capturedDraft.length > 0, '草稿必须完成预填')
    assert.equal(document.querySelector('.omnimux-toast-pill'), null, '严禁出现 Toast 弹窗')

    await act(async () => root.unmount())
  })
})
