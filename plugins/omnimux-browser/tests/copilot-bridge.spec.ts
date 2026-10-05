import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { BridgeServer, parseDecisionArgs, sanitizeCopilotLogEntry } from '../src/server.ts'
import {
  BRIDGE_APPEND_COPILOT_LOG_METHOD,
  BRIDGE_EVALUATE_DECISION_METHOD,
  type BridgeFrame,
} from '../src/protocol.ts'
import { appendCopilotLog, copilotLogPath } from '../src/copilot-log.ts'
import type { BrowserHostApi } from '../src/host-api.ts'

const TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeef'
const CAPS = { textOnly: true as const, snapshotMaxChars: 12_000, maxInteractiveItems: 60 }
const ARGS = { state: 'Feed 1: 远程办公提效吗', choices: { P1_CONTRARIAN: 'a', P2_PRACTITIONER: 'b' }, instructions: 'pick one' }
const ENTRY = { traceId: 'tw_1791180906430_m2p13k', scene: 'POST_NEW', itemId: 'ai-hot-tweets', outcome: { status: 'injected' } }
const EXPECTED_ITEM = 'ai-hot-tweets'
it('log fixture uses the perspective-enabled menu item', () => { expect(ENTRY.itemId).toEqual(EXPECTED_ITEM) })

interface Harness { bridge: BridgeServer; server: Server; url: string }
const harnesses: Harness[] = []

