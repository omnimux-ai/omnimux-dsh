/**
 * Issue #3058 OCR round2（accepted 整改）前端 F1–F4 行为级红绿证据。
 *
 * F1（modal）：decode failure / 播放期网络失败发生在 <audio> 元素而非
 *     <source>——元素级 onError 必须走同一去重候选结算：官方按 DTO 候选序
 *     回退、穷尽一次核定文案；source error 与 element error 任意到达顺序
 *     同候选只推进一次；普通音频恢复原 broken 行为；NotAllowedError 静默。
 * F2（modal）：A 穷尽 broken 后切 B，B 的 audio 在 reset 后的提交才挂载；
 *     清理必须绑定实际挂载的媒体实例（稳定 callback ref），关闭/再切换时
 *     B 的原生实例 pause + currentTime=0。
 * F3（hook）：ended 与候选穷尽为请求终态——全部 attempt element 释放
 *     （pause、归零、摘除 ended/error 监听、src 清空）、清理 ref 失效、
 *     迟到 callback 被 request token 短路；notice/suppression 语义不变。
 * F4（card+view）：悬停自动试听后点击/键盘打开详情，stop 之后 hover
 *     副作用不得自动重启（卡片标记 user-controlled），不并播。
 *
 * 真实组件/hook 经 esbuild 打包（dsh-ui-kit 替换为桩），react / react-dom
 * 由 Node 侧同一实例注入；DOM 由 JSDOM 提供，HTMLMediaElement 与 Audio
 * 构造器为受控桩。每条断言都是强断言；不验证真实媒体可播。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRequire = createRequire(join(here, '..', '..', 'package.json'))
const { JSDOM } = pluginRequire('jsdom')
const MODAL_PATH = join(here, 'AssetPreviewModal.jsx')

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
  globalThis.KeyboardEvent = window.KeyboardEvent
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return window
}

/** modal 用受控媒体桩：play/pause/paused/load + pause 计数。 */
function installMediaStubs(window) {
  const proto = window.HTMLMediaElement.prototype
  Object.defineProperty(proto, 'paused', {
    configurable: true,
    get() { return this.__paused !== false },
  })
  proto.play = function play() {
    this.__paused = false
    const outcome = window.__playOutcome ?? 'resolve'
    if (outcome === 'reject') return Promise.reject(new Error('network'))
    if (outcome === 'not-allowed') return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    return Promise.resolve()
  }
  proto.pause = function pause() {
    this.__paused = true
    this.__pauseCalls = (this.__pauseCalls ?? 0) + 1
  }
  proto.load = function load() {
    this.__loadCalls = (this.__loadCalls ?? 0) + 1
  }
}

/** hook 用受控 Audio 桩：记录 src/listeners/playCalls/deferred。 */
function installAudioStub() {
  const instances = []
  class FakeAudio {
    constructor(src) {
      this.src = src ?? ''
      this.preload = ''
      this.currentTime = 0
      this.listeners = {}
      this.playCalls = []
      this.playDeferreds = []
      this.paused = true
      this.playOutcome = 'resolve'
      this.deferPlays = FakeAudio.deferAll === true
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
      if (this.deferPlays) {
        return new Promise((resolve, reject) => {
          this.playDeferreds.push({ src: this.src, resolve, reject })
        })
      }
      if (this.playOutcome === 'reject') return Promise.reject(new Error('network'))
      if (this.playOutcome === 'not-allowed') {
        return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
      }
      return Promise.resolve()
    }
    pause() { this.paused = true }
    load() {}
  }
  FakeAudio.instances = instances
  FakeAudio.deferAll = false
  instances.FakeAudio = FakeAudio
  globalThis.Audio = FakeAudio
  globalThis.window.Audio = FakeAudio
  return instances
}

