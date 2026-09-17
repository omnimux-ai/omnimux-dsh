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
    // seedance-2-5: 0.3143 USD/sec
    const cost5s = calculatePoints({ modelId: 'seedance-2-5', duration: 5 })
    assert.equal(cost5s.points, 15.72)
    assert.equal(cost5s.formattedPoints, '≈16 积分')

    const cost30s = calculatePoints({ modelId: 'seedance-2-5', duration: 30 })
    assert.equal(cost30s.points, 94.29)
    assert.equal(cost30s.formattedPoints, '≈94 积分')

    // minimax-h3: 0.0714 USD/sec
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
    assert.match(s25Desc, /5 秒约 16 积分/)
    assert.match(s25Desc, /30 秒约 94 积分/)

    const taskDesc = describeModelBilling('seedance-2-5-task')
    assert.match(taskDesc, /按条\/按次计费/)
    assert.match(taskDesc, /固定每次 ≈5.6 积分/)
  })
})
