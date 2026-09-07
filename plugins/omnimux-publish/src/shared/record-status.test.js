import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aggregateStatus, displayStatus, calculateSubtaskSummary } from './record-status.js'

const record = (...statuses) => ({ status: 'submitted', subtasks: statuses.map((status) => ({ status })) })

describe('aggregateStatus', () => {
  it('returns draft for absent, empty, or malformed subtasks', () => {
    for (const input of [null, undefined, {}, { subtasks: [] }, { subtasks: {} }, { subtasks: false }, { subtasks: [null, 3, 'published'] }]) {
      assert.equal(aggregateStatus(input), 'draft')
    }
  })
  it('returns published only when every valid task is published', () => {
    assert.equal(aggregateStatus(record('published', 'published')), 'published')
    assert.equal(aggregateStatus({ subtasks: { one: { state: 'published' }, two: { status: 'published' } } }), 'published')
  })
  it('distinguishes failed from partial_failed', () => {
    assert.equal(aggregateStatus(record('failed', 'failed')), 'failed')
    assert.equal(aggregateStatus(record('failed', 'pending', 'draft')), 'failed')
    assert.equal(aggregateStatus(record('failed', 'published')), 'partial_failed')
  })
  it('gives every known in-flight state priority over terminal outcomes', () => {
    for (const status of ['submitting', 'submitted', 'uploading', 'processing', 'reviewing']) {
      assert.equal(aggregateStatus(record('published', 'failed', status)), 'publishing', status)
    }
  })
  it('does not promote unknown states or trust cached aggregate fields', () => {
    assert.equal(aggregateStatus(record('future_state')), 'draft')
    assert.equal(aggregateStatus(record('published', 'future_state')), 'draft')
    assert.equal(aggregateStatus({ aggregate: 'reviewing', subtasks: [] }), 'draft')
    assert.equal(aggregateStatus({ subtasks: [{}] }), 'draft')
  })
  it('always produces one of the five aggregate states without mutating input', () => {
    const allowed = new Set(['draft', 'publishing', 'partial_failed', 'failed', 'published'])
    const statuses = ['pending', 'draft', 'submitting', 'submitted', 'uploading', 'processing', 'reviewing', 'published', 'failed', 'unknown']
    for (const a of statuses) for (const b of statuses) {
      const input = record(a, b)
      const before = structuredClone(input)
      assert.ok(allowed.has(aggregateStatus(input)))
      displayStatus(input)
      assert.deepEqual(input, before)
    }
  })
})

describe('displayStatus', () => {
  it('projects reviewing tasks without making reviewing an aggregate state', () => {
    const input = record('reviewing')
    assert.equal(aggregateStatus(input), 'publishing')
    assert.equal(displayStatus(input), 'reviewing')
    assert.equal(displayStatus({ subtasks: { task: { state: 'reviewing' } } }), 'reviewing')
    assert.equal(displayStatus({ subtasks: [{ status: 'processing', state: 'reviewing' }] }), 'reviewing')
  })
  it('does not project reviewing over a terminal aggregate', () => {
    assert.equal(displayStatus({ subtasks: [{ status: 'published', state: 'reviewing' }] }), 'published')
    for (const states of [[], ['failed'], ['published'], ['failed', 'published'], ['submitting']]) {
      assert.equal(displayStatus(record(...states)), aggregateStatus(record(...states)))
    }
  })
})

describe('calculateSubtaskSummary', () => {
  it('counts array and dictionary inputs identically and ignores non-object entries', () => {
    const tasks = record('submitted', 'submitting', 'reviewing', 'processing', 'uploading', 'published', 'failed', 'unknown').subtasks
    const expected = { total: 8, published: 1, failed: 1, inFlight: 5, reviewing: 1, submitted: 2 }
    assert.deepEqual(calculateSubtaskSummary([...tasks, null, 42]), expected)
    assert.deepEqual(calculateSubtaskSummary(Object.fromEntries(tasks.map((task, index) => [index, task]))), expected)
    assert.deepEqual(calculateSubtaskSummary(undefined), { total: 0, published: 0, failed: 0, inFlight: 0, reviewing: 0, submitted: 0 })
  })
})
