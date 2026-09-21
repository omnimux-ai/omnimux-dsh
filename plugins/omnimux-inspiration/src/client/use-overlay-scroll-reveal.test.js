import assert from 'node:assert/strict'
import { after, it } from 'node:test'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { OVERLAY_SCROLL_REVEAL_MS, useOverlayScrollReveal } from './use-overlay-scroll-reveal.js'

const bootstrap = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost:3000' })
globalThis.window = bootstrap.window
globalThis.document = bootstrap.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true

after(() => bootstrap.window.close())

function Probe({ onReady }) {
  const overlay = useOverlayScrollReveal('extra-class')
  onReady(overlay)
  return createElement('div', overlay)
}

it('reveals the thumb class while scrolling and drops it after dwell', async () => {
  const timers = []
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms })
    return timers.length
  }
  globalThis.clearTimeout = () => {}
  let overlay
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await import('react').then((React) => React.act(() => {
      root.render(createElement(Probe, { onReady: (value) => { overlay = value } }))
    }))
    assert.match(overlay.className, /omnimux-inspiration-overlay-scroll/)
    assert.match(overlay.className, /extra-class/)
    const node = host.firstElementChild
    node.dispatchEvent(new bootstrap.window.Event('scroll'))
    overlay.onScroll({ currentTarget: node })
    assert.equal(node.classList.contains('is-scrolling'), true)
    assert.equal(timers.at(-1)?.ms, OVERLAY_SCROLL_REVEAL_MS)
    timers.at(-1).fn()
    assert.equal(node.classList.contains('is-scrolling'), false)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    await import('react').then((React) => React.act(() => root.unmount()))
    host.remove()
  }
})
