import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  syncNativeRightbarControls,
} from './sidebar-toggle-topbar.js'
import {
  setConversationCollapsed,
  getConversationCollapsed,
  CONVERSATION_COLLAPSE_CSS,
  resetConversationCollapseForTests,
} from './conversation-collapse.js'
import { PRODUCT_STAGE_CHROME } from './conversation-box.js'

test('Issue 1761: native toggle without an owner does not synthesize legacy focus', () => {
  resetConversationCollapseForTests()
  const dom = new JSDOM(`<!doctype html>
<html>
  <body>
    <div class="dshDesktopFrame">
      <div class="dshDesktopConversationSurface"></div>
      <div class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="fullscreen">
          <div class="_tabStrip_17p4l_156">
            <button type="button" class="Ng7Ira_iconButton" data-sidebar-right-mode="push" aria-label="退出全屏"></button>
            <button type="button" class="_iconButton_17p4l_408" data-dockkit-split-button="pane1" aria-label="分栏"></button>
            <div class="_stripChrome_17p4l_212">
              <button type="button" class="Ng7Ira_iconButton" data-sidebar-right-toggle="true" aria-label="收起右侧边栏"></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`)
  const doc = dom.window.document
  let focusMode = null

  dom.window.__omnimuxWorkbench = {
    setFocus(mode) {
      focusMode = mode
      if (mode === 'chat') {
        setConversationCollapsed(false, { doc })
      }
    },
    getFocus() {
      return focusMode || 'gui'
    },
    setConversationCollapsed(val) {
      setConversationCollapsed(val, { doc })
    },
    getConversationCollapsed() {
      return getConversationCollapsed({ doc })
    },
  }

  // 模拟全屏画布状态
  setConversationCollapsed(true, { doc })
  assert.equal(getConversationCollapsed({ doc }), true)

  // 同步原生控件并绑定事件
  syncNativeRightbarControls(doc)

  const toggleBtn = doc.querySelector('button[data-sidebar-right-toggle="true"]')
  assert.ok(toggleBtn)

  // 点击收起右侧边栏
  toggleBtn.click()

  // No native owner is mounted in this DOM-only test: sync must not fabricate an action.
  assert.equal(focusMode, null)
  assert.equal(getConversationCollapsed({ doc }), true)
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true)
  dom.window.close()
})

test('Issue 1761: chrome synchronization leaves closed-state cleanup to layout observer', () => {
  resetConversationCollapseForTests()
  const dom = new JSDOM(`<!doctype html>
<html>
  <body>
    <div class="dshDesktopFrame" data-rightbar-collapsed="true">
      <div class="dshDesktopConversationSurface"></div>
      <div class="dshDesktopRightbarSurface"></div>
    </div>
  </body>
</html>`)
  const doc = dom.window.document
  let focusMode = 'gui'

  dom.window.__omnimuxWorkbench = {
    setFocus(mode) {
      focusMode = mode
      if (mode === 'chat') {
        setConversationCollapsed(false, { doc })
      }
    },
    getFocus() {
      return focusMode
    },
    setConversationCollapsed(val) {
      setConversationCollapsed(val, { doc })
    },
    getConversationCollapsed() {
      return getConversationCollapsed({ doc })
    },
  }

  // 模拟原先残留的会话折叠
  setConversationCollapsed(true, { doc })
  assert.equal(getConversationCollapsed({ doc }), true)

  // 执行同步检测
  syncNativeRightbarControls(doc)

  // Chrome styling is passive; compact-layout owns observed close cleanup.
  assert.equal(focusMode, 'gui')
  assert.equal(getConversationCollapsed({ doc }), true)
  assert.equal(doc.documentElement.hasAttribute('data-omnimux-conversation-collapsed'), true)
  dom.window.close()
})

test('Issue 1749: CSS 防御规则必须排除右侧栏收起态，确保会话栏占满视口绝无黑屏', () => {
  // 1. conversation-box PRODUCT_STAGE_CHROME 网格样式校验
  assert.match(
    PRODUCT_STAGE_CHROME,
    /data-omnimux-conversation-collapsed\] \.dshDesktopFrame:not\(\[data-rightbar-collapsed="true"\]\)/,
    '会话收起时的 0 宽规则必须排除右栏已收起态'
  )
  assert.match(
    PRODUCT_STAGE_CHROME,
    /\.dshDesktopFrame\[data-rightbar-collapsed="true"\][\s\S]*grid-template-columns:\s*var\(--omnimux-sidebar-width,\s*280px\)\s*minmax\(0px,\s*1fr\)\s*0px\s*!important/,
    '右栏收起时必须强制会话栏占满剩余宽度'
  )

  // 2. conversation-collapse CSS 隐藏规则校验
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /data-rightbar-collapsed="true"/,
    '中间会话隐藏规则必须感知右栏收起'
  )
})
