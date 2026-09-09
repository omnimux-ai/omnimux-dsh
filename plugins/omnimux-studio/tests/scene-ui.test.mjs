import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { ScopeRegistry } from '../src/client/scope-registry.js'
const require = createRequire(import.meta.url)
test('rendered scene chips filter real cards and image examples assemble without charging', async () => {
  const dom = new JSDOM('<div id="app"></div>', { pretendToBeVisual: true })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'), { createRoot } = require('react-dom/client')
  const bundle = await build({ entryPoints: [new URL('../src/client/StudioStage.jsx', import.meta.url).pathname], bundle: true, format: 'cjs', platform: 'node', loader: { '.css': 'text', '.js': 'jsx' }, external: ['react'], write: false })
  const module = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require, document, crypto, URL, structuredClone, AbortController, setTimeout, clearTimeout })
  const registry = new ScopeRegistry()
  const scope = { cwd: '/scene-test', sessionId: 's' }
  const store = registry.getOrCreate(scope)
  const root = createRoot(document.getElementById('app'))
  const click = async text => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent === text)
    assert.ok(button, text)
    await React.act(async () => button.click())
  }
  try {
    await React.act(async () => root.render(React.createElement(module.exports.StudioStage, { registry, scope, visible: true })))
    assert.equal(document.querySelectorAll('.studio-example').length, 8)
    const retainedRoot = document.querySelector('[data-omnimux-studio]')
    await React.act(async () => root.render(React.createElement(module.exports.StudioStage, { registry, scope, visible: false })))
    assert.equal(document.querySelector('[data-omnimux-studio]'), retainedRoot)
    assert.equal(retainedRoot.hidden, true)
    await React.act(async () => root.render(React.createElement(module.exports.StudioStage, { registry, scope, visible: true })))
    assert.equal(document.querySelector('[data-omnimux-studio]'), retainedRoot)
    assert.equal(retainedRoot.hidden, false)
    await click('模特试穿')
    assert.equal(document.querySelectorAll('.studio-example').length, 1)
    assert.match(document.querySelector('.studio-example').textContent, /欧美职业女性/)
    await click('全部场景')
    assert.equal(document.querySelectorAll('.studio-example').length, 8)
    await click('图片历史与示例'); await click('示例')
    const prompt = document.querySelector('.studio-example p:nth-child(2)').textContent
    await click('装配样例正文'); await click('确认')
    assert.equal(store.getSnapshot().view, 'dashboard')
    assert.equal(store.getSnapshot().drafts.image.document.parts[0].text, prompt)
    assert.equal(store.getSnapshot().mockCredits, 3463)
    assert.equal(store.getSnapshot().tasks.length, 0)
  } finally { await React.act(async () => root.unmount()); registry.disposeAll(); dom.window.close() }
})
