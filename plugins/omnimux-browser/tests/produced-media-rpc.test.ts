import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import WebSocket from 'ws'
import { BridgeServer } from '../src/server.ts'
import { BRIDGE_PRODUCED_MEDIA_METHOD, type BridgeFrame, type ProducedMediaOutcome } from '../src/protocol.ts'
import { createProducedRegistry } from '../src/produced-registry.ts'
import type { BrowserHostApi, HostEventFrame } from '../src/host-api.ts'

const TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeef'
const CAPS = { textOnly: true as const, snapshotMaxChars: 12_000, maxInteractiveItems: 60 }

interface Harness {
  bridge: BridgeServer
  server: Server
  url: string
  callMock: { calls: unknown[][] }
}

function callCounter(fn: (request: unknown) => Promise<unknown>) {
  const calls: unknown[][] = []
  const wrapped = (request: unknown) => {
    calls.push([request])
    return fn(request)
  }
  return { fn: wrapped, calls }
}

async function startBridge(overrides: Partial<ConstructorParameters<typeof BridgeServer>[0]> = {}): Promise<Harness> {
  const recorder = callCounter(async () => ({ ok: true as const, value: 'ok' }))
  const api: BrowserHostApi = {
    call: recorder.fn,
    async *events(): AsyncIterable<HostEventFrame> {},
    respond: async () => ({ accepted: true }),
  }
  const bridge = new BridgeServer({
    token: TOKEN,
    api,
    toolTimeoutMs: 1_000,
    caps: CAPS,
    injectBrowserSnapshot: () => {},
    purgeSession: async () => {},
    setModelMode: () => {},
    produced: createProducedRegistry(),
    ...overrides,
  })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => { bridge.handleUpgrade(req, socket, head) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  return { bridge, server, url: `ws://127.0.0.1:${port}/ext/bridge`, callMock: recorder }
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

async function teardown(h: Harness, ws?: WebSocket): Promise<void> {
  ws?.close()
  await h.bridge.close()
  await new Promise<void>((resolve) => { h.server.close(() => resolve()) })
}

async function authenticated(h: Harness): Promise<{ ws: WebSocket; frames: BridgeFrame[] }> {
  const { ws, frames } = await connect(h.url)
  send(ws, { t: 'hello', token: TOKEN, caps: CAPS })
  await waitFor(() => frames.some(f => f.t === 'hello.ok'))
  return { ws, frames }
}

async function rpcResult(
  ws: WebSocket,
  frames: BridgeFrame[],
  id: string,
  payload: unknown,
): Promise<Extract<BridgeFrame, { t: 'rpc.result' }>> {
  send(ws, { t: 'rpc', id, method: BRIDGE_PRODUCED_MEDIA_METHOD, payload })
  await waitFor(() => frames.some(f => f.t === 'rpc.result' && f.id === id))
  return frames.find(f => f.t === 'rpc.result' && f.id === id) as Extract<BridgeFrame, { t: 'rpc.result' }>
}

test('returns base64 bytes for a registered path', async () => {
  const produced = createProducedRegistry()
  produced.observeEvent('s1', {
    type: 'tool/result',
    data: {
      message: { content: [{ type: 'tool-result', toolCallId: 'c1', content: [] }] },
      meta: { path: '/media/ok.png', kind: 'image', mediaType: 'image/png', bytes: 1, inContext: false },
    },
  })
  const seen: unknown[] = []
  const h = await startBridge({
    produced,
    readProduced: async (request) => {
      seen.push(request)
      return { code: 'ok', mediaType: 'image/png', bytes: 2, data: 'aGk=' }
    },
  })
  const { ws, frames } = await authenticated(h)
  const result = await rpcResult(ws, frames, 'pm-1', { sessionId: 's1', path: '/media/ok.png' })
  assert.deepEqual(result, {
    t: 'rpc.result', id: 'pm-1', ok: true,
    result: { code: 'ok', mediaType: 'image/png', bytes: 2, data: 'aGk=' },
  })
  assert.deepEqual(seen, [{ sessionId: 's1', path: '/media/ok.png' }])
  assert.equal(h.callMock.calls.length, 0)
  await teardown(h, ws)
})

test('answers not-produced for a path the session never produced', async () => {
  const h = await startBridge({
    produced: createProducedRegistry(),
    readProduced: async () => ({ code: 'not-produced', message: 'the session did not produce this path' }),
  })
  const { ws, frames } = await authenticated(h)
  const result = await rpcResult(ws, frames, 'pm-2', { sessionId: 's1', path: '/etc/passwd' })
  assert.deepEqual(result, {
    t: 'rpc.result', id: 'pm-2', ok: true,
    result: { code: 'not-produced', message: 'the session did not produce this path' },
  })
  await teardown(h, ws)
})

test('answers too-large and unsupported through the same tagged outcome channel', async () => {
  const outcomes: ProducedMediaOutcome[] = [
    { code: 'too-large', message: 'the produced file exceeds 67108864 bytes', limit: 67_108_864 },
    { code: 'unsupported', message: 'the produced file type is not servable' },
  ]
  const h = await startBridge({ readProduced: async () => outcomes.shift() ?? { code: 'internal', message: 'exhausted' } })
  const { ws, frames } = await authenticated(h)
  const tooLarge = await rpcResult(ws, frames, 'pm-3', { sessionId: 's1', path: '/media/big.mp4' })
  assert.equal(tooLarge.ok, true)
  if (tooLarge.ok) assert.equal((tooLarge.result as ProducedMediaOutcome).code, 'too-large')
  const unsupported = await rpcResult(ws, frames, 'pm-4', { sessionId: 's1', path: '/media/x.exe' })
  assert.equal(unsupported.ok, true)
  if (unsupported.ok) assert.equal((unsupported.result as ProducedMediaOutcome).code, 'unsupported')
  await teardown(h, ws)
})

test('rejects malformed payloads as bad-request without invoking the reader', async () => {
  let invoked = 0
  const h = await startBridge({
    readProduced: async () => {
      invoked += 1
      return { code: 'ok', mediaType: 'x', bytes: 0, data: '' }
    },
  })
  const { ws, frames } = await authenticated(h)
  const badPayloads: Array<[string, unknown]> = [
    ['string', 'x'],
    ['missing-path', { sessionId: 's1' }],
    ['missing-sessionId', { path: '/a.png' }],
    ['empty-path', { sessionId: 's1', path: '' }],
    ['empty-sessionId', { sessionId: '', path: '/a.png' }],
    ['null', null],
  ]
  for (const [label, payload] of badPayloads) {
    const result = await rpcResult(ws, frames, `pm-bad-${label}`, payload)
    assert.equal(result.ok, false, label)
    if (!result.ok) assert.equal(result.error.code, 'bad-request', label)
  }
  assert.equal(invoked, 0)
  await teardown(h, ws)
})

test('reports reader failures as internal', async () => {
  const h = await startBridge({
    readProduced: async () => { throw new Error('disk gone') },
  })
  const { ws, frames } = await authenticated(h)
  const result = await rpcResult(ws, frames, 'pm-err', { sessionId: 's1', path: '/media/ok.png' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'internal')
  assert.equal(h.callMock.calls.length, 0)
  await teardown(h, ws)
})

test('serves a submit dest paired via message.source.callId', async () => {
  const produced = createProducedRegistry()
  produced.observeEvent('s3', {
    type: 'tool/call',
    data: { turn: 1, step: 0, callId: 'src-call', name: 'omnimux_video_submit', arguments: '{}' },
  })
  produced.observeEvent('s3', {
    type: 'tool/result',
    data: {
      message: {
        role: 'user',
        // The only callId this result carries sits three levels deep — the
        // panel's toolResultCallId reads it, so the registry must pair it too.
        source: { callId: 'src-call' },
        content: [{ type: 'text', text: JSON.stringify({ dest: '/media/src-dest.mp4' }) }],
      },
    },
  })
  const h = await startBridge({
    produced,
    // Lookup through the real registry so the wire answer reflects the grant.
    readProduced: async (request) =>
      produced.lookup(request.sessionId, request.path) !== undefined
        ? { code: 'ok', mediaType: 'video/mp4', bytes: 1, data: 'AA==' }
        : { code: 'not-produced', message: 'the session did not produce this path' },
  })
  const { ws, frames } = await authenticated(h)
  const result = await rpcResult(ws, frames, 'pm-src', { sessionId: 's3', path: '/media/src-dest.mp4' })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal((result.result as ProducedMediaOutcome).code, 'ok')
  await teardown(h, ws)
})

test('drops a session grant after a successful purge', async () => {
  const produced = createProducedRegistry()
  produced.observeEvent('doomed', {
    type: 'tool/result',
    data: {
      message: { content: [{ type: 'tool-result', toolCallId: 'c1', content: [] }] },
      meta: { path: '/media/ok.png', kind: 'image', mediaType: 'image/png', bytes: 1, inContext: false },
    },
  })
  const h = await startBridge({ produced })
  const { ws, frames } = await authenticated(h)
  assert.ok(produced.lookup('doomed', '/media/ok.png') !== undefined)
  send(ws, { t: 'rpc', id: 'purge', method: 'bridge.session.purge', payload: { sessionId: 'doomed' } })
  await waitFor(() => frames.some(f => f.t === 'rpc.result' && f.id === 'purge'))
  assert.equal(produced.lookup('doomed', '/media/ok.png'), undefined)
  await teardown(h, ws)
})
