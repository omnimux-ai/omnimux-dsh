import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { syncNativeRightbarControls, triggerClick } from './sidebar-toggle-topbar.js'

// Integration evidence only: real React delegation and DOM propagation, not
// assembled-application Web acceptance or a replacement for the native store.
for (const mode of ['push', 'fullscreen']) {
  test(`native controls preserve React ownership and one action per click (${mode})`, () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost' })
    const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, MouseEvent: globalThis.MouseEvent }
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, MouseEvent: dom.window.MouseEvent })
    const doc = dom.window.document
    const events = []
    const obsoleteCommands = []
    dom.window.__omnimuxWorkbench = { setFocus: value => obsoleteCommands.push(value), open: () => obsoleteCommands.push('open'), getFocus: () => 'gui' }
    let expanded = false
    let modeActions = 0
    const root = createRoot(doc.getElementById('root'))
    const h = React.createElement
    const render = () => flushSync(() => root.render(h('div', { className: 'dshDesktopFrame', 'data-rightbar-collapsed': String(!expanded), 'data-sidebar-collapsed': '' },
      h('div', { 'data-conversation-header-corner': '' }, !expanded && h('button', { 'data-sidebar-right-expand': '', onClick: () => { events.push('expand'); expanded = true; render() } }, 'expand')),
      h('div', { 'data-sidebar-right-panel': mode, 'aria-hidden': !expanded },
        h('div', { 'data-dockkit-strip-chrome': 'true' }, h('button', { 'data-sidebar-right-toggle': '', onClick: () => { events.push('toggle'); expanded = !expanded; render() } }, 'collapse')),
        h('div', { 'data-mode-owner': '' },
          h('button', { 'data-dockkit-split-button': '' }, 'split'),
          h('button', { 'data-sidebar-right-mode': '', onClick: () => { modeActions += 1 } }, 'mode')),
        h('div', { id: 'content' }, 'retained content')))))
    try {
      render()
      const content = doc.getElementById('content')
      for (let cycle = 0; cycle < 3; cycle += 1) {
        syncNativeRightbarControls(doc)
        const expand = doc.querySelector('[data-sidebar-right-expand]')
        assert.equal(expand.parentElement.hasAttribute('data-conversation-header-corner'), true)
        assert.ok(doc.querySelector('[data-dockkit-strip-chrome] [data-sidebar-right-toggle]'))
        expand.click()
        assert.equal(expanded, true)
        syncNativeRightbarControls(doc)
        assert.equal(doc.querySelector('[data-sidebar-right-expand]'), null)
        const modeButton = doc.querySelector('[data-sidebar-right-mode]')
        assert.equal(modeButton.previousElementSibling.hasAttribute('data-dockkit-split-button'), true)
        modeButton.click()
        assert.equal(modeActions, cycle + 1)
        doc.querySelector('[data-sidebar-right-toggle]').click()
        assert.equal(expanded, false)
        assert.equal(doc.getElementById('content'), content)
        assert.equal(doc.querySelectorAll('[data-original-parent]').length, 0)
        assert.equal(doc.querySelector('.dshDesktopFrame').hasAttribute('data-sidebar-collapsed'), true)
      }
      assert.deepEqual(events, ['expand', 'toggle', 'expand', 'toggle', 'expand', 'toggle'])
      assert.deepEqual(obsoleteCommands, [])
    } finally {
      flushSync(() => root.unmount())
      Object.assign(globalThis, previous)
      dom.window.close()
    }
  })
}

test('non-React trigger dispatches one click even when default is prevented', () => {
  const dom = new JSDOM('<button>action</button>')
  const previous = { window: globalThis.window, MouseEvent: globalThis.MouseEvent }
  Object.assign(globalThis, { window: dom.window, MouseEvent: dom.window.MouseEvent })
  try {
    const button = dom.window.document.querySelector('button')
    let count = 0
    button.addEventListener('click', event => { count += 1; event.preventDefault() })
    triggerClick(button)
    assert.equal(count, 1)
  } finally {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
})
