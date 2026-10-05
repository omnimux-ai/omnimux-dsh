// history 纯逻辑回归：元数据严格/宽松解析、任务种类、父任务、产物 URL 与宽高比。
// 来源：OmniMux/web/src/features/influencer/__tests__/history.test.ts（只读真源）。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  isTerminalStatus,
  parentTaskId,
  parseTaskMeta,
  taskAbsoluteImageUrl,
  taskAspectRatio,
  taskImageUrl,
  taskKind,
} from './lib/history.js'

/** @param {object} [over] */
function rec(over = {}) {
  return { id: 1, task_id: 'task_x', status: 'SUCCESS', ...over }
}

describe('isTerminalStatus', () => {
  it('accepts both status spellings and rejects running states', () => {
    for (const status of ['SUCCESS', 'success', 'SUCCEEDED', 'succeeded', 'FAILURE', 'failed']) {
      assert.equal(isTerminalStatus(status), true, status)
    }
    for (const status of ['QUEUED', 'IN_PROGRESS', '', undefined]) {
      assert.equal(isTerminalStatus(status), false, String(status))
    }
  })
})

describe('parseTaskMeta', () => {
  it('parses _influencer meta from properties.input JSON', () => {
    const meta = {
      _influencer: true,
      tier: 'normal',
      selection: { gender: ['male'], age: ['adult'] },
      brief: 'a reviewer',
      size: '1024x1536',
      seed: 42,
      image_url: null,
    }
    const parsed = parseTaskMeta(rec({ properties: { input: JSON.stringify(meta) } }))
    assert.equal(parsed?.tier, 'normal')
    assert.deepEqual(parsed?.selection.gender, ['male'])
  })

  it('returns null for non-JSON or missing input', () => {
    assert.equal(parseTaskMeta(rec({ properties: { input: 'not json' } })), null)
    assert.equal(parseTaskMeta(rec({})), null)
    assert.equal(parseTaskMeta(rec({ properties: { input: '{}' } })), null)
  })

  it('requires a selection key, so a derived-only payload is refused', () => {
    const derived = JSON.stringify({ kind: 'multiview', parent_task_id: 'p1' })
    assert.equal(parseTaskMeta(rec({ properties: { input: derived } })), null)
  })

  it('refuses a JSON scalar payload', () => {
    assert.equal(parseTaskMeta(rec({ properties: { input: '42' } })), null)
  })
})

describe('taskKind', () => {
  it('reads a row without a kind as a character sheet', () => {
    const sheet = rec({ properties: { input: JSON.stringify({ tier: 'normal', selection: {} }) } })
    const board = rec({
      properties: { input: JSON.stringify({ kind: 'multiview', parent_task_id: 'p1' }) },
    })
    assert.equal(taskKind(sheet), 'sheet')
    assert.equal(taskKind(board), 'multiview')
  })

  it('reads an unparseable payload as a character sheet', () => {
    assert.equal(taskKind(rec({ properties: { input: 'not json' } })), 'sheet')
  })
})

describe('parentTaskId', () => {
  it('returns the parent only for a derived row', () => {
    const board = rec({
      properties: { input: JSON.stringify({ kind: 'multiview', parent_task_id: 'parent-1' }) },
    })
    assert.equal(parentTaskId(board), 'parent-1')
    assert.equal(parentTaskId(rec({ properties: { input: JSON.stringify({ selection: {} }) } })), null)
  })

  it('ignores an empty or missing parent', () => {
    const empty = rec({ properties: { input: JSON.stringify({ kind: 'multiview' }) } })
    assert.equal(parentTaskId(empty), null)
  })
})

describe('taskAbsoluteImageUrl', () => {
  it('keeps the absolute artifact URL an upstream provider must fetch', () => {
    const url = 'https://omnimux.ai/v1/tasks/t/artifacts/image/content?access=a'
    assert.equal(
      taskAbsoluteImageUrl(rec({ artifacts: [{ content_url: url }] })),
      url
    )
  })

  it('refuses a relative URL, which no provider could fetch', () => {
    assert.equal(
      taskAbsoluteImageUrl(rec({ artifacts: [{ content_url: '/v1/tasks/t/content' }] })),
      null
    )
  })

  it('returns null when the row carries no image', () => {
    assert.equal(taskAbsoluteImageUrl(rec()), null)
  })
})

