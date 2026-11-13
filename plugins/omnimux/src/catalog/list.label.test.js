/**
 * Issue #4103 — 目录层不得拿 operation id 冒充 label。
 *
 * 独立成文件（不改既有 list.test.js）：本用例锁定的是「契约/DTO 层 label 只来自
 * 已审校目录」这一条不变量，与列表投影的既有用例无关。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseHubConfig } from '../config.js'
import { buildModelCatalog } from './list.js'

function hub() {
  return parseHubConfig({})
}

const APPROVED_VIDEO_LABELS = {
  text_to_video: '文生视频',
  first_frame: '首帧驱动',
  first_last_frame: '首尾帧过渡',
  video_multi_ref: '全能参考',
  document_to_video: '文档参考',
  webpage_to_video: '网页参考',
}

describe('catalog operation label (#4103)', () => {
  it('gateway-only 行（wan-3.0）的 label 取 operation-registry，不用 id 冒充', () => {
    const catalog = buildModelCatalog({ text: hub().text, media: hub().media, env: {} })
    const wan = catalog.models.find((row) => row.id === 'wan-3.0')
    assert.ok(wan, 'wan-3.0 must stay visible with an execution status')
    assert.equal(wan.executionStatus, 'unsupported')
    assert.ok(Array.isArray(wan.operations) && wan.operations.length > 0, 'wan-3.0 operations required')
    for (const op of wan.operations) {
      assert.notEqual(op.label, op.id, `${op.id}: label 不得等于 operation id`)
      if (APPROVED_VIDEO_LABELS[op.id]) {
        assert.equal(op.label, APPROVED_VIDEO_LABELS[op.id], `${op.id}: label 必须取 operation-registry 中文`)
      }
    }
  })

  it('全目录不变量：任何型号的任何 operation 都不把 id 当 label 投出去', () => {
    const catalog = buildModelCatalog({ text: hub().text, media: hub().media, env: {} })
    const offenders = []
    for (const row of catalog.models) {
      for (const op of row.operations ?? []) {
        if (op.label === op.id) offenders.push(`${row.id}/${op.id}`)
      }
    }
    assert.deepEqual(offenders, [])
  })
})
