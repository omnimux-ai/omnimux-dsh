import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { PRODUCT_STAGE_CHROME } from '../../src/client/conversation-box.js'

test('e2e: left sidebar completely hides on collapse in split mode without leaving 56px rail void', () => {
  const dom = new JSDOM(`<!doctype html>
    <html data-omnimux-sidebar-toggle-topbar>
      <head>
        <style>${PRODUCT_STAGE_CHROME}</style>
      </head>
      <body>
        <div class="dshDesktopFrame">
          <aside class="dshDesktopSidebarSurface sidebarCol">
            <div class="logoRow">
              <button class="toggle" aria-label="收起侧边栏"></button>
            </div>
            <div class="nav-items">
              <div class="item">项目</div>
              <div class="item">资产库</div>
            </div>
          </aside>
          <main class="dshDesktopConversationSurface centerCol">
            <div data-composer-card>
              <textarea placeholder="描述你想要构建的内容"></textarea>
            </div>
          </main>
          <aside class="dshDesktopRightbarSurface">
            <div data-sidebar-right-panel="push" data-sidebar-right-open="true">
              <div class="assets-center">资产中心</div>
            </div>
          </aside>
        </div>
      </body>
    </html>`, {
    url: 'http://127.0.0.1:45120/',
  })

  const doc = dom.window.document
  const root = doc.documentElement
  const frame = doc.querySelector('.dshDesktopFrame')
  const sidebar = doc.querySelector('.dshDesktopSidebarSurface')
  const rightPanel = doc.querySelector('[data-sidebar-right-panel]')

  // 1. 默认展开态下，无折叠标记
  assert.equal(root.hasAttribute('data-omnimux-left-collapsed'), false)
  assert.equal(frame.hasAttribute('data-sidebar-collapsed'), false)

  // 2. 模拟用户点击左上角收起侧边栏：设置折叠标记
  root.setAttribute('data-omnimux-left-collapsed', '')
  frame.setAttribute('data-sidebar-collapsed', '')

  // 验证在右侧面板打开时，选择器能精确命中收起样式规则
  assert.ok(
    sidebar.matches('html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] .dshDesktopSidebarSurface'),
    'sidebar surface matches collapsed rule'
  )
  assert.ok(
    sidebar.matches('html[data-omnimux-sidebar-toggle-topbar] [data-sidebar-collapsed] [class*="sidebarCol"]'),
    'sidebar col matches collapsed rule'
  )

  // 验证 CSS 规则中声明了完全置零与 display: none
  assert.match(PRODUCT_STAGE_CHROME, /\[class\*="sidebarCol"\][\s\S]*?width:\s*0!important/)
  assert.match(PRODUCT_STAGE_CHROME, /\[class\*="sidebarCol"\][\s\S]*?display:\s*none!important/)
  assert.match(PRODUCT_STAGE_CHROME, /\.dshDesktopSidebarSurface[\s\S]*?display:\s*none!important/)

  // 验证分屏网格第一列置零，右侧面板充盈铺满视口宽度
  assert.match(
    PRODUCT_STAGE_CHROME,
    /min-width:\s*420px\s*!important/,
  )
  assert.match(
    PRODUCT_STAGE_CHROME,
    /flex:\s*1\s+1\s+0%\s*!important/,
  )
  // 确保没有写死 440px 导致阻断拖拽手柄
  assert.doesNotMatch(
    PRODUCT_STAGE_CHROME,
    /grid-template-columns:[^}]*440px/,
  )

  // 3. 再次展开：移除折叠标记，状态平滑还原
  root.removeAttribute('data-omnimux-left-collapsed')
  frame.removeAttribute('data-sidebar-collapsed')
  assert.equal(root.hasAttribute('data-omnimux-left-collapsed'), false)
  assert.equal(frame.hasAttribute('data-sidebar-collapsed'), false)
})

test('e2e: pure conversation mode completely eliminates left black bar on collapse even with dormant panel in DOM', () => {
  const dom = new JSDOM(`<!doctype html>
    <html data-omnimux-sidebar-toggle-topbar>
      <head>
        <style>${PRODUCT_STAGE_CHROME}</style>
      </head>
      <body>
        <div class="dshDesktopFrame" data-rightbar-collapsed="true">
          <aside class="dshDesktopSidebarSurface sidebarCol">
            <div class="logoRow">
              <button class="toggle" aria-label="收起侧边栏"></button>
            </div>
          </aside>
          <main class="dshDesktopConversationSurface centerCol">
            <div data-composer-card>Chat Content</div>
          </main>
          <!-- 常驻在 DOM 中但未激活（无 data-sidebar-right-open）的面板节点 -->
          <div data-sidebar-right-panel="push"></div>
        </div>
      </body>
    </html>`, {
    url: 'http://127.0.0.1:45120/',
  })

  const doc = dom.window.document
  const root = doc.documentElement
  const frame = doc.querySelector('.dshDesktopFrame')

  // 用户点击收起左侧栏
  root.setAttribute('data-omnimux-left-collapsed', '')
  frame.setAttribute('data-sidebar-collapsed', '')

  // 验证通用置零规则命中，不因常驻的 data-sidebar-right-panel 节点而失效
  assert.ok(
    frame.matches('html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] .dshDesktopFrame'),
    'frame matches universal zero track rule'
  )
  assert.ok(
    frame.matches('html[data-omnimux-left-collapsed] .dshDesktopFrame[data-rightbar-collapsed="true"]'),
    'frame matches 100vw fill rule'
  )

  // 验证规则中严格指定 0px 100vw 0px，彻底消除任何黑边死区
  assert.match(
    PRODUCT_STAGE_CHROME,
    /html\[data-omnimux-left-collapsed\]\s+\.dshDesktopFrame\[data-rightbar-collapsed="true"\][\s\S]*?grid-template-columns:\s*0px 100vw 0px\s*!important/,
  )
})
