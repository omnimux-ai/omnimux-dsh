/**
 * V1 `omnimux.saveImageAsset` bridge RPC（Issue #3052）。
 *
 * 冻结契约：图片写入只走当前 token 验证且握手完成的本机 WebSocket；输入限
 * {requestId,url,pageUrl,title?}；业务成功/失败骑成功帧；未认证连接连握手
 * 都过不了，写能力不暴露给非 loopback 远端；取消与连接代次绑定。
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { BridgeServer } from '../src/server.ts'
import { BRIDGE_SAVE_IMAGE_ASSET_METHOD, type BridgeFrame } from '../src/protocol.ts'
import type { BrowserHostApi } from '../src/host-api.ts'

const TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeef'
const CAPS = {
  textOnly: true as const,
  snapshotMaxChars: 12_000,
  maxInteractiveItems: 60,
  imageAssetSave: true as const,
}

interface Harness {
  bridge: BridgeServer
  server: Server
  url: string
  callMock: ReturnType<typeof vi.fn>
}

async function startBridge(overrides: Partial<ConstructorParameters<typeof BridgeServer>[0]> = {}): Promise<Harness> {
  const callMock = vi.fn(async () => ({ ok: true as const, value: 'ok' }))
  const api: BrowserHostApi = {
    call: callMock,
    async *events() {},
    respond: async () => ({ accepted: true }),
  }
  const bridge = new BridgeServer({
    token: TOKEN,
    api,
    toolTimeoutMs: 1_000,
    caps: CAPS,
    injectBrowserSnapshot: vi.fn(),
    purgeSession: vi.fn(async () => {}),
    setModelMode: vi.fn(),
    ...overrides,
  })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => { bridge.handleUpgrade(req, socket, head) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  return { bridge, server, url: `ws://127.0.0.1:${port}/ext/bridge`, callMock }
}

function connect(url: string): Promise<{ ws: WebSocket; frames: BridgeFrame[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const frames: BridgeFrame[] = []
    ws.on('message', (data) => { frames.push(JSON.parse(data.toString()) as BridgeFrame) })
    ws.on('error', reject)
    ws.on('open', () => { resolve({ ws, frames }) })
  })
}

function send(ws: WebSocket, frame: BridgeFrame): void {
  ws.send(JSON.stringify(frame))
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => { setTimeout(resolve, 10) })
  }
}

const harnesses: Harness[] = []
afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    await h.bridge.close()
    await new Promise<void>((resolve) => { h.server.close(() => resolve()) })
  }
})

async function authenticated(h: Harness): Promise<{ ws: WebSocket; frames: BridgeFrame[] }> {
  const { ws, frames } = await connect(h.url)
  send(ws, { t: 'hello', token: TOKEN, caps: CAPS })
  await waitFor(() => frames.some((f) => f.t === 'hello.ok'))
  return { ws, frames }
}

function savePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'req-1',
    url: 'https://cdn.example.com/a.png',
    pageUrl: 'https://news.example.com/article',
    title: '示例图',
    ...overrides,
  }
}

describe('omnimux.saveImageAsset RPC', () => {
  it('advertises imageAssetSave in hello.ok caps', async () => {
    const h = await startBridge()
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)
    expect(frames.find((f) => f.t === 'hello.ok')).toEqual({
      t: 'hello.ok',
      caps: { textOnly: true, snapshotMaxChars: 12_000, maxInteractiveItems: 60, imageAssetSave: true },
    })
    ws.close()
  })

  it('runs the save over the token-authenticated connection and returns the business outcome', async () => {
    const saveImageAsset = vi.fn(async () => ({ status: 'saved' as const, assetId: 'ast_1', fileId: 'fil_1', lrev: 3 }))
    const h = await startBridge({ saveImageAsset })
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)

    send(ws, { t: 'rpc', id: 'save-1', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload() })
    await waitFor(() => frames.some((f) => f.t === 'rpc.result' && f.id === 'save-1'))

    expect(frames).toContainEqual({
      t: 'rpc.result',
      id: 'save-1',
      ok: true,
      result: { status: 'saved', assetId: 'ast_1', fileId: 'fil_1', lrev: 3 },
    })
    expect(saveImageAsset).toHaveBeenCalledWith({
      requestId: 'req-1',
      url: 'https://cdn.example.com/a.png',
      pageUrl: 'https://news.example.com/article',
      title: '示例图',
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    // 桥本地方法：不得转发给网关。
    expect(h.callMock).not.toHaveBeenCalled()
    ws.close()
  })

  it('relays business failures on the same successful frame', async () => {
    const saveImageAsset = vi.fn(async () => ({ status: 'http-error' as const, statusCode: 404 }))
    const h = await startBridge({ saveImageAsset })
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)
    send(ws, { t: 'rpc', id: 'save-err', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload() })
    await waitFor(() => frames.some((f) => f.t === 'rpc.result' && f.id === 'save-err'))
    expect(frames).toContainEqual({
      t: 'rpc.result', id: 'save-err', ok: true,
      result: { status: 'http-error', statusCode: 404 },
    })
    ws.close()
  })

  it('answers unavailable when the save service is not mounted', async () => {
    const h = await startBridge()
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)
    send(ws, { t: 'rpc', id: 'save-none', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload() })
    await waitFor(() => frames.some((f) => f.t === 'rpc.result' && f.id === 'save-none'))
    expect(frames).toContainEqual({
      t: 'rpc.result', id: 'save-none', ok: true,
      result: { status: 'unavailable' },
    })
    ws.close()
  })

  it.each([
    ['missing requestId', savePayload({ requestId: undefined })],
    ['empty url', savePayload({ url: '' })],
    ['local path field', savePayload({ path: '/etc/passwd' })],
    ['headers field', savePayload({ headers: { cookie: 'x' } })],
    ['null', null],
    ['string', 'x'],
  ])('rejects a malformed payload as bad-request without invoking save (%s)', async (_label, payload) => {
    const saveImageAsset = vi.fn(async () => ({ status: 'saved' as const, assetId: 'a', fileId: 'f', lrev: 1 }))
    const h = await startBridge({ saveImageAsset })
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)
    send(ws, { t: 'rpc', id: `bad-${_label}`, method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload })
    await waitFor(() => frames.some((f) => f.t === 'rpc.result' && f.id === `bad-${_label}`))
    expect(frames).toContainEqual(expect.objectContaining({
      t: 'rpc.result', id: `bad-${_label}`, ok: false,
      error: expect.objectContaining({ code: 'bad-request' }),
    }))
    expect(saveImageAsset).not.toHaveBeenCalled()
    ws.close()
  })

  it('refuses the write RPC from a non-loopback remote even with a valid token', async () => {
    const saveImageAsset = vi.fn(async () => ({ status: 'saved' as const, assetId: 'a', fileId: 'f', lrev: 1 }))
    const h = await startBridge({ remoteAddressOverride: '192.168.1.5', saveImageAsset })
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)
    send(ws, { t: 'rpc', id: 'remote-save', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload() })
    await waitFor(() => frames.some((f) => f.t === 'rpc.result' && f.id === 'remote-save'))
    expect(frames).toContainEqual(expect.objectContaining({
      t: 'rpc.result', id: 'remote-save', ok: false,
      error: expect.objectContaining({ code: 'forbidden' }),
    }))
    expect(saveImageAsset).not.toHaveBeenCalled()
    ws.close()
  })

  it('never reaches the save path without an authenticated hello', async () => {
    const saveImageAsset = vi.fn(async () => ({ status: 'saved' as const, assetId: 'a', fileId: 'f', lrev: 1 }))
    const h = await startBridge({ saveImageAsset })
    harnesses.push(h)
    const ws = new WebSocket(h.url)
    const done = new Promise<void>((resolve) => { ws.on('close', () => { resolve() }) })
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'rpc', id: 'unauth', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload() }))
    })
    await done
    expect(saveImageAsset).not.toHaveBeenCalled()
  })

  it('binds cancellation to the connection generation: closing the socket aborts the in-flight save', async () => {
    let captured: AbortSignal | undefined
    const saveImageAsset = vi.fn((_payload: unknown, ctx: { signal: AbortSignal }) => {
      captured = ctx.signal
      return new Promise<{ status: 'saved'; assetId: string; fileId: string; lrev: number }>(() => {})
    })
    const h = await startBridge({ saveImageAsset })
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)
    send(ws, { t: 'rpc', id: 'save-slow', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload() })
    await waitFor(() => captured !== undefined)
    expect(captured!.aborted).toBe(false)
    ws.close()
    await waitFor(() => captured!.aborted === true)
    // 断连不重投：该请求只被发起到一个保存调用。
    expect(saveImageAsset).toHaveBeenCalledTimes(1)
  })

  it('two concurrent saves on one connection each get their own receipt', async () => {
    const saveImageAsset = vi.fn(async (payload: { requestId: string }) => ({
      status: 'saved' as const,
      assetId: `ast_${payload.requestId}`,
      fileId: 'fil_1',
      lrev: 5,
    }))
    const h = await startBridge({ saveImageAsset })
    harnesses.push(h)
    const { ws, frames } = await authenticated(h)
    send(ws, { t: 'rpc', id: 'a', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload({ requestId: 'a' }) })
    send(ws, { t: 'rpc', id: 'b', method: BRIDGE_SAVE_IMAGE_ASSET_METHOD, payload: savePayload({ requestId: 'b' }) })
    await waitFor(() => frames.filter((f) => f.t === 'rpc.result').length === 2)
    for (const id of ['a', 'b']) {
      expect(frames).toContainEqual(expect.objectContaining({
        t: 'rpc.result', id, ok: true,
        result: expect.objectContaining({ status: 'saved', assetId: `ast_${id}` }),
      }))
    }
    ws.close()
  })
})
