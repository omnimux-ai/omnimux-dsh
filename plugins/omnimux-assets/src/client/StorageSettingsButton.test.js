import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

test('settings tooltip portals viewport coordinates and preserves keyboard activation', async () => {
  const dom = new JSDOM('<body><div id="root" style="contain:layout style"></div></body>', { url: 'http://localhost' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const frames = new Map()
  let frameId = 0
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
  window.cancelAnimationFrame = id => frames.delete(id)
  const flushFrame = () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback()
  }
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { act } = React
  const compiled = await build({ entryPoints: [new URL('./StorageSettingsButton.jsx', import.meta.url).pathname], bundle: true,
    write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'dsh-ui-kit', '@deepseek-ai/dsh-client-ui-primitives'] })
  const mod = { exports: {} }
  const kit = { IconButton: React.forwardRef(({ children, title, variant, ...props }, ref) => React.createElement('button', { ...props, ref, 'data-title': title, 'data-variant': variant }, children)) }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)((name) => {
    if (name === 'dsh-ui-kit') return kit
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { IconSettingsOutline16: () => React.createElement('svg', { width: 16, height: 16 }) }
    return require(name)
  }, mod, mod.exports)
  const root = createRoot(document.getElementById('root'))
  let clicks = 0
  try {
    await act(async () => root.render(React.createElement(mod.exports.StorageSettingsButton, { label: '资产库设置', onClick: () => clicks++ })))
    const button = document.querySelector('button')
    button.getBoundingClientRect = () => ({ left: 400, right: 432, width: 32, top: 100, bottom: 132, height: 32 })
    await act(async () => button.focus())
    let tip = document.querySelector('[role="tooltip"]')
    assert.equal(tip.parentElement, document.body)
    assert.equal(button.getAttribute('aria-describedby'), tip.id)
    assert.equal(button.getAttribute('aria-label'), '资产库设置')
    assert.equal(button.getAttribute('data-title'), '')
    assert.equal(button.getAttribute('data-variant'), 'ghost')
    assert.equal(button.querySelector('svg').getAttribute('width'), '16')
    tip.getBoundingClientRect = () => ({ width: 100, height: 26 })
    await act(async () => { window.dispatchEvent(new window.Event('resize')); flushFrame() })
    assert.equal(tip.style.getPropertyValue('--assets-tooltip-left'), '366px')
    assert.equal(tip.style.getPropertyValue('--assets-tooltip-top'), '140px')

    // Parent layout can translate a fixed-size anchor after resize and several stable frames.
    window.innerWidth = 1280
    await act(async () => { window.dispatchEvent(new window.Event('resize')); flushFrame() })
    for (let index = 0; index < 100; index++) flushFrame()
    button.getBoundingClientRect = () => ({ left: 668, width: 32, top: 100, bottom: 132, height: 32 })
    tip.getBoundingClientRect = () => ({ width: 79, height: 26 })
    await act(async () => flushFrame())
    assert.equal(Number.parseFloat(tip.style.getPropertyValue('--assets-tooltip-left')) + 79 / 2, 684)
    assert.equal(tip.style.getPropertyValue('--assets-tooltip-top'), '140px')
    assert.equal(frames.size, 1, 'Only one frame may be pending while visible')
    const setProperty = tip.style.setProperty.bind(tip.style)
    let styleWrites = 0
    tip.style.setProperty = (...args) => { styleWrites++; setProperty(...args) }
    for (let index = 0; index < 10; index++) flushFrame()
    assert.equal(styleWrites, 0, 'Stable geometry must not cause style writes')

    // Translation without any viewport event still follows the anchor.
    button.getBoundingClientRect = () => ({ left: 643, width: 32, top: 150, bottom: 182, height: 32 })
    await act(async () => flushFrame())
    assert.equal(tip.style.getPropertyValue('--assets-tooltip-left'), '619.5px')
    assert.equal(tip.style.getPropertyValue('--assets-tooltip-top'), '190px')
    window.innerWidth = 1024
    tip.getBoundingClientRect = () => ({ width: 100, height: 26 })
    button.getBoundingClientRect = () => ({ left: 1000, width: 32, top: 740, bottom: 772 })
    await act(async () => { window.dispatchEvent(new window.Event('scroll')); flushFrame() })
    assert.equal(tip.style.getPropertyValue('--assets-tooltip-left'), '912px')
    assert.equal(tip.style.getPropertyValue('--assets-tooltip-top'), '706px')
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="tooltip"]'), null)
    assert.equal(frames.size, 0, 'Hidden tooltip must cancel its frame')
    await act(async () => { button.blur(); button.focus() })
    assert.ok(document.querySelector('[role="tooltip"]'))
    await act(async () => button.click())
    assert.equal(clicks, 1)
    assert.equal(document.querySelector('[role="tooltip"]'), null)
    assert.equal(frames.size, 0, 'Hidden tooltip must cancel its frame')
    await act(async () => {
      button.blur()
      button.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 300))
    })
    assert.ok(document.querySelector('[role="tooltip"]'))
    await act(async () => button.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true })))
    assert.equal(document.querySelector('[role="tooltip"]'), null)
    assert.equal(frames.size, 0, 'Hidden tooltip must cancel its frame')
    await act(async () => button.focus())
    assert.equal(frames.size, 1)
  } finally {
    await act(async () => root.unmount())
    assert.equal(frames.size, 0, 'Unmount must cancel the visible tooltip frame')
    dom.window.close()
    delete globalThis.window
    delete globalThis.document
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
