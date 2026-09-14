import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INGEST_PATH, PRODUCT_STAGE_EVENT, installStageTracker } from './stage-tracker.js'
import { MAX_DWELL_MS } from '../stage-events.js'

/**
 * @param {{ now?: () => number }} [options]
 */
function harness(options = {}) {
  /** @type {Array<{ name: string, stage: string, dwellMs?: number }>} */
  const sent = []
  const target = new EventTarget()
  const dispose = installStageTracker({
    target,
    send: (payload) => sent.push(payload),
    now: options.now,
  })
  return {
    sent,
    dispose,
    stage: (id) => target.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: { id } })),
    pagehide: () => target.dispatchEvent(new Event('pagehide')),
    visibility: () => target.dispatchEvent(new Event('visibilitychange')),
  }
}

test('page opens and closes are reported with dwell time', () => {
  let clock = 1000
  const h = harness({ now: () => clock })
  h.stage('omnimux-assets')
  clock = 3500
  h.stage('omnimux-workflow')
  h.stage('')
  h.dispose()

  assert.deepEqual(h.sent, [
    { name: 'stage-open', stage: 'omnimux-assets' },
    { name: 'stage-close', stage: 'omnimux-assets', dwellMs: 2500 },
    { name: 'stage-open', stage: 'omnimux-workflow' },
    { name: 'stage-close', stage: 'omnimux-workflow', dwellMs: 0 },
  ])
})

test('re-claiming the current page does not duplicate events', () => {
  const h = harness()
  h.stage('omnimux-assets')
  h.stage('omnimux-assets')
  h.stage('omnimux-assets')
  h.dispose()
  assert.deepEqual(h.sent, [{ name: 'stage-open', stage: 'omnimux-assets' }])
})

test('closing without an open page reports nothing', () => {
  const h = harness()
  h.stage('')
  h.dispose()
  assert.deepEqual(h.sent, [])
})

test('malformed stage events are ignored', () => {
  const h = harness()
  const target = new EventTarget()
  /** @type {unknown[]} */
  const sent = []
  const dispose = installStageTracker({ target, send: (payload) => sent.push(payload) })
  target.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: {} }))
  target.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: { id: 42 } }))
  target.dispatchEvent(new Event(PRODUCT_STAGE_EVENT))
  dispose()
  h.dispose()
  assert.deepEqual(sent, [])
})

test('dispose stops reporting and is safe without a target', () => {
  const h = harness()
  h.stage('omnimux-assets')
  h.dispose()
  h.stage('omnimux-clip')
  h.dispose() // idempotent
  assert.deepEqual(h.sent, [{ name: 'stage-open', stage: 'omnimux-assets' }])

  const noop = installStageTracker({})
  assert.equal(typeof noop, 'function')
  noop()
})

test('the ingest path stays inside the plugin-owned namespace', () => {
  assert.equal(INGEST_PATH, '/omnimux-analytics/event')
  assert.equal(PRODUCT_STAGE_EVENT, 'dsh-product-stage')
})

test('leaving the document reports the dwell time of the open page', () => {
  let clock = 1000
  const h = harness({ now: () => clock })
  h.stage('omnimux-assets')
  clock = 8000
  h.pagehide()
  h.pagehide() // idempotent: the page is already closed
  h.dispose()

  assert.deepEqual(h.sent, [
    { name: 'stage-open', stage: 'omnimux-assets' },
    { name: 'stage-close', stage: 'omnimux-assets', dwellMs: 7000 },
  ])
})

test('backgrounding the document keeps the page open and counting', () => {
  let clock = 1000
  const h = harness({ now: () => clock })
  h.stage('omnimux-workflow')

  // Hidden/visible transitions are not page changes: the page stays open, and
  // the time spent away is still counted into the same visit.
  clock = 6000
  h.visibility()
  clock = 60000
  h.visibility()
  assert.equal(h.sent.length, 1, 'backgrounding must not close the page')

  clock = 70000
  h.stage('')
  assert.deepEqual(h.sent[1], { name: 'stage-close', stage: 'omnimux-workflow', dwellMs: 69000 })
  h.dispose()
})

test('dispose stops reporting page events', () => {
  const h = harness()
  h.stage('omnimux-assets')
  h.dispose()
  h.stage('omnimux-clip')
  h.pagehide()
  assert.deepEqual(h.sent, [{ name: 'stage-open', stage: 'omnimux-assets' }])
})

test('dwell time is clamped to the accepted range instead of dropping the close event', () => {
  let clock = 0
  const h = harness({ now: () => clock })
  h.stage('omnimux-assets')
  clock = MAX_DWELL_MS * 3 // a page left open for days
  h.stage('')

  assert.deepEqual(h.sent[1], { name: 'stage-close', stage: 'omnimux-assets', dwellMs: MAX_DWELL_MS })
  h.dispose()
})
