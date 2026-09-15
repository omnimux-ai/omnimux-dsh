import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { PRODUCT_STAGE_CHROME } from './conversation-box.js'

describe('sidebar collapse hidden (Issue 56d2b4af565e)', () => {
  it('PRODUCT_STAGE_CHROME contains rules to completely hide sidebarCol and dshDesktopSidebarSurface when collapsed', () => {
    // 验证无论是否存在右侧面板，sidebarCol 在收起态均声明 display: none 与 0 宽
    assert.match(
      PRODUCT_STAGE_CHROME,
      /html\[data-omnimux-sidebar-toggle-topbar\]\[data-omnimux-left-collapsed\]\s+\[class\*="sidebarCol"\][\s\S]*?display:none!important/,
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /html\[data-omnimux-sidebar-toggle-topbar\]\s+\[data-sidebar-collapsed\]\s+\[class\*="sidebarCol"\][\s\S]*?display:none!important/,
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /html\[data-omnimux-sidebar-toggle-topbar\]\[data-omnimux-left-collapsed\]\s+\.dshDesktopSidebarSurface[\s\S]*?display:none!important/,
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /html\[data-omnimux-sidebar-toggle-topbar\]\s+\[data-sidebar-collapsed\]\s+\.dshDesktopSidebarSurface[\s\S]*?display:none!important/,
    )
  })

  it('PRODUCT_STAGE_CHROME preserves flexible layout for centerCol under split mode without locking grid to fixed widths', () => {
    assert.match(
      PRODUCT_STAGE_CHROME,
      /min-width:\s*420px\s*!important/,
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /flex:\s*1\s+1\s+0%\s*!important/,
    )
    // 确保没有使用 440px 破坏底座原生的拖拽网格调整
    assert.doesNotMatch(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:[^}]*440px/,
    )
  })

  it('verifies simulated DOM matching for collapsed sidebar in split mode', () => {
    const dom = new JSDOM(`<!doctype html>
<html data-omnimux-sidebar-toggle-topbar data-omnimux-left-collapsed>
<head><style>${PRODUCT_STAGE_CHROME}</style></head>
<body>
  <div class="dshDesktopFrame" data-sidebar-collapsed>
    <div class="dshDesktopSidebarSurface sidebarCol_xyz">
      <div class="logoRow_xyz">Logo</div>
    </div>
    <div class="dshDesktopConversationSurface centerCol_xyz">
      <div data-composer-card>Composer</div>
    </div>
    <div data-sidebar-right-panel="push" data-sidebar-right-open>
      Right Panel Content
    </div>
  </div>
</body>
</html>`)

    const doc = dom.window.document
    const sidebar = doc.querySelector('.dshDesktopSidebarSurface')
    assert.ok(sidebar)
    // 验证选择器能正确命中 sidebar 节点
    assert.ok(sidebar.matches('html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] .dshDesktopSidebarSurface'))
    assert.ok(sidebar.matches('html[data-omnimux-sidebar-toggle-topbar] [data-sidebar-collapsed] [class*="sidebarCol"]'))

    const frame = doc.querySelector('.dshDesktopFrame')
    assert.ok(frame.matches('html[data-omnimux-left-collapsed] .dshDesktopFrame:has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"]))'))

    const rightPanel = doc.querySelector('[data-sidebar-right-panel]')
    assert.ok(rightPanel.matches('html[data-omnimux-left-collapsed] .dshDesktopFrame [data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])'))
  })
})