async function bundleEntry(entry, stubUiKit) {
  const esbuild = pluginRequire('esbuild')
  const plugins = [
    {
      name: 'stub-assets',
      setup(b) {
        b.onResolve({ filter: /\.(css|less|scss|woff|woff2|ttf|png|jpg|jpeg|webp|svg|mp3|mp4)$/ }, (a) => ({ path: a.path, namespace: 'stub-assets' }))
        b.onLoad({ filter: /./, namespace: 'stub-assets' }, () => ({ contents: 'module.exports = {}', loader: 'js' }))
      },
    },
  ]
  if (stubUiKit) {
    plugins.push({
      name: 'stub-uikit',
      setup(b) {
        b.onResolve({ filter: /^dsh-ui-kit$/ }, (a) => ({ path: a.path, namespace: 'stub-uikit' }))
        b.onLoad({ filter: /./, namespace: 'stub-uikit' }, () => ({
          contents:
            "const React = require('react');" +
            "module.exports = { Button: (p) => React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children), IconButton: (p) => React.createElement('button', { disabled: p.disabled, onClick: p.onClick, 'aria-label': p['aria-label'] }, p.children) };",
          loader: 'js',
        }))
      },
    })
  }
  const result = await esbuild.build({
    entryPoints: [join(here, entry)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins,
  })
  const mod = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(pluginRequire, mod, mod.exports)
  return mod.exports
}

const loadModal = async () => (await bundleEntry('AssetPreviewModal.jsx', true)).AssetPreviewModal
const loadHook = async () => bundleEntry('use-cloud-assets-feed.js', false)
const loadCard = async () => (await bundleEntry('CloudAssetsView.jsx', true)).CloudAssetCard

const t = (key) => ({
  'cloud.preview.failed': '试听暂不可用，请稍后重试。',
  'modal.unsupportedMedia': '当前文件格式不支持内嵌预览',
  'modal.close': '关闭预览',
}[key] ?? key)

const VOICE_ITEM = {
  id: 'cloud:voice-1',
  title: '林潇 2.0',
  kind: 'audio',
  previewUrl: 'https://cdn.example.com/primary.mp3',
  text: '',
  preview: {
    purpose: 'official-voice-preview',
    state: 'verified-file',
    primary_url: 'https://cdn.example.com/primary.mp3',
    candidates: ['https://cdn.example.com/primary.mp3', 'https://cdn.example.com/alt.mp3'],
  },
}

const VOICE_ITEM_B = {
  id: 'cloud:voice-2',
  title: '心悦 3.0',
  kind: 'audio',
  previewUrl: 'https://cdn.example.com/v2-primary.mp3',
  text: '',
  preview: {
    purpose: 'official-voice-preview',
    state: 'verified-file',
    primary_url: 'https://cdn.example.com/v2-primary.mp3',
    candidates: ['https://cdn.example.com/v2-primary.mp3'],
  },
}

const ORDINARY_AUDIO = {
  id: 'cloud:bgm-1',
  title: 'beat',
  kind: 'audio',
  previewUrl: '/omnimux/assets/cloud/media?id=bgm-1&which=media',
  text: '',
  preview: null,
}

const VOICE_ROW = {
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

const sources = (container) =>
  [...container.querySelectorAll('audio source')].map((s) => s.getAttribute('src'))

const fireElementError = (container) => {
  const el = container.querySelector('audio')
  assert.ok(el, 'audio element 已渲染')
  el.dispatchEvent(new (globalThis.window.Event)('error', { bubbles: false }))
}

const fireSourceError = (node) => {
  node.dispatchEvent(new (globalThis.window.Event)('error', { bubbles: false }))
}

test('F1：<audio> 元素级 error 走同一去重候选结算——官方回退穷尽一次文案，source/element 反向不双推进，普通音频恢复 broken', async () => {
  const window = installDom()
  installMediaStubs(window)
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const AssetPreviewModal = await loadModal()
  const { act } = React

  const container = window.document.getElementById('root')
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: VOICE_ITEM, t, onClose: () => {} }))
  })
  const flush = async () => { await act(async () => { await Promise.resolve() }) }

  // 反向到达顺序：同一候选 element error 与 source error 双信号只推进一次。
  const primarySource = container.querySelector('audio source')
  assert.deepEqual(sources(container), ['https://cdn.example.com/primary.mp3'])
  await act(async () => {
    fireElementError(container)
    fireSourceError(primarySource)
  })
  await flush()
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt.mp3'],
    'element+source 双信号同候选只推进一次，不跳过 alt 直接穷尽')
  assert.ok(container.querySelector('audio'), '回退中播放器不撤掉')
  assert.doesNotMatch(container.textContent, /试听暂不可用/, '未穷尽不出失败文案')

  // alt 候选的 element error（decode/网络失败发生在 audio 元素）→ 穷尽：
  // 播放器撤掉，只出一次核定文案，绝不落 unsupportedMedia。
  await act(async () => { fireElementError(container) })
  await flush()
  // 布尔化断言：assert.equal(domElement, null) 失败时格式化 JSDOM 节点开销失控。
  assert.equal(container.querySelector('audio') === null, true, 'element 级错误同样驱动候选穷尽')
  const failedText = container.textContent
  assert.match(failedText, /试听暂不可用，请稍后重试。/)
  assert.doesNotMatch(failedText, /当前文件格式不支持内嵌预览/)
  assert.equal((failedText.match(/试听暂不可用，请稍后重试。/g) ?? []).length, 1)

  await act(async () => { root.unmount() })

  // 普通音频：element 级 error 恢复原 broken 语义（撤播放器），不出官方文案。
  const container2 = window.document.createElement('div')
  window.document.body.appendChild(container2)
  const root2 = createRoot(container2)
  await act(async () => {
    root2.render(React.createElement(AssetPreviewModal, { item: ORDINARY_AUDIO, t, onClose: () => {} }))
  })
  assert.deepEqual(sources(container2), ['/omnimux/assets/cloud/media?id=bgm-1&which=media'])
  await act(async () => { fireElementError(container2) })
  await flush()
  assert.equal(container2.querySelector('audio') === null, true,
    '普通音频 element 级 error 恢复原 broken 行为')
  assert.doesNotMatch(container2.textContent, /试听暂不可用，请稍后重试。/)
  await act(async () => { root2.unmount() })
})

