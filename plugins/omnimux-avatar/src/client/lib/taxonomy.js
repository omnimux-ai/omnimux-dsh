// 形象分类数据集的纯逻辑：查找、可见性、硬冲突、点选语义与计数。
//
// 来源：OmniMux/web/src/features/influencer/lib/taxonomy.ts（只读真源），行为 1:1。
// 注意：trySelect 的「先选者胜」上限语义与真源一致；服务端用的是「后选者胜」，
// 客户端副本必须保留真源行为，因为界面就是这个行为。

/**
 * 按 id 查分类。
 * @param {import('./types.js').InfluencerCategory[]} cats
 * @param {string} id
 * @returns {import('./types.js').InfluencerCategory|undefined}
 */
export function catById(cats, id) {
  return cats.find((c) => c.id === id)
}

/**
 * 按 id 在指定分类内查选项。
 * @param {import('./types.js').InfluencerCategory[]} cats
 * @param {string} catId
 * @param {string} optId
 * @returns {import('./types.js').InfluencerOption|undefined}
 */
export function optById(cats, catId, optId) {
  const c = catById(cats, catId)
  return c?.options.find((o) => o.id === optId)
}

/**
 * 某分类在当前档位下可见的选项。
 * @param {import('./types.js').InfluencerCategory} c
 * @param {string} tier
 * @returns {import('./types.js').InfluencerOption[]}
 */
export function visOpts(c, tier) {
  return c.options.filter((o) => o.visibleIn.includes(tier))
}

/** @param {string[]|undefined} arr @param {string} v */
function includes(arr, v) {
  return !!arr && arr.includes(v)
}

/** @param {import('./types.js').Selection} sel @param {string} cat @param {string} opt */
function has(sel, cat, opt) {
  return includes(sel[cat], opt)
}

/** @param {import('./types.js').Selection} sel @param {string} cat @param {string[]} opts */
function hasAny(sel, cat, opts) {
  return (sel[cat] ?? []).some((v) => opts.includes(v))
}

/**
 * @typedef {object} ConflictRule
 * @property {string} id 供测试与诊断使用的稳定 id
 * @property {string} message 英文消息键，调用方自行包 t()
 * @property {(tier: string, sel: import('./types.js').Selection) => boolean} hits
 * @property {{ category: string, avoid: string[] }} reroll 随机器为清除该规则要重掷的分类，以及必须避开的选项
 */

/**
 * 4 条硬冲突：上游冲突表 2 条 + 同一规则集的脖颈/牙齿互斥 2 条。
 * 唯一真源：手工选择器读 `message`，随机器读 `reroll`。
 * @type {ConflictRule[]}
 */
export const CONFLICT_RULES = [
  {
    id: 'heavy_no_tall',
    message: 'Heavy build cannot be combined with Tall or Very tall.',
    hits: (_, sel) =>
      has(sel, 'body_type', 'body_heavy') && hasAny(sel, 'height', ['h_tall', 'h_very_tall']),
    reroll: { category: 'height', avoid: ['h_tall', 'h_very_tall'] },
  },
  {
    id: 'build_no_shortlimb',
    message: 'This build cannot be combined with Short legs or Long limbs in this mode.',
    hits: (tier, sel) =>
      tier !== 'normal' &&
      hasAny(sel, 'body_type', ['body_heavy', 'body_muscular', 'body_ultra']) &&
      hasAny(sel, 'proportions', ['pr_shortlegs', 'pr_longlimbs']),
    reroll: { category: 'proportions', avoid: ['pr_shortlegs', 'pr_longlimbs'] },
  },
  {
    id: 'ultra_no_longneck',
    message: 'Extreme muscular build cannot be combined with Long neck.',
    hits: (_, sel) => has(sel, 'body_type', 'body_ultra') && has(sel, 'freak_neck', 'neck_long'),
    reroll: { category: 'freak_neck', avoid: ['neck_long'] },
  },
  {
    id: 'longneck_no_buckteeth',
    message: 'Long neck cannot be combined with Buck teeth.',
    hits: (_, sel) => has(sel, 'freak_neck', 'neck_long') && has(sel, 'freak_face', 'ff_teeth_11'),
    reroll: { category: 'freak_face', avoid: ['ff_teeth_11'] },
  },
]

/**
 * 冲突文案的中文翻译表，键为英文原文（即 CONFLICT_RULES[].message）。
 * 真源把翻译放在 i18n 语言包里；插件端不引入该语言包，改为在本模块内自带一份，
 * 并由 taxonomy.test.mjs 断言「每条英文消息都有非空中文」。
 * @type {Record<string, string>}
 */
