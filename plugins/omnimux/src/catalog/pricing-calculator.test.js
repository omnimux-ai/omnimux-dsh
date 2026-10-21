import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  USD_TO_POINTS_RATE,
  calculatePoints,
  describeModelBilling,
} from './pricing-calculator.js'

describe('OmniMux Pricing Calculator Engine', () => {
  it('enforces 1 USD = 10 Points conversion rate', () => {
    assert.equal(USD_TO_POINTS_RATE, 10)
  })

  it('accurately calculates per-second video generation costs', () => {
    // #3516 网关对账：seedance-2-5 基准价 0.8 USD/sec（原 0.3143）
    const cost5s = calculatePoints({ modelId: 'seedance-2-5', duration: 5 })
    assert.equal(cost5s.points, 40)
    assert.equal(cost5s.formattedPoints, '≈40 积分')

    const cost30s = calculatePoints({ modelId: 'seedance-2-5', duration: 30 })
    assert.equal(cost30s.points, 240)
    assert.equal(cost30s.formattedPoints, '≈240 积分')

    // 新增 seedance-2-0-fast: 0.059022 USD/sec
    const fast5s = calculatePoints({ modelId: 'seedance-2-0-fast', duration: 5 })
    assert.equal(fast5s.points, 2.95)
    assert.equal(fast5s.formattedPoints, '≈3.0 积分')

    // 新增 seedance-2-0-mini: 0.0157 USD/sec
    const mini5s = calculatePoints({ modelId: 'seedance-2-0-mini', duration: 5 })
    assert.equal(mini5s.points, 0.78)
    assert.equal(mini5s.formattedPoints, '≈0.8 积分')

    // minimax-h3: 0.0714 USD/sec（#3516 后仅登记不上架，基准价仍保留）
    const h3_5s = calculatePoints({ modelId: 'minimax-h3', duration: 5 })
    assert.equal(h3_5s.points, 3.57)
    assert.equal(h3_5s.formattedPoints, '≈3.6 积分')
  })

  it('accurately calculates per-task package costs', () => {
    // seedance-2-5-task: 0.558824 USD/task
    const taskCost = calculatePoints({ modelId: 'seedance-2-5-task' })
    assert.equal(taskCost.points, 5.59)
    assert.equal(taskCost.formattedPoints, '≈5.6 积分')

    // gpt-image-2.5: 0.013072 USD/image
    const imgCost = calculatePoints({ modelId: 'gpt-image-2.5' })
    assert.equal(imgCost.points, 0.13)
    assert.equal(imgCost.formattedPoints, '≈0.1 积分')

    // #3516 新增基准价：seedream-5-0-pro 0.064286 / suno 0.075556 / whisper-1 0.015 USD per task
    for (const [modelId, points] of [
      ['seedream-5-0-pro', 0.64],
      ['suno', 0.76],
      ['whisper-1', 0.15],
    ]) {
      const cost = calculatePoints({ modelId })
      assert.equal(cost.points, points, modelId)
    }
  })

  it('takes channel group discount or multiplier ratios into account', () => {
    // minimax-h3-video: 0.025 USD/sec, fast discount ratio 0.9
    const fastCost = calculatePoints({ modelId: 'minimax-h3-video', duration: 5, groupRatio: 0.9 })
    assert.equal(fastCost.points, 1.13)
    assert.equal(fastCost.formattedPoints, '≈1.1 积分')
  })

  it('generates natural language billing descriptions for Agent perception', () => {
    const s25Desc = describeModelBilling('seedance-2-5')
    assert.match(s25Desc, /按秒计费/)
    assert.match(s25Desc, /5 秒约 40 积分/)
    assert.match(s25Desc, /30 秒约 240 积分/)

    const taskDesc = describeModelBilling('seedance-2-5-task')
    assert.match(taskDesc, /按条\/按次计费/)
    assert.match(taskDesc, /固定每次 ≈5.6 积分/)
  })
})
