// 灵感预设的解析与呈现：套用解析、可用性过滤、参数行。
//
// 来源：OmniMux/web/src/features/influencer/lib/presets.ts（只读真源），解析逻辑 1:1。
//
// 偏离（数据来源变更）：真源在构建期 `import snapshot from '../data/presets.json'`，
// 把快照打进前端包；插件端改为运行时取服务端载荷
// （GET /api/omnimux/avatar/presets，见 api.js fetchPresets），由 setPresetSnapshot 注入。
// 因此 PRESET_SNAPSHOT 在注入前是空快照（total=0），注入后字段就地更新。

/**
 * @typedef {object} PresetSnapshotEnvelope
 * @property {number} version
 * @property {string} source
 * @property {string} fetched_at
 * @property {import('./types.js').ExplorePreset[]} items
 */

/** @type {PresetSnapshotEnvelope} */
let snapshot = { version: 0, source: '', fetched_at: '', items: [] }

/**
 * 快照来源信息，供诊断与工作台自报使用。字段与真源的 PRESET_SNAPSHOT 同名同义，
 * 由 setPresetSnapshot 就地刷新（对象标识不变，读取方无需重新取值）。
 */
export const PRESET_SNAPSHOT = {
  version: 0,
  source: '',
  fetchedAt: '',
  total: 0,
}

/**
 * 注入服务端返回的预设快照。载荷不是对象或 items 不是数组时清空为空快照。
 * @param {Partial<PresetSnapshotEnvelope>|null|undefined} next
 * @returns {PresetSnapshotEnvelope}
 */
export function setPresetSnapshot(next) {
  const items = Array.isArray(next?.items) ? next.items : []
  snapshot = {
    version: typeof next?.version === 'number' ? next.version : 0,
    source: typeof next?.source === 'string' ? next.source : '',
    fetched_at: typeof next?.fetched_at === 'string' ? next.fetched_at : '',
    items,
  }
  PRESET_SNAPSHOT.version = snapshot.version
  PRESET_SNAPSHOT.source = snapshot.source
  PRESET_SNAPSHOT.fetchedAt = snapshot.fetched_at
  PRESET_SNAPSHOT.total = items.length
  return snapshot
}

/** 当前快照（只读用途：条目遍历）。 */
export function presetItems() {
  return snapshot.items
}

/**
 * 预设的选项目标对当前数据集解析后的结果；无法精确复现时返回 null。
 *
 * 有意做成全有全无：一个预设就是完整的一套形象，只套用能解析的那一半会造出
 * 与卡片所示不同的角色。快照脚本本身用同一份数据集做闸门，所以这里返回 null
 * 意味着两者已经漂移——此时宁可丢弃这张卡，也不要误导用户。
 * @param {import('./types.js').ExplorePreset} preset
 * @param {import('./types.js').InfluencerTaxonomy} taxonomy
 * @returns {import('./types.js').Selection|null}
 */
export function resolvePresetSelection(preset, taxonomy) {
  const tiers = new Set(taxonomy.tier_group.options.map((o) => o.id))
  if (!tiers.has(preset.tier)) return null

  const categories = new Map(taxonomy.categories.map((c) => [c.id, c]))
  /** @type {import('./types.js').Selection} */
  const resolved = {}

  for (const [categoryId, optionIds] of Object.entries(preset.selection)) {
    const category = categories.get(categoryId)
    if (!category) return null

    /** @type {string[]} */
    const kept = []
    for (const optionId of optionIds) {
      const option = category.options.find((o) => o.id === optionId)
      // 档位过滤同样要过：选项若不在该预设自己的档位里可见，
      // 套用后左侧面板根本看不到这一项。
      if (!option || !option.visibleIn.includes(preset.tier)) return null
      kept.push(optionId)
    }
    if (!kept.length) continue
    if (kept.length > category.max) return null
    resolved[categoryId] = kept
  }

  return Object.keys(resolved).length ? resolved : null
}

/**
 * 可以直接套用的预设；不可用的永远进不了网格。
 * @param {import('./types.js').InfluencerTaxonomy|null} taxonomy
 * @returns {import('./types.js').ExplorePreset[]}
 */
export function usablePresets(taxonomy) {
  if (!taxonomy) return []
  return snapshot.items.filter((p) => resolvePresetSelection(p, taxonomy) !== null)
}

/**
 * 预设参数的可读行：分类与选项标签取自数据集，顺序与左侧边栏一致。
 * 直接展示原始选项 id 对用户没有意义。
 * @param {import('./types.js').ExplorePreset} preset
 * @param {import('./types.js').InfluencerTaxonomy} taxonomy
 * @returns {import('./types.js').PresetParamRow[]}
 */
export function presetParamRows(preset, taxonomy) {
  const resolved = resolvePresetSelection(preset, taxonomy)
  if (!resolved) return []

  const categories = new Map(taxonomy.categories.map((c) => [c.id, c]))
  /** @param {string} categoryId */
  const rank = (categoryId) => {
    const index = taxonomy.category_priority.indexOf(categoryId)
    return index < 0 ? 99 : index
  }

  return Object.entries(resolved)
    .map(([categoryId, optionIds]) => {
      const category = categories.get(categoryId)
      return {
        categoryId,
        label: category?.label_en ?? categoryId,
        options: optionIds.map(
          (id) => category?.options.find((o) => o.id === id)?.label_en ?? id
        ),
      }
    })
    .sort((a, b) => rank(a.categoryId) - rank(b.categoryId))
}
