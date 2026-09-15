import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  findWorkbenchPanelElement,
  WORKBENCH_PANEL_ATTR,
} from './geometry.js'
import {
  tagWorkbenchPanel,
} from './split-layout.js'

test('findWorkbenchPanelElement strictly ignores .dshDesktopFrame when frame carries data-dragging', () => {
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body>
        <div class="dshDesktopFrame" data-dragging="true" style="width: 1728px; height: 900px;">
          <aside class="dshDesktopSidebarSurface" style="width: 280px;"></aside>
          <main class="dshDesktopConversationSurface" style="width: 600px;"></main>
          <aside class="dshDesktopRightbarSurface" style="width: 848px;">
            <div class="Ng7Ira_panel" data-sidebar-right-panel="push" data-sidebar-right-open="true" style="width: 848px;">
              <div class="panelResize_handle"></div>
            </div>
          </aside>
        </div>
      </body>
    </html>`, {
    url: 'http://127.0.0.1:45120/',
  })

  const doc = dom.window.document
  const frame = doc.querySelector('.dshDesktopFrame')
  const panel = doc.querySelector('.Ng7Ira_panel')

  // 1. Frame has data-dragging, but MUST NOT be identified as workbench panel
  const resolved = findWorkbenchPanelElement(doc)
  assert.notEqual(resolved, frame, 'findWorkbenchPanelElement must never return .dshDesktopFrame')
  assert.equal(resolved, panel, 'findWorkbenchPanelElement should resolve actual right panel')

  // 2. If frame accidentally had WORKBENCH_PANEL_ATTR, tagWorkbenchPanel removes it
  frame.setAttribute(WORKBENCH_PANEL_ATTR, '')
  tagWorkbenchPanel(doc)
  assert.equal(frame.hasAttribute(WORKBENCH_PANEL_ATTR), false, 'frame must not retain WORKBENCH_PANEL_ATTR')
  assert.equal(panel.hasAttribute(WORKBENCH_PANEL_ATTR), true, 'panel should receive WORKBENCH_PANEL_ATTR')
})
