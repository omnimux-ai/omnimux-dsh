// @vitest-environment jsdom
// @ts-nocheck
//
// 文本生成模型隔离（Issue #3629）· worker 侧契约。
//
// 页面 Copilot 的正文由 background 用一个临时会话生成。用户配置了文本生成模型时，
// 该会话必须先钉定到它、再转发 prompt；钉定失败必须把原因显式返回给用户，绝不能
// 静默改用宿主默认或对话模型（那正是 #3629 要消除的行为）。
//
// 这些用例驱动真实的 worker：chrome 桩在静态导入之前装好，断言的是宿主真正会收到的
// 帧顺序与 payload。写法与 tests/capture-message.spec.ts 一致：不使用 TS 专有语法、
// 用 node:assert/strict 断言（写入门禁对新测试文件做 acorn 静态检查）。

import { describe, it, vi } from 'vitest'
import assert from 'node:assert/strict'

const harness = vi.hoisted(() => {
  function channel() {
    const listeners = []
    return {
      addListener: (listener) => { listeners.push(listener) },
      removeListener: (listener) => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      },
      // 固定元数调用：不引入参数展开，保持写入门禁可静态检查。
      emit: (first, second, third) => {
        for (const listener of listeners) listener(first, second, third)
      },
    }
  }

  const settings = {
    bridgeUrl: 'wss://bridge.example/ext/bridge',
    token: 'pairing-token',
    sharePageContent: 'auto',
    unrestrictedBrowserAccess: false,
    trustedActionOrigins: [],
    approvalNotifications: true,
    autoResumeSession: true,
    textModel: '',
    textProvider: '',
    textEffort: '',
  }

  const portMessages = []
  const port = {
    name: 'dsh-panel',
    postMessage: (message) => { portMessages.push(message) },
    onMessage: channel(),
    onDisconnect: channel(),
  }

  const runtime = { onMessage: channel(), onConnect: channel(), onInstalled: channel() }

  globalThis.chrome = {
    i18n: { getUILanguage: () => 'zh-CN' },
    alarms: { create: () => {}, clear: async () => true, onAlarm: channel() },
    notifications: { create: async () => '', clear: async () => true, onClicked: channel() },
    runtime: {
      id: 'test-extension',
      getURL: (path) => 'chrome-extension://test/' + path,
      onMessage: runtime.onMessage,
      onConnect: runtime.onConnect,
      onInstalled: runtime.onInstalled,
    },
    sidePanel: { open: async () => {}, setPanelBehavior: async () => {} },
    storage: {
      local: {
        get: async (key) => (key === 'dshSettings' ? { dshSettings: settings } : {}),
        set: async () => {},
      },
      session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    },
    tabs: {
      get: async (tabId) => ({ id: tabId, windowId: 1, title: 'Tab', url: 'https://example.com/' }),
      query: async () => [],
      sendMessage: async () => undefined,
      onActivated: channel(),
      onUpdated: channel(),
      onReplaced: channel(),
      onRemoved: channel(),
    },
    scripting: { executeScript: async () => [] },
    webNavigation: { getAllFrames: async () => [], onCommitted: channel() },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: channel(), onRemoved: channel() },
  }

  return { settings, port, portMessages, runtime }
})

// 静态导入：worker 顶层就注册 chrome 监听，所以桩必须先装好。
import '../src/background/index.ts'

class FakeWebSocket extends EventTarget {
  // 浏览器 WebSocket 的状态常量：bridge 用 WebSocket.OPEN 判断能否发帧，
  // 少了它们桥会把「已 open」判成不可用而走重连。
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances = []

  constructor(url) {
    super()
    this.url = url
    this.readyState = 0
    this.sent = []
    FakeWebSocket.instances.push(this)
  }

  send(value) {
    this.sent.push(JSON.parse(value))
  }

  open() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }

  receive(frame) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }))
  }

  close() {
    this.readyState = 3
    this.dispatchEvent(new CloseEvent('close', { code: 1000, reason: '' }))
  }
}

const SENDER = { id: 'test-extension', tab: { id: 7, windowId: 3 }, frameId: 0 }

let sharedSocket = null

