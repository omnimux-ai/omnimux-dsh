import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const h = React.createElement
const primitives = new Proxy({}, { get: (_, key) => key === 'Tooltip' ? ({ children }) => children : () => null })
const built = buildSync({ entryPoints: [resolve(process.env.UI_AUDIT_KIT, 'lib/index.js')], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'] })
function independentKitModule() {
  const module = { exports: {} }
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, (id) => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id))
  return module.exports
}
const kitA = independentKitModule()
const kitB = independentKitModule()
function mount(element) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(element))
  return { host, render: next => act(() => root.render(next)), close: () => { act(() => root.unmount()); host.remove() } }
}

test('independent F1 preserves th callback currentTarget, class, style, ref and icon click', () => {
  const ref = React.createRef()
  let currentTarget
  let count = 0
  const ui = mount(h('table', null, h('thead', null, h('tr', null, h(kitA.TableHead, { ref, className: 'caller-head', style: { width: '123px' }, sortable: true, onClick: e => { currentTarget = e.currentTarget; count++ } }, 'Name')))))
  try {
    act(() => ui.host.querySelector('path').dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    assert.equal(count, 1)
    assert.equal(currentTarget, ref.current)
    assert.equal(ref.current.tagName, 'TH')
    assert.ok(ref.current.classList.contains('caller-head'))
    assert.equal(ref.current.style.width, '123px')
  } finally { ui.close() }
})

test('independent K1 separate plugin-bundled kit modules retain shared lock until last drawer closes', () => {
  // Product build scripts bundle dsh-ui-kit into each ModuleLoader factory.
  // These two evaluations model that actual module isolation, not two imports
  // of the same cached module (which would hide cross-bundle ownership bugs).
  document.body.style.overflow = 'auto'
  const a = mount(h(kitA.Drawer, { open: true, onClose() {}, closable: false }, 'A'))
  const b = mount(h(kitB.Drawer, { open: true, onClose() {}, closable: false }, 'B'))
  try {
    assert.equal(document.body.style.overflow, 'hidden')
    a.render(null)
    assert.equal(document.body.style.overflow, 'hidden', 'drawer B is still open after drawer A releases its independent kit module lock')
    b.render(null)
    assert.equal(document.body.style.overflow, 'auto')
  } finally { a.close(); b.close(); document.body.style.overflow = '' }
})

test('independent K2 cancelled descendant event does not toggle tile', () => {
  let changes = 0
  const ui = mount(h(kitA.SelectableTile, { id: 'a', title: 'A', onChange: () => changes++, extra: h('span', { onClick: e => e.preventDefault() }, 'cancel') }))
  try {
    const node = [...ui.host.querySelectorAll('span')].find(n => n.textContent === 'cancel')
    act(() => node.click())
    assert.equal(changes, 0)
  } finally { ui.close() }
})

test('independent K3 rejected modern clipboard falls back without losing original focus', async () => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('permission denied') } } })
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  document.execCommand = () => true
  try {
    assert.equal(await kitA.copyToClipboard('synthetic QA'), true)
    assert.equal(document.activeElement, input)
    assert.equal(document.querySelectorAll('textarea').length, 0)
  } finally { input.remove() }
})
