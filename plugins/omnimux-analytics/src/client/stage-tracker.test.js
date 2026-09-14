import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INGEST_PATH, PRODUCT_STAGE_EVENT, installStageTracker } from './stage-tracker.js'

/**
 * @param {{ now?: () => number }} [options]
 */
function harness(options = {}) {
  /** @type {Array<{ name: string, stage: string, dwellMs?: number }>} */
  const sent = []
  const target = new EventTarget()
  const dispose = installStageTracker({ target, send: (payload) => sent.push(payload), now: options.now })
  return {
    sent,
    dispose,
    stage: (id) => target.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: { id } })),
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
