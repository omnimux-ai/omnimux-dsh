// presets 纯逻辑回归：套用解析、可用性过滤、参数行，以及对随插件分发快照的不变量检查。
// 来源：OmniMux/web/src/features/influencer/__tests__/presets.test.ts（只读真源）。
// 数据来源已变更（见 lib/presets.js 顶部说明）：快照由服务端载荷注入，
// 因此本测试直接从磁盘读取随插件分发的 data/presets.json 与 data/taxonomy.json。

import { readFileSync } from 'node:fs'

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  PRESET_SNAPSHOT,
  presetParamRows,
  resolvePresetSelection,
  setPresetSnapshot,
  usablePresets,
} from './lib/presets.js'

const PRESETS_URL = new URL('../../data/presets.json', import.meta.url)
const TAXONOMY_URL = new URL('../../data/taxonomy.json', import.meta.url)

/** 随插件分发的真实快照。 */
const snapshot = JSON.parse(readFileSync(PRESETS_URL, 'utf8'))

/** 随插件分发的真实数据集。 */
const servedTaxonomy = JSON.parse(readFileSync(TAXONOMY_URL, 'utf8'))

/** @param {object} [overrides] */
function preset(overrides = {}) {
  return {
    id: 'p1',
    name: 'Preset 1',
    preview: { path: '/influencer-presets/a.webp', width: 400, height: 600 },
    sheet: { path: '/influencer-presets/b.webp', width: 1200, height: 700 },
    tier: 'freak',
    selection: { hair: ['hair_bowl'] },
    ...overrides,
  }
}

/** 小型数据集夹具，用于逐条验证解析规则。 */
function taxonomy() {
  return {
    version: 1,
    source: 'test',
    tier_group: {
      options: [
        { id: 'normal', label_en: 'Average', visibleIn: ['normal'] },
        { id: 'freak', label_en: 'Bold', visibleIn: ['freak'] },
      ],
      comingSoonImageUrls: [],
    },
    category_priority: ['gender'],
    categories: [
      {
        id: 'hair',
        label_en: 'Hair',
        kind: 'media',
        max: 1,
        options: [
          { id: 'hair_bowl', label_en: 'Bowl cut', visibleIn: ['freak'] },
          { id: 'hair_buzz', label_en: 'Buzz cut', visibleIn: ['normal'] },
        ],
      },
      {
        id: 'gender',
        label_en: 'Gender',
        kind: 'media',
        max: 1,
        options: [{ id: 'male', label_en: 'Male', visibleIn: ['normal', 'freak'] }],
      },
    ],
    prompt_map: { tiers: {}, categories: {} },
  }
}

describe('resolvePresetSelection', () => {
  it('keeps every pick when the category, option and tier all resolve', () => {
    const resolved = resolvePresetSelection(
      preset({ selection: { gender: ['male'], hair: ['hair_bowl'] } }),
      taxonomy()
    )
    assert.deepEqual(resolved, { gender: ['male'], hair: ['hair_bowl'] })
  })

  it('drops an empty pick list instead of carrying it into the sidebar', () => {
    const resolved = resolvePresetSelection(
      preset({ selection: { hair: ['hair_bowl'], gender: [] } }),
      taxonomy()
    )
    assert.deepEqual(resolved, { hair: ['hair_bowl'] })
  })

  it('refuses the whole preset when a category is unknown', () => {
    assert.equal(
      resolvePresetSelection(
        preset({ selection: { hair: ['hair_bowl'], species: ['elf'] } }),
        taxonomy()
      ),
      null
    )
  })

  it('refuses the whole preset when an option is not visible in its own tier', () => {
    // `hair_buzz` 只在 `normal` 可见，而这个预设声明的是 `freak`。
    assert.equal(
      resolvePresetSelection(preset({ tier: 'freak', selection: { hair: ['hair_buzz'] } }), taxonomy()),
      null
    )
  })

  it('refuses a preset whose tier the taxonomy does not offer', () => {
    assert.equal(resolvePresetSelection(preset({ tier: 'legendary' }), taxonomy()), null)
  })

  it('refuses a preset that exceeds a category pick limit', () => {
    assert.equal(
      resolvePresetSelection(preset({ selection: { hair: ['hair_bowl', 'hair_buzz'] } }), taxonomy()),
      null
    )
  })

  it('refuses a preset with nothing picked at all', () => {
    assert.equal(resolvePresetSelection(preset({ selection: {} }), taxonomy()), null)
  })
})

