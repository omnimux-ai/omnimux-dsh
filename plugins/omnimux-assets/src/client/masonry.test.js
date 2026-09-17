import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASONRY_AUDIO_RATIO,
  MASONRY_CHROME,
  MASONRY_DEFAULT_RATIO,
  cardHeightOf,
  columnHeights,
  columnIndexById,
  coverRatioOf,
  distributeColumns,
} from './masonry.js'

test('coverRatioOf: 已知缓存优先于目录字段', () => {
  const asset = { id: 'a', coverWidth: 100, coverHeight: 100 }
  assert.equal(coverRatioOf(asset, { a: 0.5 }), 0.5)
  assert.equal(coverRatioOf(asset), 1)
})

test('coverRatioOf: 目录宽高字段', () => {
  assert.equal(coverRatioOf({ coverWidth: 1152, coverHeight: 2048 }), 1152 / 2048)
  assert.equal(coverRatioOf({ width: 736, height: 898 }), 736 / 898)
})

test('coverRatioOf: 未知比例回落默认立绘；纯语音走色块等效比例', () => {
  assert.equal(coverRatioOf({}), MASONRY_DEFAULT_RATIO)
  assert.equal(coverRatioOf({ mediaType: 'image', hasCover: true }), MASONRY_DEFAULT_RATIO)
  assert.equal(coverRatioOf({ mediaType: 'audio', hasCover: false }), MASONRY_AUDIO_RATIO)
  assert.equal(coverRatioOf({ id: 'x' }, { x: 0 }), MASONRY_DEFAULT_RATIO)
  assert.equal(coverRatioOf({ coverWidth: -1, coverHeight: 10 }), MASONRY_DEFAULT_RATIO)
})

test('distributeColumns: 空集合仍返回列桶，不抛错', () => {
  assert.deepEqual(distributeColumns([], 5), [[], [], [], [], []])
  assert.deepEqual(distributeColumns(null, 2), [[], []])
})

test('distributeColumns: 单列就是原顺序', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(distributeColumns(items, 1).map((col) => col.map((row) => row.id)), [[1, 2, 3]])
})

test('distributeColumns: 最短列优先，相等时取最左', () => {
  const items = [
    { id: 'tall-a', ratio: 0.5 },
    { id: 'tall-b', ratio: 0.5 },
    { id: 'wide', ratio: 3 },
    { id: 'tall-c', ratio: 0.5 },
  ]
  const ratioOf = (row) => row.ratio
  const buckets = distributeColumns(items, 2, ratioOf)
  const ids = buckets.map((col) => col.map((row) => row.id))
  // 第 1、2 张等高，分别进左、右；第 3 张极矮进当前等高的最左列；第 4 张进更矮的右列。
  assert.deepEqual(ids, [['tall-a', 'wide'], ['tall-b', 'tall-c']])
})

test('distributeColumns: 比例极值 0.5 / 3.0 仍能分列', () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    ratio: index % 2 === 0 ? 0.5 : 3,
  }))
  const buckets = distributeColumns(items, 3, (row) => row.ratio)
  assert.equal(buckets.length, 3)
  assert.equal(buckets.flat().length, 8)
})

test('columnIndexById: 追加一批后先前 id 的列索引不变', () => {
  const first = [
    { id: 'a', ratio: 0.51 },
    { id: 'b', ratio: 0.72 },
    { id: 'c', ratio: 0.93 },
    { id: 'd', ratio: 0.56 },
  ]
  const extra = [
    { id: 'e', ratio: 0.6 },
    { id: 'f', ratio: 0.8 },
  ]
  const ratioOf = (row) => row.ratio
  const before = columnIndexById(first, 3, ratioOf)
  const after = columnIndexById(first.concat(extra), 3, ratioOf)
  for (const id of ['a', 'b', 'c', 'd']) {
    assert.equal(after.get(id), before.get(id), `${id} 追加后换列了`)
  }
})

test('columnHeights: 多列总高度差不超过最高列的 20%（均匀样本）', () => {
  const items = Array.from({ length: 20 }, (_, index) => ({
    id: index,
    ratio: 0.5 + (index % 5) * 0.1,
  }))
  const ratioOf = (row) => row.ratio
  const buckets = distributeColumns(items, 5, ratioOf)
  const heights = columnHeights(buckets, ratioOf)
  const max = Math.max(...heights)
  const min = Math.min(...heights)
  assert.ok(max > 0)
  assert.ok((max - min) / max <= 0.2, `列高差 ${(max - min) / max} 超过 20%`)
})

test('cardHeightOf: 非法比例回落默认，不抛错', () => {
  assert.equal(cardHeightOf(MASONRY_DEFAULT_RATIO), 1 / MASONRY_DEFAULT_RATIO + MASONRY_CHROME)
  assert.equal(cardHeightOf(0), cardHeightOf(MASONRY_DEFAULT_RATIO))
  assert.equal(cardHeightOf(Number.NaN), cardHeightOf(MASONRY_DEFAULT_RATIO))
})
