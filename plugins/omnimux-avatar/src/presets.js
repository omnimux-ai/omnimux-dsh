// 预设快照（Explore 预设）的加载与解析。
// 快照随插件分发，解析结果必须与实时 taxonomy 完全对得上，否则整条预设不可用。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePluginDataDir } from './paths.js'

let cached = null

/** 预设快照的解析结果，首次读取后缓存。 */
export function PresetSnapshot() {
  if (cached === null) {
    cached = JSON.parse(readFileSync(join(resolvePluginDataDir(), 'presets.json'), 'utf8'))
  }
  return cached
}

/**
 * 把预设的选项解析到当前 taxonomy 上，无法完整复现时返回 null。
 *
 * 全有或全无：预设是一整套造型，只套用能解析的一半会得到与卡片不同的角色。
 * 快照脚本已按同一份 taxonomy 把关，这里的 null 说明两者已经漂移，
 * 应当丢弃该卡片而不是误导用户。
 */
export function resolvePresetSelection(preset, taxonomy) {
  if (!preset || !taxonomy) return null

  const tiers = new Set(taxonomy.tier_group.options.map((o) => o.id))
  if (!tiers.has(preset.tier)) return null

  const categories = new Map(taxonomy.categories.map((c) => [c.id, c]))
  const resolved = {}

  for (const [categoryId, optionIds] of Object.entries(preset.selection ?? {})) {
    const category = categories.get(categoryId)
    if (!category) return null

    const kept = []
    for (const optionId of optionIds) {
      const option = category.options.find((o) => o.id === optionId)
      // 档位过滤同样要过：选项若不在该预设自己的档位里可见，
      // 套用后左侧面板根本看不到这一项。
      if (!option || !(option.visibleIn ?? []).includes(preset.tier)) return null
      kept.push(optionId)
    }
    if (kept.length === 0) continue
    if (kept.length > category.max) return null
    resolved[categoryId] = kept
  }

  return Object.keys(resolved).length ? resolved : null
}

/** 可直接套用的预设；不可用的永远不进列表。 */
export function usablePresets(taxonomy) {
  if (!taxonomy) return []
  return PresetSnapshot().items.filter((p) => resolvePresetSelection(p, taxonomy) !== null)
}

/**
 * 预设参数的可读行：分类与选项都取 taxonomy 的中文/英文标签，
 * 顺序与左侧栏一致。原始选项 id 对用户没有意义。
 */
export function presetParamRows(preset, taxonomy) {
  const resolved = resolvePresetSelection(preset, taxonomy)
  if (!resolved) return []

  const categories = new Map(taxonomy.categories.map((c) => [c.id, c]))
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
