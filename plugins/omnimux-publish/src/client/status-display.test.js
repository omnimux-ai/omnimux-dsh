import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aggregateStatus, displayStatus, statusText, STATUS_LABEL } from './status-display.js'
import {
  aggregateStatus as sharedAggregate,
  displayStatus as sharedDisplay,
} from '../shared/record-status.js'

describe('status-display: 单真源 re-export 与六态中文映射', () => {
  it('算法直接 re-export 共享纯函数（同一函数引用，无本地拷贝）', () => {
    assert.equal(aggregateStatus, sharedAggregate)
    assert.equal(displayStatus, sharedDisplay)
  })

  it('STATUS_LABEL 六态完整且无死角', () => {
    assert.equal(STATUS_LABEL.draft, '草稿')
    assert.equal(STATUS_LABEL.publishing, '发布中')
    assert.equal(STATUS_LABEL.reviewing, '审核中')
    assert.equal(STATUS_LABEL.published, '已发布')
    assert.equal(STATUS_LABEL.partial_failed, '部分失败')
    assert.equal(STATUS_LABEL.failed, '失败')
    assert.equal(statusText('published'), '已发布')
    assert.equal(statusText('reviewing'), '审核中')
  })

  it('aggregateStatus 遵循共享契约：in-flight 优先于失败', () => {
    // 1. [published, failed, reviewing] -> in-flight(reviewing) > 0 -> publishing
    assert.equal(
      aggregateStatus({
        status: 'submitted',
        subtasks: [{ status: 'published' }, { status: 'failed' }, { status: 'reviewing' }],
      }),
      'publishing',
    )

    // 2. [published, failed] -> partial_failed（无 in-flight 且有成有败）
    assert.equal(
      aggregateStatus({
        status: 'submitted',
        subtasks: [{ status: 'published' }, { status: 'failed' }],
      }),
      'partial_failed',
    )

    // 3. all published -> published
    assert.equal(
      aggregateStatus({
        status: 'submitted',
        subtasks: [{ status: 'published' }, { status: 'published' }],
      }),
      'published',
    )

    // 4. all failed -> failed
    assert.equal(
      aggregateStatus({
        status: 'submitted',
        subtasks: [{ status: 'failed' }, { status: 'failed' }],
      }),
      'failed',
    )

    // 5. 无有效子任务 -> draft
    assert.equal(aggregateStatus({ status: 'draft' }), 'draft')
    assert.equal(aggregateStatus(null), 'draft')
  })

  it('displayStatus 仅从子任务真源投影 reviewing，不信任缓存 aggregate/subtask_summary', () => {
    // 1. 子任务有 reviewing 且聚合为发布中 -> 投影 reviewing
    assert.equal(
      displayStatus({
        status: 'submitted',
        aggregate: 'publishing',
        subtasks: [{ status: 'published' }, { status: 'failed' }, { status: 'reviewing' }],
      }),
      'reviewing',
    )

    // 2. 缓存 subtask_summary 的 reviewing 计数不参与派生：
    //    无子任务真源时聚合为 draft，绝不凭空投影 reviewing
    assert.equal(
      displayStatus({
        status: 'submitted',
        aggregate: 'publishing',
        subtask_summary: { reviewing: 1, total: 2 },
      }),
      'draft',
    )

    // 3. published 无 reviewing -> published
    assert.equal(
      displayStatus({
        status: 'submitted',
        aggregate: 'published',
        subtasks: [{ status: 'published' }],
      }),
      'published',
    )

    // 4. partial_failed -> partial_failed
    assert.equal(
      displayStatus({
        status: 'submitted',
        aggregate: 'partial_failed',
        subtasks: [{ status: 'published' }, { status: 'failed' }],
      }),
      'partial_failed',
    )

    // 5. draft -> draft
    assert.equal(displayStatus({ status: 'draft' }), 'draft')
  })
})
