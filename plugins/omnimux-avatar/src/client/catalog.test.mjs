// catalog 纯逻辑回归：三级选择器投影与自动渠道选择。
// 数据来源已变更（见 lib/catalog.js 顶部说明）：这里用一份手写的、与真实中枢目录同形
// 的夹具，验证 品牌 / 模型 / 渠道 三层的投影规则。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  BRAND_NAME_MAP,
  brandsOf,
  groupsOfModel,
  imageModels,
  modelsOfBrand,
  pickAutoGroup,
  vendorName,
} from './lib/catalog.js'

/** 与中枢 /omnimux/model-catalog 的 image 行同形（含 family / channelGroups）。 */
const ROWS = [
  {
    id: 'gpt-image-2.5',
    label: 'GPT Image 2.5',
    badge: '新品',
    subtitle: '标准版 1K · 高分档依渠道',
    family: 'openai',
    channelGroups: [
      {
        id: 'pro',
        label: '旗舰版',
        badge: '原生高分 · 独立线路',
        wireGroup: 'gpt-image-2.5-pro',
        enabled: true,
        pricing: { pointsEstimate: 0.036765, discountRate: 0.281248, billingMode: 'per_task' },
      },
      {
        id: 'standard',
        label: '标准版',
        default: true,
        enabled: true,
        wireGroup: 'default',
        pricing: { pointsEstimate: 0.13072, discountRate: 1, billingMode: 'per_task' },
      },
      {
        id: 'economy',
        label: '经济版',
        enabled: true,
        wireGroup: 'gpt-image-2.5-economy',
        pricing: { pointsEstimate: 0.0147, discountRate: 0.112455, billingMode: 'per_task' },
      },
    ],
  },
  {
    id: 'seedance-2-5',
    label: 'Seedance 2.5',
    family: 'bytedance',
    channelGroups: [
      { id: 'official', label: '官方版', wireGroup: 'seedance-official', enabled: true, pricing: { billingMode: 'per_second' } },
    ],
  },
  {
    id: 'minimax-h3',
    label: 'MiniMax H3',
    family: 'minimax',
    channelGroups: [],
  },
  {
    id: 'custom-thing',
    label: 'Custom Thing',
    channelGroups: [
      { id: 'disabled', label: '已停用', enabled: false, wireGroup: 'custom-disabled' },
      { id: 'live', label: '可用', enabled: true, wireGroup: 'custom-live' },
    ],
  },
]

describe('imageModels', () => {
  it('returns the catalog image rows', () => {
    assert.equal(imageModels({ image: ROWS }).length, ROWS.length)
  })

  it('returns an empty list for a missing or malformed catalog', () => {
    assert.deepEqual(imageModels(undefined), [])
    assert.deepEqual(imageModels(null), [])
    assert.deepEqual(imageModels({}), [])
    assert.deepEqual(imageModels({ image: 'nope' }), [])
  })
})

describe('brandsOf', () => {
  it('groups rows by family, in catalog order, without duplicates', () => {
    const brands = brandsOf([...ROWS, ROWS[0]])
    assert.deepEqual(brands.map((b) => b.id), ['openai', 'seedance', 'minimax', 'common'])
    assert.deepEqual(brands.map((b) => b.name), ['OpenAI', 'Seedance', 'MiniMax', '通用'])
  })

  it('maps bytedance and seedance onto one brand', () => {
    const brands = brandsOf([
      { id: 'a', label: 'A', family: 'bytedance' },
      { id: 'b', label: 'B', family: 'seedance' },
    ])
    assert.deepEqual(brands, [{ id: 'seedance', name: 'Seedance' }])
  })

  it('skips rows without an id', () => {
    assert.deepEqual(brandsOf([{ label: 'x' }, null]), [])
  })
})

describe('modelsOfBrand', () => {
  it('returns that brand rows with a readable name and description', () => {
    const models = modelsOfBrand(ROWS, 'openai')
    assert.equal(models.length, 1)
    assert.equal(models[0].id, 'gpt-image-2.5')
    assert.equal(models[0].name, 'GPT Image 2.5')
    assert.equal(models[0].desc, '标准版 1K · 高分档依渠道')
    assert.equal(models[0].raw, ROWS[0])
  })

  it('falls back to the badge then to a default description', () => {
    assert.equal(modelsOfBrand(ROWS, 'seedance')[0].desc, '执行中枢精选模型')
    assert.equal(
      modelsOfBrand([{ id: 'x', label: 'X', badge: 'H3' }], 'common')[0].desc,
      'H3'
    )
  })

  it('returns nothing for an unknown brand', () => {
    assert.deepEqual(modelsOfBrand(ROWS, 'nope'), [])
  })
})

describe('groupsOfModel', () => {
  it('projects the channel rows the picker renders', () => {
    const groups = groupsOfModel(ROWS, 'gpt-image-2.5')
    assert.equal(groups.length, 3)
    assert.deepEqual(groups.map((g) => g.id), ['pro', 'standard', 'economy'])
    assert.equal(groups[1].isDefault, true)
    assert.equal(groups[0].isDefault, false)
    assert.equal(groups[1].wireGroup, 'default')
    assert.equal(groups[0].wireGroup, 'gpt-image-2.5-pro')
    assert.equal(groups[0].tag, '原生高分 · 独立线路')
    assert.equal(groups[0].billing, '按条计费')
    assert.equal(groups[0].price, '≈0.036765 积分')
    assert.equal(groups[0].discount, '3 折')
    assert.equal(groups[2].ratio, '')
  })

  it('labels per-second billing and marks the default price fallback', () => {
    const [group] = groupsOfModel(ROWS, 'seedance-2-5')
    assert.equal(group.billing, '按秒计费')
    assert.equal(group.tag, '按秒计费')
    assert.equal(group.price, '按量计费')
    assert.equal(group.enabled, true)
  })

  it('returns an empty list when the row exposes no group list', () => {
    assert.deepEqual(groupsOfModel(ROWS, 'minimax-h3'), [])
    assert.deepEqual(groupsOfModel(ROWS, 'missing'), [])
  })
})

describe('pickAutoGroup', () => {
  it('prefers the group marked default', () => {
    const groups = groupsOfModel(ROWS, 'gpt-image-2.5')
    assert.equal(pickAutoGroup(groups), 'standard')
  })

  it('falls back to the first enabled group when none is marked default', () => {
    const groups = groupsOfModel(ROWS, 'custom-thing')
    assert.equal(pickAutoGroup(groups), 'live')
  })

  it('returns an empty string when there is nothing to pick', () => {
    assert.equal(pickAutoGroup([]), '')
    assert.equal(pickAutoGroup(undefined), '')
    assert.equal(pickAutoGroup([{ id: 'off', enabled: false }]), '')
  })

  it('falls back to the first enabled group when the marked default is disabled', () => {
    const groups = [
      { id: 'off', enabled: false, isDefault: true },
      { id: 'on', enabled: true, isDefault: false },
    ]
    assert.equal(pickAutoGroup(groups), 'on')
  })
})

describe('vendorName', () => {
  it('resolves a brand display name and falls back for an unknown id', () => {
    const brands = brandsOf(ROWS)
    assert.equal(vendorName(brands, 'openai'), 'OpenAI')
    assert.equal(vendorName(brands, 'ghost'), 'Vendor ghost')
    assert.equal(vendorName(undefined, 'openai'), 'Vendor openai')
  })

  it('keeps the shared brand name map', () => {
    assert.equal(BRAND_NAME_MAP.bytedance, 'Seedance')
  })
})
