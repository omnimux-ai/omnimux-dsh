import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  checkCatalog,
  checkFamily,
  checkMirror,
  ALLOWED_LABELS,
  FORBIDDEN_WORDS,
  MIRROR_PATH,
  REQUIRED_LABEL,
} from './verify-channel-group-naming.mjs'
import { MODEL_CHANNEL_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js'

const rules = (violations) => violations.map((v) => v.rule)

describe('channel group naming gate', () => {
  it('passes on the live catalog and canvas mirror', () => {
    const mirrorText = readFileSync(MIRROR_PATH, 'utf8')
    assert.deepEqual(checkCatalog(MODEL_CHANNEL_GROUPS), [])
    assert.deepEqual(checkMirror(MODEL_CHANNEL_GROUPS, mirrorText), [])
  })

  it('covers every enabled group of the catalog', () => {
    const enabled = Object.values(MODEL_CHANNEL_GROUPS)
      .flat()
      .filter((g) => g.enabled !== false)
    assert.ok(enabled.length >= 30)
    for (const g of enabled) {
      assert.ok(ALLOWED_LABELS.includes(g.label), `${g.id} label「${g.label}」需在白名单内`)
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
    const violations = checkMirror(MODEL_CHANNEL_GROUPS, '"label": "标准版",')
    assert.deepEqual(rules(violations), ['MIRROR_MISMATCH', 'MIRROR_MISMATCH'])
  })

  it('requires the baseline tier name to stay canonical', () => {
    assert.equal(REQUIRED_LABEL, '标准版')
  })
})
