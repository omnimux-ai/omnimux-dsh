import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { bindWorkbenchDeps, resetWorkbenchHostAdapter } from './host-adapter.js'
import {
  installRightbarStateMirror,
  RIGHTBAR_FULLSCREEN_ATTR,
  RIGHTBAR_OPEN_ATTR,
} from './rightbar-state-mirror.js'

let dom
let uninstall

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  resetWorkbenchHostAdapter()
  dom?.window.close()
  dom = undefined
})

function setup(body, mounted = 'session-b') {
  dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`)
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  bindWorkbenchDeps({ sidebarRight: { mounted: { getSnapshot: () => mounted } } })
  return dom.window.document
}

test('镜像只反映当前会话面板，不反映隐藏旧会话', () => {
  const doc = setup(`
    <div data-sidebar-right-session="session-a" hidden>
      <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>
    </div>
    <div data-sidebar-right-session="session-b">
      <div data-sidebar-right-panel="push" data-sidebar-right-open></div>
    </div>
  `)
  uninstall = installRightbarStateMirror(doc)
  assert.equal(doc.documentElement.getAttribute(RIGHTBAR_OPEN_ATTR), 'true')
  assert.equal(doc.documentElement.hasAttribute(RIGHTBAR_FULLSCREEN_ATTR), false)
})

test('当前会话切到无面板时移除镜像属性', async () => {
  const doc = setup(`
    <div data-sidebar-right-session="session-a">
      <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>
    </div>
    <div data-sidebar-right-session="session-b" hidden>
      <div data-sidebar-right-panel="push"></div>
    </div>
  `, 'session-a')
  uninstall = installRightbarStateMirror(doc)
  assert.equal(doc.documentElement.getAttribute(RIGHTBAR_FULLSCREEN_ATTR), 'true')
  bindWorkbenchDeps({ sidebarRight: { mounted: { getSnapshot: () => 'session-b' } } })
  doc.querySelector('[data-sidebar-right-session="session-a"]').setAttribute('hidden', '')
  doc.querySelector('[data-sidebar-right-session="session-b"]').removeAttribute('hidden')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(doc.documentElement.hasAttribute(RIGHTBAR_OPEN_ATTR), false)
  assert.equal(doc.documentElement.hasAttribute(RIGHTBAR_FULLSCREEN_ATTR), false)
})
