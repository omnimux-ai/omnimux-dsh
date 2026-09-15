/**
 * 宿主右侧侧栏全屏态的判定与退出（#rail-active-state-convergence / P3）。
 *
 * 覆盖：面板/镜像双真源判定、退出按钮定位优先级、点击与降级动作、
 * 以及非全屏时的纯 no-op 语义。
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  HOST_FULLSCREEN_MIRROR_SELECTOR,
  HOST_FULLSCREEN_PANEL_SELECTOR,
  exitHostRightSidebarFullscreen,
  findHostFullscreenExitButton,
  isHostRightSidebarFullscreen,
} from './host-fullscreen.js'

const previousWindow = globalThis.window
const previousDocument = globalThis.document
/** @type {JSDOM | undefined} */
let dom

afterEach(() => {
  dom?.window.close()
  dom = undefined
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

/**
 * @param {string} body
 * @returns {Document}
 */
function setupDom(body) {
  dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`)
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return dom.window.document
}

function fullscreenPanel(inner = '') {
  return `<div data-sidebar-right-panel="fullscreen" data-sidebar-right-open>${inner}</div>`
}

test('fullscreen is the official panel key, mirror is only a fallback', () => {
  const doc = setupDom(fullscreenPanel())
  assert.equal(doc.querySelector(HOST_FULLSCREEN_PANEL_SELECTOR) !== null, true)
  assert.equal(isHostRightSidebarFullscreen(doc), true)

  const push = setupDom('<div data-sidebar-right-panel="push" data-sidebar-right-open></div>')
  assert.equal(isHostRightSidebarFullscreen(push), false)

  const closed = setupDom('<div data-sidebar-right-panel="fullscreen"></div>')
  assert.equal(isHostRightSidebarFullscreen(closed), false)
  assert.equal(closed.querySelector(HOST_FULLSCREEN_PANEL_SELECTOR), null)
})

test('the shell mirror counts only when the panel does not disclaim fullscreen', () => {
  const mirrorOnly = setupDom('<div class="dshDesktopFrame" data-rightbar-fullscreen="true"></div>')
  assert.equal(mirrorOnly.querySelector(HOST_FULLSCREEN_MIRROR_SELECTOR) !== null, true)
  assert.equal(isHostRightSidebarFullscreen(mirrorOnly), true)

  const disclaimed = setupDom(
    '<div class="dshDesktopFrame" data-rightbar-fullscreen="true"><div data-sidebar-right-panel="push" data-sidebar-right-open></div></div>',
  )
  assert.equal(isHostRightSidebarFullscreen(disclaimed), false)
})

test('a document without any host evidence is never fullscreen', () => {
  const doc = setupDom('<div class="dshDesktopFrame"></div>')
  assert.equal(isHostRightSidebarFullscreen(doc), false)
  assert.equal(isHostRightSidebarFullscreen(undefined), false)
})

test('the exit control is the official mode button inside the fullscreen panel', () => {
  const doc = setupDom(fullscreenPanel('<button data-sidebar-right-mode="push" id="exit"></button>'))
  const button = findHostFullscreenExitButton(doc)
  assert.equal(button?.id, 'exit')

  const splitOnly = setupDom(fullscreenPanel('<button data-sidebar-right-mode="split" id="split"></button>'))
  assert.equal(findHostFullscreenExitButton(splitOnly)?.id, 'split')

  const labelled = setupDom(fullscreenPanel('<button aria-label="退出全屏" id="label"></button>'))
  assert.equal(findHostFullscreenExitButton(labelled)?.id, 'label')

  // 面板里没有退出控件时，仍可退回官方文档级 push 按钮。
  const documentWide = setupDom(`${fullscreenPanel()}<button data-sidebar-right-mode="push" id="outside"></button>`)
  assert.equal(findHostFullscreenExitButton(documentWide)?.id, 'outside')

  const none = setupDom(fullscreenPanel())
  assert.equal(findHostFullscreenExitButton(none), null)
})

test('the button that would enter fullscreen is never used as the exit control', () => {
  const doc = setupDom(fullscreenPanel('<button data-sidebar-right-mode="fullscreen" id="enter"></button>'))
  assert.equal(findHostFullscreenExitButton(doc), null)
})

test('exiting fullscreen clicks the official control and reports the action', () => {
  const doc = setupDom(fullscreenPanel('<button data-sidebar-right-mode="push" id="exit"></button>'))
  let clicked = 0
  doc.getElementById('exit').addEventListener('click', () => { clicked += 1 })
  assert.equal(exitHostRightSidebarFullscreen(doc), true)
  assert.equal(clicked, 1)
})

test('exiting falls back to the host split focus when no control exists', () => {
  const doc = setupDom(fullscreenPanel())
  const modes = []
  assert.equal(exitHostRightSidebarFullscreen(doc, { setFocus: (mode) => modes.push(mode) }), true)
  assert.deepEqual(modes, ['split'])
})

test('exiting without any control and without a host seam reports failure', () => {
  const doc = setupDom(fullscreenPanel())
  assert.equal(exitHostRightSidebarFullscreen(doc), false)
})

test('exiting a non-fullscreen panel is a pure no-op', () => {
  const doc = setupDom('<div data-sidebar-right-panel="push" data-sidebar-right-open><button data-sidebar-right-mode="push" id="exit"></button></div>')
  let clicked = 0
  doc.getElementById('exit').addEventListener('click', () => { clicked += 1 })
  const modes = []
  assert.equal(exitHostRightSidebarFullscreen(doc, { setFocus: (mode) => modes.push(mode) }), false)
  assert.equal(clicked, 0)
  assert.deepEqual(modes, [])
  assert.equal(exitHostRightSidebarFullscreen(undefined, { setFocus: () => modes.push('split') }), false)
  assert.deepEqual(modes, [])
})
