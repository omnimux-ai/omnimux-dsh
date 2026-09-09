import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)

test('Escape cancels a pending hover tooltip before its delay expires', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<body><div id="root"></div></body>', { url: 'http://localhost' })
  const previous = Object.fromEntries(['window', 'document', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true })
  const React = require('react')
  const { act } = React
  const { createRoot } = require('react-dom/client')
  const compiled = await build({
    entryPoints: [new URL('./StorageSettingsButton.jsx', import.meta.url).pathname],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'dsh-ui-kit', '@deepseek-ai/dsh-client-ui-primitives'],
  })
  const module = { exports: {} }
  const IconButton = React.forwardRef(({ children, title, variant, ...props }, ref) => React.createElement('button', { ...props, ref }, children))
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)((name) => {
    if (name === 'dsh-ui-kit') return { IconButton }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { IconSettingsOutline16: () => React.createElement('svg') }
    return require(name)
  }, module, module.exports)
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(React.createElement(module.exports.StorageSettingsButton, { label: 'Asset library settings', onClick() {} })))
    const button = document.querySelector('button')
    await act(async () => button.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })))
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await act(async () => new Promise(resolve => setTimeout(resolve, 320)))
    assert.ok(!document.querySelector('[role="tooltip"]'), 'Escape must cancel pending hover, not reveal the tooltip afterwards')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})
