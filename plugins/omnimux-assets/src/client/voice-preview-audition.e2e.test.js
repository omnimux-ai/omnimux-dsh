/**
 * Issue #3058 官方音色试听状态机行为级 e2e（UI 模拟，非真实音频播放证据）。
 *
 * 真实 hook（use-cloud-assets-feed.js 的 useCloudAudition）经 esbuild 打包，
 * react / react-dom 作为 external 由 Node 侧同一份实例注入；DOM 由 JSDOM 提供，
 * Audio 构造器由测试桩替代（含 deferred play()：只有挂起的 promise 才能真实复现
 * 「旧候选的迟到 rejection 误结算新候选」竞态，源码字符串断言覆盖不了它）。
 * 断言的是状态机契约（每条断言都是强断言 assert.equal / deepEqual）：
 *   - 官方试听按 preview DTO 候选顺序播放（primary 在前，不重发同一 URL）；
 *   - 候选 onerror + play().catch 同候选只结算一次（不双推进）；
 *   - requestToken 隔离：旧请求迟到回调不覆盖新试听状态；
 *   - 每次 play() 调用捕获各自 attempt 下标：旧候选的迟到 rejection 只结算它
 *     自己，不得误伤已被 error 推进的新候选（OCR 整改 #2/#4）；
 *   - unverified 官方 preview 行在 hook seam 即被 fail-closed 拒绝，
 *     连 Audio 实例都不构造（OCR 整改 #8），不只靠卡片藏播放键；
 *   - NotAllowedError（自动播放权限拒绝）不轮换候选、不伪装文件不存在：
 *     静默回空闲并抑制同一悬停的自动重启，直到用户显式动作（OCR 整改 #12）；
 *   - 候选穷尽或已知断网只提示一次核定文案，同一次悬停不再自动重试；
 *   - 每个 attempt 独立原生 Audio element（Sol 规格轴 HIGH #1）：error 事件
 *     不携带 URL 身份，同一 element 换 src 后旧 error 会被误算到新候选；
 *     反向失败顺序（deferred rejection 先 / error 后）每候选只结算一次；
 *   - 旧 attempt 迟到的 NotAllowedError 先经 !currentAttempt/settled 短路，
 *     不清新状态、不暂停新 element（Sol 规格轴 HIGH #2）；当前权限拒绝先
 *     pause/归零清理再回空闲，不留仍在播放的孤儿 element；
 *   - 普通资产仍经 cloudMediaUrl 单 URL 播放；stop/unmount 清理所有 attempt。
 * 本测试不验证真实媒体可播——那是 PM 演示验收（A1–A4）的事。
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

/** 受控 Audio 桩：记录每实例的 src 轨迹、play 调用与事件监听。 */
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
      /** 'resolve' | 'reject' | 'not-allowed' —— play() 的受控结果 */
      this.playOutcome = 'resolve'
      /** true 时 play() 返回挂起的 promise，测试对每个 deferred assert.equal 所属候选 */
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
  /** deferAll=true 时新实例 play() 一律挂起；首个 play 在 toggle 内同步发起须先开 flag，
   *  供测试 assert.equal 每个 deferred 与候选下标的归属 */
  FakeAudio.deferAll = false
  instances.FakeAudio = FakeAudio
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

/** 官方音色 preview DTO 行（锁定 schema 的最小形态）。 */
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

