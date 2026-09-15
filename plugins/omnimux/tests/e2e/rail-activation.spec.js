import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  SidebarActivationArbiter,
  resolveSidebarActiveTarget,
} from '../../src/client/workbench/sidebar-activation.js'
import {
  isHostRightSidebarFullscreen,
  exitHostRightSidebarFullscreen,
} from '../../src/client/workbench/host-fullscreen.js'

test('e2e: rail activation arbiter guarantees single-active with session precedence and fullscreen exit', async () => {
  const dom = new JSDOM(`<!doctype html>
<html>
<head></head>
<body>
  <div id="root">
    <div class="dshDesktopFrame" data-rightbar-open="true" data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true">
      <div data-pane="sidebar" class="sidebarCol">
        <div role="treeitem" aria-selected="true" data-session-id="s-1">会话 1</div>
        <div role="treeitem" aria-selected="false" data-session-id="s-2">会话 2</div>
        <button class="omnimux-sidebar-nav-entry" data-omnimux-workflow-entry="" data-tab-id="omnimux-workflow:library">项目</button>
      </div>
      <div class="centerCol dshDesktopConversationSurface" style="width: 440px;">
        <div data-slot="conversation"></div>
      </div>
      <div class="dshDesktopRightSurface">
        <button data-sidebar-right-mode="push" title="分栏">退出全屏</button>
      </div>
    </div>
  </div>
</body>
</html>`)

  const doc = dom.window.document
  globalThis.document = doc
  globalThis.window = dom.window

  // Mock getBoundingClientRect for JSDOM
  const convColumn = doc.querySelector('[data-slot="conversation"]')
  if (convColumn) {
    convColumn.getBoundingClientRect = () => ({
      width: 440,
      height: 800,
      top: 0,
      left: 220,
      right: 660,
      bottom: 800,
      x: 220,
      y: 0,
      toJSON() {},
    })
  }

  // 1. Initial State: Host rightbar is fullscreen
  assert.equal(isHostRightSidebarFullscreen(doc), true)

  // 2. Scenario A: Click session row while fullscreen -> must exit fullscreen and reveal conversation
  const exitSuccess = exitHostRightSidebarFullscreen(doc)
  assert.equal(exitSuccess, true)

  // Simulate host responding to push click
  const frame = doc.querySelector('.dshDesktopFrame')
  frame.removeAttribute('data-sidebar-right-panel')
  assert.equal(isHostRightSidebarFullscreen(doc), false)

  // 3. Scenario B: Arbiter verdict when session row is selected and conversation is visible
  const arbiter = new SidebarActivationArbiter({ document: doc })
  const verdict = arbiter.getVerdict()
  assert.equal(verdict.winner, 'session')
  assert.equal(verdict.tabId, undefined)

  // Every plugin row must be inactive (Rule 1 outranks plugins)
  assert.equal(arbiter.isRowActive('omnimux-workflow:library'), false)

  // 4. Scenario C: Switch to plugin tab with panel open and no session selected
  const selectedSession = doc.querySelector('[role="treeitem"][aria-selected="true"]')
  selectedSession.setAttribute('aria-selected', 'false')

  let mockSidebarRight = {
    isExpanded: () => true,
    active: () => ({ kind: 'omnimux-workflow:library' }),
  }

  const pluginArbiter = new SidebarActivationArbiter({
    document: doc,
    deps: { sidebarRight: mockSidebarRight },
  })

  const pluginVerdict = pluginArbiter.getVerdict()
  assert.equal(pluginVerdict.winner, 'row')
  assert.equal(pluginVerdict.tabId, 'omnimux-workflow:library')
  assert.equal(pluginArbiter.isRowActive('omnimux-workflow:library'), true)

  // 5. Scenario D: Click session row again -> session immediately reclaims precedence
  selectedSession.setAttribute('aria-selected', 'true')
  pluginArbiter.dirty = true
  const reclaimedVerdict = pluginArbiter.getVerdict()
  assert.equal(reclaimedVerdict.winner, 'session')
  assert.equal(pluginArbiter.isRowActive('omnimux-workflow:library'), false)

  arbiter.dispose()
  pluginArbiter.dispose()
})
