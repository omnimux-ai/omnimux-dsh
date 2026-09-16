// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { connectPanel } from '../src/panel/api.ts'
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
function carrier() {
  let receive: (message: unknown) => void = () => {}
  let sent: { id: string } = { id: '' }
  vi.stubGlobal('chrome', { runtime: { connect: () => ({
    postMessage: (message: { id: string }) => { sent = message },
    onMessage: { addListener: (listener: typeof receive) => { receive = listener } },
    onDisconnect: { addListener: () => {} },
  }) } })
  const api = connectPanel()
  const promise = api.rpc('bridge.fetchMedia', { url: 'https://cdn.example/image.png' })
  return { promise, id: sent.id, reply: (result: unknown, ok = true, error?: unknown) => receive({ type: 'rpc.result', id: sent.id, ok, result, error }) }
}
it('unwraps the real server response success shape', async () => {
  const c = carrier(); c.reply({ type: 'server-response', rpcId: 'independently-correlated-host-id', result: { ok: true, value: { items: [] } } })
  await expect(c.promise).resolves.toEqual({ items: [] })
})
it('surfaces structured business failure and prioritizes transport failure', async () => {
  const c = carrier(); c.reply({ type: 'server-response', rpcId: c.id, result: { ok: false, error: { code: 'denied', message: 'Refused', details: { reason: 'scope' } } } })
  await expect(c.promise).rejects.toMatchObject({ code: 'denied', message: 'Refused', details: { reason: 'scope' } })
  const d = carrier(); d.reply({ type: 'server-response', rpcId: d.id, result: { ok: true, value: 'ignored' } }, false, { code: 'disconnected', message: 'Gone' })
  await expect(d.promise).rejects.toMatchObject({ code: 'disconnected', message: 'Gone' })
})
it.each([
  { status: 'ok', contentType: 'image/png', byteLength: 3, data: 'YWJj' },
  { status: 'failed', message: 'remote failure' },
  { status: 'timeout', timeoutMs: 9000 },
  { result: { ok: true, value: 'ordinary business object' } },
  { type: 'different', rpcId: 'other', result: { ok: false, error: { code: 'x', message: 'x', details: {} } } },
])('preserves native result without treating lookalikes as envelopes: %j', async value => {
  const c = carrier(); c.reply(value); await expect(c.promise).resolves.toEqual(value)
})
it('does not unwrap missing identity or malformed envelope unions', async () => {
  for (const make of [
    (_id: string) => ({ type: 'server-response', rpcId: '', result: { ok: true, value: 1 } }),
    (id: string) => ({ type: 'server-response', rpcId: id, result: { ok: true } }),
    (id: string) => ({ type: 'server-response', rpcId: id, result: { ok: false, error: { message: 'missing code/details' } } }),
  ]) { const c = carrier(); const value = make(c.id); c.reply(value); await expect(c.promise).resolves.toEqual(value) }
})
