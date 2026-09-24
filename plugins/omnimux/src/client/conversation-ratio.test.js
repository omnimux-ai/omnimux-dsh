/**
 * 中间会话栏比例制纯函数层单测（Issue #2608 / 规格 AC-1、AC-2、AC-3）。
 *
 * 断言口径：
 * - 五档像素刻度（1728/1920/2560/1440/1280，左栏展开 280）逐点 ±1px；
 * - 比例归一化对 NaN / ±Infinity / -1 / 0.9 / undefined 的回落与夹紧；
 * - 宽度↔比例往返一致。
 * 真实内核几何由 `scripts/three-column-collapse-qa.mjs` 与真机验收负责，这里只锁算式。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CONVERSATION_MIN_CANVAS_PX,
  CONVERSATION_MIN_CHAT_PX,
  CONVERSATION_RATIO_DEFAULT,
  CONVERSATION_RATIO_MAX,
  CONVERSATION_RATIO_MIN,
  clampConversationRatio,
  conversationStageWidthPx,
  conversationWidthFromRatio,
  normalizeConversationRatio,
  ratioFromConversationWidth,
  resolveConversationPixelBudget,
} from './conversation-ratio.js'

/** 左栏展开态宽度（外壳 SIDEBAR_DEFAULT）。 */
const EXPANDED_RAIL_PX = 280

/** 验收刻度：视口 → 期望中栏宽（AC-2 大屏刻度 / AC-3 小屏被下限夹住）。 */
const WIDTH_LADDER = [
  { viewport: 1728, chat: 434, clamped: false, note: 'AC-2 大屏刻度' },
  { viewport: 1920, chat: 492, clamped: false, note: 'AC-2 基准刻度' },
  { viewport: 2560, chat: 684, clamped: false, note: 'AC-2 大屏刻度' },
  { viewport: 1440, chat: 360, clamped: true, note: 'AC-3 被 360px 下限夹住' },
  { viewport: 1280, chat: 360, clamped: true, note: 'AC-3 被 360px 下限夹住' },
]

describe('conversation ratio constants (MiniMax Design 3.0.16 alignment)', () => {
  it('pins the four contract constants', () => {
    assert.equal(CONVERSATION_RATIO_MIN, 0)
    assert.equal(CONVERSATION_RATIO_MAX, 0.72)
    assert.equal(CONVERSATION_RATIO_DEFAULT, 0.3)
    assert.equal(CONVERSATION_MIN_CHAT_PX, 360, '下限固定 360（竞品 220 不采纳）')
    assert.equal(CONVERSATION_MIN_CANVAS_PX, 320)
  })
})

describe('normalizeConversationRatio falls back instead of propagating garbage', () => {
  it('falls back to the default for non-finite input', () => {
    assert.equal(normalizeConversationRatio(Number.NaN), CONVERSATION_RATIO_DEFAULT)
    assert.equal(normalizeConversationRatio(Number.POSITIVE_INFINITY), CONVERSATION_RATIO_DEFAULT)
    assert.equal(normalizeConversationRatio(Number.NEGATIVE_INFINITY), CONVERSATION_RATIO_DEFAULT)
    assert.equal(normalizeConversationRatio(undefined), CONVERSATION_RATIO_DEFAULT)
    assert.equal(normalizeConversationRatio(null), CONVERSATION_RATIO_DEFAULT, 'null 是「缺失」不是 0')
    assert.equal(normalizeConversationRatio(''), CONVERSATION_RATIO_DEFAULT, '空串是「缺失」不是 0')
    assert.equal(normalizeConversationRatio('   '), CONVERSATION_RATIO_DEFAULT)
    assert.equal(normalizeConversationRatio(true), CONVERSATION_RATIO_DEFAULT, '布尔不是比例')
    assert.equal(normalizeConversationRatio('not-a-number'), CONVERSATION_RATIO_DEFAULT)
    assert.equal(normalizeConversationRatio({}), CONVERSATION_RATIO_DEFAULT)
  })

  it('clamps finite input into [0, 0.72]', () => {
    assert.equal(normalizeConversationRatio(-1), 0, '负数夹到区间下界')
    assert.equal(normalizeConversationRatio(0.9), CONVERSATION_RATIO_MAX, '超上界夹到 0.72')
    assert.equal(normalizeConversationRatio(0.72), CONVERSATION_RATIO_MAX, '上界本身保留')
    assert.equal(normalizeConversationRatio(0), 0)
    assert.equal(normalizeConversationRatio(0.5), 0.5, '区间内原样保留')
    assert.equal(normalizeConversationRatio('0.4'), 0.4, '数值字符串按数值处理')
  })

  it('clampConversationRatio treats non-finite input as the interval floor', () => {
    assert.equal(clampConversationRatio(Number.NaN), CONVERSATION_RATIO_MIN)
    assert.equal(clampConversationRatio(Number.POSITIVE_INFINITY), CONVERSATION_RATIO_MIN)
    assert.equal(clampConversationRatio(-3), CONVERSATION_RATIO_MIN)
    assert.equal(clampConversationRatio(3), CONVERSATION_RATIO_MAX)
  })
})

