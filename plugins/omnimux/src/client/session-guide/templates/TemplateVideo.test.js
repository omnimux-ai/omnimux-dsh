import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// In-memory JSX transform only; no application bundle or browser is started.
const module = { exports: {} }
const source = readFileSync(new URL('./TemplateVideo.jsx', import.meta.url), 'utf8')
new Function('require', 'module', 'exports', transformSync(source, { loader: 'jsx', format: 'cjs' }).code)(createRequire(import.meta.url), module, module.exports)
const { TemplateVideo } = module.exports

test('preview lifecycle: policy retry, visibility, cancellation and resource errors (mock media)', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true })
  const keys = ['window', 'document', 'IntersectionObserver', 'IS_REACT_ACT_ENVIRONMENT']
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  let observerCallback
  let disconnected = false
  let hidden = false
  let plays = 0
  let pauses = 0
  let failures = 0
  let rejection = 'NotAllowedError'
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
    IntersectionObserver: class {
      constructor(callback) { observerCallback = callback }
      observe() {}
      disconnect() { disconnected = true }
    } })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  dom.window.HTMLMediaElement.prototype.play = function () {
    plays++
    return rejection ? Promise.reject(Object.assign(new Error('mock'), { name: rejection })) : Promise.resolve()
  }
  dom.window.HTMLMediaElement.prototype.pause = function () { pauses++ }
  const root = createRoot(document.getElementById('root'))
  const props = { src: 'https://cdn.example.com/a.mp4', className: 'preview', onError: () => failures++ }
  const render = async (extra = {}) => act(async () => root.render(React.createElement(TemplateVideo, { ...props, ...extra })))
  try {
    await render()
    const video = document.querySelector('video')
    assert.equal(video.hasAttribute('src'), false)
    await act(async () => observerCallback([{ isIntersecting: true, intersectionRatio: 1 }]))
    assert.equal(plays, 0)
    await render({ active: true })
    assert.equal(plays, 1)
    assert.equal(failures, 0, 'policy rejection must not poison parent error state')
    assert.ok(video.classList.contains('is-preview-pending'))
    rejection = null
    await render({ active: false })
    assert.equal(video.hasAttribute('src'), false)
    await render({ active: true })
    assert.equal(plays, 2, 'next activation retries')
    await act(async () => video.dispatchEvent(new dom.window.Event('playing')))
    assert.equal(video.classList.contains('is-preview-pending'), false)
    assert.equal(video.muted, true)
    assert.equal(video.loop, true)
    assert.equal(video.hasAttribute('playsinline'), true)
    hidden = true
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.equal(video.hasAttribute('src'), false)
    hidden = false
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.equal(plays, 3)
    await act(async () => observerCallback([{ isIntersecting: false, intersectionRatio: 0 }]))
    assert.equal(video.hasAttribute('src'), false)
    rejection = 'AbortError'
    await act(async () => observerCallback([{ isIntersecting: true, intersectionRatio: 1 }]))
    assert.equal(failures, 0)
    await render({ active: false })
    rejection = 'NotSupportedError'
    await render({ active: true })
    assert.equal(failures, 1)
    await act(async () => video.dispatchEvent(new dom.window.Event('error')))
    assert.equal(failures, 2)
    const beforeDetail = plays
    await render({ controls: true })
    assert.equal(plays, beforeDetail, 'detail never auto plays')
    assert.equal(video.controls, true)
    assert.equal(video.preload, 'none')
    video.currentTime = 7
    const beforeHide = pauses
    hidden = true
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.ok(pauses > beforeHide, 'hidden detail pauses')
    assert.equal(video.getAttribute('src'), props.src, 'detail retains its source while hidden')
    assert.equal(video.currentTime, 7)
    hidden = false
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    const beforeScroll = pauses
    await act(async () => observerCallback([{ isIntersecting: false, intersectionRatio: 0 }]))
    assert.ok(pauses > beforeScroll, 'offscreen detail pauses')
    assert.equal(video.getAttribute('src'), props.src)
    assert.equal(video.currentTime, 7)
    await act(async () => observerCallback([{ isIntersecting: true, intersectionRatio: 1 }]))
    assert.equal(plays, beforeDetail, 'detail visibility recovery never auto plays')
    const beforeUnmount = pauses
    await act(async () => root.unmount())
    assert.ok(pauses > beforeUnmount)
    assert.equal(disconnected, true)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    keys.forEach((key, index) => previous[index] ? Object.defineProperty(globalThis, key, previous[index]) : delete globalThis[key])
  }
})
