import test from 'node:test'
import assert from 'node:assert/strict'
import { PAGE_SIZE_MAX, PAGE_SIZE_MIN, pageSizeFor } from './page-size.js'

test('pageSizeFor: 目标列数 × 三行 (Issue 2151 AC-1)', () => {
  assert.equal(pageSizeFor(5), 15)
  assert.equal(pageSizeFor(4), 12)
  assert.equal(pageSizeFor(3), 9)
  assert.equal(pageSizeFor(2), 6)
})

test('pageSizeFor: 结果夹在 [6, 24]', () => {
  assert.equal(pageSizeFor(1), PAGE_SIZE_MIN)
  assert.equal(pageSizeFor(8), PAGE_SIZE_MAX)
  assert.equal(pageSizeFor(100), PAGE_SIZE_MAX)
})

test('pageSizeFor: 非法列数回落下限', () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '']) {
    assert.equal(pageSizeFor(bad), PAGE_SIZE_MIN, `${String(bad)} 未回落`)
  }
})