/** 连上一个面板端口（真实生产路径）并让桥进入 connected。 */
async function connectedSocket() {
  if (sharedSocket !== null) return sharedSocket
  globalThis.WebSocket = FakeWebSocket
  const base = FakeWebSocket.instances.length
  harness.runtime.onConnect.emit(harness.port)
  await vi.waitFor(() => { assert.ok(FakeWebSocket.instances.length > base) })
  const socket = FakeWebSocket.instances.at(base)
  socket.open()
  // 桥在 socket open 之后才挂 message 监听并发出 hello：必须先等到 hello 帧，
  // 否则 hello.ok 会早于监听注册而被丢掉，桥会走 ack 超时重连。
  await vi.waitFor(() => { assert.equal(socket.sent.length > 0, true) })
  socket.receive({ t: 'hello.ok', caps: { textOnly: true, snapshotMaxChars: 32000, maxInteractiveItems: 60 } })
  await vi.waitFor(() => { assert.ok(socket.sent.length > 0) })
  sharedSocket = socket
  return socket
}

/** 通过面板 settings 消息改文本生成模型（与设置面板同一条链路）。 */
async function configureTextModel(model, provider, effort) {
  const id = 'text-model:' + model + ':' + provider + ':' + effort
  harness.port.onMessage.emit({
    type: 'settings',
    id,
    settings: { textModel: model, textProvider: provider, textEffort: effort },
  })
  await vi.waitFor(() => {
    const acked = harness.portMessages.some((message) => message.type === 'settings.result' && message.id === id && message.ok === true)
    assert.ok(acked)
  })
}

function generate(respond) {
  harness.runtime.onMessage.emit(
    { type: 'DSH_TWITTER_COPILOT_GENERATE', systemPrompt: '你是回帖助手', userMessage: '生成一条回帖' },
    SENDER,
    respond,
  )
}

function rpcFrames(socket) {
  return socket.sent.filter((frame) => frame.t === 'rpc')
}

function framesFrom(socket, index) {
  return rpcFrames(socket).slice(index)
}

function frameWith(frames, method) {
  return frames.find((frame) => frame.method === method)
}

function reply(socket, frame, result) {
  socket.receive({ t: 'rpc.result', id: frame.id, ok: true, result })
}

function replyError(socket, frame, message) {
  socket.receive({ t: 'rpc.result', id: frame.id, ok: false, error: { code: 'internal', message } })
}

function completeTurn(socket, sessionId, text) {
  socket.receive({
    t: 'event',
    frame: {
      method: 'session/event',
      payload: {
        type: 'session/event',
        sessionId,
        event: {
          type: 'assistant/message',
          data: { message: { role: 'assistant', content: [{ type: 'text', text }] } },
        },
      },
    },
  })
  socket.receive({
    t: 'event',
    frame: {
      method: 'session/event',
      payload: { type: 'session/event', sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } },
    },
  })
}

/** 发出生成请求并应答 session.create，返回本次请求的帧起点。 */
async function startGeneration(socket, respond, sessionId) {
  const from = rpcFrames(socket).length
  generate(respond)
  await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'session.create')) })
  const create = frameWith(framesFrom(socket, from), 'session.create')
  reply(socket, create, { sessionId })
  return from
}

function firstResponse(respond) {
  assert.ok(respond.mock.calls.length > 0, 'worker 没有回执')
  return respond.mock.calls.at(0).at(0)
}

