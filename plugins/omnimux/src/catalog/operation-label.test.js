/**
 * Issue #4113（F3）— operation label 缓存失败不得缓存空表。
 *
 * 修复前 `labelMap()` 首次读盘失败会把空 Map 写进模块缓存，同进程后续即使 registry
 * 恢复也永远解析不出 label（要给每个 request 重启才恢复）。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { approvedOperationLabel } from './contract/operation-label.js'

const REGISTRY = { operations: [{ id: 'text_to_video', label: '文生视频' }] }

describe('operation-label cache (#4113 F3)', () => {
  it('首次读盘失败不缓存空表：下一次调用能重新读取并解析出 label', () => {
    // 第一次：loader 抛错（模拟契约目录暂时不可读）
    assert.equal(
      approvedOperationLabel('text_to_video', undefined, () => { throw new Error('EACCES') }),
      undefined,
    )
    // 第二次：registry 恢复 → 不依赖进程重启即可解析
    assert.equal(
      approvedOperationLabel('text_to_video', undefined, () => REGISTRY),
      '文生视频',
    )
    // 第三次：走缓存，不再调用 loader
    let called = 0
    assert.equal(
      approvedOperationLabel('text_to_video', undefined, () => { called += 1; return REGISTRY }),
      '文生视频',
    )
    assert.equal(called, 0, '成功结果应缓存，不再重复读盘')
  })

  it('显式传入 registry 时优先用它，未知 id 返回 undefined（不伪造）', () => {
    assert.equal(approvedOperationLabel('text_to_video', REGISTRY), '文生视频')
    assert.equal(approvedOperationLabel('brand_new_operation', REGISTRY), undefined)
    assert.equal(approvedOperationLabel('', REGISTRY), undefined)
  })
})
