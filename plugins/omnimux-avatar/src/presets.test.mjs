// 预设快照契约测试：可用性、素材路径、参数行渲染与四类拒绝分支。
import test from 'node:test'
import assert from 'node:assert/strict'

import { CategoryByID, OptionByID, Taxonomy } from './taxonomy.js'
import {
  PresetSnapshot,
  presetParamRows,
  resolvePresetSelection,
  usablePresets,
} from './presets.js'

const ASSET_PATH = /^\/influencer-presets\/[0-9a-f]+\.webp$/

test('快照含 35 条预设，且全部可在随包数据集上完整复现', () => {
  const tax = Taxonomy()
  const items = PresetSnapshot().items
  assert.equal(items.length, 35)
  assert.equal(usablePresets(tax).length, 35)
  for (const preset of items) {
    assert.notEqual(resolvePresetSelection(preset, tax), null, `${preset.id} 未能复现`)
  }
})

test('预设 id 唯一', () => {
  const ids = PresetSnapshot().items.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('每条素材路径符合约定且宽高为正', () => {
  for (const preset of PresetSnapshot().items) {
    for (const key of ['preview', 'sheet']) {
      const asset = preset[key]
      assert.ok(asset, `${preset.id} 缺少 ${key}`)
      assert.match(asset.path, ASSET_PATH, `${preset.id}.${key} 路径不合规`)
      assert.ok(asset.width > 0 && asset.height > 0, `${preset.id}.${key} 宽高非正`)
    }
  }
})

test('presetParamRows 输出标签而非 id，并按 category_priority 排序', () => {
  const tax = Taxonomy()
  const preset = PresetSnapshot().items[0]
  const resolved = resolvePresetSelection(preset, tax)
  const rows = presetParamRows(preset, tax)

  assert.equal(rows.length, Object.keys(resolved).length)
  assert.equal(rows[0].categoryId, 'gender')
  assert.equal(rows[0].label, CategoryByID('gender').label_en)
  assert.notEqual(rows[0].label, 'gender')
  assert.equal(rows[0].options[0], OptionByID('gender', resolved.gender[0]).label_en)
  assert.notEqual(rows[0].options[0], resolved.gender[0])

  // 该预设覆盖全部五个优先分类，前五行顺序应与 category_priority 完全一致。
  assert.deepEqual(
    rows.slice(0, tax.category_priority.length).map((r) => r.categoryId),
    tax.category_priority
  )
})

test('presetParamRows 对全部预设都满足优先级单调不减', () => {
  const tax = Taxonomy()
  const rank = (id) => {
    const index = tax.category_priority.indexOf(id)
    return index < 0 ? 99 : index
  }
  for (const preset of PresetSnapshot().items) {
    const rows = presetParamRows(preset, tax)
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(
        rank(rows[i - 1].categoryId) <= rank(rows[i].categoryId),
        `${preset.id} 排序错误: ${rows[i - 1].categoryId} -> ${rows[i].categoryId}`
      )
    }
    for (const row of rows) {
      const category = CategoryByID(row.categoryId)
      assert.equal(row.label, category.label_en)
      for (let i = 0; i < row.options.length; i += 1) {
        const id = resolvePresetSelection(preset, tax)[row.categoryId][i]
        assert.equal(row.options[i], OptionByID(row.categoryId, id).label_en)
      }
    }
  }
})

test('未知分类返回 null', () => {
  const tax = Taxonomy()
  const base = PresetSnapshot().items[0]
  assert.equal(
    resolvePresetSelection({ ...base, selection: { ...base.selection, nope: ['x'] } }, tax),
    null
  )
})

test('档位不可见的选项返回 null', () => {
  const tax = Taxonomy()
  const base = PresetSnapshot().items.find((p) => p.tier === 'freak')
  assert.ok(base, '需要一条 freak 档位预设')
  // head_ancient 仅在 total 档位可见。
  assert.equal(
    resolvePresetSelection({ ...base, selection: { gender: ['male'], freak_head: ['head_ancient'] } }, tax),
    null
  )
})

test('档位不匹配返回 null', () => {
  const tax = Taxonomy()
  const base = PresetSnapshot().items[0]
  assert.equal(resolvePresetSelection({ ...base, tier: 'notatier' }, tax), null)
  // 合法档位但选项在该档位不可见。
  const normal = PresetSnapshot().items.find((p) => p.tier === 'normal')
  assert.ok(normal, '需要一条 normal 档位预设')
  assert.equal(
    resolvePresetSelection({ ...normal, selection: { gender: ['male'], freak_neck: ['neck_long'] } }, tax),
    null
  )
})

test('超过分类上限返回 null', () => {
  const tax = Taxonomy()
  const base = PresetSnapshot().items[0]
  // gender 的 max 为 1，提交两项即超限。
  assert.equal(CategoryByID('gender').max, 1)
  assert.equal(
    resolvePresetSelection({ ...base, selection: { gender: ['male', 'female'] } }, tax),
    null
  )
})

test('空选择集返回 null', () => {
  const tax = Taxonomy()
  const base = PresetSnapshot().items[0]
  assert.equal(resolvePresetSelection({ ...base, selection: {} }, tax), null)
})

test('usablePresets 在缺少数据集时返回空数组', () => {
  assert.deepEqual(usablePresets(null), [])
  assert.deepEqual(usablePresets(undefined), [])
})
