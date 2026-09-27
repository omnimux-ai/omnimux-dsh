import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clearAllTaskTimers,
  clearAllTimersInMap,
  clearTaskTimers,
  clearTimerInMap,
} from './veo-timers.js'

describe('veo-timers map isolation', () => {
  it('clearTimerInMap on upscaleTimers leaves pollTimers untouched', () => {
    const pollTimers = new Map([['task-a', 101], ['task-b', 102]])
    const upscaleTimers = new Map([['task-a', 201]])
    const cleared = []

    const ok = clearTimerInMap(upscaleTimers, 'task-a', (id) => cleared.push(id))

    assert.equal(ok, true)
    assert.deepEqual(cleared, [201])
    assert.equal(upscaleTimers.has('task-a'), false)
    assert.deepEqual([...pollTimers.entries()], [['task-a', 101], ['task-b', 102]])
  })

  it('clearAllTimersInMap on upscaleTimers does not mutate pollTimers', () => {
    const pollTimers = new Map([['task-a', 101]])
    const upscaleTimers = new Map([['task-a', 201], ['task-c', 203]])
    const cleared = []

    const n = clearAllTimersInMap(upscaleTimers, (id) => cleared.push(id))

    assert.equal(n, 2)
    assert.deepEqual(cleared.sort(), [201, 203])
    assert.equal(upscaleTimers.size, 0)
    assert.deepEqual([...pollTimers.entries()], [['task-a', 101]])
  })

  it('clearTaskTimers clears both maps for one id without cross-deletes', () => {
    const pollTimers = new Map([['task-a', 101], ['task-b', 102]])
    const upscaleTimers = new Map([['task-a', 201]])
    const cleared = []

    const result = clearTaskTimers(
      { pollTimers, upscaleTimers },
      'task-a',
      (id) => cleared.push(id),
    )

    assert.deepEqual(result, { clearedPoll: true, clearedUpscale: true })
    assert.deepEqual(cleared.sort(), [101, 201])
    assert.equal(pollTimers.has('task-a'), false)
    assert.equal(pollTimers.get('task-b'), 102)
    assert.equal(upscaleTimers.has('task-a'), false)
  })

  it('clearAllTaskTimers drains both maps independently', () => {
    const pollTimers = new Map([['task-a', 101]])
    const upscaleTimers = new Map([['task-b', 202]])
    const cleared = []

    const result = clearAllTaskTimers(
      { pollTimers, upscaleTimers },
      (id) => cleared.push(id),
    )

    assert.deepEqual(result, { pollCleared: 1, upscaleCleared: 1 })
    assert.deepEqual(cleared.sort(), [101, 202])
    assert.equal(pollTimers.size, 0)
    assert.equal(upscaleTimers.size, 0)
  })
})