test('useCloudAudition：官方试听按 DTO 候选播放，回退/结算/隔离契约', async () => {
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

  // 1. 普通资产：单一 cloudMediaUrl，无候选逻辑
  act(() => { audition.toggle(BGM_ROW) })
  assert.equal(audition.playingId, 'audio-bgm-1')
  assert.equal(latest().src, '/omnimux/assets/cloud/media?id=audio-bgm-1&which=media')

  // 2. 再点同一行 → 停止并归零
  act(() => { audition.toggle(BGM_ROW) })
  assert.equal(audition.playingId, '')
  assert.equal(latest().paused, true)

  // 3. 官方试听：primary 在前，单播（新实例替换旧实例）
  act(() => { audition.toggle(BGM_ROW) })
  const bgmAudio = latest()
  act(() => { audition.toggle(VOICE_VERIFIED) })
  assert.equal(audition.playingId, 'audio-voiceover-linxiao')
  const voiceAudio = latest()
  assert.notEqual(voiceAudio, bgmAudio)
  assert.equal(bgmAudio.paused, true, '旧试听必须停止（单播）')
  // DTO primary 是官方 CDN 直链，不走 media 路由拼接
  assert.equal(voiceAudio.src, 'https://cdn.example.com/primary.mp3')

  // 4. primary onerror → 回退 alt.mp3（按序、不重发 primary）；
  // 每次 attempt 用独立原生 Audio element，避免同一 element 换 src 后
  // 旧候选的无 URL 身份 error 被误算到新候选（Sol 规格轴 HIGH #1）。
  act(() => { voiceAudio.dispatch('error') })
  const altAudio = latest()
  assert.notEqual(altAudio, voiceAudio, '每个 attempt 独立 Audio element')
  assert.equal(altAudio.src, 'https://cdn.example.com/alt.mp3')
  assert.deepEqual([...voiceAudio.playCalls, ...altAudio.playCalls], [
    'https://cdn.example.com/primary.mp3',
    'https://cdn.example.com/alt.mp3',
  ], '候选按序播放且不重发同一 URL')
  act(() => { audition.stop() })
  assert.equal(audition.playingId, '')
  assert.equal(altAudio.paused, true, 'stop 清理所有 attempt element（正向停止路径）')
  assert.equal(voiceAudio.paused, true)

  // 5. NotAllowedError 不换 URL、不提示、抑制同一悬停的自动重启
  instances.length = 0
  globalThis.Audio = class {
    constructor(src) { this.src = src; this.listeners = {}; this.paused = true; instances.push(this) }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn) }
    dispatch(type) { for (const fn of this.listeners[type] ?? []) fn.call(this) }
    play() { this.paused = false; this.playCalls = (this.playCalls ?? []); this.playCalls.push(this.src); return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) }
    pause() { this.paused = true }
  }
  globalThis.window.Audio = globalThis.Audio
  await act(async () => { audition.toggle(VOICE_VERIFIED) })
  await flush()
  const naAudio = instances[instances.length - 1]
  assert.equal(naAudio.playCalls.length, 1, '不得尝试 alt 候选')
  assert.equal(naAudio.playCalls[0], 'https://cdn.example.com/primary.mp3',
    'NotAllowedError 不得轮换候选（拒绝 ≠ 文件不存在）')
  assert.equal(naAudio.src, '',
    '权限拒绝走 releaseRequest 终态释放：src 清空、监听摘除，不留孤儿资源')
  assert.equal(audition.playingId, '')
  assert.equal(audition.notice, '', '权限拒绝不出「文件不可用」文案，只静默回空闲')
  assert.equal(audition.suppressedIds.has('audio-voiceover-linxiao'), true,
    '权限拒绝后的同一悬停被标记为自动播放抑制')
  assert.equal(naAudio.paused, true,
    '当前权限拒绝须先 pause/归零清理再回空闲，不留仍在播放的孤儿 element')

  // 6. 抑制期间悬停副作用（非显式 toggle）一律不新建 Audio；显式动作解除抑制后重试。
  const deniedCount = instances.length
  await act(async () => { audition.toggle(VOICE_VERIFIED) })
  await act(async () => { audition.toggle(VOICE_VERIFIED) })
  await flush()
  assert.equal(instances.length, deniedCount, '悬停自动重启被抑制，不产生新的构造/请求')
  await act(async () => { audition.toggle(VOICE_VERIFIED, true) })
  assert.equal(instances.length, deniedCount + 1, '显式动作重新发起试听')
  await flush()
  // 显式重试仍被拒（同一拒绝策略）：再次拒绝重新武装抑制，不算静默失败。
  assert.equal(audition.suppressedIds.has('audio-voiceover-linxiao'), true,
    '显式重试再次被拒后抑制重新武装')
  act(() => { audition.stop() })

  // 恢复受控桩
  const instances2 = installAudioStub()
  const latest2 = () => instances2[instances2.length - 1]

  // 7. 旧请求迟到回调不覆盖新状态：A 试听中立刻切 B，A 的 ended 不得清空 B
  act(() => { audition.toggle(VOICE_VERIFIED) })
  const stale = latest2()
  act(() => { audition.toggle({ ...VOICE_VERIFIED, id: 'audio-voiceover-other', name: '其他音色' }) })
  const fresh = latest2()
  act(() => { stale.dispatch('ended') })
  assert.equal(audition.playingId, 'audio-voiceover-other',
    '旧请求回调不得覆盖新试听状态')
  act(() => { fresh.dispatch('ended') })
  assert.equal(audition.playingId, '')

  // 8. 候选穷尽 → 一次核定文案 notice，不假播放；同一悬停不再自动重试
  const allFail = { ...VOICE_VERIFIED, id: 'audio-voiceover-fail' }
  act(() => { audition.toggle(allFail) })
  const failing = latest2()
  await act(async () => { failing.dispatch('error') })
  await flush()
  const failingAlt = latest2()
  assert.notEqual(failingAlt, failing, '回退候选使用独立 Audio element')
  await act(async () => { failingAlt.dispatch('error') })
  await flush()
  assert.equal(audition.playingId, '')
  assert.equal(audition.notice, '试听暂不可用，请稍后重试。')
  // 旧 attempt 的迟到 error 不得重复推进/提示
  act(() => { failing.dispatch('error') })
  assert.equal(audition.notice, '试听暂不可用，请稍后重试。')
  // 穷尽失败同样抑制悬停自动重启，防止「playingId 清空 → 又 hover」的提示循环
  assert.equal(audition.suppressedIds.has('audio-voiceover-fail'), true)
  const exhaustedCount = instances2.length
  await act(async () => { audition.toggle(allFail) })
  assert.equal(instances2.length, exhaustedCount, '同一悬停不得自动重试已失败资产')

  // 9. unmount 清理
  act(() => { audition.toggle(BGM_ROW) })
  const lastAudio = latest2()
  act(() => { root.unmount() })
  assert.equal(lastAudio.paused, true)
})

