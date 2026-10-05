// 加权随机器：按数据集自带的 randomize 画像掷点，并保证结果永不违反硬冲突。
//
// 来源：OmniMux/web/src/features/influencer/lib/randomize.ts（只读真源），行为 1:1。

import { catById, findConflict, visOpts } from './taxonomy.js'

/** 可注入的随机源，便于测试固定结果；生产用 Math.random。 */
/** @typedef {() => number} RandomSource */

/**
 * 数据集 `rules.randomize` 画像里的加权项：选项 id → 概率；
 * 剩余概率在分类里其余可选项之间均分。
 * @type {Record<string, Record<string, number>>}
 */
const WEIGHTS = {
  gender: { male: 0.67, female: 0.33 },
  aesthetic: { suits: 0.4, retro: 0.2 },
  hair: { hs_lampshade: 0.2 },
}

/** 该画像永不掷出的选项（按分类）。 @type {Record<string, string[]>} */
const NEVER_ROLLED = {
  body_type: ['body_curvy'],
}

/** 仅 Bold 与 Extreme 档位会掷出的选项。 @type {Record<string, string[]>} */
const NEVER_ROLLED_NORMAL = {
  body_type: ['body_ultra'],
}

/** 会被其他分类读取的分类；先掷，保证读取时值已确定。 */
const DEPENDENCY_ROOTS = new Set(['gender'])

const BEARD_GENDERS = ['male', 'trans_man']

const BEARD_OPTIONS = [
  'fh_stubble',
  'fh_beard',
  'fh_goatee',
  'fh_moustache',
  'fh_pencil',
  'fh_pushbroom',
  'fh_braid',
]

/** 占用眉槽的面部特征。 */
const BROW_OPTIONS = ['fn_thickbrows', 'ff_brows_5', 'ff_brows_6', 'ff_brows_7']

/**
 * @typedef {object} Dependency
 * @property {string} category
 * @property {string} reason 规则存在的原因，与规则写在一起以免重构后丢失
 * @property {(sel: import('./types.js').Selection) => string[]} drop 当前选择下要从该分类池中剔除的选项 id
 */

/**
 * 数据集本身未编码的跨分类依赖：每条规则指明一个分类，以及「别的分类已掷出某项后
 * 该分类不再可选的选项」。眉槽那一对双向都列出，使结果不依赖分类顺序。
 * @type {Dependency[]}
 */
const DEPENDENCIES = [
  {
    category: 'facial_hair',
    reason: 'Beards and moustaches only grow on people who grow them.',
    drop: (sel) => (hasAny(sel, 'gender', BEARD_GENDERS) ? [] : BEARD_OPTIONS),
  },
  {
    category: 'distinctive',
    reason: '“No brows” and a brow feature describe the same feature twice.',
    drop: (sel) => (hasAny(sel, 'freak_face', BROW_OPTIONS) ? ['df_nobrows'] : []),
  },
  {
    category: 'freak_face',
    reason: '“No brows” leaves no brows to style.',
    drop: (sel) => (has(sel, 'distinctive', 'df_nobrows') ? BROW_OPTIONS : []),
  },
]

/** @param {string[]|undefined} arr @param {string} value */
function includes(arr, value) {
  return !!arr && arr.includes(value)
}

/** @param {import('./types.js').Selection} sel @param {string} category @param {string} option */
function has(sel, category, option) {
  return includes(sel[category], option)
}

/** @param {import('./types.js').Selection} sel @param {string} category @param {string[]} options */
function hasAny(sel, category, options) {
  return (sel[category] ?? []).some((value) => options.includes(value))
}

/**
 * 掷点顺序：依赖根分类（gender）优先，其余保持数据集顺序。
 * @param {import('./types.js').InfluencerCategory[]} categories
 * @returns {import('./types.js').InfluencerCategory[]}
 */
function rollOrder(categories) {
  const roots = categories.filter((c) => DEPENDENCY_ROOTS.has(c.id))
  return [...roots, ...categories.filter((c) => !DEPENDENCY_ROOTS.has(c.id))]
}

