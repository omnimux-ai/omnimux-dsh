// taxonomy 纯逻辑回归：可见性、点选语义、档位过滤、计数与冲突文案覆盖。
// 来源：OmniMux/web/src/features/influencer/__tests__/taxonomy.test.ts（只读真源）。

import { readFileSync } from 'node:fs'

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  CONFLICT_MESSAGES_ZH,
  CONFLICT_RULES,
  catById,
  filterSelectionForTier,
  optById,
  selectedCount,
  selectedLabels,
  totalSelected,
  trySelect,
  visOpts,
} from './lib/taxonomy.js'
import { en, zh } from './locales.js'

const TAXONOMY_URL = new URL('../../data/taxonomy.json', import.meta.url)

/** 随插件分发的真实数据集。 */
const taxonomy = JSON.parse(readFileSync(TAXONOMY_URL, 'utf8'))

/** 数据集里全部去重后的 label_en（分类 + 选项）。 */
const TAXONOMY_LABELS = [
  ...new Set(
    taxonomy.categories.flatMap((category) => [
      category.label_en,
      ...category.options.map((option) => option.label_en),
    ])
  ),
]

/** @param {object} partial */
function cat(partial) {
  return { kind: 'media', label_en: partial.id, max: 1, options: [], ...partial }
}

const cats = [
  cat({
    id: 'gender',
    max: 1,
    options: [
      { id: 'male', label_en: 'Male', visibleIn: ['normal', 'freak', 'total'] },
      { id: 'female', label_en: 'Female', visibleIn: ['normal', 'freak', 'total'] },
    ],
  }),
  cat({
    id: 'proportions',
    max: 2,
    options: [
      { id: 'p1', label_en: 'P1', visibleIn: ['normal', 'freak', 'total'] },
      { id: 'p2', label_en: 'P2', visibleIn: ['normal', 'freak', 'total'] },
      { id: 'p3', label_en: 'P3', visibleIn: ['freak', 'total'] },
    ],
  }),
  cat({
    id: 'accessory',
    max: 3,
    options: [
      { id: 'acc_none', label_en: 'None', visibleIn: ['normal', 'freak', 'total'] },
      { id: 'hat', label_en: 'Hat', visibleIn: ['normal', 'freak', 'total'], slot: 'head' },
      { id: 'cap', label_en: 'Cap', visibleIn: ['normal', 'freak', 'total'], slot: 'head' },
      { id: 'glasses', label_en: 'Glasses', visibleIn: ['normal', 'freak', 'total'], slot: 'eyes' },
    ],
  }),
]

describe('visOpts', () => {
  it('returns only options visible in the tier', () => {
    const c = cats[1]
    assert.deepEqual(visOpts(c, 'normal').map((o) => o.id), ['p1', 'p2'])
    assert.deepEqual(visOpts(c, 'total').map((o) => o.id), ['p1', 'p2', 'p3'])
  })
})

describe('trySelect', () => {
  it('single-max category replaces the previous pick', () => {
    const { selection } = trySelect(cats, 'normal', { gender: ['male'] }, 'gender', 'female')
    assert.deepEqual(selection.gender, ['female'])
  })

  it('respects max and keeps first picks', () => {
    const sel = { proportions: ['p1', 'p2'] }
    const { selection } = trySelect(cats, 'normal', sel, 'proportions', 'p3')
    assert.deepEqual(selection.proportions, ['p1', 'p2'])
  })

  it('acc_none is exclusive and clears other accessories', () => {
    const { selection } = trySelect(
      cats,
      'normal',
      { accessory: ['hat', 'glasses'] },
      'accessory',
      'acc_none'
    )
    assert.deepEqual(selection.accessory, ['acc_none'])
  })

  it('picking another accessory clears acc_none', () => {
    const { selection } = trySelect(
      cats,
      'normal',
      { accessory: ['acc_none'] },
      'accessory',
      'hat'
    )
    assert.deepEqual(selection.accessory, ['hat'])
  })

  it('same-slot last-wins', () => {
    const { selection } = trySelect(cats, 'normal', { accessory: ['hat'] }, 'accessory', 'cap')
    assert.deepEqual(selection.accessory, ['cap'])
  })

  it('toggle off removes the pick and deletes empty category', () => {
    const { selection } = trySelect(cats, 'normal', { gender: ['male'] }, 'gender', 'male')
    assert.equal(selection.gender, undefined)
    assert.equal('gender' in selection, false)
  })

  it('rejects a pick that would trip a hard conflict and leaves the selection alone', () => {
    const conflictCats = [
      cat({
        id: 'body_type',
        options: [
          { id: 'body_heavy', label_en: 'Heavy', visibleIn: ['normal', 'freak', 'total'] },
        ],
      }),
      cat({
        id: 'height',
        options: [
          { id: 'h_average', label_en: 'Average', visibleIn: ['normal', 'freak', 'total'] },
          { id: 'h_tall', label_en: 'Tall', visibleIn: ['normal', 'freak', 'total'] },
        ],
      }),
    ]
    const before = { body_type: ['body_heavy'] }
    const { selection, message } = trySelect(conflictCats, 'normal', before, 'height', 'h_tall')
    assert.equal(message, 'Heavy build cannot be combined with Tall or Very tall.')
    assert.deepEqual(selection, before)
  })

  it('reports unknown category and option instead of mutating', () => {
    assert.equal(trySelect(cats, 'normal', {}, 'nope', 'x').message, 'Unknown category.')
    assert.equal(trySelect(cats, 'normal', {}, 'gender', 'nope').message, 'Unknown option.')
  })
})

