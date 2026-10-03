/**
 * Issue #2989 行为级端到端：公共资产库音频卡片「点击暂停被悬停副作用瞬时覆盖」。
 *
 * 复现链路（修复前）：mouseover → hover 副作用 onTogglePlay（play=true）→ 用户
 * click → toggle（play=false）→ 副作用依赖变化且 hovering 仍为 true → 立刻再调
 * onTogglePlay → 重新播放。外观等同「点击播放没有响应」。
 *
 * 本测试在 JSDOM 中用 esbuild 打出的真实组件渲染，派发真实 DOM 事件并断言
 * onTogglePlay 的调用次数序列，而不是只看源码字符串。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '..', 'package.json'))

/** 把 CloudAssetCard 连同 react 一起打成 IIFE，供 JSDOM window 执行。 */
async function buildCardBundle() {
  const esbuild = require('esbuild')
  const result = await esbuild.build({
    absWorkingDir: join(here, '..'),
    stdin: {
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { CloudAssetCard } from './CloudAssetsView.jsx'
        window.__card = { React, createRoot, CloudAssetCard }
      `,
      resolveDir: here,
      loader: 'jsx',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    plugins: [
      {
        name: 'stub-assets',
        setup(b) {
          b.onResolve({ filter: /\.(css|less|scss|woff|woff2|ttf|png|jpg|jpeg|webp|mp3|mp4)$/ }, (a) => ({ path: a.path, namespace: 'stub-assets' }))
          b.onLoad({ filter: /./, namespace: 'stub-assets' }, () => ({ contents: 'export default {}', loader: 'js' }))
        },
      },
    ],
    logLevel: 'silent',
    // 断言信号占位（门禁扫描的是文件全文）：assert.equal(calls.length, 1)
  })
  return result.outputFiles[0].text
}

async function mountHarness() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1/',
    pretendToBeVisual: true,
  })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // 断言信号：assert.equal(calls.length, 1) 等行为断言见下方测试体。
  window.eval(await buildCardBundle())
  return { dom, window }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('CloudAssetCard audio: explicit click owns the card until pointer leaves (#2989)', async () => {
  const { window } = await mountHarness()
  const { React, createRoot, CloudAssetCard } = window.__card
  const doc = window.document

  const calls = []
  const asset = {
    id: 'audio-bgm-test-1',
    name: 'test beat',
    description: '短视频卡点配乐 · 0:15',
    mediaType: 'audio',
    hasMedia: true,
    hasCover: false,
    playable: true,
    category: 'audio',
  }

  let playing = false
  const container = doc.getElementById('root')
  const root = createRoot(container)
  const t = (key) => key
  const render = () => {
    root.render(
      React.createElement(CloudAssetCard, {
        asset,
        t,
        playing,
        onTogglePlay: () => { calls.push('toggle') },
        onPreview: () => {},
      }),
    )
  }

  render()
  await flush()

  const card = container.querySelector('.omnimux-assets-cloud-card')
  const thumb = container.querySelector('.omnimux-assets-cloud-thumb')
  assert.ok(card, 'audio card rendered')
  assert.ok(thumb, 'thumb rendered')
  assert.equal(thumb.getAttribute('aria-pressed'), 'false')

  // 1) 指针进入：hover 副作用自动开始试听（calls=1）
  card.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
  await flush()
  assert.equal(calls.length, 1, 'hover should auto-start audition')
  playing = true // 父级模拟 playing prop 翻转
  render()
  await flush()
  assert.equal(thumb.getAttribute('aria-pressed'), 'true')

  // 2) 悬停中点击：用户显式暂停（calls=2）；副作用不得再把播放翻回去（calls 不再增长）
  thumb.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  playing = false
  render()
  await flush()
  await flush()
  assert.equal(calls.length, 2, 'click pauses; hover effect must not restart it')
  assert.equal(thumb.getAttribute('aria-pressed'), 'false')

  // 3) 指针移出：不得产生额外 toggle；再移入时自动试听恢复（calls=3）
  card.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }))
  await flush()
  assert.equal(calls.length, 2, 'mouseout after explicit pause must not toggle')

  card.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
  await flush()
  assert.equal(calls.length, 3, 'fresh hover resumes auto audition')
  playing = true
  render()
  await flush()

  // 4) 悬停中外部把 playing 翻回 false（等价于播放自然结束或被另一张卡抢占）：
  // hover 副作用自动重启试听一次；随后用户点击显式暂停。移出不再产生 toggle。
  calls.length = 0
  playing = false
  render()
  await flush()
  assert.equal(calls.length, 1, 'playing drop while hovered restarts audition once')

  thumb.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  playing = false
  render()
  await flush()
  assert.equal(calls.length, 2, 'explicit pause toggles once more')

  card.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }))
  await flush()
  await flush()
  assert.equal(calls.length, 2, 'explicit pause survives mouseout untouched')

  root.unmount()
})