describe('taskAspectRatio', () => {
  it('reads a ratio spelling', () => {
    const row = rec({ properties: { input: JSON.stringify({ size: '9:16' }) } })
    assert.equal(taskAspectRatio(row), '9 / 16')
  })

  it('reads a pixel spelling', () => {
    const row = rec({ properties: { input: JSON.stringify({ size: '1024x1536' }) } })
    assert.equal(taskAspectRatio(row), '1024 / 1536')
  })

  it('returns undefined for a missing, malformed or zero size', () => {
    assert.equal(taskAspectRatio(rec()), undefined)
    assert.equal(taskAspectRatio(rec({ properties: { input: 'not json' } })), undefined)
    assert.equal(taskAspectRatio(rec({ properties: { input: JSON.stringify({}) } })), undefined)
    assert.equal(taskAspectRatio(rec({ properties: { input: JSON.stringify({ size: 'auto' }) } })), undefined)
    assert.equal(taskAspectRatio(rec({ properties: { input: JSON.stringify({ size: '0x1536' }) } })), undefined)
  })
})

describe('taskImageUrl', () => {
  it('strips the gateway origin so dev-proxy hosts still resolve', () => {
    const url = taskImageUrl(
      rec({
        artifacts: [
          {
            key: 'image',
            content_url: 'http://localhost:3000/v1/tasks/task_x/artifacts/image/content?access=abc',
          },
        ],
      })
    )
    assert.equal(url, '/v1/tasks/task_x/artifacts/image/content?access=abc')
  })

  it('falls back to result_url then legacy_content_url', () => {
    assert.equal(
      taskImageUrl(rec({ result_url: 'https://cdn.example.com/img.png' })),
      '/img.png'
    )
    assert.equal(
      taskImageUrl(rec({ legacy_content_url: 'https://cdn.example.com/legacy.png?x=1' })),
      '/legacy.png?x=1'
    )
  })

  it('prefers an artifact over the legacy fields', () => {
    const url = taskImageUrl(
      rec({
        artifacts: [{ url: 'https://cdn.example.com/art.png' }],
        result_url: 'https://cdn.example.com/result.png',
      })
    )
    assert.equal(url, '/art.png')
  })

  it('falls back to the server-provided image url when the row has no artifacts', () => {
    const row = rec({ imageUrl: '/api/omnimux/avatar/task/image?avatarId=avt_1&taskId=avt_task_1' })
    assert.equal(taskImageUrl(row), '/api/omnimux/avatar/task/image?avatarId=avt_1&taskId=avt_task_1')
  })

  it('keeps result_url and legacy_content_url ahead of the server url', () => {
    const server = '/api/omnimux/avatar/task/image?avatarId=avt_1&taskId=avt_task_1'
    assert.equal(
      taskImageUrl(rec({ result_url: 'https://cdn.example.com/result.png', imageUrl: server })),
      '/result.png'
    )
    assert.equal(
      taskImageUrl(rec({ legacy_content_url: 'https://cdn.example.com/legacy.png', imageUrl: server })),
      '/legacy.png'
    )
  })

  it('prefers an artifact over the server-provided image url', () => {
    const url = taskImageUrl(
      rec({
        artifacts: [{ url: 'https://cdn.example.com/art.png' }],
        imageUrl: '/api/omnimux/avatar/task/image?avatarId=avt_1&taskId=avt_task_1',
      })
    )
    assert.equal(url, '/art.png')
  })

  it('returns null when nothing is available', () => {
    assert.equal(taskImageUrl(rec()), null)
    assert.equal(taskImageUrl(rec({ artifacts: [] })), null)
  })

  it('keeps a relative url untouched when it cannot be parsed', () => {
    assert.equal(taskImageUrl(rec({ result_url: 'not-a-url' })), 'not-a-url')
  })
})
