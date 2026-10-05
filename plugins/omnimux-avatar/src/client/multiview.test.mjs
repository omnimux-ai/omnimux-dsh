// multiview 纯逻辑回归：状态映射、进度钳制与画廊分层。
// 来源：OmniMux/web/src/features/influencer/__tests__/multiview.test.ts（只读真源）。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { parentTaskId, taskAbsoluteImageUrl, taskKind } from './lib/history.js'
import {
  MULTIVIEW_SIZE,
  multiViewProgress,
  multiViewState,
  partitionTasks,
  pendingMultiViewRecord,
  taskKey,
} from './lib/multiview.js'

/** @param {string} taskId @param {object} [over] */
function sheet(taskId, over = {}) {
  return {
    id: 1,
    task_id: taskId,
    status: 'SUCCESS',
    properties: { input: JSON.stringify({ tier: 'normal', selection: {} }) },
    ...over,
  }
}

/** @param {string} parentTaskId @param {object} [over] */
function board(parentTaskId, over = {}) {
  return {
    id: 2,
    task_id: `board-${parentTaskId}`,
    status: 'QUEUED',
    properties: {
      input: JSON.stringify({ kind: 'multiview', parent_task_id: parentTaskId }),
    },
    ...over,
  }
}

describe('taskKind', () => {
  it('reads a row without a kind as a character sheet', () => {
    assert.equal(taskKind(sheet('a')), 'sheet')
    assert.equal(taskKind(board('a')), 'multiview')
  })

  it('reads an unparseable payload as a character sheet', () => {
    assert.equal(taskKind(sheet('a', { properties: { input: 'not json' } })), 'sheet')
  })
})

describe('parentTaskId', () => {
  it('returns the parent only for a derived row', () => {
    assert.equal(parentTaskId(board('parent-1')), 'parent-1')
    assert.equal(parentTaskId(sheet('a')), null)
  })

  it('ignores an empty or missing parent', () => {
    const empty = board('', { properties: { input: JSON.stringify({ kind: 'multiview' }) } })
    assert.equal(parentTaskId(empty), null)
  })
})

describe('taskAbsoluteImageUrl', () => {
  it('keeps the absolute artifact URL an upstream provider must fetch', () => {
    const url = 'https://omnimux.ai/v1/tasks/t/artifacts/image/content?access=a'
    assert.equal(taskAbsoluteImageUrl(sheet('t', { artifacts: [{ content_url: url }] })), url)
  })

  it('refuses a relative URL, which no provider could fetch', () => {
    assert.equal(
      taskAbsoluteImageUrl(sheet('t', { artifacts: [{ content_url: '/v1/tasks/t/content' }] })),
      null
    )
  })

  it('returns null when the row carries no image', () => {
    assert.equal(taskAbsoluteImageUrl(sheet('t')), null)
  })
})

describe('multiViewState', () => {
  it('maps task status to the badge state', () => {
    assert.equal(multiViewState(null), 'absent')
    assert.equal(multiViewState(undefined), 'absent')
    assert.equal(multiViewState(board('a', { status: 'QUEUED' })), 'generating')
    assert.equal(multiViewState(board('a', { status: 'IN_PROGRESS' })), 'generating')
    assert.equal(multiViewState(board('a', { status: 'SUCCESS' })), 'ready')
    assert.equal(multiViewState(board('a', { status: 'SUCCEEDED' })), 'ready')
    assert.equal(multiViewState(board('a', { status: 'FAILURE' })), 'failed')
    assert.equal(multiViewState(board('a', { status: 'FAILED' })), 'failed')
  })

  it('accepts the lowercase status spelling some adaptors return', () => {
    assert.equal(multiViewState(board('a', { status: 'succeeded' })), 'ready')
    assert.equal(multiViewState(board('a', { status: 'failed' })), 'failed')
  })
})

describe('multiViewProgress', () => {
  it('parses a percentage string', () => {
    assert.equal(multiViewProgress(board('a', { progress: '42%' })), 42)
  })

  it('clamps missing, malformed and out-of-range values', () => {
    assert.equal(multiViewProgress(null), 0)
    assert.equal(multiViewProgress(board('a', { progress: '' })), 0)
    assert.equal(multiViewProgress(board('a', { progress: 'abc' })), 0)
    assert.equal(multiViewProgress(board('a', { progress: '140' })), 100)
    assert.equal(multiViewProgress(board('a', { progress: '-5' })), 0)
  })
})

describe('pendingMultiViewRecord', () => {
  it('is a queued placeholder keyed by the submitted task id', () => {
    const record = pendingMultiViewRecord('t1')
    assert.equal(taskKey(record), 't1')
    assert.equal(record.status, 'QUEUED')
    assert.equal(multiViewState(record), 'generating')
    assert.equal(multiViewProgress(record), 0)
  })

  it('generates the panel aspect the layout expects', () => {
    assert.equal(MULTIVIEW_SIZE, '16:9')
  })
})

describe('partitionTasks', () => {
  it('keeps sheets as roots and attaches a board to its parent', () => {
    const root = sheet('parent-1', { id: 10 })
    const child = board('parent-1', { id: 11 })

    const { roots, childByParent } = partitionTasks([child, root])

    assert.deepEqual(roots.map(taskKey), ['parent-1'])
    assert.equal(childByParent.get('parent-1'), child)
  })

  it('never promotes a derived row to a root card', () => {
    const { roots } = partitionTasks([board('parent-1')])
    assert.deepEqual(roots, [])
  })

  it('keeps the newest board when a card has several', () => {
    const older = board('parent-1', { id: 20 })
    const newer = board('parent-1', { id: 21 })

    const { childByParent } = partitionTasks([sheet('parent-1', { id: 10 }), older, newer])

    assert.equal(childByParent.get('parent-1'), newer)
  })

  it('drops a board whose parent is no longer listed', () => {
    const { roots, childByParent } = partitionTasks([board('parent-gone')])
    assert.deepEqual(roots, [])
    assert.equal(childByParent.size, 0)
  })

  it('treats a malformed payload as a root rather than losing the row', () => {
    const broken = sheet('broken', { properties: { input: '{not json' } })
    const { roots } = partitionTasks([broken])
    assert.deepEqual(roots.map(taskKey), ['broken'])
  })
})