async function startBridge(overrides: Partial<ConstructorParameters<typeof BridgeServer>[0]> = {}): Promise<Harness> {
  const api: BrowserHostApi = { call: vi.fn(async () => ({ ok: true as const, value: 'ok' })), async *events() {}, respond: vi.fn(async () => ({ accepted: true })) }
  const bridge = new BridgeServer({
    token: TOKEN, api, toolTimeoutMs: 1_000, caps: CAPS,
    injectBrowserSnapshot: vi.fn(), purgeSession: vi.fn(async () => {}), setModelMode: vi.fn(),
    ...overrides,
  })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => { bridge.handleUpgrade(req, socket, head) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const h = { bridge, server, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ext/bridge` }
  harnesses.push(h)
  return h
}

function connect(url: string): Promise<{ ws: WebSocket; frames: BridgeFrame[]; done: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const frames: BridgeFrame[] = []
    ws.on('message', (data) => { frames.push(JSON.parse(data.toString()) as BridgeFrame) })
    ws.on('error', reject)
    ws.on('open', () => resolve({ ws, frames, done: new Promise<void>((r) => { ws.on('close', () => r()) }) }))
  })
}

async function waitFor(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => { setTimeout(r, 10) })
  }
}

async function authed(url: string) {
  const c = await connect(url)
  c.ws.send(JSON.stringify({ t: 'hello', token: TOKEN, caps: CAPS }))
  await waitFor(() => c.frames.some((f) => f.t === 'hello.ok'))
  const rpc = async (id: string, method: string, payload: unknown) => {
    c.ws.send(JSON.stringify({ t: 'rpc', id, method, payload }))
    await waitFor(() => c.frames.some((f) => f.t === 'rpc.result' && (f as { id?: string }).id === id))
    return c.frames.find((f) => f.t === 'rpc.result' && (f as { id?: string }).id === id)
  }
  return { ...c, rpc }
}

afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    await h.bridge.close()
    await new Promise<void>((r) => { h.server.close(() => r()) })
  }
})

describe('#3100 bridge.evaluateDecision', () => {
  it('forwards bounded args and returns decision + confidence', async () => {
    const evaluateDecision = vi.fn(async () => ({ decision: 'P1_CONTRARIAN', confidence: 0.82, extra: 'dropped' }))
    const h = await startBridge({ evaluateDecision })
    const c = await authed(h.url)
    const res = await c.rpc('d1', BRIDGE_EVALUATE_DECISION_METHOD, ARGS)
    expect(res).toMatchObject({ ok: true, result: { decision: 'P1_CONTRARIAN', confidence: 0.82 } })
    expect(evaluateDecision.mock.calls[0][0]).toEqual(ARGS)
    c.ws.close()
  })

  it('rejects malformed args without calling the seam', async () => {
    const evaluateDecision = vi.fn(async () => ({ decision: 'x' }))
    const h = await startBridge({ evaluateDecision })
    const c = await authed(h.url)
    const res = await c.rpc('bad', BRIDGE_EVALUATE_DECISION_METHOD, { ...ARGS, state: 'x'.repeat(4001) })
    expect(res).toMatchObject({ ok: false, error: { code: 'bad-request' } })
    expect(evaluateDecision).not.toHaveBeenCalled()
    c.ws.close()
  })

  it('answers decision-unavailable when the seam is absent', async () => {
    const h = await startBridge()
    const c = await authed(h.url)
    const res = await c.rpc('none', BRIDGE_EVALUATE_DECISION_METHOD, ARGS)
    expect(res).toMatchObject({ ok: false, error: { code: 'decision-unavailable' } })
    c.ws.close()
  })

  it('reports seam failures as decision-failed', async () => {
    const h = await startBridge({ evaluateDecision: vi.fn(async () => { throw new Error('jev offline') }) })
    const c = await authed(h.url)
    const res = await c.rpc('err', BRIDGE_EVALUATE_DECISION_METHOD, ARGS)
    expect(res).toMatchObject({ ok: false, error: { code: 'decision-failed', message: 'jev offline' } })
    c.ws.close()
  })

  it('never reaches the seam before authenticated hello', async () => {
    const evaluateDecision = vi.fn(async () => ({ decision: 'x' }))
    const h = await startBridge({ evaluateDecision })
    const { ws, done } = await connect(h.url)
    ws.send(JSON.stringify({ t: 'rpc', id: 'u', method: BRIDGE_EVALUATE_DECISION_METHOD, payload: ARGS }))
    await done
    expect(evaluateDecision).not.toHaveBeenCalled()
  })

  it('parseDecisionArgs bounds choices to 1–10', () => {
    expect(parseDecisionArgs({ ...ARGS, choices: {} })).toBeUndefined()
    const eleven = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`c${i}`, 'x']))
    expect(parseDecisionArgs({ ...ARGS, choices: eleven })).toBeUndefined()
    expect(parseDecisionArgs(ARGS)).toEqual(ARGS)
  })
})

describe('#3100 bridge.appendCopilotLog', () => {
  it('persists a whitelisted entry', async () => {
    const appendCopilotLog = vi.fn(async () => {})
    const h = await startBridge({ appendCopilotLog })
    const c = await authed(h.url)
    const res = await c.rpc('l1', BRIDGE_APPEND_COPILOT_LOG_METHOD, { ...ENTRY, draftFullText: 'leak', token: 'secret' })
    expect(res).toMatchObject({ ok: true, result: { persisted: true } })
    expect(appendCopilotLog.mock.calls[0][0]).toEqual(ENTRY)
    c.ws.close()
  })

  it('rejects entries without a trace id and reports missing dependency', async () => {
    const h = await startBridge()
    const c = await authed(h.url)
    expect(await c.rpc('b', BRIDGE_APPEND_COPILOT_LOG_METHOD, { outcome: { status: 'x' } })).toMatchObject({ ok: false, error: { code: 'bad-request' } })
    expect(await c.rpc('n', BRIDGE_APPEND_COPILOT_LOG_METHOD, ENTRY)).toMatchObject({ ok: false, error: { code: 'log-failed', message: 'Copilot log unavailable' } })
    c.ws.close()
  })

  it('sanitizer caps snippets, seeds and total size', () => {
    const out = sanitizeCopilotLogEntry({
      ...ENTRY,
      seeds: Array.from({ length: 5 }, () => ({ author: 'a', textSnippet: 'x'.repeat(500), total: 80 })),
    })!
    const seeds = out.seeds as Array<{ textSnippet: string }>
    expect(seeds).toHaveLength(3)
    expect(seeds[0].textSnippet).toHaveLength(200)
    expect(sanitizeCopilotLogEntry({ ...ENTRY, generation: { blob: 'x'.repeat(20_000) } })).toBeUndefined()
  })

  it('keeps feed-source counts and per-seed source / quote flags, drops unknown values', () => {
    const out = sanitizeCopilotLogEntry({
      ...ENTRY,
      sourcesScanned: { for_you: 6, following: 7, evil: 99, page: 'x' },
      seeds: [
        { author: 'a', textSnippet: 't', total: 70, source: 'for_you', isQuote: true },
        { author: 'b', textSnippet: 't', total: 66, source: 'elsewhere', isQuote: 'yes' },
      ],
    })!
    expect(out.sourcesScanned).toEqual({ for_you: 6, following: 7 })
    const picked = sanitizeCopilotLogEntry({ ...ENTRY, seedPick: { source: 'jev', candidates: 6, pickedIndex: 1, confidence: 0.73, latencyMs: 450 } })!
    expect(picked.seedPick).toEqual({ source: 'jev', candidates: 6, pickedIndex: 1, confidence: 0.73, latencyMs: 450 })
    expect(out.seeds).toEqual([
      { author: 'a', textSnippet: 't', total: 70, source: 'for_you', isQuote: true },
      { author: 'b', textSnippet: 't', total: 66 },
    ])
  })
})

describe('#3100 copilot log file', () => {
  it('lives under the DSH home data root and appends one line per entry', async () => {
    expect(copilotLogPath().endsWith(join('omnimux-browser', 'twitter-copilot.ndjson'))).toBe(true)
    const dir = await mkdtemp(join(tmpdir(), 'copilot-log-'))
    const file = join(dir, 'nested', 'twitter-copilot.ndjson')
    await appendCopilotLog(ENTRY, file)
    await appendCopilotLog({ ...ENTRY, traceId: 'tw_2_b' }, file)
    const lines = (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => l.traceId)).toEqual([ENTRY.traceId, 'tw_2_b'])
    await rm(dir, { recursive: true, force: true })
  })
})