test('F2：A 穷尽 broken 后切 B，B 在 reset 后挂载的实例被 pause/归零（callback ref 绑定实际实例）', async () => {
  const window = installDom()
  installMediaStubs(window)
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const AssetPreviewModal = await loadModal()
  const { act } = React

  const container = window.document.getElementById('root')
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: VOICE_ITEM, t, onClose: () => {} }))
  })
  const flush = async () => { await act(async () => { await Promise.resolve() }) }
  const audio = () => container.querySelector('audio')

  // A 候选穷尽 → broken：audio 被撤掉。
  await act(async () => { fireSourceError(container.querySelector('audio source')) })
  await flush()
  await act(async () => { fireSourceError(container.querySelector('audio source')) })
  await flush()
  assert.equal(audio() === null, true, 'A 穷尽后播放器撤掉')
  assert.match(container.textContent, /试听暂不可用，请稍后重试。/)

  // 切 B：broken 经 passive effect reset 后 B 的 audio 才挂载。
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: VOICE_ITEM_B, t, onClose: () => {} }))
  })
  await flush()
  const elB = audio()
  assert.ok(elB, 'B 音频在 broken reset 后挂载')
  assert.deepEqual(sources(container), ['https://cdn.example.com/v2-primary.mp3'])

  // B 正在播放 → 再切回 A：B 的原生实例必须被 pause + 归零——清理绑定的是
  // 实际挂载的实例，不是按 itemKey effect 捕获的 ref（F2 修复前此处捕获 null）。
  elB.currentTime = 12.5
  await act(async () => { elB.play() })
  assert.equal(elB.__paused, false)
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: VOICE_ITEM, t, onClose: () => {} }))
  })
  await flush()
  assert.equal(elB.__paused, true, '切换时 post-broken 挂载的 B 实例必须停止')
  assert.equal(elB.currentTime, 0, '切换时 post-broken 挂载的 B 实例必须归零')

  // 关闭弹窗（unmount）：同样在 reset 后挂载的实例停止。
  const elA2 = audio()
  assert.ok(elA2, 'A 重新挂载音频')
  await act(async () => { elA2.play() })
  await act(async () => { root.unmount() })
  assert.equal(elA2.__paused, true, '关闭弹窗停止 post-broken 挂载的实例')
  assert.equal(elA2.currentTime, 0)
})

