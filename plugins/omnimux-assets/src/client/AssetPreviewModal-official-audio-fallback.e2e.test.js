/**
 * Issue #3058 Sol 复核 MEDIUM：官方音色详情（AssetPreviewModal）音频候选回退。
 *
 * 修复前 bug：详情只把 DTO primary_url 交给 <audio>，该 URL 加载失败立即
 * setBroken → 播放器撤掉、走失败空态，candidates 里的回退地址从不尝试。
 * 产品规格：共享的是映射与解析语义——详情与网格同样按 DTO 候选顺序消费，
 * 候选全失败才提示一次核定文案，绝不落「格式不支持」空态。
 *
 * 真实组件经 esbuild 打包（dsh-ui-kit 替换为桩），react / react-dom 由 Node 侧
 * 同一份实例注入；DOM 由 JSDOM 提供，HTMLMediaElement 的 play/pause/paused
 * 用受控桩（JSDOM 不实现媒体管线）。每条断言都是强断言；不验证真实媒体可播。
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
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return window
}

/**
 * 受控媒体桩：JSDOM 的 HTMLMediaElement 不实现 play/pause/paused，
 * 这里给出可控实现，play() 结果由 window.__playOutcome 受控。
 */
function installMediaStubs(window) {
  const proto = window.HTMLMediaElement.prototype
  Object.defineProperty(proto, 'paused', {
    configurable: true,
    get() { return this.__paused !== false },
  })
  proto.play = function play() {
    const outcome = window.__playOutcome ?? 'resolve'
    if (outcome === 'reject') return Promise.reject(new Error('network'))
    if (outcome === 'not-allowed') return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    // 真实浏览器语义：成功的 play() 置 paused=false 并派发 'play' 事件；
    // 被拒绝的 play() 不派发 play——播放意图只能由原生事件维护。
    assert.equal(this.__paused !== false, true, 'play() 前元素处于 paused 态')
    this.__paused = false
    this.dispatchEvent(new window.Event('play'))
    return Promise.resolve()
  }
  proto.pause = function pause() {
    this.__paused = true
    this.__pauseCalls = (this.__pauseCalls ?? 0) + 1
    this.dispatchEvent(new window.Event('pause'))
  }
  proto.load = function load() {
    this.__loadCalls = (this.__loadCalls ?? 0) + 1
  }
}

/** 打包 AssetPreviewModal.jsx：dsh-ui-kit 替换为桩。 */
async function loadModal() {
  const esbuild = pluginRequire('esbuild')
  const result = await esbuild.build({
    entryPoints: [MODAL_PATH],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [
      {
        name: 'stub-uikit',
        setup(b) {
          b.onResolve({ filter: /^dsh-ui-kit$/ }, (a) => ({ path: a.path, namespace: 'stub-uikit' }))
          b.onLoad({ filter: /./, namespace: 'stub-uikit' }, () => ({
            contents:
              "const React = require('react');" +
              "module.exports = { Button: (p) => React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children) };",
            loader: 'js',
          }))
        },
      },
    ],
  })
  const mod = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(pluginRequire, mod, mod.exports)
  return mod.exports.AssetPreviewModal
}

const t = (key) => ({
  'cloud.preview.failed': '试听暂不可用，请稍后重试。',
  'modal.unsupportedMedia': '当前文件格式不支持内嵌预览',
  'modal.close': '关闭预览',
}[key] ?? key)

/** 官方音色详情 item（cloudAssetToPreviewItem 产物形态）。 */
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

/** 非官方普通音频 item：单一 previewUrl，无 preview DTO。 */
const ORDINARY_AUDIO = {
  id: 'cloud:bgm-1',
  title: 'beat',
  kind: 'audio',
  previewUrl: '/omnimux/assets/cloud/media?id=bgm-1&which=media',
  text: '',
  preview: null,
}

/** 当前渲染的 audio source src 列表。 */
const sources = (container) =>
  [...container.querySelectorAll('audio source')].map((s) => s.getAttribute('src'))

const fireError = (container) => {
  const el = container.querySelector('audio source')
  assert.ok(el, 'audio source 已渲染')
  el.dispatchEvent(new (globalThis.window.Event)('error', { bubbles: false }))
}

