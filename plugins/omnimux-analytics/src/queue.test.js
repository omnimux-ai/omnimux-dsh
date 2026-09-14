import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEventQueue } from './queue.js'

const BASE = {
  umamiUrl: 'https://analytics.omnimux.ai',
  websiteId: 'w-1',
  hostname: 'omnimux-plugins',
  flushIntervalMs: 0, // immediate mode unless a test overrides
  maxQueue: 500,
  sampleRate: 1,
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

test('flush POSTs one event per request to /api/send with the Umami contract shape', async () => {
  /** @type {Array<{ url: string, payload: Record<string, unknown> }>} */
  const seen = []
  const queue = createEventQueue({
    ...BASE,
    send: async (request) => { seen.push(request) },
  })
  queue.push({ name: 'tool-call', data: { plugin: 'omnimux-workflow', tool: 'workflow_run' } })
  await queue.flush()

  assert.equal(seen.length, 1)
  const request = seen[0]
  assert.equal(request.url, 'https://analytics.omnimux.ai/api/send')
  assert.equal(request.payload.type, 'event')
  const payload = /** @type {Record<string, unknown>} */ (request.payload.payload)
  // The deployed instance discriminates on `website`; the dashboard's
  // `data-website-id` attribute name is NOT the wire field.
  assert.equal(payload.website, 'w-1')
  assert.equal('websiteId' in payload, false)
  assert.equal(payload.hostname, 'omnimux-plugins')
  assert.equal(payload.name, 'tool-call')
  assert.deepEqual(payload.data, { plugin: 'omnimux-workflow', tool: 'workflow_run' })
  assert.equal(queue.stats.sent, 1)
  assert.equal(queue.stats.failed, 0)
  assert.equal(queue.pending(), 0)
})

test('failed sends are counted and never throw', async () => {
  const queue = createEventQueue({
    ...BASE,
    send: async () => { throw new Error('network down') },
  })
  queue.push({ name: 'tool-call', data: { plugin: 'p', tool: 't' } })
  await queue.flush()
  assert.equal(queue.stats.failed, 1)
  assert.equal(queue.stats.sent, 0)
})

test('sampleRate drops events before the queue', async () => {
  const queue = createEventQueue({
    ...BASE,
    sampleRate: 0,
    send: async () => assert.fail('sampled event must not be sent'),
  })
  queue.push({ name: 'tool-call', data: {} })
  await queue.flush()
  assert.equal(queue.stats.dropped, 1)
  assert.equal(queue.pending(), 0)
})

test('maxQueue drops the oldest event while keeping newer ones', async () => {
  /** @type {Array<Record<string, unknown>>} */
  const names = []
  const queue = createEventQueue({
    ...BASE,
    flushIntervalMs: 5, // batch mode: all pushes land before the first flush
    maxQueue: 2,
    send: async (request) => {
      names.push(/** @type {Record<string, unknown>} */ (request.payload.payload).name)
    },
  })
  queue.push({ name: 'a', data: {} })
  queue.push({ name: 'b', data: {} })
  queue.push({ name: 'c', data: {} })
  await tick(80)
  assert.deepEqual(names, ['b', 'c'])
  queue.dispose()
})

test('interval mode flushes after flushIntervalMs', async () => {
  /** @type {number[]} */
  const times = []
  const queue = createEventQueue({
    ...BASE,
    flushIntervalMs: 20,
    send: async () => { times.push(1) },
  })
  queue.push({ name: 'tool-call', data: {} })
  assert.equal(times.length, 0)
  await tick(60)
  assert.equal(times.length, 1)
  queue.dispose()
})

test('dispose stops timers and accepts nothing further', async () => {
  const queue = createEventQueue({
    ...BASE,
    flushIntervalMs: 10,
    send: async () => assert.fail('disposed queue must not send'),
  })
  queue.push({ name: 'a', data: {} })
  queue.dispose()
  queue.push({ name: 'b', data: {} }) // no-op
  queue.dispose() // idempotent
  assert.equal(queue.pending(), 1) // 'a' never flushed, silently dropped on dispose
})

test('concurrent sends stay bounded and count separately', async () => {
  let inFlight = 0
  let maxInFlight = 0
  const queue = createEventQueue({
    ...BASE,
    flushIntervalMs: 5, // batch mode: all pushes land in one flush window
    send: async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await tick(10)
      inFlight -= 1
    },
  })
  for (let i = 0; i < 8; i++) queue.push({ name: `e${i}`, data: {} })
  await tick(120)
  assert.equal(queue.stats.sent, 8)
  assert.ok(maxInFlight <= 4, `expected concurrency <= 4, got ${maxInFlight}`)
  queue.dispose()
})
