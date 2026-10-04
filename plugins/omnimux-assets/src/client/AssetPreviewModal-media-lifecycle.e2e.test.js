/**
 * Issue #3058 OCR closure F1/F2/F5：AssetPreviewModal 媒体生命周期。
 *
 * F1：弹窗不卸载而 item 切换时，<audio> 须按 itemKey 重挂载——旧实例停止、
 *     新实例指向新 item 首候选，绝不在同一 media element 上只换 src。
 * F2：令牌/候选下标的重置发生在 commit 之后的 effect，不在 render 期改 ref；
 *     已提交 element 的回调绑定当次提交的 item/attempt——旧 item 迟到的
 *     source error 不能读新 item 的 src、不能推进新 item 状态。
 * F5（邻近同根）：官方预览音频全候选失败（broken）且 description 非空时，
 *     显示核定 cloud.preview.failed 文案而非描述文本。
 *
 * 真实组件经 esbuild 打包（dsh-ui-kit 替换为桩），react / react-dom 由 Node 侧
 * 同一份实例注入；DOM 由 JSDOM 提供，HTMLMediaElement 用受控桩。
 * 每条断言都是强断言；不验证真实媒体可播。
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
    candidates: ['https://cdn.example.com/v2-primary.mp3', 'https://cdn.example.com/v2-alt.mp3'],
  },
}

const sources = (container) =>
  [...container.querySelectorAll('audio source')].map((s) => s.getAttribute('src'))

const fireError = (container) => {
  const el = container.querySelector('audio source')
  assert.ok(el, 'audio source 已渲染')
  el.dispatchEvent(new (globalThis.window.Event)('error', { bubbles: false }))
}

test('AssetPreviewModal：item A→B 切换 audio 按 itemKey 重挂载，旧实例停止且迟到 error 不误伤新 item（F1/F2）', async () => {
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

  const elA = audio()
  assert.ok(elA, 'item A 音频控件已渲染')
  const srcElA = container.querySelector('audio source')
  assert.deepEqual(sources(container), ['https://cdn.example.com/primary.mp3'])

  // A 正在播放 → 切到 B（弹窗不卸载，同 kind 同控件）。
  await act(async () => { elA.play() })
  assert.equal(elA.__paused, false)
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item: VOICE_ITEM_B, t, onClose: () => {} }))
  })
  await flush()

  const elB = audio()
  assert.notEqual(elB, elA,
    'itemKey 变化必须重挂载 audio element（不在同一 media element 上只换 src）')
  assert.equal(elA.__paused, true, '换 item 必须停止已提交的旧实例')
  assert.equal(container.contains(elA), false, '旧 audio element 不再在文档中')
  assert.equal(container.contains(srcElA), false, '旧 source element 不再在文档中')
  assert.deepEqual(sources(container), ['https://cdn.example.com/v2-primary.mp3'],
    '新 item 从它自己的 DTO primary 开始')

  // 旧 item 已卸载 source 迟到的 error 事件：绝不能读新 src、不能推进 B 状态。
  await act(async () => {
    srcElA.dispatchEvent(new window.Event('error', { bubbles: false }))
  })
  await flush()
  assert.deepEqual(sources(container), ['https://cdn.example.com/v2-primary.mp3'],
    '旧 item 迟到 error 不得推进/污染新 item 的候选')
  assert.equal(container.contains(elB), true, '新 item 播放控件仍在')
  assert.doesNotMatch(container.textContent, /试听暂不可用/, '新 item 不出失败文案')

  await act(async () => { root.unmount() })
})

test('AssetPreviewModal：官方预览全候选失败 + description 非空 → 核定失败文案优先于描述文本（F5）', async () => {
  const window = installDom()
  installMediaStubs(window)
  const React = pluginRequire('react')
  const { createRoot } = pluginRequire('react-dom/client')
  const AssetPreviewModal = await loadModal()
  const { act } = React

  const container = window.document.getElementById('root')
  const root = createRoot(container)
  const item = { ...VOICE_ITEM, text: '林潇是温柔女声' }
  await act(async () => {
    root.render(React.createElement(AssetPreviewModal, { item, t, onClose: () => {} }))
  })
  const flush = async () => { await act(async () => { await Promise.resolve() }) }

  // 两个候选全部失败 → broken：无论 description 是否为空，只显示核定失败文案。
  await act(async () => { fireError(container) })
  await flush()
  assert.deepEqual(sources(container), ['https://cdn.example.com/alt.mp3'], 'primary 失败回退 alt')
  await act(async () => { fireError(container) })
  await flush()

  assert.equal(container.querySelector('audio'), null, '候选穷尽后撤掉播放器')
  assert.match(container.textContent, /试听暂不可用，请稍后重试。/,
    '官方预览全候选失败必须显示核定失败文案')
  assert.doesNotMatch(container.textContent, /林潇是温柔女声/,
    '失败态不得吞成 description 文本')
  assert.doesNotMatch(container.textContent, /当前文件格式不支持内嵌预览/,
    '绝不落 unsupportedMedia 空态')

  await act(async () => { root.unmount() })
})
