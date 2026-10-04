/**
 * Issue #3058 OCR 整改 #12：悬停自动播放被拒（NotAllowedError）后的抑制契约。
 *
 * 复现链路（修复前 bug）：mouseover → hover 副作用 onTogglePlay → hook 的
 * play() 被浏览器以 NotAllowedError 拒绝 → 旧实现把它当失败提示并清 playingId
 * → 同一悬停的副作用看到 hovering && !playing 又调 toggle → 无限重试 +
 * 重复弹「试听暂不可用」notice。
 *
 * 核定行为：权限拒绝静默回空闲（不是文件不可用、不出文案），并把该资产标记为
 * 悬停自动重启抑制——同一悬停不再自动重试，直到新的显式动作（点击播放键）。
 * 显式动作由卡片经 onTogglePlay(asset, true) 传递。
 *
 * 真实 CloudAssetCard + 真实 useCloudAudition（同一 esbuild bundle），
 * react / react-dom 由 Node 侧同一实例注入，DOM 由 JSDOM 提供，
 * Audio 构造器为受控桩。每条断言都是强断言 assert.equal / deepEqual。
 * 本测试不验证真实媒体可播——那是 PM 演示验收的事。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRequire = createRequire(join(here, '..', '..', 'package.json'))
const { JSDOM } = pluginRequire('jsdom')

/** JSDOM 全局必须在 react-dom 首次加载前就位。 */
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

/** 受控 Audio 桩：play() 固定以 NotAllowedError 拒绝，记录构造与调用次数。 */
function installDenyingAudioStub() {
  const instances = []
  class FakeAudio {
    constructor(src) {
      this.src = src ?? ''
      this.preload = ''
      this.currentTime = 0
      this.listeners = {}
      this.playCalls = []
      this.paused = true
      instances.push(this)
    }
    addEventListener(type, fn) {
      ;(this.listeners[type] ??= []).push(fn)
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn)
    }
    dispatch(type) {
      for (const fn of this.listeners[type] ?? []) fn.call(this, { type, target: this })
      const handler = this[`on${type}`]
      if (typeof handler === 'function') handler.call(this, { type, target: this })
    }
    play() {
      this.paused = false
      this.playCalls.push(this.src)
      return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    }
    pause() { this.paused = true }
    load() {}
  }
  globalThis.Audio = FakeAudio
  globalThis.window.Audio = FakeAudio
  return instances
}

/** 分别打包 CloudAssetsView.jsx（卡片）与 use-cloud-assets-feed.js（真实 hook）。
 * 卡片 bundle 也内联同一份 feed 源码但不重导出，Probe 改用 feed bundle 的
 * useCloudAudition 驱动——同一模块、同一 React；对构造次数 assert.equal 计次。 */
async function loadParts() {
  const esbuild = pluginRequire('esbuild')
  const build = async (entry) => {
    const result = await esbuild.build({
      entryPoints: [join(here, entry)],
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
    return mod.exports
  }
  const view = await build('CloudAssetsView.jsx')
  const feed = await build('use-cloud-assets-feed.js')
  return { CloudAssetCard: view.CloudAssetCard, useCloudAudition: feed.useCloudAudition }
}

/** 官方音色 preview DTO 行（锁定 schema 的最小形态）。 */
const VOICE_VERIFIED = {
  id: 'audio-voiceover-linxiao',
  name: '林潇 2.0',
  description: '通用场景 · 中文',
  mediaType: 'audio',
  hasMedia: true,
  playable: true,
  preview: {
    purpose: 'official-voice-preview',
    state: 'verified-file',
    primary_url: 'https://cdn.example.com/primary.mp3',
    candidates: ['https://cdn.example.com/primary.mp3', 'https://cdn.example.com/alt.mp3'],
    checked_at: '2026-10-03T00:00:00.000Z',
    evidence_ref: 'audit',
  },
}

test('CloudAssetCard + useCloudAudition：悬停自动播放被拒后同一悬停不再自动重试（OCR #12）', async () => {
  const window = installDom()
  const instances = installDenyingAudioStub()
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const { CloudAssetCard, useCloudAudition } = await loadParts()
  const { act } = React

  let audition = null
  function Probe() {
    const a = useCloudAudition({ t: (key) => ({ 'cloud.preview.failed': '试听暂不可用，请稍后重试。' }[key] ?? key) })
    audition = a
    return React.createElement(CloudAssetCard, {
      asset: VOICE_VERIFIED,
      t: (key) => key,
      playing: a.playingId === VOICE_VERIFIED.id,
      autoplaySuppressed: a.suppressedIds.has(VOICE_VERIFIED.id),
      onTogglePlay: (asset, explicit) => a.toggle(asset, explicit),
      onPreview: () => {},
    })
  }
  const container = window.document.getElementById('root')
  const root = createRoot(container)
  const render = () => act(async () => { root.render(React.createElement(Probe)) })
  const fire = (node, type) => act(async () => {
    node.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }))
  })
  const flush = async () => { await act(async () => { await Promise.resolve() }) }

  await render()
  const card = container.querySelector('.omnimux-assets-cloud-card')
  const thumb = container.querySelector('.omnimux-assets-cloud-thumb')
  assert.ok(card, 'card rendered')
  assert.ok(thumb, 'audio thumb rendered')

  // 1) 指针进入 → hover 副作用自动试听 → play() 被 NotAllowedError 拒绝。
  await fire(card, 'mouseover')
  await flush()
  assert.equal(instances.length, 1, '悬停发起一次自动试听')
  assert.equal(instances[0].playCalls[0], 'https://cdn.example.com/primary.mp3')
  assert.equal(instances[0].src, '',
    '权限拒绝为请求终态：releaseRequest 清 src/摘监听，不留加载中的孤儿')
  assert.equal(audition.playingId, '')
  assert.equal(audition.notice, '', '权限拒绝不出「文件不可用」文案')
  assert.equal(audition.suppressedIds.has('audio-voiceover-linxiao'), true,
    '该资产被标记为悬停自动重启抑制')
  await render()

  // 2) 同一悬停内 playingId 仍为空但副作用重跑：不再创建 Audio、不重试。
  await render()
  await flush()
  assert.equal(instances.length, 1, '同一悬停不再自动重启（无 notice/attempt 循环）')

  // 3) 指针移出再移入：仍被抑制——离开不算显式动作。
  await fire(card, 'mouseout')
  await fire(card, 'mouseover')
  await flush()
  assert.equal(instances.length, 1, '重新悬停也不是显式动作，仍不自动重试')

  // 4) 点击播放键（显式动作）→ 解除抑制并重新发起试听（仍被拒但计一次真实 attempt）。
  await fire(thumb, 'click')
  await flush()
  assert.equal(instances.length, 2, '显式点击重新发起一次试听')
  assert.equal(instances[1].playCalls.length, 1, '显式重试真实调用了 play()')
  assert.equal(instances[1].playCalls[0], 'https://cdn.example.com/primary.mp3')

  // 5) 显式重试再次被拒 → 抑制重新武装，悬停继续不自动重试。
  await flush()
  assert.equal(audition.suppressedIds.has('audio-voiceover-linxiao'), true,
    '显式重试再次被拒后抑制重新武装')
  await render()
  await flush()
  assert.equal(instances.length, 2, '再次拒绝后同一悬停不自动重启')
  assert.equal(audition.notice, '', '全程无失败文案循环')

  await act(async () => { root.unmount() })
})