describe('conversation stage width (viewport − rail)', () => {
  it('subtracts the visible rail while expanded', () => {
    assert.equal(conversationStageWidthPx({ viewportWidth: 1920, railVisiblePx: 280 }), 1640)
  })

  it('locks the expanded rail baseline while collapsed so the width is preserved', () => {
    assert.equal(
      conversationStageWidthPx({ viewportWidth: 1920, railVisiblePx: 0, railBaselinePx: 280, collapsed: true }),
      1640,
      '收起左栏不得改变分母，否则中栏宽度会随收起动作变化（INV-1 保宽）',
    )
  })

  it('never returns a negative stage', () => {
    assert.equal(conversationStageWidthPx({ viewportWidth: 100, railVisiblePx: 280 }), 0)
    assert.equal(conversationStageWidthPx({ viewportWidth: Number.NaN, railVisiblePx: 280 }), 0)
    assert.equal(conversationStageWidthPx(), 0)
  })
})

describe('conversation width ladder at the default 30% ratio (AC-2 / AC-3)', () => {
  for (const { viewport, chat, clamped, note } of WIDTH_LADDER) {
    it(`${viewport} → ${chat}px（${note}）`, () => {
      const stage = conversationStageWidthPx({ viewportWidth: viewport, railVisiblePx: EXPANDED_RAIL_PX })
      const width = conversationWidthFromRatio(stage, CONVERSATION_RATIO_DEFAULT)
      assert.ok(
        Math.abs(width - chat) <= 1,
        `期望 ${chat}px ±1，实测 ${width}px（舞台 ${stage}px）`,
      )
      if (!clamped) {
        const ratio = width / stage
        assert.ok(
          ratio >= 0.295 && ratio <= 0.305,
          `未被夹住时「中栏 ÷ 舞台」必须落在 [0.295, 0.305]，实测 ${ratio.toFixed(4)}（AC-1）`,
        )
      } else {
        assert.equal(width, CONVERSATION_MIN_CHAT_PX, '被下限夹住时必须正好等于下限')
      }
    })
  }

  it('grows monotonically with the viewport, so a bigger window never shrinks the column', () => {
    const widths = [1280, 1440, 1728, 1920, 2560].map((viewport) => conversationWidthFromRatio(
      conversationStageWidthPx({ viewportWidth: viewport, railVisiblePx: EXPANDED_RAIL_PX }),
      CONVERSATION_RATIO_DEFAULT,
    ))
    for (let i = 1; i < widths.length; i += 1) {
      assert.ok(widths[i] >= widths[i - 1], `视口变大后中栏不得变窄：${widths[i - 1]} → ${widths[i]}`)
    }
  })
})