describe('usablePresets', () => {
  it('returns nothing until the taxonomy has loaded', () => {
    assert.deepEqual(usablePresets(null), [])
  })

  it('returns nothing until the snapshot has been injected', () => {
    setPresetSnapshot(null)
    assert.equal(PRESET_SNAPSHOT.total, 0)
    assert.deepEqual(usablePresets(servedTaxonomy), [])
  })

  it('keeps only the presets that resolve against the served taxonomy', () => {
    setPresetSnapshot(snapshot)
    const all = usablePresets(servedTaxonomy)
    assert.equal(all.length, snapshot.items.length)
    assert.equal(all.length, 35)
    assert.equal(PRESET_SNAPSHOT.total, 35)
    for (const item of all) {
      assert.notEqual(resolvePresetSelection(item, servedTaxonomy), null, item.id)
    }
  })

  it('reports the snapshot provenance it was given', () => {
    setPresetSnapshot(snapshot)
    assert.equal(PRESET_SNAPSHOT.version, snapshot.version)
    assert.equal(PRESET_SNAPSHOT.source, snapshot.source)
    assert.equal(PRESET_SNAPSHOT.fetchedAt, snapshot.fetched_at)
  })
})

describe('presetParamRows', () => {
  it('orders rows by the taxonomy priority and shows labels, not raw ids', () => {
    const rows = presetParamRows(
      preset({ selection: { gender: ['male'], hair: ['hair_bowl'] } }),
      taxonomy()
    )
    assert.deepEqual(rows.map((r) => r.categoryId), ['gender', 'hair'])
    assert.deepEqual(rows[0], { categoryId: 'gender', label: 'Gender', options: ['Male'] })
    assert.deepEqual(rows[1], { categoryId: 'hair', label: 'Hair', options: ['Bowl cut'] })
  })

  it('returns no rows for a preset that cannot be applied', () => {
    assert.deepEqual(presetParamRows(preset({ selection: {} }), taxonomy()), [])
  })

  it('falls back to the raw id when a label is missing', () => {
    const rows = presetParamRows(preset({ selection: { hair: ['hair_bowl'] } }), {
      ...taxonomy(),
      categories: [
        {
          id: 'hair',
          label_en: 'Hair',
          kind: 'media',
          max: 1,
          options: [{ id: 'hair_bowl', visibleIn: ['freak'] }],
        },
      ],
    })
    assert.deepEqual(rows, [{ categoryId: 'hair', label: 'Hair', options: ['hair_bowl'] }])
  })
})

describe('preset snapshot on disk', () => {
  const tax = servedTaxonomy

  /** 每个用例都重新注入一次快照，避免依赖用例执行顺序。 */
  function shippedItems() {
    setPresetSnapshot(snapshot)
    return usablePresets(tax)
  }

  it('carries the mirrored catalogue with unique ids', () => {
    const items = shippedItems()
    assert.ok(PRESET_SNAPSHOT.total > 0)
    assert.equal(new Set(items.map((i) => i.id)).size, items.length)
  })

  it('points every asset at our own origin, with real dimensions', () => {
    for (const item of shippedItems()) {
      for (const asset of [item.preview, item.sheet]) {
        assert.equal(asset.path.startsWith('/influencer-presets/'), true, asset.path)
        assert.equal(asset.path.endsWith('.webp'), true, asset.path)
        assert.ok(asset.width > 0, asset.path)
        assert.ok(asset.height > 0, asset.path)
      }
    }
  })

  it('ships a tier and at least one pick for every preset', () => {
    for (const item of shippedItems()) {
      assert.ok(tax.tier_group.options.map((o) => o.id).includes(item.tier), item.id)
      assert.ok(Object.keys(item.selection).length > 0, item.id)
    }
  })

  it('renders readable parameter rows for every shipped preset', () => {
    for (const item of shippedItems()) {
      const rows = presetParamRows(item, tax)
      assert.ok(rows.length > 0, item.id)
      for (const row of rows) {
        assert.ok(row.label && row.label.length > 0, item.id)
        assert.ok(row.options.length > 0, item.id)
      }
    }
  })
})
