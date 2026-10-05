// randomize 纯逻辑回归：填满、永不冲突、按规则重掷正确分类、依赖与权重。
// 来源：OmniMux/web/src/features/influencer/__tests__/randomize.test.ts（只读真源）。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { randomizeSelection } from './lib/randomize.js'
import { conflictMessage } from './lib/taxonomy.js'

const TIERS = ['normal', 'freak', 'total']
const FREAK_UP = ['freak', 'total']

/** @param {string} id @param {object} [extra] */
function opt(id, extra = {}) {
  return { id, label_en: id, visibleIn: TIERS, ...extra }
}

/** @param {string} id @param {object[]} options @param {number} [max] */
function cat(id, options, max = 1) {
  return { id, label_en: id, kind: 'media', max, options }
}

/** 尽量贴近随插件分发的那份数据集，足以触发全部四条硬冲突与跨分类依赖。 */
const tax = {
  version: 1,
  source: 'test',
  tier_group: { options: [], comingSoonImageUrls: [] },
  category_priority: [],
  categories: [
    cat('gender', [
      opt('male'),
      opt('female'),
      opt('trans_man'),
      opt('trans_woman'),
      opt('non_binary'),
    ]),
    cat('ethnicity_origin_base', [opt('eth_a'), opt('eth_b'), opt('eth_c')]),
    cat('age', [opt('adult'), opt('mature'), opt('senior')]),
    cat('skin_tone', [opt('st_fair'), opt('st_deep')]),
    cat('eye_color', [opt('ec_brown'), opt('ec_blue')]),
    cat('height', [opt('h_average'), opt('h_tall'), opt('h_very_tall')]),
    cat('body_type', [
      opt('body_slim'),
      opt('body_athletic'),
      opt('body_heavy'),
      opt('body_muscular'),
      opt('body_curvy'),
      opt('body_ultra'),
    ]),
    cat(
      'proportions',
      [
        opt('pr_shortlegs'),
        opt('pr_longlimbs'),
        opt('pr_shoulders'),
        opt('pr_waist'),
        opt('pr_egg', { visibleIn: FREAK_UP }),
        opt('pr_potbelly', { visibleIn: FREAK_UP }),
      ],
      2
    ),
    cat('freak_neck', [
      opt('neck_normal'),
      opt('neck_column', { visibleIn: FREAK_UP }),
      opt('neck_long', { visibleIn: FREAK_UP }),
      opt('neck_short'),
    ]),
    cat(
      'freak_face',
      [
        opt('fn_freckles', { slot: 'marks' }),
        opt('fn_thickbrows', { slot: 'brows' }),
        opt('ff_brows_5', { visibleIn: FREAK_UP, slot: 'brows' }),
        opt('ff_teeth_11', { visibleIn: FREAK_UP, slot: 'teeth' }),
      ],
      4
    ),
    cat('facial_hair', [opt('fh_none'), opt('fh_beard')]),
    cat('hair', [opt('hs_lampshade', { visibleIn: FREAK_UP }), opt('hair_bob')]),
    cat('aesthetic', [opt('suits'), opt('retro'), opt('goth')]),
  ],
  prompt_map: { tiers: {}, categories: {} },
}

/** 确定性生成器，使重复运行可复现且无需 mock。 */
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** @param {number} value */
function fixed(value) {
  return () => value
}

/** @param {object} sel @param {string} category */
function firstOf(sel, category) {
  return (sel[category] ?? [])[0] ?? ''
}

const BEARD_OPTIONS = ['fh_beard']
const BROW_OPTIONS = ['fn_thickbrows', 'ff_brows_5']

