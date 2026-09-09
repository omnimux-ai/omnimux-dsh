import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const h = React.createElement
const primitives = new Proxy({}, { get: (_, key) => key === 'Tooltip' ? ({ children }) => children : () => null })
const built = buildSync({ entryPoints: [resolve(process.env.UI_AUDIT_KIT, 'lib/index.js')], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'] })
function loadKit() {
  const module = { exports: {} }
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, id => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id))
  return module.exports
}
function mount(kit, container, strict) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let closed = false
  const render = open => act(() => root.render(h(strict ? React.StrictMode : React.Fragment, null, h(kit.Drawer, { open, container, onClose() {}, closable: false }, 'Drawer'))))
  render(true)
  return { render, close() { if (!closed) { act(() => root.unmount()); host.remove(); closed = true } } }
}

for (const order of [[0, 1], [1, 0]]) {
  for (const release of ['close', 'unmount']) {
    for (const strict of [false, true]) {
      test(`independent modules ${order.join('→')} ${release}, StrictMode=${strict}`, () => {
        document.body.style.overflow = 'auto'
        const a = loadKit()
        const drawers = [mount(a, undefined, strict)]
        // Evaluate B while A owns the lock, as when a second plugin loads lazily.
        drawers.push(mount(loadKit(), undefined, strict))
        try {
          assert.equal(document.body.style.overflow, 'hidden')
          const dispose = i => release === 'unmount' ? drawers[i].close() : drawers[i].render(false)
          dispose(order[0])
          assert.equal(document.body.style.overflow, 'hidden')
          dispose(order[1])
          assert.equal(document.body.style.overflow, 'auto')
          if (release === 'close') {
            drawers[1].render(true)
            assert.equal(document.body.style.overflow, 'hidden')
            drawers[1].render(false)
            assert.equal(document.body.style.overflow, 'auto')
          }
        } finally { drawers.forEach(drawer => drawer.close()); document.body.style.overflow = '' }
      })
    }
  }
}

test('independent modules share custom container owners without locking other containers', () => {
  const one = document.createElement('section')
  const two = document.createElement('section')
  one.style.overflow = 'scroll'
  two.style.overflow = 'auto'
  document.body.append(one, two)
  const a = loadKit()
  const b = loadKit()
  const drawers = [mount(a, one, false), mount(b, one, false), mount(b, two, false)]
  try {
    drawers[0].close()
    assert.equal(one.style.overflow, 'hidden')
    drawers[2].close()
    assert.equal(two.style.overflow, 'auto')
    assert.equal(one.style.overflow, 'hidden')
    assert.equal(document.body.style.overflow, '')
    drawers[1].close()
    assert.equal(one.style.overflow, 'scroll')
  } finally { drawers.forEach(drawer => drawer.close()); one.remove(); two.remove() }
})

test('built PageHeader CSS preserves the authorized no-divider rule', () => {
  const kit = loadKit()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() => root.render(h(kit.PageHeader, { title: 'Header' })))
    const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules])
    const header = host.firstElementChild
    const rule = rules.find(rule => rule.selectorText && header.matches(rule.selectorText) && rule.style.getPropertyValue('border-bottom'))
    assert.ok(rule, 'the built CSS must contain the PageHeader rule')
    assert.equal(rule.style.getPropertyValue('border-bottom-style'), 'none')
    assert.equal(window.getComputedStyle(header).borderBottomStyle, 'none')
  } finally { act(() => root.unmount()); host.remove() }
})
