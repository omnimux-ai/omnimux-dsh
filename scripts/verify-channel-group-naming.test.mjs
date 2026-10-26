import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  checkCatalog,
  checkCanvasNames,
  checkFamily,
  checkProjectedCatalog,
  ALLOWED_LABELS,
  FORBIDDEN_WORDS,
  REQUIRED_LABEL,
} from './verify-channel-group-naming.mjs'
import { MODEL_CHANNEL_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js'
import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js'
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js'
import { readCanvasCatalog } from '../plugins/omnimux-workflow/src/workflow/seam/canvasCatalog.ts'

const rules = (violations) => violations.map((v) => v.rule)

/** 目录投影：模型 id → 线路行（四个桶去重）。 */
function projection(catalog) {
  const projected = {}
  for (const kind of ['text', 'image', 'video', 'audio']) {
    for (const row of [catalog.text, catalog.image, catalog.video, catalog.audio].flat()) Object.assign(projected, Object.fromEntries([[row.id, row.channelGroups ?? []]]))
  }
  return projected
}

const readCatalog = () => buildModelCatalog({ env: {}, snapshot: resolveReadOnlySnapshot().snapshot })

describe('channel group naming gate', () => {
  it('passes on the live catalog and canvas mirror', () => {
    const catalog = readCatalog()
    const canvasRows = readCanvasCatalog((name) => (name === 'modelCatalog' ? { list: () => catalog } : undefined))
    assert.deepEqual(checkProjectedCatalog(projection(catalog), MODEL_CHANNEL_GROUPS).violations, [])
    assert.deepEqual(checkCanvasNames(canvasRows, catalog), [])
  })

  it('covers every enabled group of the catalog', () => {
    const catalog = readCatalog()
    const report = checkProjectedCatalog(projection(catalog), MODEL_CHANNEL_GROUPS)
    // 2026-10-25 #3762：产品命名 7 条 + 网关命名 3 条 = 目录在售 10 条线路。
    assert.ok(report.authoredCount >= 7, `authored lines must be checked, got ${report.authoredCount}`)
    assert.ok(report.gatewayCount >= 3, `gateway-published lines must be counted, got ${report.gatewayCount}`)
    for (const line of report.gatewayLines) {
      assert.ok(ALLOWED_LABELS.length > 0)
      assert.ok(line.modelId && line.id, 'gateway census entries must name their line')
    }
  })

  it('rejects a supplier name leaking into the badge', () => {
    const violations = checkFamily('demo', [
      { id: 'std', label: '标准版' },
      { id: 'fast', label: '经济版', badge: 'AutoDL 极速出片' },
    ])
    assert.deepEqual(rules(violations), ['FORBIDDEN_WORD'])
  })

  it('rejects a purchase-layer term in the label', () => {
    const violations = checkFamily('demo', [{ id: 'pool', label: '号池版' }])
    assert.deepEqual(
      rules(violations).sort(),
      ['FORBIDDEN_WORD', 'LABEL_NOT_ALLOWED', 'STANDARD_LABEL_MISSING'].sort(),
    )
  })

  it('rejects a label outside the whitelist', () => {
    const violations = checkFamily('demo', [
      { id: 'std', label: '标准版' },
      { id: 'vip', label: '尊享版' },
    ])
    assert.deepEqual(rules(violations), ['LABEL_NOT_ALLOWED'])
  })

  it('rejects a duplicated tier word inside one family', () => {
    const violations = checkFamily('demo', [
      { id: 'std', label: '标准版' },
      { id: 'a', label: '旗舰版' },
      { id: 'b', label: '旗舰版' },
    ])
    assert.deepEqual(rules(violations), ['LABEL_DUPLICATE_TIER'])
  })

  it('rejects a family without the baseline tier', () => {
    const violations = checkFamily('demo', [{ id: 'fast', label: '极速版' }])
    assert.deepEqual(rules(violations), ['STANDARD_LABEL_MISSING'])
  })

  it('rejects separators and the 档 suffix in labels', () => {
    assert.deepEqual(rules(checkFamily('demo', [{ id: 'a', label: '工作流·高速档' }])), [
      'LABEL_NOT_ALLOWED',
      'LABEL_SHAPE_INVALID',
      'STANDARD_LABEL_MISSING',
    ])
  })

  it('rejects a product-authored label that describes its own price', () => {
    const violations = checkFamily('demo', [
      { id: 'std', label: '标准版' },
      { id: 'cheap', label: '¥2.85/秒' },
    ])
    assert.ok(rules(violations).includes('LABEL_PRICE_SELF_DESCRIPTION'))
  })

  it('ignores disabled groups', () => {
    const violations = checkFamily('demo', [
      { id: 'std', label: '标准版' },
      { id: 'legacy', label: '号池版', enabled: false },
    ])
    assert.deepEqual(violations, [])
  })

  it('keeps the banned word list non-empty', () => {
    assert.ok(FORBIDDEN_WORDS.length >= 10)
    assert.ok(FORBIDDEN_WORDS.includes('AutoDL'))
  })

  it('detects a mirror drift against the hub', () => {
    const canvasRows = { video: [{ id: 'seedance-2-0', channelGroups: [{ id: 'standard', label: '标准版', badge: '改过的文案' }] }] }
    const directoryRows = { video: [{ id: 'seedance-2-0', channelGroups: [{ id: 'standard', label: '标准版', badge: '官方原生专线 · 按秒计费' }] }] }
    assert.deepEqual(rules(checkCanvasNames(canvasRows, directoryRows)), ['CANVAS_NAME_DRIFT'])
    assert.deepEqual(checkCanvasNames(directoryRows, directoryRows), [])
  })

  it('only exempts gateway-published lines from the tier whitelist', () => {
    const projected = {
      'demo-model': [
        { id: 'standard', wireGroup: 'default', label: '标准版', enabled: true },
        { id: 'gateway-line', wireGroup: 'gw-x', label: 'Nano Banana 2 Lite 低价版（经济跑量）', enabled: true },
      ],
    }
    const overrides = { 'demo-model': [{ id: 'standard', wireGroup: 'default', label: '标准版' }] }
    const report = checkProjectedCatalog(projected, overrides)
    assert.deepEqual(report.violations, [], 'the gateway-published name is not product-authored, so the whitelist does not apply')
    assert.equal(report.authoredCount, 1)
    assert.equal(report.gatewayCount, 1)
    // 但产品自己起的名必须受白名单约束。
    const strict = checkProjectedCatalog(
      { 'demo-model': [{ id: 'standard', wireGroup: 'default', label: '尊享版', enabled: true }] },
      overrides,
    )
    assert.ok(rules(strict.violations).includes('LABEL_NOT_ALLOWED'))
  })

  it('requires the baseline tier name to stay canonical', () => {
    assert.equal(REQUIRED_LABEL, '标准版')
  })

  it('keeps the rule engine reachable for direct family checks', () => {
    assert.deepEqual(checkCatalog({ demo: [{ id: 'std', label: '标准版' }] }), [])
  })
})
