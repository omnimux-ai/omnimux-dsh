import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_ASPECT_RATIO,
  cardRatioOf,
  cardHeightOf,
  distributeColumns,
  columnsForWidth,
} from './masonry-layout.js'

describe('library-flow / masonry-layout 算法与分列模型单测', () => {
  it('cardRatioOf: 精准推导不同 lane 与不同分辨率数据', () => {
    // 默认兜底
    assert.equal(cardRatioOf(null), DEFAULT_ASPECT_RATIO)
    assert.equal(cardRatioOf({}), DEFAULT_ASPECT_RATIO)

    // lane 映射
    assert.equal(cardRatioOf({ lane: 'trending' }), 9 / 16)
    assert.equal(cardRatioOf({ lane: 'inspiration' }), 9 / 16)
    assert.equal(cardRatioOf({ lane: 'assets' }), 3 / 4)
    assert.equal(cardRatioOf({ lane: 'products' }), 3 / 4)
    assert.equal(cardRatioOf({ lane: 'featured' }), 16 / 10)
    assert.equal(cardRatioOf({ lane: 'skills' }), 1 / 1)

    // 显式宽高
    assert.equal(cardRatioOf({ raw: { coverWidth: 1920, coverHeight: 1080 } }), 1920 / 1080)
    assert.equal(cardRatioOf({ raw: { width: 1080, height: 1920 } }), 1080 / 1920)

    // 字符串分辨率
    assert.equal(cardRatioOf({ raw: { resolution: '1920x1080' } }), 1920 / 1080)
    assert.equal(cardRatioOf({ raw: { resolution: '1080 × 1920' } }), 1080 / 1920)
  })

  it('cardHeightOf: 归一化高度计算与防卫', () => {
    assert.ok(cardHeightOf(9 / 16) > cardHeightOf(16 / 9))
    assert.ok(cardHeightOf(-1) > 0)
    assert.ok(cardHeightOf(0) > 0)
  })

  it('distributeColumns: 贪心高度均衡与空态处理', () => {
    // 空数据
    const emptyResult = distributeColumns([], 3)
    assert.equal(emptyResult.length, 3)
    assert.deepEqual(emptyResult, [[], [], []])

    // 混排素材（包含 16:9 横版与 9:16 竖版）
    const items = [
      { id: '1', raw: { resolution: '1920x1080' } }, // 横版高约 1 / 1.77 + 0.15 = 0.71
      { id: '2', raw: { resolution: '1080x1920' } }, // 竖版高约 1 / 0.56 + 0.15 = 1.93
      { id: '3', raw: { resolution: '1920x1080' } }, // 横版
      { id: '4', raw: { resolution: '1080x1920' } }, // 竖版
    ]

    const buckets = distributeColumns(items, 2)
    assert.equal(buckets.length, 2)
    // 算法必须将后续元素分配给较矮的列，消除单列空洞
    assert.equal(buckets[0][0].id, '1') // col 0 receives item 1 (h=0.71)
    assert.equal(buckets[1][0].id, '2') // col 1 receives item 2 (h=1.93)
    // item 3 (h=0.71) 应进入较矮的 col 0
    assert.equal(buckets[0][1].id, '3')
  })

  it('columnsForWidth: 容器宽度反解列数与边界条件', () => {
    // 极小宽度或非法值保障最低列数
    assert.equal(columnsForWidth(0), 2)
    assert.equal(columnsForWidth(-100), 2)
    assert.equal(columnsForWidth(NaN), 2)

    // 侧边栏宽度 380px -> 2 列
    assert.equal(columnsForWidth(380, { minColWidth: 160, gap: 12 }), 2)

    // 侧边栏全屏 / 中等视口 800px -> 4 列
    assert.equal(columnsForWidth(800, { minColWidth: 180, gap: 16, maxCols: 6 }), 4)

    // 新会话大视口 1400px -> 6 列（封顶）
    assert.equal(columnsForWidth(1400, { minColWidth: 180, gap: 16, maxCols: 6 }), 6)
  })
})