test('AssetPreviewModal：官方试听按 DTO 候选顺序回退，穷尽后只出一次核定文案（Sol 复核 MEDIUM）', async () => {
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

  // 初始 src = primary（DTO 顺序第一位）
  assert.deepEqual(sources(container), ['https://cdn.example.com/primary.mp3'],
    '初始播放首选 primary_url')

  // primary 加载失败 → 按序回退 alt，播放控件不撤掉、不出文案
  await act(async () => { fireError(container) })
  await flush()
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt.mp3'],
    'primary onError 按序回退到下一 DTO 候选')
  assert.ok(container.querySelector('audio'), '回退后播放控件仍在')
  assert.equal(container.querySelector('.omnimux-assets-modal-unsupported'), null,
    '候选未穷尽绝不落格式不支持空态')

  // alt 也失败 → 穷尽：播放控件撤掉，只出一次核定失败文案
  await act(async () => { fireError(container) })
  await flush()
  assert.equal(container.querySelector('audio'), null, '候选穷尽后撤掉播放器')
  const failedText = container.textContent
  assert.match(failedText, /试听暂不可用，请稍后重试。/, '穷尽后提示一次核定文案')
  assert.doesNotMatch(failedText, /当前文件格式不支持内嵌预览/,
    '绝不落 unsupportedMedia 格式错误空态')
  assert.equal((failedText.match(/试听暂不可用，请稍后重试。/g) ?? []).length, 1,
    '核定文案只出现一次')

  await act(async () => { root.unmount() })
})

test('AssetPreviewModal：播放中的候选回退延续用户手势播放，NotAllowedError 不换候选；换 item/关闭停止旧实例', async () => {
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

  // 用户已点播放（playing=true）→ primary error 回退：新候选自动延续播放。
  // 延续的 play() 若被 NotAllowedError 拒绝（自动播放策略拒绝 ≠ 文件不存在），
  // 候选留在 alt 原地，不得乱换、不得出失败文案。
  window.__playOutcome = 'resolve'
  await act(async () => { audio().play() })
  assert.equal(audio().__paused, false, '用户手势播放中')
  window.__playOutcome = 'not-allowed'
  await act(async () => { fireError(container) })
  await flush()
  window.__playOutcome = 'resolve'
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt.mp3'],
    '回退已推进到 alt：NotAllowedError 只影响延续播放，不得再乱换候选')
  assert.ok(container.querySelector('audio'), '播放器不因权限拒绝被撤掉')
  assert.doesNotMatch(container.textContent, /当前文件格式不支持内嵌预览/)
  assert.doesNotMatch(container.textContent, /试听暂不可用/,
    '权限拒绝不伪装文件失败出文案')

  // 换新 item：旧实例停止（pause），新 item 从它自己的 DTO primary 重新开始
  const otherItem = {
    ...VOICE_ITEM,
    id: 'cloud:voice-2',
    title: '心悦 3.0',
    previewUrl: 'https://cdn.example.com/v2-primary.mp3',
    preview: {
      ...VOICE_ITEM.preview,
      primary_url: 'https://cdn.example.com/v2-primary.mp3',
      candidates: ['https://cdn.example.com/v2-alt.mp3'],
    },
  }
  const oldAudio = audio()
  await act(async () => { oldAudio.play() })
  assert.equal(oldAudio.__paused, false)
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: otherItem, t, onClose: () => {} }))
  })
  await flush()
  assert.equal(oldAudio.__paused, true, '换 item 必须停止旧播放实例')
  assert.deepEqual(sources(container), ['https://cdn.example.com/v2-primary.mp3'],
    '新 item 从它自己的 DTO primary 重新开始')
  assert.doesNotMatch(container.textContent, /试听暂不可用/, '换 item 不残留旧失败文案')

  // 关闭弹窗（unmount）：当前在播实例停止
  const current = audio()
  await act(async () => { current.play() })
  assert.equal(current.__paused, false)
  await act(async () => { root.unmount() })
  assert.equal(current.__paused, true, '关闭弹窗停止在播实例')
})

/**
 * 复现真实浏览器 fatal decode/network error 的派发序列：浏览器在派发 error
 * 事件之前已把失败元素的 paused 置为 true（并先置 MediaError）。若意图靠
 * error 时刻的 paused 采样，会把「正在播放」误记为「已暂停」，回退后静默不播。
 * pause() 桩会同步派发 'pause'，故这里直写 __paused 而不是调 pause()。
 */
const fireFatalElementError = (audioEl) => {
  assert.ok(audioEl, 'audio element 已渲染')
  audioEl.__paused = true
  Object.defineProperty(audioEl, 'error', { configurable: true, value: { code: 3 } })
  audioEl.dispatchEvent(new globalThis.window.Event('pause'))
  audioEl.dispatchEvent(new globalThis.window.Event('error', { bubbles: false }))
}

