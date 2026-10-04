/**
 * Issue #3058 OCR closure F4：普通素材失败保持旧静默停止行为。
 *
 * CLI 根因：普通素材的单地址候选也走 reportFailure，官方试听新增的失败
 * notice + hover suppression 改变了普通云端音频旧行为。
 * 契约：
 *   - 普通素材（BGM/SFX）唯一候选 error → 静默停止：notice === ''、
 *     suppressedIds 不含该 id、element pause；同一悬停自动 toggle 仍可
 *     重新发起（旧行为，非官方抑制）。
 *   - 普通素材 NotAllowedError：静默回空闲，不出文案、不武装抑制。
 *   - 官方试听穷尽失败 → 核定 notice + suppress（既有契约，回归守住）。
 *
 * 真实 hook 经 esbuild 打包，react / react-dom 由 Node 侧同一实例注入；
 * DOM 由 JSDOM 提供，Audio 由受控桩替代。每条断言都是强断言；
 * 不验证真实媒体可播。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRequire = createRequire(join(here, '..', '..', 'package.json'))
const { JSDOM } = pluginRequire('jsdom')

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

/** 受控 Audio 桩：类级 playOutcome 决定新实例 play() 结果。 */
function installAudioStub() {
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
      const outcome = FakeAudio.playOutcome
      if (outcome === 'reject') return Promise.reject(new Error('network'))
      if (outcome === 'not-allowed') {
        return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
      }
      return Promise.resolve()
    }
    pause() { this.paused = true }
    load() {}
  }
  FakeAudio.instances = instances
  FakeAudio.playOutcome = 'resolve'
  globalThis.Audio = FakeAudio
  globalThis.window.Audio = FakeAudio
  return instances
}

async function loadHook() {
  const esbuild = pluginRequire('esbuild')
  const result = await esbuild.build({
    entryPoints: [join(here, 'use-cloud-assets-feed.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  })
  const mod = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(pluginRequire, mod, mod.exports)
  return mod.exports
}

const VOICE_VERIFIED = {
  id: 'audio-voiceover-linxiao',
  name: '林潇 2.0',
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
const BGM_ROW = { id: 'audio-bgm-1', name: 'beat', mediaType: 'audio', hasMedia: true, playable: true }

const t = (key) => ({ 'cloud.preview.failed': '试听暂不可用，请稍后重试。' }[key] ?? key)

test('useCloudAudition：普通素材失败静默停止（无 notice / 无抑制），官方试听穷尽仍核定提示+抑制（F4）', async () => {
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

  // 1. 普通素材唯一候选 error → 静默停止：无 notice、不入 suppression。
  act(() => { audition.toggle(BGM_ROW) })
  assert.equal(audition.playingId, 'audio-bgm-1')
  const bgmAudio = latest()
  assert.equal(bgmAudio.src, '/omnimux/assets/cloud/media?id=audio-bgm-1&which=media')
  await act(async () => { bgmAudio.dispatch('error') })
  await flush()
  assert.equal(audition.playingId, '', '普通素材失败回空闲')
  assert.equal(bgmAudio.paused, true, '普通素材失败暂停自己的 element（旧 silent stop）')
  assert.equal(audition.notice, '', '普通素材失败不出官方试听核定文案（F4）')
  assert.equal(audition.suppressedIds.has('audio-bgm-1'), false,
    '普通素材失败不入悬停抑制（F4）')

  // 2. 失败后的同一悬停自动 toggle（非显式）仍可重新发起——普通素材旧语义不抑制。
  const bgmCount = instances.length
  await act(async () => { audition.toggle(BGM_ROW) })
  await flush()
  assert.equal(instances.length, bgmCount + 1,
    '普通素材悬停自动重试不受 suppression 拦截（旧行为不变）')
  assert.equal(audition.playingId, 'audio-bgm-1')
  act(() => { audition.stop() })

  // 3. 普通素材 NotAllowedError（play 拒绝）：静默回空闲，不出文案、不武装抑制。
  globalThis.Audio.playOutcome = 'not-allowed'
  await act(async () => { audition.toggle(BGM_ROW) })
  await flush()
  globalThis.Audio.playOutcome = 'resolve'
  const bgmNa = latest()
  assert.equal(audition.playingId, '', '普通素材权限拒绝回空闲')
  assert.equal(bgmNa.paused, true, '权限拒绝先 pause/归零清理')
  assert.equal(audition.notice, '', '普通素材权限拒绝不出文案（F4）')
  assert.equal(audition.suppressedIds.has('audio-bgm-1'), false,
    '普通素材权限拒绝不武装抑制（F4）')

  // 4. 官方试听穷尽对照：核定 notice + suppress 仍生效（回归不变）。
  const allFail = { ...VOICE_VERIFIED, id: 'audio-voiceover-fail' }
  act(() => { audition.toggle(allFail) })
  const failing = latest()
  await act(async () => { failing.dispatch('error') })
  await flush()
  const failingAlt = latest()
  await act(async () => { failingAlt.dispatch('error') })
  await flush()
  assert.equal(audition.playingId, '')
  assert.equal(audition.notice, '试听暂不可用，请稍后重试。',
    '官方试听穷尽仍一次核定文案（回归不变）')
  assert.equal(audition.suppressedIds.has('audio-voiceover-fail'), true,
    '官方试听穷尽仍入抑制（回归不变）')

  act(() => { root.unmount() })
})