test('useCloudAudition：旧候选 play() 迟到 rejection 只结算它自己（OCR #2/#4）', async () => {
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

  // 首个 play() 在 toggle 内同步发起，deferred 模式必须在 toggle 之前就位。
  instances.FakeAudio.deferAll = true
  act(() => { audition.toggle(VOICE_VERIFIED) })
  const audio = latest()
  // 首次 play（candidate 0 = primary）的 promise 由测试持有，先不让它结算。
  assert.equal(audio.playCalls.length, 1)
  assert.equal(audio.playDeferreds.length, 1)

  // candidate 0 的 error 事件先行到达 → 推进 candidate 1：新 attempt 用一个
  // 独立原生 Audio element（每个 attempt 一个 element，不再共享 src 换绑）。
  act(() => { audio.dispatch('error') })
  const fallback = latest()
  assert.notEqual(fallback, audio, '新候选使用独立 Audio element')
  assert.equal(fallback.src, 'https://cdn.example.com/alt.mp3')
  assert.equal(fallback.playDeferreds.length, 1)

  // 修复前 bug：candidate 0 的 play() 迟到 rejection 会读可变 candidateIndex(=1)，
  // 把刚推进的 candidate 1 误结算为失败并直接提示「全部不可用」。
  // 契约：迟到的 rejection 只能结算发起它的那次 attempt。
  await act(async () => {
    audio.playDeferreds[0].reject(new Error('late primary failure'))
    await Promise.resolve()
  })
  assert.equal(fallback.src, 'https://cdn.example.com/alt.mp3',
    '旧候选的迟到 rejection 不得把 candidate 1 当成失败跳过')
  assert.equal(audition.playingId, 'audio-voiceover-linxiao',
    'candidate 1 仍是当前候选，试听不被提前终结')
  assert.equal(audition.notice, '', '未到穷尽不得提示失败文案')

  // candidate 1 自己真正失败（error 到达）后，其 play() rejection 结算它自己 → 穷尽提示。
  await act(async () => { fallback.dispatch('error') })
  await act(async () => {
    fallback.playDeferreds[0].reject(new Error('alt failed'))
    await Promise.resolve()
  })
  await flush()
  assert.equal(audition.playingId, '')
  assert.equal(audition.notice, '试听暂不可用，请稍后重试。')

  act(() => { root.unmount() })
})

test('useCloudAudition：unverified 官方 preview 行在播放 seam fail-closed，不构造 Audio（OCR #8）', async () => {
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
  const flush = async () => { await act(async () => { await Promise.resolve() }) }

  // 卡片藏播放键只是 UI 一层；hook 是真实播放 seam，任何调用方/陈旧路径
  // 都不许对未验证官方音色发起候选探测（preview-only 契约）。
  const UNVERIFIED = {
    ...VOICE_VERIFIED,
    id: 'audio-voiceover-unverified',
    preview: {
      ...VOICE_VERIFIED.preview,
      state: 'unverified',
      candidates: ['https://cdn.example.com/guess-1.mp3', 'https://cdn.example.com/guess-2.mp3'],
    },
  }
  await act(async () => { audition.toggle(UNVERIFIED) })
  await flush()
  assert.equal(instances.length, 0, 'unverified 行不得构造 Audio（禁止探测候选 URL）')
  assert.equal(audition.playingId, '', 'unverified 行不得进入播放态')
  assert.equal(audition.notice, '', 'unverified 行不得提示失败文案')

  act(() => { root.unmount() })
})