test('F3：ended 与候选穷尽释放全部 attempt element 并失效清理 ref（listeners/src 清空、token 短路）', async () => {
  const window = installDom()
  const instances = installAudioStub()
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const { useCloudAudition } = await loadHook()
  const { act } = React

  let audition = null
  function Probe() {
    audition = useCloudAudition({ t })
    return null
  }
  const root = createRoot(window.document.getElementById('root'))
  act(() => { root.render(React.createElement(Probe)) })
  const latest = () => instances[instances.length - 1]
  const flush = async () => { await act(async () => { await Promise.resolve() }) }
  const released = (el) => (
    el.paused === true &&
    el.src === '' &&
    (el.listeners.ended ?? []).length === 0 &&
    (el.listeners.error ?? []).length === 0
  )

  // ── ended 终态：本请求所有 attempt element（含已回退的旧 element）全部释放。
  act(() => { audition.toggle(VOICE_ROW) })
  const primary = latest()
  act(() => { primary.dispatch('error') })
  const alt = latest()
  assert.notEqual(alt, primary)
  act(() => { alt.dispatch('ended') })
  await flush()
  assert.equal(audition.playingId, '')
  assert.equal(released(primary), true, 'ended 终态必须释放已回退的旧 attempt element')
  assert.equal(released(alt), true, 'ended 终态必须释放当前 attempt element')

  // 终态后的新请求不被旧 cleanup 短路：正常发起、正常播放。
  const releasedCount = instances.length
  act(() => { audition.toggle(VOICE_ROW) })
  assert.equal(instances.length, releasedCount + 1, '终态释放后新请求正常发起')
  assert.equal(audition.playingId, 'audio-voiceover-linxiao')
  assert.equal(latest().src, 'https://cdn.example.com/primary.mp3')
  // 旧请求已释放的迟到 ended 不再影响新请求。
  act(() => { primary.dispatch('ended') })
  assert.equal(audition.playingId, 'audio-voiceover-linxiao',
    '旧请求释放后的迟到回调不得清空新试听')
  act(() => { audition.stop() })

  // ── 穷尽终态：同样释放全部 attempt element，notice/suppression 语义不变。
  const allFail = { ...VOICE_ROW, id: 'audio-voiceover-fail' }
  act(() => { audition.toggle(allFail) })
  const failPrimary = latest()
  act(() => { failPrimary.dispatch('error') })
  const failAlt = latest()
  act(() => { failAlt.dispatch('error') })
  await flush()
  assert.equal(audition.playingId, '')
  assert.equal(audition.notice, '试听暂不可用，请稍后重试。',
    '穷尽核定文案语义不变（仅官方分支）')
  assert.equal(audition.suppressedIds.has('audio-voiceover-fail'), true,
    '穷尽悬停抑制语义不变')
  assert.equal(released(failPrimary), true, '穷尽终态必须释放全部 attempt element')
  assert.equal(released(failAlt), true)
  // 穷尽后 stop() 只是无害空转：旧清理 ref 已失效，不抛错也不再触碰 element。
  act(() => { audition.stop() })
  assert.equal(instances.length, releasedCount + 3, '穷尽后 stop 不产生新的构造')

  act(() => { root.unmount() })
})

test('F3b：NotAllowedError 权限拒绝同样走 releaseRequest 全请求终态释放', async () => {
  const window = installDom()
  const instances = installAudioStub()
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const { useCloudAudition } = await loadHook()
  const { act } = React

  let audition = null
  function Probe() {
    audition = useCloudAudition({ t })
    return null
  }
  const root = createRoot(window.document.getElementById('root'))
  act(() => { root.render(React.createElement(Probe)) })
  const latest = () => instances[instances.length - 1]
  const flush = async () => { await act(async () => { await Promise.resolve() }) }
  const released = (el) => (
    el.paused === true &&
    el.src === '' &&
    (el.listeners.ended ?? []).length === 0 &&
    (el.listeners.error ?? []).length === 0
  )

  // 权限拒绝终态（deferred rejection 持真实竞态）：全请求资源释放——
  // pause/归零/摘除 ended+error 监听/清 src/失效清理 ref，与 ended/穷尽同约。
  instances.FakeAudio.deferAll = true
  act(() => { audition.toggle(VOICE_ROW) })
  const denied = latest()
  assert.equal(denied.src, 'https://cdn.example.com/primary.mp3')
  await act(async () => {
    denied.playDeferreds[0].reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    await Promise.resolve()
  })
  instances.FakeAudio.deferAll = false
  await flush()
  assert.equal(audition.playingId, '', '权限拒绝静默回空闲')
  assert.equal(audition.notice, '', '权限拒绝不出文件失败文案（语义不变）')
  assert.equal(audition.suppressedIds.has('audio-voiceover-linxiao'), true,
    '权限拒绝仍武装悬停抑制（官方分支语义不变）')
  assert.equal(released(denied), true,
    'NotAllowedError 终态必须整请求释放 attempt element（不留孤儿资源/闭包）')
  // 释放后该 element 的迟到 error 不得推进新 attempt/触发兜底。
  act(() => { denied.dispatch('error') })
  await flush()
  assert.equal(instances.length, 1, '权限拒绝不得轮换候选、不得产生新构造')
  // 终态后显式重试正常发起新请求：释放不是永久锁死。
  act(() => { audition.toggle(VOICE_ROW, true) })
  assert.equal(instances.length, 2, '显式动作重新发起试听')
  assert.equal(latest().src, 'https://cdn.example.com/primary.mp3')
  act(() => { audition.stop() })

  act(() => { root.unmount() })
})

