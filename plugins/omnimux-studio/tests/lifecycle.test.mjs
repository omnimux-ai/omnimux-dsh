import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const bundled = await build({ entryPoints: [new URL('../src/client/index.js', import.meta.url).pathname], bundle: true, format: 'cjs', platform: 'node', loader: { '.css': 'text', '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'dsh-ui-kit'], write: false })
const React = { createContext: () => ({}), createElement: (type, props) => ({ type, props }) }
function load(document) {
  const module = { exports: {} }
  vm.runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' ? React : {}, console, document, crypto, setTimeout, clearTimeout, structuredClone, URL, AbortController })
  return module.exports
}
test('F11/F12 ten dependency injection cycles dispose tab/locale/style/registry exactly once', () => {
  const document = new JSDOM('<!doctype html><head></head><body></body>').window.document
  const { apply } = load(document)
  const tabs = new Map(), locales = new Map()
  let registered = 0, unregistered = 0, translations = 0
  const sidebar = { registerTab: descriptor => {
    assert.equal(tabs.has(descriptor.id), false)
    tabs.set(descriptor.id, descriptor); registered++
    return () => { assert(tabs.delete(descriptor.id)); unregistered++ }
  } }
  const locale = { register: (ns, dicts) => { assert.equal(locales.has(ns), false); locales.set(ns, dicts); return () => { assert(locales.delete(ns)) } }, bind: ns => key => { translations++; return locales.get(ns)['zh-CN'][key] } }
  for (let index = 0; index < 10; index++) {
    const effects = []
    apply({ inject: (_dependencies, callback) => callback({ betterSidebar: sidebar, locale, effect: factory => effects.push(factory()) }) })
    assert.equal(tabs.size, 1)
    assert.equal(document.querySelectorAll('#omnimux-studio-styles').length, 1)
    const descriptor = tabs.values().next().value
    assert.equal(descriptor.title(), '视觉工坊')
    const element = descriptor.component({ scope: { cwd: '/a', sessionId: 's' }, visible: true })
    const registry = element.props.registry
    const store = registry.getOrCreate({ cwd: '/a', sessionId: 's' })
    descriptor.onClose({}, { cwd: '/a', sessionId: 's' })
    assert(store.disposed)
    registry.getOrCreate({ cwd: '/a', sessionId: 's' })
    for (const effect of effects.reverse()) effect()
    assert.equal(registry.stores.size, 0)
    assert.equal(locales.size, 0)
    assert.equal(tabs.size, 0)
    assert.equal(document.querySelectorAll('#omnimux-studio-styles').length, 0)
  }
  assert.equal(registered, 10); assert.equal(unregistered, 10); assert.equal(translations, 10)
})
test('F11 absent dependencies produce no style or fallback when injector waits', () => {
  const document = new JSDOM('<!doctype html><head></head><body></body>').window.document
  const { apply, inject } = load(document)
  assert.deepEqual(Array.from(inject), ['betterSidebar', 'locale'])
  let dependencies
  apply({ inject: names => { dependencies = names } })
  assert.deepEqual(Array.from(dependencies), ['betterSidebar', 'locale'])
  assert.equal(document.head.children.length, 0)
})
