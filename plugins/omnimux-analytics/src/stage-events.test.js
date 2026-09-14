import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_DWELL_MS, MAX_STAGE_ID_LENGTH, parseStageEvent } from './stage-events.js'

test('accepts a page open event', () => {
  assert.deepEqual(parseStageEvent({ name: 'stage-open', stage: 'omnimux-assets' }), {
    name: 'stage-open',
    data: { stage: 'omnimux-assets' },
  })
})

test('accepts a page close event with dwell time', () => {
  assert.deepEqual(parseStageEvent({ name: 'stage-close', stage: 'omnimux-workflow', dwellMs: 2500 }), {
    name: 'stage-close',
    data: { stage: 'omnimux-workflow', dwellMs: 2500 },
  })
})

test('rejects events outside the closed name set', () => {
  for (const name of ['', 'stage-open ', 'STAGE-OPEN', 'tool-call', 'track', 42, null, undefined]) {
    assert.equal(parseStageEvent({ name, stage: 'omnimux-assets' }), undefined, `name=${String(name)}`)
  }
})

test('rejects any field outside the whitelist', () => {
  assert.equal(parseStageEvent({
    name: 'stage-open',
    stage: 'omnimux-assets',
    prompt: 'user text must never travel through this route',
  }), undefined)
  assert.equal(parseStageEvent({ name: 'stage-open', stage: 'omnimux-assets', url: 'https://x/y' }), undefined)
})

test('rejects stage ids that are not plain identifiers', () => {
  for (const stage of ['', ' ', '../../etc/passwd', 'a b', 'a/b', '<script>', '-leading', 'x'.repeat(MAX_STAGE_ID_LENGTH + 1)]) {
    assert.equal(parseStageEvent({ name: 'stage-open', stage }), undefined, `stage=${stage}`)
  }
})

test('rejects dwell times that are not bounded integers', () => {
  for (const dwellMs of [-1, 1.5, MAX_DWELL_MS + 1, '1200', null, Number.NaN]) {
    assert.equal(
      parseStageEvent({ name: 'stage-close', stage: 'omnimux-assets', dwellMs }),
      undefined,
      `dwellMs=${String(dwellMs)}`,
    )
  }
})

test('rejects non-object input', () => {
  for (const value of [null, undefined, 'stage-open', 7, []]) {
    assert.equal(parseStageEvent(value), undefined, `value=${String(value)}`)
  }
})