describe('resolveConversationPixelBudget keeps the canvas at least 320px', () => {
  it('caps the column so the canvas keeps its floor', () => {
    const stage = 1000
    const budget = resolveConversationPixelBudget(stage, CONVERSATION_RATIO_MAX)
    assert.equal(budget.maxChatWidth, stage - CONVERSATION_MIN_CANVAS_PX)
    assert.ok(
      budget.chatWidth <= stage - CONVERSATION_MIN_CANVAS_PX,
      `画布必须保留 ≥${CONVERSATION_MIN_CANVAS_PX}px，实测剩余 ${stage - budget.chatWidth}px`,
    )
  })

  it('lets the floor win when the cap would fall below it', () => {
    const budget = resolveConversationPixelBudget(300, CONVERSATION_RATIO_MAX)
    assert.equal(budget.minChatWidth, 300, '舞台比下限还窄时下限退让到舞台宽')
    assert.equal(budget.maxChatWidth, 300, '上限不得低于下限')
    assert.equal(budget.chatWidth, 300)
  })

  it('treats a non-finite stage as zero instead of producing NaN', () => {
    const budget = resolveConversationPixelBudget(Number.NaN, CONVERSATION_RATIO_DEFAULT)
    assert.deepEqual(budget, { chatWidth: 0, minChatWidth: 0, maxChatWidth: 0 })
  })
})

describe('ratio ↔ width round trip', () => {
  for (const viewport of [1728, 1920, 2560]) {
    it(`round-trips at ${viewport}px`, () => {
      const stage = conversationStageWidthPx({ viewportWidth: viewport, railVisiblePx: EXPANDED_RAIL_PX })
      for (const ratio of [0.3, 0.45, 0.6]) {
        const width = conversationWidthFromRatio(stage, ratio)
        const back = ratioFromConversationWidth(stage, width)
        assert.ok(
          Math.abs(back - ratio) <= 1 / stage,
          `比例往返必须一致（只允许 ±1px 的取整误差）：${ratio} → ${width}px → ${back}`,
        )
        assert.equal(
          conversationWidthFromRatio(stage, back),
          width,
          '反推比例再算回来必须落在同一像素刻度上',
        )
      }
    })
  }

  it('round-trips the effective ratio even where the floor clamps the width', () => {
    // 1440 下 30% 会被 360px 下限抬到 0.3104：往返必须收敛到「实际生效的比例」，
    // 而不是把被夹紧后的宽度反推成原始比例（那会让持久化值与渲染值分叉）。
    const stage = conversationStageWidthPx({ viewportWidth: 1440, railVisiblePx: EXPANDED_RAIL_PX })
    const width = conversationWidthFromRatio(stage, CONVERSATION_RATIO_DEFAULT)
    assert.equal(width, CONVERSATION_MIN_CHAT_PX)
    const back = ratioFromConversationWidth(stage, width)
    assert.equal(conversationWidthFromRatio(stage, back), width, '被夹紧后往返仍须像素稳定')
    assert.ok(back > CONVERSATION_RATIO_DEFAULT, '生效比例必须高于被下限截断的输入比例')
  })

  it('falls back to the default ratio when the stage cannot carry a ratio', () => {
    assert.equal(ratioFromConversationWidth(0, 400), CONVERSATION_RATIO_DEFAULT)
    assert.equal(ratioFromConversationWidth(Number.NaN, 400), CONVERSATION_RATIO_DEFAULT)
    assert.equal(ratioFromConversationWidth(1600, Number.NaN), CONVERSATION_RATIO_DEFAULT)
  })

  it('clamps a dragged pixel width into the legal ratio band', () => {
    assert.equal(ratioFromConversationWidth(1600, 100), 100 / 1600, '下限之上按真实比例记录')
    assert.equal(ratioFromConversationWidth(1600, 1600), CONVERSATION_RATIO_MAX, '拖到满宽夹到 0.72')
    assert.equal(ratioFromConversationWidth(1600, -50), CONVERSATION_RATIO_MIN)
  })
})
