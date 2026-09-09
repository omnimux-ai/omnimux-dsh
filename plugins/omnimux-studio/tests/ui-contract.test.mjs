import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const source = path => readFileSync(new URL(`../src/client/${path}`, import.meta.url), 'utf8')
test('F01/F02/F03/F14 static local CSS, no chrome and portable build', () => {
  const css = source('studio.css')
  for (const block of css.split('}').filter(item => item.trim())) {
    const selectors = block.split('{')[0].split(',')
    for (const selector of selectors) assert(selector.trim().startsWith('[data-omnimux-studio]'), selector)
  }
  assert.doesNotMatch(css, /:root|position:\s*fixed|--dsw-[\w-]+\s*:/)
  assert.doesNotMatch(source('StudioStage.jsx'), /StudioHeader|claimProductStage|localStorage|pushState/)
  assert.doesNotMatch(readFileSync(new URL('../scripts/build-client.mjs', import.meta.url), 'utf8'), /\/Users\/|\.pnpm|readdirSync/)
  assert.match(source('styles.js'), /return \(\) => style.remove\(\)/)
})
test('F07 rendered editor handles token Enter, IME, ordered text and Backspace', async () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { pretendToBeVisual: true, url: 'http://localhost/' })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.requestAnimationFrame = callback => { callback(); return 1 }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { act } = React
  const bundle = await build({ entryPoints: [new URL('../src/client/components/OrderedEditor.jsx', import.meta.url).pathname], bundle: true, format: 'cjs', platform: 'node', external: ['react', 'dsh-ui-kit'], write: false })
  const module = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' ? React : { Button: props => React.createElement('button', props) }, crypto, URL, requestAnimationFrame, navigator: {} })
  const { OrderedEditor } = module.exports
  let submissions = 0
  const initial = { version: 1, parts: [{ id: 'a', kind: 'text', text: 'A' }, { id: 'b', kind: 'url-token', tokenType: 'product', value: 'SKU_1', validation: 'valid' }, { id: 'c', kind: 'text', text: 'B' }, { id: 'd', kind: 'url-token', tokenType: 'video', value: 'https://example.org/v', validation: 'valid' }, { id: 'e', kind: 'text', text: 'C' }] }
  function App() { const [document, onChange] = React.useState(initial); return React.createElement(OrderedEditor, { document, onChange, onSubmit: () => submissions++, allowTokens: true }) }
  const root = createRoot(document.getElementById('app'))
  await act(async () => root.render(React.createElement(App)))
  const node = id => document.querySelector(`[data-part-id="${id}"]`)
  const key = async (element, value, properties = {}) => act(async () => { element.focus(); element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...properties })) })
  assert.deepEqual([...document.querySelectorAll('[data-part-id]')].map(item => item.value), ['A', 'SKU_1', 'B', 'https://example.org/v', 'C'])
  await key(node('b'), 'Enter', { ctrlKey: true })
  assert.equal(submissions, 0)
  assert.equal(document.activeElement, node('c'))
  await key(node('d'), 'Enter', { isComposing: true })
  assert.equal(submissions, 0)
  assert.equal(document.activeElement, node('d'))
  await key(node('a'), 'Enter', { isComposing: true, ctrlKey: true })
  assert.equal(submissions, 0)
  await key(node('a'), 'Enter')
  assert.equal(submissions, 0)
  await key(node('a'), 'Enter', { ctrlKey: true })
  assert.equal(submissions, 1)
  node('c').setSelectionRange(0, 0)
  await key(node('c'), 'Backspace')
  assert(node('b'))
  await key(node('c'), 'Backspace')
  assert.equal(node('b'), null)
  assert.equal(document.activeElement, node('a'))
  await act(async () => root.unmount())
  dom.window.close()
})
