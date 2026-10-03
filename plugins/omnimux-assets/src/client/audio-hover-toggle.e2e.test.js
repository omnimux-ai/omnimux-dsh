/**
 * Issue #2989 行为级端到端：公共资产库音频卡片「点击暂停被悬停副作用瞬时覆盖」。
 *
 * 复现链路（修复前）：mouseover → hover 副作用 onTogglePlay（play=true）→ 用户
 * click → toggle（play=false）→ 副作用依赖变化且 hovering 仍为 true → 立刻再调
 * onTogglePlay → 重新播放。外观等同「点击播放没有响应」。
 *
 * 真实组件经 esbuild 打包，react / react-dom 作为 external 由 Node 侧同一份实例
 * 注入；DOM 由 JSDOM 提供。每一步交互都包在 React.act 里，被动副作用在断言前
 * 确定性刷新完毕——不依赖 setTimeout(0) 抢调度窗口（CI 慢机上会抢不到）。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRequire = createRequire(join(here, '..', '..', 'package.json'))
const { JSDOM } = pluginRequire('jsdom')

/** JSDOM 全局必须在 react-dom 首次加载前就位，否则 canUseDOM 判定为 false。 */
function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1/',
    pretendToBeVisual: true,
  })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true })
  globalThis.HTMLElement = window.HTMLElement
  globalThis.Node = window.Node
  globalThis.MouseEvent = window.MouseEvent
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return window
}

/** 打包 CloudAssetsView.jsx；react 系列保持 external，由 pluginRequire 注入同一实例。 */
async function loadCard() {
  const esbuild = pluginRequire('esbuild')
  const result = await esbuild.build({
    entryPoints: [join(here, 'CloudAssetsView.jsx')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [
      {
        name: 'stub-assets',
        setup(b) {
          b.onResolve({ filter: /\.(css|less|scss|woff|woff2|ttf|png|jpg|jpeg|webp|svg|mp3|mp4)$/ }, (a) => ({ path: a.path, namespace: 'stub-assets' }))
          b.onLoad({ filter: /./, namespace: 'stub-assets' }, () => ({ contents: 'module.exports = {}', loader: 'js' }))
        },
      },
    ],
  })
  const mod = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(pluginRequire, mod, mod.exports)
  return mod.exports.CloudAssetCard
}

test('CloudAssetCard audio: explicit click owns the card until pointer leaves (#2989)', async () => {
  const window = installDom()
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const CloudAssetCard = await loadCard()
  const { act } = React

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
  const container = window.document.getElementById('root')
  const root = createRoot(container)
  const element = () => React.createElement(CloudAssetCard, {
    asset,
    t: (key) => key,
    playing,
    onTogglePlay: () => { calls.push('toggle') },
    onPreview: () => {},
  })
  const render = () => act(async () => { root.render(element()) })
  const fire = (node, type) => act(async () => {
    node.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }))
  })

  await render()
  const card = container.querySelector('.omnimux-assets-cloud-card')
  const thumb = container.querySelector('.omnimux-assets-cloud-thumb')
  assert.ok(card, 'audio card rendered')
  assert.ok(thumb, 'thumb rendered')
  assert.equal(thumb.getAttribute('aria-pressed'), 'false')

  // 1) 指针进入：hover 副作用自动开始试听
  await fire(card, 'mouseover')
  assert.equal(calls.length, 1, 'hover should auto-start audition')
  playing = true
  await render()
  assert.equal(thumb.getAttribute('aria-pressed'), 'true')

  // 2) 悬停中点击：用户显式暂停；副作用不得把播放翻回去
  await fire(thumb, 'click')
  playing = false
  await render()
  assert.equal(calls.length, 2, 'click pauses; hover effect must not restart it')
  assert.equal(thumb.getAttribute('aria-pressed'), 'false')

  // 3) 指针移出：不产生额外 toggle；再移入时自动试听恢复
  await fire(card, 'mouseout')
  assert.equal(calls.length, 2, 'mouseout after explicit pause must not toggle')
  await fire(card, 'mouseover')
  assert.equal(calls.length, 3, 'fresh hover resumes auto audition')
  playing = true
  await render()

  // 4) 悬停中外部把 playing 翻回 false（播完或被另一张卡抢占）：hover 自动重启一次；
  //    随后用户点击显式暂停；移出不再产生 toggle。
  calls.length = 0
  playing = false
  await render()
  assert.equal(calls.length, 1, 'playing drop while hovered restarts audition once')
  await fire(thumb, 'click')
  playing = false
  await render()
  assert.equal(calls.length, 2, 'explicit pause toggles once more')
  await fire(card, 'mouseout')
  assert.equal(calls.length, 2, 'explicit pause survives mouseout untouched')

  await act(async () => { root.unmount() })
})
