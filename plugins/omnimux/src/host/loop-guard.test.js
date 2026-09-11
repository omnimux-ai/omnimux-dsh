import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCallFingerprint,
  sanitizeSubstantiveValue,
  createLoopGuard,
} from './loop-guard.js'

test('sanitizeSubstantiveValue - removes transient fields', () => {
  const input = {
    prompt: 'A cinematic shot of a camera',
    timestamp: 123456789,
    requestId: 'req-abc',
    nested: {
      traceId: 'tr-1',
      action: 'generate',
    },
  }
  const sanitized = sanitizeSubstantiveValue(input)
  assert.deepEqual(sanitized, {
    prompt: 'A cinematic shot of a camera',
    nested: {
      action: 'generate',
    },
  })
})

test('computeCallFingerprint - deterministic regardless of key order', () => {
  const fp1 = computeCallFingerprint('media_video', { a: 1, b: 2 })
  const fp2 = computeCallFingerprint('media_video', { b: 2, a: 1 })
  assert.equal(fp1, fp2)
  assert.ok(fp1.startsWith('media_video#'))
})

test('computeCallFingerprint - ignores timestamp differences', () => {
  const fp1 = computeCallFingerprint('media_video', { prompt: 'hello', timestamp: 100 })
  const fp2 = computeCallFingerprint('media_video', { prompt: 'hello', timestamp: 200 })
  assert.equal(fp1, fp2)
})

test('createLoopGuard - blocks on 3 identical calls in 5-call window', () => {
  const guard = createLoopGuard({ windowSize: 5, maxRepeats: 3 })

  const res1 = guard.recordAndCheck('media_video', { prompt: 'same' })
  assert.equal(res1.blocked, false)

  const res2 = guard.recordAndCheck('media_video', { prompt: 'same' })
  assert.equal(res2.blocked, false)

  // 3rd time in 3 calls -> trips
  const res3 = guard.recordAndCheck('media_video', { prompt: 'same' })
  assert.equal(res3.blocked, true)
  assert.equal(res3.code, 'LOOP_GUARD_BLOCKED')
})

test('createLoopGuard - window slides out older calls', () => {
  const guard = createLoopGuard({ windowSize: 3, maxRepeats: 3 })

  guard.recordAndCheck('tool_a', { x: 1 }) // 1st
  guard.recordAndCheck('tool_a', { x: 1 }) // 2nd
  guard.recordAndCheck('tool_b', { diff: true }) // 3rd (different)
  guard.recordAndCheck('tool_c', { diff: true }) // 4th (pushes out 1st)

  // At this point, window contains [tool_a(2nd), tool_b, tool_c]
  // Calling tool_a again makes it 2 out of 3, so not blocked
  const res = guard.recordAndCheck('tool_a', { x: 1 })
  assert.equal(res.blocked, false)
})