describe('filterSelectionForTier', () => {
  it('drops options invisible in the new tier and reports labels', () => {
    const { selection, dropped } = filterSelectionForTier(cats, 'normal', {
      proportions: ['p1', 'p3'],
      gender: ['male'],
    })
    assert.deepEqual(selection.proportions, ['p1'])
    assert.deepEqual(selection.gender, ['male'])
    assert.deepEqual(dropped, ['P3'])
  })

  it('falls back to the raw id when a dropped option is unknown', () => {
    const { dropped } = filterSelectionForTier(cats, 'normal', { gender: ['ghost'] })
    assert.deepEqual(dropped, ['ghost'])
  })
})

describe('counts', () => {
  it('selectedCount and totalSelected', () => {
    const sel = { gender: ['male'], accessory: ['hat', 'glasses'] }
    assert.equal(selectedCount(sel, 'accessory'), 2)
    assert.equal(totalSelected(sel), 3)
  })

  it('selectedLabels returns labels in category order', () => {
    const labels = selectedLabels(cats, { accessory: ['hat'], gender: ['male'] })
    assert.ok(labels.includes('Male'))
    assert.ok(labels.includes('Hat'))
    assert.equal(catById(cats, 'gender')?.id, 'gender')
    assert.equal(optById(cats, 'gender', 'male')?.label_en, 'Male')
  })
})

describe('conflict rules i18n coverage', () => {
  it('keeps the four English messages unchanged', () => {
    assert.deepEqual(
      CONFLICT_RULES.map((rule) => rule.message),
      [
        'Heavy build cannot be combined with Tall or Very tall.',
        'This build cannot be combined with Short legs or Long limbs in this mode.',
        'Extreme muscular build cannot be combined with Long neck.',
        'Long neck cannot be combined with Buck teeth.',
      ]
    )
  })

  it('carries a non-empty zh translation for every rule', () => {
    for (const rule of CONFLICT_RULES) {
      const zh = CONFLICT_MESSAGES_ZH[rule.message]
      assert.equal(typeof zh, 'string', rule.message)
      assert.ok(zh.length > 0, rule.message)
      assert.notEqual(zh, rule.message, rule.message)
    }
    assert.equal(Object.keys(CONFLICT_MESSAGES_ZH).length, CONFLICT_RULES.length)
  })

  it('gives every rule a stable id and a reroll target', () => {
    assert.equal(new Set(CONFLICT_RULES.map((rule) => rule.id)).size, CONFLICT_RULES.length)
    for (const rule of CONFLICT_RULES) {
      assert.equal(typeof rule.reroll.category, 'string')
      assert.ok(Array.isArray(rule.reroll.avoid) && rule.reroll.avoid.length > 0)
    }
  })
})

// 数据集标签的中文覆盖回归：taxonomy.json 只带英文 label_en，组件按
// t(label_en) 取词，所以每个 label_en 都必须在 zh 词典里给出中文。
describe('taxonomy labels · zh coverage', () => {
  it('collects a non-empty label set from the shipped dataset', () => {
    assert.ok(TAXONOMY_LABELS.length > 0)
    assert.equal(new Set(TAXONOMY_LABELS).size, TAXONOMY_LABELS.length)
  })

  it('carries a distinct zh translation for every category and option label', () => {
    for (const label of TAXONOMY_LABELS) {
      const text = zh.translation[label]
      assert.equal(typeof text, 'string', label)
      assert.ok(text.length > 0, label)
      assert.notEqual(text, label, label)
    }
  })

  it('registers an identity en entry for every label', () => {
    for (const label of TAXONOMY_LABELS) {
      assert.equal(en.translation[label], label, label)
    }
  })

  it('keeps zh and en key sets at the same size', () => {
    assert.equal(Object.keys(zh.translation).length, Object.keys(en.translation).length)
  })
})