/**
 * 该分类此刻可掷的选项：档位可见、未被画像禁用、不在 avoid 中、也未被依赖规则取消。
 * 若被过滤空了则回退到档位全量可见集，避免整张卡片留白。
 * @param {import('./types.js').InfluencerCategory} cat
 * @param {string} tier
 * @param {import('./types.js').Selection} sel
 * @param {string[]} avoid
 * @returns {import('./types.js').InfluencerOption[]}
 */
function eligiblePool(cat, tier, sel, avoid) {
  const visible = visOpts(cat, tier)
  const banned = new Set([
    ...(NEVER_ROLLED[cat.id] ?? []),
    ...(tier === 'normal' ? (NEVER_ROLLED_NORMAL[cat.id] ?? []) : []),
    ...avoid,
  ])
  for (const dep of DEPENDENCIES) {
    if (dep.category !== cat.id) continue
    for (const id of dep.drop(sel)) banned.add(id)
  }
  const pool = visible.filter((o) => !banned.has(o.id))
  return pool.length ? pool : visible
}

/**
 * 按 WEIGHTS 从 pool 中抽取；未加权选项均分剩余概率。
 * @param {string} catId
 * @param {import('./types.js').InfluencerOption[]} pool
 * @param {RandomSource} random
 * @returns {import('./types.js').InfluencerOption}
 */
function pickWeighted(catId, pool, random) {
  const weights = WEIGHTS[catId] ?? {}
  const roll = random()
  let acc = 0
  for (const [id, weight] of Object.entries(weights)) {
    acc += weight
    if (roll < acc) {
      const hit = pool.find((o) => o.id === id)
      // 加权项在当前档位可能不可见，此时由剩余集合接管。
      if (hit) return hit
      break
    }
  }
  const rest = pool.filter((o) => !(o.id in weights))
  const draw = rest.length ? rest : pool
  return draw[Math.floor(random() * draw.length)]
}

/** 上限，保证病态规则集也不会空转。 */
const MAX_REPAIR_PASSES = 8

/**
 * 通过重掷规则指定的软分类来清除冲突，使每张卡片保持填满；
 * 只有该分类已无兼容选项时才删除该分类。
 * @param {import('./types.js').InfluencerTaxonomy} tax
 * @param {string} tier
 * @param {import('./types.js').Selection} sel
 * @param {RandomSource} random
 * @returns {import('./types.js').Selection}
 */
function repair(tax, tier, sel, random) {
  /** @type {import('./types.js').Selection} */
  const next = { ...sel }
  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    const conflict = findConflict(tier, next)
    if (!conflict) return next
    const { category, avoid } = conflict.reroll
    const cat = catById(tax.categories, category)
    if (!cat) break
    const usable = eligiblePool(cat, tier, next, avoid).filter((o) => !avoid.includes(o.id))
    if (usable.length) {
      next[category] = [pickWeighted(category, usable, random).id]
    } else if (next[category]) {
      delete next[category]
    } else {
      break
    }
  }
  return next
}

/**
 * 与上游产品画像一致的加权随机器：男性 67%、女性 33%，西装 40%、复古 20%、
 * 灯罩发型 20%，curvy 排除，ultra 在普通档排除。
 *
 * 当前档位有可见选项的分类都会被赋值；数据集硬冲突会被修复而不是随载荷下发；
 * 跨分类依赖（胡子、眉毛）依据已掷出的值解析。
 * @param {import('./types.js').InfluencerTaxonomy} tax
 * @param {string} tier
 * @param {RandomSource} [random]
 * @returns {import('./types.js').Selection}
 */
export function randomizeSelection(tax, tier, random = Math.random) {
  /** @type {import('./types.js').Selection} */
  const sel = {}
  for (const cat of rollOrder(tax.categories)) {
    const pool = eligiblePool(cat, tier, sel, [])
    if (!pool.length) continue
    sel[cat.id] = [pickWeighted(cat.id, pool, random).id]
  }
  return repair(tax, tier, sel, random)
}
