import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  POINTS_REFERENCE_SECONDS,
  PRICE_COMPARISON_UNAVAILABLE,
  USD_TO_POINTS_RATE,
  describeModelBilling,
  estimatePointsFromGateway,
  gatewayBillingMode,
  gatewayPricingBlock,
  gatewayUnitPriceUsd,
} from './pricing-calculator.js'
import { resolveReadOnlySnapshot } from './cloud/current.js'
import { findSnapshotModel } from './cloud/view.js'

/**
 * P1b: every number below is derived from the bundled gateway snapshot. There is
 * no local price table left to compare against, so the tests assert the
 * derivation itself (unit price x group ratio) rather than a copied constant,
 * plus the literal value the gateway currently publishes as a drift alarm.
 */
const snapshot = resolveReadOnlySnapshot().snapshot

/** @param {string} id */
function modelOf(id) {
  const model = findSnapshotModel(snapshot, id)
  assert.ok(model, `model ${id} must exist in the bundled gateway snapshot`)
  return model
}

describe('OmniMux Pricing Calculator Engine', () => {
  it('enforces 1 USD = 10 Points conversion rate', () => {
    assert.equal(USD_TO_POINTS_RATE, 10)
    assert.equal(POINTS_REFERENCE_SECONDS, 5)
  })

  it('accurately calculates per-second video generation costs', () => {
    // seedance-2-0 在快照里是 0.0971 USD/秒、default 倍率 1。
    const model = modelOf('seedance-2-0')
    assert.equal(gatewayBillingMode(model), 'per_second')
    const unit = gatewayUnitPriceUsd(model)
    assert.equal(unit, 0.0971)

    const points = estimatePointsFromGateway({ billing: model.billing, billingMode: 'per_second', groupRatio: 1 })
    assert.equal(points, 4.86)
    assert.equal(points, Math.round(unit * 1 * POINTS_REFERENCE_SECONDS * USD_TO_POINTS_RATE * 100) / 100)

    // A longer package scales linearly, and the reference window is a comparison
    // baseline rather than a product rule.
    const tenSeconds = estimatePointsFromGateway({
      billing: model.billing, billingMode: 'per_second', groupRatio: 1, baselineSeconds: 10,
    })
    assert.equal(tenSeconds, 9.71)

    // The 0.8 USD/秒 seedance-2-5 line costs 40 points per 5-second package.
    const premium = modelOf('seedance-2-5')
    assert.equal(
      estimatePointsFromGateway({ billing: premium.billing, billingMode: 'per_second', groupRatio: 1 }),
      40,
    )
  })

  it('accurately calculates per-task package costs', () => {
    // suno 只公布 model_price + quota_type=1（按次固定价）。
    const suno = modelOf('suno')
    assert.equal(gatewayBillingMode(suno), 'per_task')
    assert.equal(
      estimatePointsFromGateway({ billing: suno.billing, billingMode: 'per_task', groupRatio: 1 }),
      0.76,
    )

    // 词元计费没有固定套餐，必须报「无法比对」而不是编一个数字。
    const chat = modelOf('gemini-3.8-flash')
    assert.equal(gatewayBillingMode(chat), 'per_token')
    assert.equal(estimatePointsFromGateway({ billing: chat.billing, billingMode: 'per_token', groupRatio: 1 }), null)
  })

  it('takes channel group discount or multiplier ratios into account', () => {
    const model = modelOf('seedance-2-5')
    const base = estimatePointsFromGateway({ billing: model.billing, billingMode: 'per_second', groupRatio: 1 })
    assert.equal(base, 40)
    assert.equal(
      estimatePointsFromGateway({ billing: model.billing, billingMode: 'per_second', groupRatio: 0.5 }),
      base / 2,
    )
    assert.equal(
      estimatePointsFromGateway({ billing: model.billing, billingMode: 'per_second', groupRatio: 2 }),
      base * 2,
    )

    // 快照给 480p 专线的倍率是 0.17，线路价格必须按它算。
    const block = gatewayPricingBlock(model, 0.17)
    assert.equal(block.groupRatio, 0.17)
    assert.equal(block.pointsEstimate, 6.8)
    assert.equal(block.unitPriceUsd, 0.8)
    assert.equal(block.pointsNote, undefined)
  })

  it('generates natural language billing descriptions for Agent perception', () => {
    const perSecond = describeModelBilling('seedance-2-0')
    assert.match(perSecond, /按秒计费/)
    assert.match(perSecond, /0\.0971 USD\/秒/)
    assert.match(perSecond, /4\.86 积分\/5秒/)

    // 线路写法优先用该线路的倍率。
    const discounted = describeModelBilling('seedance-2-5@desktop-480p')
    assert.match(discounted, /desktop-480p/)
    assert.match(discounted, /6\.8 积分\/5秒/)

    const perTask = describeModelBilling('suno')
    assert.match(perTask, /按次计费/)
    assert.match(perTask, /0\.76 积分\/次/)

    // 表达式计费 / 词元计费只给原因，不给数字。
    for (const id of ['gpt-image-2.5', 'gemini-3.8-flash']) {
      const text = describeModelBilling(id)
      assert.match(text, /无法/, id)
      assert.equal(/\d+\.\d+ 积分/.test(text), false, `${id} must not quote a fabricated price`)
    }

    // 网关不售的型号没有计费描述。
    assert.equal(describeModelBilling('seedream-5-0-pro'), null)
  })

  it('marks expression-billed lines as uncomparable instead of guessing', () => {
    const image = modelOf('gpt-image-2.5')
    const block = gatewayPricingBlock(image, 1)
    assert.equal(block.billingMode, 'per_task')
    assert.equal(block.unitPriceUsd, 0.3)
    assert.equal(block.pointsEstimate, null)
    assert.equal(block.pointsNote, PRICE_COMPARISON_UNAVAILABLE.EXPR)

    const chat = gatewayPricingBlock(modelOf('gemini-3.8-flash'), 1)
    assert.equal(chat.pointsEstimate, null)
    assert.equal(chat.pointsNote, PRICE_COMPARISON_UNAVAILABLE.EXPR)
  })
})