describe('Copilot 正文生成与文本生成模型（#3629）', () => {
  it('未设置文本模型时不钉定：session.prompt 直接转发（A3）', async () => {
    const socket = await connectedSocket()
    await configureTextModel('', '', '')
    const respond = vi.fn()
    const from = await startGeneration(socket, respond, 'session-unset')

    await vi.waitFor(() => { assert.ok(rpcFrames(socket).length > from + 1) })
    const frames = framesFrom(socket, from)
    assert.equal(frames.some((frame) => frame.method === 'bridge.textGeneration'), false)
    const next = frames.at(1)
    assert.equal(next.method, 'session.prompt')

    reply(socket, next, { ok: true })
    completeTurn(socket, 'session-unset', '宿主默认正文')
    await vi.waitFor(() => { assert.equal(firstResponse(respond).text, '宿主默认正文') })
    assert.equal(firstResponse(respond).ok, true)
    assert.equal(frameWith(framesFrom(socket, from), 'bridge.completeText'), undefined)
  })

  it('已设置文本模型时先钉定再 prompt', async () => {
    const socket = await connectedSocket()
    await configureTextModel('claude-opus-4-6', 'anthropic', 'high')
    const respond = vi.fn()
    const from = await startGeneration(socket, respond, 'session-pinned')

    await vi.waitFor(() => { assert.ok(rpcFrames(socket).length > from + 1) })
    const pin = framesFrom(socket, from).at(1)
    assert.equal(pin.method, 'bridge.textGeneration')
    assert.deepStrictEqual(pin.payload, {
      sessionId: 'session-pinned',
      model: 'claude-opus-4-6',
      provider: 'anthropic',
      reasoningEffort: 'high',
    })

    reply(socket, pin, { pinned: true })
    await vi.waitFor(() => { assert.ok(rpcFrames(socket).length > from + 2) })
    const frames = framesFrom(socket, from)
    const prompt = frames.at(2)
    assert.equal(prompt.method, 'session.prompt')
    assert.equal(prompt.payload.sessionId, 'session-pinned')
    assert.equal(frames.some((frame) => frame.method === 'bridge.completeText'), false)

    reply(socket, prompt, { ok: true })
    completeTurn(socket, 'session-pinned', '钉定模型正文')
    await vi.waitFor(() => { assert.equal(firstResponse(respond).text, '钉定模型正文') })
    assert.equal(firstResponse(respond).ok, true)
  })

  it('钉定失败返回显式错误、不产生正文、不静默兜底（A4）', async () => {
    const socket = await connectedSocket()
    // 已保存 provider：钉定帧直接发出（provider 解析失败是另一条用例）。
    await configureTextModel('claude-opus-4-6', 'anthropic', '')
    const respond = vi.fn()
    const from = await startGeneration(socket, respond, 'session-pin-failed')

    await vi.waitFor(() => { assert.ok(rpcFrames(socket).length > from + 1) })
    const pin = framesFrom(socket, from).at(1)
    assert.equal(pin.method, 'bridge.textGeneration')
    assert.equal(pin.payload.provider, 'anthropic')
    replyError(socket, pin, 'model unavailable')

    await vi.waitFor(() => { assert.ok(respond.mock.calls.length > 0) })
    const response = firstResponse(respond)
    assert.equal(response.ok, false)
    assert.ok(response.message.includes('claude-opus-4-6'))
    assert.ok(response.message.includes('model unavailable'))
    assert.equal(response.text, undefined)

    const frames = framesFrom(socket, from)
    assert.equal(frames.some((frame) => frame.method === 'session.prompt'), false)
    assert.equal(frames.some((frame) => frame.method === 'bridge.completeText'), false)

    // 临时会话仍然被回收。
    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'bridge.session.purge')) })
    assert.equal(frameWith(framesFrom(socket, from), 'bridge.session.purge').payload.sessionId, 'session-pin-failed')
  })

  it('兜底 bridge.completeText 携带已配置的 model', async () => {
    const socket = await connectedSocket()
    await configureTextModel('claude-opus-4-6', '', '')
    const respond = vi.fn()
    const from = rpcFrames(socket).length
    generate(respond)

    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'session.create')) })
    replyError(socket, frameWith(framesFrom(socket, from), 'session.create'), 'session create failed')

    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'bridge.completeText')) })
    const fallback = frameWith(framesFrom(socket, from), 'bridge.completeText')
    assert.deepStrictEqual(fallback.payload, {
      prompt: '生成一条回帖',
      system: '你是回帖助手',
      model: 'claude-opus-4-6',
    })

    reply(socket, fallback, { text: '兜底正文' })
    await vi.waitFor(() => { assert.equal(firstResponse(respond).text, '兜底正文') })
    assert.equal(firstResponse(respond).ok, true)
  })

  it('未设置文本模型时兜底不带 model（A3）', async () => {
    const socket = await connectedSocket()
    await configureTextModel('', '', '')
    const respond = vi.fn()
    const from = rpcFrames(socket).length
    generate(respond)

    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'session.create')) })
    replyError(socket, frameWith(framesFrom(socket, from), 'session.create'), 'session create failed')

    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'bridge.completeText')) })
    const fallback = frameWith(framesFrom(socket, from), 'bridge.completeText')
    assert.deepStrictEqual(fallback.payload, { prompt: '生成一条回帖', system: '你是回帖助手' })
    assert.equal(Object.keys(fallback.payload).includes('model'), false)

    reply(socket, fallback, { text: '兜底正文' })
    await vi.waitFor(() => { assert.equal(firstResponse(respond).text, '兜底正文') })
    assert.equal(firstResponse(respond).ok, true)
  })

  it('已保存 provider 时直接用，不回查目录', async () => {
    const socket = await connectedSocket()
    await configureTextModel('claude-opus-4-6', 'anthropic', 'high')
    const respond = vi.fn()
    const from = await startGeneration(socket, respond, 'session-provider-saved')

    await vi.waitFor(() => { assert.ok(rpcFrames(socket).length > from + 1) })
    const frames = framesFrom(socket, from)
    const pin = frames.at(1)
    assert.equal(pin.method, 'bridge.textGeneration')
    assert.equal(pin.payload.provider, 'anthropic')
    assert.equal(frames.some((frame) => frame.method === 'session.modelCatalog'), false)

    reply(socket, pin, { pinned: true })
    await vi.waitFor(() => { assert.ok(rpcFrames(socket).length > from + 2) })
    const prompt = framesFrom(socket, from).at(2)
    assert.equal(prompt.method, 'session.prompt')
    reply(socket, prompt, { ok: true })
    completeTurn(socket, 'session-provider-saved', '保存 provider 正文')
    await vi.waitFor(() => { assert.equal(firstResponse(respond).text, '保存 provider 正文') })
    assert.equal(firstResponse(respond).ok, true)
  })

  it('provider 为空时按 model id 回查目录，钉定带上解析出的 provider', async () => {
    const socket = await connectedSocket()
    await configureTextModel('grok-4.6', '', '')
    const respond = vi.fn()
    const from = await startGeneration(socket, respond, 'session-provider-lookup')

    // 目录组 id 与组名映射给出的值不同：断言必须命中 id 路径。
    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'session.modelCatalog')) })
    const lookup = frameWith(framesFrom(socket, from), 'session.modelCatalog')
    reply(socket, lookup, {
      groups: [
        { id: 'grok-subscription', name: 'Grok (Subscription)', models: [{ id: 'grok-4.6', name: 'Grok 4.6' }] },
      ],
    })

    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'bridge.textGeneration')) })
    const frames = framesFrom(socket, from)
    const pin = frameWith(frames, 'bridge.textGeneration')
    assert.deepStrictEqual(pin.payload, {
      sessionId: 'session-provider-lookup',
      model: 'grok-4.6',
      provider: 'grok-subscription',
    })
    assert.ok(frames.indexOf(pin) > frames.indexOf(lookup))

    reply(socket, pin, { pinned: true })
    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'session.prompt')) })
    reply(socket, frameWith(framesFrom(socket, from), 'session.prompt'), { ok: true })
    completeTurn(socket, 'session-provider-lookup', '目录解析正文')
    await vi.waitFor(() => { assert.equal(firstResponse(respond).text, '目录解析正文') })
    assert.equal(firstResponse(respond).ok, true)
  })

  it('provider 为空且目录查不到时不发钉定、显式报错、仍 purge', async () => {
    const socket = await connectedSocket()
    await configureTextModel('ghost-model-9', '', '')
    const respond = vi.fn()
    const from = await startGeneration(socket, respond, 'session-provider-missing')

    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'session.modelCatalog')) })
    const lookup = frameWith(framesFrom(socket, from), 'session.modelCatalog')
    reply(socket, lookup, {
      groups: [
        { id: 'grok-subscription', name: 'Grok (Subscription)', models: [{ id: 'grok-4.6', name: 'Grok 4.6' }] },
      ],
    })

    await vi.waitFor(() => { assert.ok(respond.mock.calls.length > 0) })
    const response = firstResponse(respond)
    assert.equal(response.ok, false)
    assert.ok(response.message.includes('ghost-model-9'))
    assert.equal(response.text, undefined)

    const frames = framesFrom(socket, from)
    assert.equal(frames.some((frame) => frame.method === 'bridge.textGeneration'), false)
    assert.equal(frames.some((frame) => frame.method === 'session.prompt'), false)
    assert.equal(frames.some((frame) => frame.method === 'bridge.completeText'), false)

    await vi.waitFor(() => { assert.ok(frameWith(framesFrom(socket, from), 'bridge.session.purge')) })
    assert.equal(frameWith(framesFrom(socket, from), 'bridge.session.purge').payload.sessionId, 'session-provider-missing')
  })
})