describe('randomizeSelection', () => {
  it('fills every category that has an option in the tier', () => {
    for (const tier of TIERS) {
      const sel = randomizeSelection(tax, tier, seeded(7))
      for (const c of tax.categories) {
        assert.equal(sel[c.id]?.length, 1, `${tier} ${c.id}`)
      }
    }
  })

  it('never returns a selection that trips a hard conflict', () => {
    for (const tier of TIERS) {
      const random = seeded(11)
      for (let run = 0; run < 4000; run++) {
        const sel = randomizeSelection(tax, tier, random)
        assert.equal(conflictMessage(tier, sel), null, `${tier} run ${run}`)
      }
    }
  })

  it('re-rolls the height instead of blanking the card when heavy meets tall', () => {
    const heavyTall = {
      ...tax,
      categories: [cat('body_type', [opt('body_heavy')]), cat('height', [opt('h_average'), opt('h_tall')])],
    }
    const sel = randomizeSelection(heavyTall, 'normal', seeded(3))
    assert.deepEqual(sel.height, ['h_average'])
    assert.equal(conflictMessage('normal', sel), null)
  })

  it('re-rolls the proportions instead of the build for the short-limb rule', () => {
    const buildLimb = {
      ...tax,
      categories: [
        cat('body_type', [opt('body_muscular')]),
        cat('proportions', [opt('pr_shortlegs'), opt('pr_longlimbs'), opt('pr_shoulders')], 2),
      ],
    }
    const sel = randomizeSelection(buildLimb, 'freak', fixed(0))
    assert.deepEqual(sel.body_type, ['body_muscular'])
    assert.deepEqual(sel.proportions, ['pr_shoulders'])
    assert.equal(conflictMessage('freak', sel), null)

    // 同一组合在普通档不构成冲突，因此保留首次掷出的短腿。
    const normal = randomizeSelection(buildLimb, 'normal', fixed(0))
    assert.deepEqual(normal.proportions, ['pr_shortlegs'])
    assert.equal(conflictMessage('normal', normal), null)
  })

  it('re-rolls the neck instead of the build when ultra meets a long neck', () => {
    const ultraNeck = {
      ...tax,
      categories: [cat('body_type', [opt('body_ultra')]), cat('freak_neck', [opt('neck_long'), opt('neck_short')])],
    }
    const sel = randomizeSelection(ultraNeck, 'total', seeded(5))
    assert.deepEqual(sel.body_type, ['body_ultra'])
    assert.deepEqual(sel.freak_neck, ['neck_short'])
    assert.equal(conflictMessage('total', sel), null)
  })

  it('re-rolls the face feature instead of the neck when a long neck meets buck teeth', () => {
    const neckTeeth = {
      ...tax,
      categories: [
        cat('freak_neck', [opt('neck_long')]),
        cat('freak_face', [opt('ff_teeth_11', { slot: 'teeth' }), opt('fn_freckles')]),
      ],
    }
    const sel = randomizeSelection(neckTeeth, 'total', seeded(9))
    assert.deepEqual(sel.freak_neck, ['neck_long'])
    assert.deepEqual(sel.freak_face, ['fn_freckles'])
    assert.equal(conflictMessage('total', sel), null)
  })

  it('never gives a beard to a gender that does not grow one', () => {
    const genders = ['female', 'trans_woman', 'non_binary']
    for (const gender of genders) {
      const only = {
        ...tax,
        categories: [cat('gender', [opt(gender)]), cat('facial_hair', [opt('fh_none'), opt('fh_beard')])],
      }
      const sel = randomizeSelection(only, 'total', seeded(13))
      assert.equal(firstOf(sel, 'facial_hair'), 'fh_none', gender)
    }
  })

  it('lets a beard-capable gender roll facial hair', () => {
    const only = {
      ...tax,
      categories: [cat('gender', [opt('male')]), cat('facial_hair', [opt('fh_none'), opt('fh_beard')])],
    }
    assert.deepEqual(randomizeSelection(only, 'total', fixed(0.5)).facial_hair, ['fh_beard'])
  })

  it('drops "no brows" when a brow feature is already picked', () => {
    const only = {
      ...tax,
      categories: [
        cat('freak_face', [opt('fn_thickbrows', { slot: 'brows' })]),
        cat('distinctive', [opt('df_nobrows'), opt('df_scar')]),
      ],
    }
    assert.deepEqual(randomizeSelection(only, 'total', fixed(0.1)).distinctive, ['df_scar'])
  })

  it('drops the brow feature when "no brows" is already picked', () => {
    const only = {
      ...tax,
      categories: [
        cat('distinctive', [opt('df_nobrows')]),
        cat('freak_face', [opt('fn_thickbrows', { slot: 'brows' }), opt('fn_freckles')]),
      ],
    }
    const sel = randomizeSelection(only, 'total', fixed(0.1))
    assert.deepEqual(sel.distinctive, ['df_nobrows'])
    assert.deepEqual(sel.freak_face, ['fn_freckles'])
  })

  it('keeps "no brows" and a brow feature apart on every run', () => {
    const random = seeded(17)
    for (let run = 0; run < 4000; run++) {
      const sel = randomizeSelection(tax, 'total', random)
      const hasNoBrows = firstOf(sel, 'distinctive') === 'df_nobrows'
      const brow = firstOf(sel, 'freak_face')
      if (hasNoBrows) assert.ok(!BROW_OPTIONS.includes(brow), `run ${run}`)
    }
  })

  it('excludes curvy in every tier and ultra in the average tier', () => {
    for (const tier of TIERS) {
      const random = seeded(19)
      for (let run = 0; run < 2000; run++) {
        const body = firstOf(randomizeSelection(tax, tier, random), 'body_type')
        assert.notEqual(body, 'body_curvy', `${tier} run ${run}`)
        if (tier === 'normal') assert.notEqual(body, 'body_ultra', `normal run ${run}`)
      }
    }
  })

  it('follows the upstream weighting for gender, aesthetic and hair', () => {
    const runs = 20000
    const gender = { male: 0, female: 0 }
    const aesthetic = { suits: 0, retro: 0 }
    let lampshade = 0
    const random = seeded(23)
    for (let run = 0; run < runs; run++) {
      const sel = randomizeSelection(tax, 'total', random)
      gender[firstOf(sel, 'gender')] += 1
      aesthetic[firstOf(sel, 'aesthetic')] += 1
      if (firstOf(sel, 'hair') === 'hs_lampshade') lampshade += 1
    }
    assert.ok(gender.male / runs > 0.65)
    assert.ok(gender.male / runs < 0.69)
    assert.ok(aesthetic.suits / runs > 0.38)
    assert.ok(aesthetic.suits / runs < 0.42)
    assert.ok(aesthetic.retro / runs > 0.18)
    assert.ok(aesthetic.retro / runs < 0.22)
    assert.ok(lampshade / runs > 0.18)
    assert.ok(lampshade / runs < 0.22)
  })

  it('never picks a category whose options are all invisible in the tier', () => {
    const freakOnly = {
      ...tax,
      categories: [
        cat('gender', [opt('male'), opt('female')]),
        cat('aesthetic', [opt('goth', { visibleIn: ['freak'] })]),
      ],
    }
    const sel = randomizeSelection(freakOnly, 'normal', seeded(29))
    assert.equal(sel.aesthetic, undefined)
    assert.equal(sel.gender?.length, 1)
  })

  it('drops a category only when the tier leaves no compatible option', () => {
    const impossible = {
      ...tax,
      categories: [cat('body_type', [opt('body_heavy')]), cat('height', [opt('h_tall')])],
    }
    const sel = randomizeSelection(impossible, 'normal', seeded(31))
    assert.equal(sel.height, undefined)
    assert.equal(conflictMessage('normal', sel), null)
  })

  it('keeps beards off every non-beard gender across many runs', () => {
    const random = seeded(37)
    for (let run = 0; run < 4000; run++) {
      const sel = randomizeSelection(tax, 'total', random)
      const gender = firstOf(sel, 'gender')
      if (gender !== 'male' && gender !== 'trans_man') {
        assert.ok(!BEARD_OPTIONS.includes(firstOf(sel, 'facial_hair')), `run ${run} gender ${gender}`)
      }
    }
  })
})