test('AssetPreviewModal：fatal error 前置 paused=true 不回退丢播放意图——事件维护意图，用户主动 pause 不自动起播', async () => {
  const window = installDom()
  installMediaStubs(window)
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const AssetPreviewModal = await loadModal()
  const { act } = React

  const container = window.document.getElementById('root')
  const root = createRoot(container)
  const threeCandidates = {
    ...VOICE_ITEM,
    preview: {
      ...VOICE_ITEM.preview,
      candidates: ['https://cdn.example.com/primary.mp3', 'https://cdn.example.com/alt.mp3', 'https://cdn.example.com/alt2.mp3'],
    },
  }
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: threeCandidates, t, onClose: () => {} }))
  })
  const flush = async () => { await act(async () => { await Promise.resolve() }) }
  const audio = () => container.querySelector('audio')

  // ── A. 播放中致命错误（error 前浏览器已置 paused=true）：
  //    意图必须在 error 之前由原生 play 事件维护，回退的新 attempt 延续播放。
  window.__playOutcome = 'resolve'
  const el0 = audio()
  await act(async () => { el0.play() })
  assert.equal(el0.__paused, false, '用户手势播放中')
  await act(async () => { fireFatalElementError(el0) })
  await flush()
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt.mp3'],
    'fatal error 仍按 DTO 序回退到下一候选')
  const el1 = audio()
  assert.notEqual(el1, el0, '回退挂载独立 audio element')
  assert.equal(el1.__paused, false,
    'error 前置 paused 不得误杀播放意图：回退新 attempt 延续 play()')
  assert.equal(el0.__paused, true, '旧 element 保持停止')

  // 旧（已 detach）attempt 的迟到 pause/error 不得污染新 attempt：listeners 已摘除。
  await act(async () => {
    el0.dispatchEvent(new window.Event('pause'))
    el0.dispatchEvent(new window.Event('error', { bubbles: false }))
  })
  await flush()
  assert.equal(el1.__paused, false, '已回退旧 element 的迟到 pause 不得改写当前意图')
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt.mp3'],
    '已回退旧 element 的迟到 error 不得推进')

  // 新 attempt 自己的致命错误：正常推进到第三候选并延续播放。
  await act(async () => { fireFatalElementError(el1) })
  await flush()
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt2.mp3'],
    '新 attempt 自己的 fatal error 正常推进下一候选')
  const el2 = audio()
  assert.equal(el2.__paused, false, 'el1 处于播放态，回退延续播放意图')
  assert.equal(container.contains(el1), false, '旧 element 已卸载')
  await act(async () => {
    el1.dispatchEvent(new window.Event('pause'))
    el1.dispatchEvent(new window.Event('error', { bubbles: false }))
  })
  await flush()
  assert.equal(el2.__paused, false, '二次旧 attempt 迟到信号仍不污染当前 attempt')
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt2.mp3'])

  // ── B. 用户主动暂停后的候选失败：回退不得自动起播（意图非 true）。
  await act(async () => { el2.pause() })
  await flush()
  assert.equal(el2.__paused, true)
  await act(async () => { fireFatalElementError(el2) })
  await flush()
  assert.equal(container.querySelector('audio') === null, true,
    '末候选失败后穷尽，播放器撤掉')
  assert.match(container.textContent, /试听暂不可用，请稍后重试。/,
    '穷尽仍出一次核定文案')

  // ── C. 用户主动暂停 + 还有后续候选时：回退挂载但不起播。
  // 换不同 id 的 item：broken reset 以 id|previewUrl 为键，同 id 不重置。
  const itemC = {
    ...VOICE_ITEM,
    id: 'cloud:voice-3',
    previewUrl: 'https://cdn.example.com/p3a.mp3',
    preview: {
      ...VOICE_ITEM.preview,
      primary_url: 'https://cdn.example.com/p3a.mp3',
      candidates: ['https://cdn.example.com/p3a.mp3', 'https://cdn.example.com/p3b.mp3'],
    },
  }
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: itemC, t, onClose: () => {} }))
  })
  await flush()
  const p0 = audio()
  assert.ok(p0, 'item C 音频已挂载（broken 已重置）')
  await act(async () => { p0.play() })
  await act(async () => { p0.pause() })
  await flush()
  await act(async () => { fireFatalElementError(p0) })
  await flush()
  assert.deepEqual(sources(container), ['https://cdn.example.com/p3b.mp3'],
    '用户暂停后回退仍推进到下一候选')
  const p1 = audio()
  assert.equal(p1.__paused !== false, true,
    '用户主动暂停后回退不得自动起播')

  await act(async () => { root.unmount() })
})

test('AssetPreviewModal：普通音频 item 行为不动——无 DTO、单 URL、失败即旧语义', async () => {
  const window = installDom()
  installMediaStubs(window)
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const AssetPreviewModal = await loadModal()
  const { act } = React

  const container = window.document.getElementById('root')
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: ORDINARY_AUDIO, t, onClose: () => {} }))
  })
  const flush = async () => { await act(async () => { await Promise.resolve() }) }

  assert.deepEqual(sources(container), ['/omnimux/assets/cloud/media?id=bgm-1&which=media'],
    '普通音频只用单一 previewUrl')
  await act(async () => { fireError(container) })
  await flush()
  assert.equal(container.querySelector('audio'), null, '普通音频失败后撤掉播放器（旧语义不变）')
  assert.doesNotMatch(container.textContent, /试听暂不可用，请稍后重试。/,
    '普通音频不出官方试听核定文案')

  await act(async () => { root.unmount() })
})