test('useCloudAudition：反向失败顺序每候选一次结算 + 旧 attempt 迟到 NotAllowedError 短路（Sol 规格轴 HIGH #1/#2）', async () => {
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

  // ── 场景 A：deferred rejection 先到 → 回退开始 → 旧候选 error 不得跳过新候选。
  // error 事件不携带 URL 身份：同一 element 换 src 时旧 error 会被误算进新候选，
  // 因此每个 attempt 必须用独立 element，旧 error 由 attempt 令牌短路。
  instances.FakeAudio.deferAll = true
  act(() => { audition.toggle(VOICE_VERIFIED) })
  const audioA = latest()
  assert.equal(audioA.src, 'https://cdn.example.com/primary.mp3')
  await act(async () => {
    audioA.playDeferreds[0].reject(new Error('primary rejected first'))
    await Promise.resolve()
  })
  const audioB = latest()
  assert.equal(audioB.src, 'https://cdn.example.com/alt.mp3', 'rejection 先行推进回退')
  await act(async () => { audioA.dispatch('error') })
  await flush()
  assert.equal(instances.length, 2, '旧 attempt 的迟到 error 不得推进/终结新候选')
  assert.equal(audioB.paused, false, '新候选播放不被旧 error 干扰')
  assert.equal(audition.playingId, 'audio-voiceover-linxiao')
  assert.equal(audition.notice, '', '未到穷尽不得提示失败文案')
  // 新候选自己失败才穷尽，一次文案
  await act(async () => { audioB.dispatch('error') })
  await flush()
  assert.equal(audition.playingId, '')
  assert.equal(audition.notice, '试听暂不可用，请稍后重试。')

  // ── 场景 B：error 先推进回退 → 旧 attempt 的迟到 NotAllowedError 必须先经
  // !currentAttempt/settled 短路：不得清新播放状态、不得暂停新 element。
  act(() => { audition.stop() })
  act(() => { audition.toggle(VOICE_VERIFIED, true) })
  const audioC = latest()
  act(() => { audioC.dispatch('error') })
  const audioD = latest()
  assert.equal(audioD.src, 'https://cdn.example.com/alt.mp3')
  await act(async () => {
    audioC.playDeferreds[0].reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    await Promise.resolve()
  })
  await flush()
  assert.equal(audition.playingId, 'audio-voiceover-linxiao',
    '旧 attempt 迟到 NotAllowedError 不得清空新试听状态')
  assert.equal(audioD.paused, false,
    '旧 attempt 迟到 NotAllowedError 不得暂停新 element')
  assert.equal(audition.notice, '', '旧 attempt 迟到拒绝不出失败文案')
  assert.equal(audition.suppressedIds.has('audio-voiceover-linxiao'), false,
    '旧 attempt 迟到拒绝不得错误武装悬停抑制')

  // ── 正向路径：切换音色仍清理本请求所有 attempt element。
  act(() => { audition.toggle(BGM_ROW) })
  assert.equal(audioC.paused, true, '切换音色清理已回退的旧 attempt element')
  assert.equal(audioD.paused, true, '切换音色暂停当前 element')
  const bgmAudio = latest()
  act(() => { root.unmount() })
  assert.equal(bgmAudio.paused, true, 'unmount 清理当前 element')
})

test('useCloudAudition：onerror 与 play rejection 同候选只结算一次', async () => {
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

  // 首次 play 成功（src=primary），随后同候选的 error 事件与 play 拒绝双信号
  // 到达：只允许一次推进到 alt，且 alt 自身失败只结算一次即穷尽。
  instances.FakeAudio.deferAll = true
  act(() => { audition.toggle(VOICE_VERIFIED) })
  const audio = latest()
  // 阶段一：error 推进到 alt（独立 element）
  act(() => { audio.dispatch('error') })
  const altAudio = latest()
  assert.notEqual(altAudio, audio, '每个 attempt 独立 Audio element')
  assert.equal(altAudio.src, 'https://cdn.example.com/alt.mp3')
  // 阶段二：alt 的 play 拒绝 + error 同候选双信号 → 只结算一次即穷尽
  await act(async () => {
    altAudio.playDeferreds[0].reject(new Error('alt rejected'))
    await Promise.resolve()
  })
  await act(async () => { altAudio.dispatch('error') })
  await flush()
  // 迟到的旧候选信号也不得重复推进
  await act(async () => { audio.dispatch('error') })
  await flush()
  assert.deepEqual(audio.playCalls.concat(altAudio.playCalls), [
    'https://cdn.example.com/primary.mp3',
    'https://cdn.example.com/alt.mp3',
  ], 'error 事件与 play 拒绝同候选只结算一次，无第三次推进')
  assert.equal(audition.notice, '试听暂不可用，请稍后重试。')
  act(() => { root.unmount() })
})