test('F4：悬停自动试听后点击/键盘打开详情，stop 生效不自动重启（user-controlled 标记）', async () => {
  const window = installDom()
  const instances = installAudioStub()
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const CloudAssetCard = await loadCard()
  const { useCloudAudition } = await loadHook()
  const { act } = React

  let audition = null
  const previewed = []
  const toggleCalls = []
  function Probe() {
    const a = useCloudAudition({ t })
    audition = a
    // 复刻 CloudAssetsView.handleOpenPreview：打开详情前先 stop 卡片试听。
    const handleOpenPreview = (asset) => {
      a.stop()
      previewed.push(asset.id)
    }
    return React.createElement(CloudAssetCard, {
      asset: VOICE_ROW,
      t: (key) => key,
      playing: a.playingId === VOICE_ROW.id,
      autoplaySuppressed: a.suppressedIds.has(VOICE_ROW.id),
      onTogglePlay: (asset, explicit) => { toggleCalls.push({ id: asset.id, explicit }); a.toggle(asset, explicit) },
      onPreview: handleOpenPreview,
    })
  }
  const container = window.document.getElementById('root')
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Probe)) })
  const fire = (node, type) => act(async () => {
    node.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }))
  })
  const flush = async () => { await act(async () => { await Promise.resolve() }) }

  const card = container.querySelector('.omnimux-assets-cloud-card')
  const body = container.querySelector('.omnimux-assets-card-body')
  assert.ok(card && body, 'card 与 title body 已渲染')

  // 1) 指针进入 → hover 自动试听开始。
  await fire(card, 'mouseover')
  await flush()
  assert.equal(instances.length, 1, '悬停自动发起一次试听')
  assert.equal(audition.playingId, 'audio-voiceover-linxiao')

  // 2) 悬停中键盘打开详情（Enter on title body）：stop 生效，且同一悬停不得
  //    再自动重启试听（F4 修复前 userControlledRef 仍 false，hover 副作用立刻重播）。
  await act(async () => {
    body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  await flush()
  assert.deepEqual(previewed, ['audio-voiceover-linxiao'], '键盘入口打开详情')
  assert.equal(audition.playingId, '', '打开详情前停止卡片试听')
  await act(async () => { root.render(React.createElement(Probe)) })
  await act(async () => { root.render(React.createElement(Probe)) })
  await flush()
  assert.equal(instances.length, 1,
    '详情打开后同一悬停不得自动重启试听（键盘入口）')
  assert.equal(toggleCalls.length, 1, 'hover 副作用在详情存续期不再补发 toggle')

  // 3) 关闭详情、指针移出再移入：新一次悬停恢复正常自动试听。
  await fire(card, 'mouseout')
  await fire(card, 'mouseover')
  await flush()
  assert.equal(instances.length, 2, '新悬停恢复自动试听')
  assert.equal(audition.playingId, 'audio-voiceover-linxiao')

  // 4) 点击入口（真实序列：mousedown 标记接管 → click 冒泡到卡片 onClick）：
  //    同样先 stop 不重启。
  await fire(body, 'mousedown')
  await fire(body, 'click')
  await flush()
  assert.deepEqual(previewed, ['audio-voiceover-linxiao', 'audio-voiceover-linxiao'],
    '点击入口同样打开详情')
  assert.equal(audition.playingId, '')
  await act(async () => { root.render(React.createElement(Probe)) })
  await flush()
  assert.equal(instances.length, 2,
    '详情打开后同一悬停不得自动重启试听（点击入口）')

  await act(async () => { root.unmount() })
})
