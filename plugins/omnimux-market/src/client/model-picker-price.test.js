import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cheapestGroupPriceLabel,
  formatGroupPrice,
  projectListedRow,
} from './model-picker-catalog.js'

describe('model picker price label', () => {
  it('shows a points estimate when the hub publishes one', () => {
    assert.equal(formatGroupPrice({ pricing: { pointsEstimate: 4500, billingMode: 'per_task' } }), '≈4500 积分')
  })

  it('falls back to a ratio when the gateway publishes no points scale', () => {
    assert.equal(formatGroupPrice({ pricing: { pointsEstimate: null, priceRatio: 0.5 } }), '×0.5 倍率')
  })

  it('says so instead of inventing a number when there is no quote at all', () => {
    assert.equal(formatGroupPrice({ pricing: {} }), '暂无报价')
    assert.equal(formatGroupPrice({}), '暂无报价')
    assert.equal(formatGroupPrice(null), '暂无报价')
    assert.equal(formatGroupPrice({ pricing: { pointsEstimate: Number.NaN } }), '暂无报价')
  })

  it('labels the cheapest enabled line, matching cost_first ordering', () => {
    const label = cheapestGroupPriceLabel({
      channelGroups: [
        { id: 'pro', enabled: true, pricing: { pointsEstimate: 4500 } },
        { id: 'standard', enabled: true, pricing: { pointsEstimate: 1800 } },
      ],
    })
    assert.equal(label, '≈1800 积分')
  })

  it('ignores disabled lines when picking the cheapest', () => {
    const label = cheapestGroupPriceLabel({
      channelGroups: [
        { id: 'cheap', enabled: false, pricing: { pointsEstimate: 100 } },
        { id: 'standard', enabled: true, pricing: { pointsEstimate: 1800 } },
      ],
    })
    assert.equal(label, '≈1800 积分')
  })

  it('still reports a ratio-only pool rather than going blank', () => {
    const label = cheapestGroupPriceLabel({
      channelGroups: [{ id: 'standard', enabled: true, pricing: { priceRatio: 1.178 } }],
    })
    assert.equal(label, '×1.178 倍率')
  })

  it('returns an empty label for a model with no pool', () => {
    assert.equal(cheapestGroupPriceLabel({ channelGroups: [] }), '')
    assert.equal(cheapestGroupPriceLabel({}), '')
  })

  it('carries the pricing onto the projected picker row', () => {
    const row = projectListedRow({
      id: 'seedance-2-5',
      label: 'Seedance 2.5',
      channelGroups: [
        { id: 'pro', label: '旗舰版', wireGroup: 'seedance-2-5-task-pro', enabled: true, pricing: { pointsEstimate: 4500 } },
        { id: 'standard', label: '标准版', wireGroup: 'default', enabled: true, pricing: { pointsEstimate: 1800 } },
      ],
    }, 'video')

    assert.equal(row.priceLabel, '≈1800 积分')
    assert.equal(row.channelGroups.length, 2)
    assert.equal(row.channelGroups[0].wireGroup, 'seedance-2-5-task-pro')
  })

  it('keeps a row with no pricing information renderable', () => {
    const row = projectListedRow({ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }, 'text')
    assert.deepEqual(row.channelGroups, [])
    assert.equal(row.priceLabel, '')
  })
})
