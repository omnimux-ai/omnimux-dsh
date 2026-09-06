import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createEventsClient } from './events-client.js'

describe('EventsClient', () => {
  it('dispatches RPC and sends ack', async () => {
    let ackPayload = null
    let openedTab = null

    const fakeFetch = async (url, opts) => {
      if (url.includes('/rpc/ack')) {
        ackPayload = JSON.parse(opts.body)
      }
      return { ok: true }
    }

    const fakeWorkbench = {
      open: async ({ tabId }) => {
        openedTab = tabId
        return true
      },
      getUiContext: () => ({ schemaVersion: 1, ok: true }),
    }

    const client = createEventsClient({
      fetch: fakeFetch,
      getWorkbench: () => fakeWorkbench,
    })

    // Simulate RPC event arriving
    await client.notifyMessageForTests({
      type: 'omnimux:workbench:rpc',
      payload: {
        requestId: 'req_abc',
        tabId: 'omnimux-assets:library',
      },
    })

    assert.equal(openedTab, 'omnimux-assets:library')
    assert.ok(ackPayload)
    assert.equal(ackPayload.requestId, 'req_abc')
    assert.equal(ackPayload.ok, true)
    assert.equal(ackPayload.applied, true)
    assert.equal(ackPayload.code, 'opened')
    assert.equal(ackPayload.tabId, 'omnimux-assets:library')
  })

  it('notifies subscribers on specific and wildcard events', () => {
    const client = createEventsClient()
    const received = []

    client.subscribe('omnimux:assets:changed', (ev) => received.push(ev.type))
    client.subscribe('*', (ev) => received.push(`all:${ev.type}`))

    client.notifyMessageForTests({
      type: 'omnimux:assets:changed',
      payload: { lrev: 1 },
    })

    assert.deepEqual(received, ['omnimux:assets:changed', 'all:omnimux:assets:changed'])
  })
})

function sockets() {
  const instances = []
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; instances.push(this) }
    open() { this.readyState = 1; this.onopen?.() }
    emit(event) { this.onmessage?.({ data: JSON.stringify(event) }) }
    close() { this.readyState = 3; this.onclose?.() }
  }
  return { Socket, instances }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('event connection lifecycle', () => {
  it('connect is idempotent; stalled heartbeats stay bounded, time out and abort on disposal', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 })
    t.mock.method(console, 'warn', () => {})
    const { Socket, instances } = sockets()
    const pending = []
    const client = createEventsClient({
      WebSocket: Socket,
      streamUrl: 'ws://localhost/omnimux/events/stream',
      getWorkbench: () => ({ getUiContext: () => ({ sessionId: 'session-test' }) }),
      fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
        pending.push(signal)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    })
    client.connect()
    client.connect()
    assert.equal(instances.length, 1)
    instances[0].open()
    t.mock.timers.tick(2000)
    assert.equal(pending.length, 1, 'do not enqueue another heartbeat behind a stalled request')
    t.mock.timers.tick(1000)
    await flush()
    assert.equal(pending[0].aborted, true)
    t.mock.timers.tick(1000)
    assert.equal(pending.length, 2)
    client.disconnect()
    assert.equal(pending[1].aborted, true)
    await flush()
    t.mock.timers.tick(15000)
    assert.equal(instances.length, 1)
    assert.equal(pending.length, 2)
    assert.equal(client.isHealthy(), false)
  })

  it('reconnects with the last event cursor and ignores the old socket', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 })
    const { Socket, instances } = sockets()
    const client = createEventsClient({ WebSocket: Socket, streamUrl: 'ws://localhost/omnimux/events/stream' })
    const revisions = []
    client.subscribe('omnimux:assets:changed', (event) => revisions.push(event.payload.lrev))
    client.connect()
    instances[0].open()
    instances[0].emit({ id: '7', type: 'omnimux:assets:changed', payload: { lrev: 7 } })
    const staleMessage = instances[0].onmessage
    instances[0].close()
    assert.equal(client.isHealthy(), false)
    t.mock.timers.tick(3000)
    assert.equal(instances.length, 2)
    assert.equal(new URL(instances[1].url).searchParams.get('after'), '7')
    staleMessage({ data: JSON.stringify({ id: '8', type: 'omnimux:assets:changed', payload: { lrev: 8 } }) })
    instances[1].open()
    instances[1].emit({ id: '8', type: 'omnimux:assets:changed', payload: { lrev: 8 } })
    assert.deepEqual(revisions, [7, 8])
    client.disconnect()
    t.mock.timers.tick(10000)
    assert.equal(instances.length, 2)
  })

  it('does not enqueue viewport requests without an actual session', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 })
    const { Socket, instances } = sockets()
    let posts = 0
    const client = createEventsClient({
      WebSocket: Socket, streamUrl: 'ws://localhost/omnimux/events/stream',
      getWorkbench: () => ({ getUiContext: () => ({ sessionId: 'default' }) }),
      fetch: async () => { posts++; return { ok: true } },
    })
    client.connect()
    instances[0].open()
    t.mock.timers.tick(4000)
    assert.equal(posts, 0)
    client.disconnect()
  })

  it('does not acknowledge an old RPC after the owning client disconnects', async () => {
    let resolveOpen
    let posts = 0
    const client = createEventsClient({
      getWorkbench: () => ({ open: () => new Promise((resolve) => { resolveOpen = resolve }) }),
      fetch: async () => { posts++; return { ok: true } },
    })
    const operation = client.notifyMessageForTests({
      type: 'omnimux:workbench:rpc', payload: { requestId: 'pending-rpc', tabId: 'assets' },
    })
    client.disconnect()
    resolveOpen(true)
    await operation
    assert.equal(posts, 0)
  })
})