export const CONFLICT_MESSAGES_ZH = {
  'Heavy build cannot be combined with Tall or Very tall.':
    '壮硕体型不能与「高」或「很高」同时选择。',
  'This build cannot be combined with Short legs or Long limbs in this mode.':
    '该体型在当前档位不能与「短腿」或「长四肢」同时选择。',
  'Extreme muscular build cannot be combined with Long neck.':
    '极限肌肉体型不能与「长脖子」同时选择。',
  'Long neck cannot be combined with Buck teeth.':
    '长脖子不能与「龅牙」同时选择。',
}

/**
 * 当前选择命中的第一条冲突规则，无冲突返回 null。
 * @param {string} tier
 * @param {import('./types.js').Selection} sel
 * @returns {ConflictRule|null}
 */
export function findConflict(tier, sel) {
  for (const rule of CONFLICT_RULES) {
    if (rule.hits(tier, sel)) return rule
  }
  return null
}

/**
 * 冲突文案，无冲突返回 null。
 * @param {string} tier
 * @param {import('./types.js').Selection} sel
 * @returns {string|null}
 */
export function conflictMessage(tier, sel) {
  return findConflict(tier, sel)?.message ?? null
}

/**
 * @typedef {object} TrySelectResult
 * @property {import('./types.js').Selection} selection
 * @property {string|null} message
 */

/**
 * 按演示版语义点选一个选项：分类上限（先选者胜）、多选分类内的同槽位替换、
 * acc_none 互斥，以及硬冲突闸门。
 * @param {import('./types.js').InfluencerCategory[]} cats
 * @param {string} tier
 * @param {import('./types.js').Selection} sel
 * @param {string} catId
 * @param {string} optId
 * @returns {TrySelectResult}
 */
export function trySelect(cats, tier, sel, catId, optId) {
  const c = catById(cats, catId)
  if (!c) return { selection: sel, message: 'Unknown category.' }
  const opt = optById(cats, catId, optId)
  if (!opt) return { selection: sel, message: 'Unknown option.' }

  const cur = [...(sel[catId] ?? [])]
  /** @type {string[]} */
  let next
  if (cur.includes(optId)) {
    next = cur.filter((x) => x !== optId)
  } else {
    const maxN = c.max > 0 ? c.max : 1
    if (maxN === 1 || (catId === 'accessory' && optId === 'acc_none')) {
      next = [optId]
    } else {
      const kept = cur.filter((id) => {
        if (catId === 'accessory' && id === 'acc_none') return false
        if (!opt.slot) return true
        const po = optById(cats, catId, id)
        return po?.slot !== opt.slot
      })
      next = kept.length >= maxN ? kept : [...kept, optId]
    }
  }
  /** @type {import('./types.js').Selection} */
  const trial = { ...sel }
  if (next.length) trial[catId] = next
  else delete trial[catId]

  const msg = conflictMessage(tier, trial)
  if (msg) return { selection: sel, message: msg }
  return { selection: trial, message: null }
}

/**
 * 切换档位时丢弃在新档位不可见的已选项，并返回被丢弃项的标签供提示使用。
 * @param {import('./types.js').InfluencerCategory[]} cats
 * @param {string} tier
 * @param {import('./types.js').Selection} sel
 * @returns {{ selection: import('./types.js').Selection, dropped: string[] }}
 */
export function filterSelectionForTier(cats, tier, sel) {
  /** @type {import('./types.js').Selection} */
  const out = {}
  /** @type {string[]} */
  const dropped = []
  for (const c of cats) {
    const picks = sel[c.id]
    if (!picks?.length) continue
    const ok = picks.filter((id) => {
      const o = optById(cats, c.id, id)
      const visible = !!o && o.visibleIn.includes(tier)
      if (!visible) dropped.push(o?.label_en ?? id)
      return visible
    })
    if (ok.length) out[c.id] = ok
  }
  return { selection: out, dropped }
}

/**
 * 某分类当前选中数量。
 * @param {import('./types.js').Selection} sel
 * @param {string} catId
 * @returns {number}
 */
export function selectedCount(sel, catId) {
  return (sel[catId] ?? []).length
}

/**
 * 全部已选数量。
 * @param {import('./types.js').Selection} sel
 * @returns {number}
 */
export function totalSelected(sel) {
  return Object.values(sel).reduce((n, arr) => n + arr.length, 0)
}

/**
 * 已选项的标签列表，按分类顺序。
 * @param {import('./types.js').InfluencerCategory[]} cats
 * @param {import('./types.js').Selection} sel
 * @returns {string[]}
 */
export function selectedLabels(cats, sel) {
  /** @type {string[]} */
  const out = []
  for (const c of cats) {
    for (const id of sel[c.id] ?? []) {
      out.push(optById(cats, c.id, id)?.label_en ?? id)
    }
  }
  return out
}
