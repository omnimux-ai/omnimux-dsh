// 图像生成模型的目录读取与三级选择器（品牌 / 模型 / 渠道）投影。
//
// 来源：OmniMux/web/src/features/influencer/lib/catalog.ts（只读真源）。
//
// 偏离（数据来源变更，必须记录）：
//   真源直接读 OmniMux 网关的 `/api/pricing` 与 `/api/user/self/groups`，把 pricing 行
//   当成模型真源，并用 `availableGroups` / `quoteCredits` 计算渠道与积分。
//   插件端改为读 DSH 中枢目录 `GET /omnimux/model-catalog`（见 fetchModelCatalog）：
//   - 图像模型 = `catalog.image` 行（每行至少有 `id` 与 `label`，另含 `family` / `badge` /
//     `subtitle` / `parameters` / `channelGroups`，见中枢 catalog/project.js projectRow）；
//   - 品牌层来自 `family`，映射表与 omnimux-viewer 的 parseCatalogToCascade 保持一致；
//   - 渠道层直接读行的 `channelGroups`（中枢已投影 `id` / `label` / `wireGroup` /
//     `default` / `enabled` / `pricing` / `constraints`）；行没有渠道列表时返回 `[]`，
//     调用方按「无渠道」降级；
//   - 真源的积分报价（quoteCredits）依赖网关 group_ratio，中枢目录不提供该数据，
//     故不再移植；界面改为展示中枢渠道组自带的 pointsEstimate / discountRate。
// 三级选择器的形状（品牌 / 模型 / 渠道）与真源保持一致。

/** 中枢模型目录地址（DSH 中枢提供的相对路径）。 */
const CATALOG_PATH = '/omnimux/model-catalog'

/**
 * 品牌展示名映射，与 omnimux-viewer MediaViewerComposerData.BRAND_NAME_MAP 同源。
 * 中枢的 `family` 是稳定小写键，界面需要可读品牌名。
 * @type {Record<string, string>}
 */
export const BRAND_NAME_MAP = {
  openai: 'OpenAI',
  bytedance: 'Seedance',
  seedance: 'Seedance',
  minimax: 'MiniMax',
  kling: 'Kling',
  google: 'Google',
  midjourney: 'Midjourney',
  bfl: 'Black Forest Labs',
  anthropic: 'Claude',
}

/** 无法归入已知品牌时的兜底展示名。 */
const GENERIC_BRAND = '通用'

/**
 * 读取中枢模型目录原始快照。
 * @param {typeof fetch} [fetchImpl] 便于测试注入
 * @returns {Promise<import('./types.js').ModelCatalog>}
 */
export async function fetchModelCatalog(fetchImpl = fetch) {
  const res = await fetchImpl(CATALOG_PATH, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`模型目录读取失败（HTTP ${res.status}）`)
  const body = await res.json()
  if (!body || typeof body !== 'object') throw new Error('模型目录响应不是对象')
  return body
}

/**
 * 目录里的图像生成模型行。中枢目录本身是唯一真源：它列为图像的即在此提供，
 * 本地不维护允许/拒绝名单。
 * @param {import('./types.js').ModelCatalog|undefined|null} catalog
 * @returns {import('./types.js').ModelCatalogRow[]}
 */
export function imageModels(catalog) {
  if (!catalog) return []
  return Array.isArray(catalog.image) ? catalog.image : []
}

/**
 * 行的品牌键：中枢 `family`，缺省归入 common；bytedance 与 seedance 视为同一品牌。
 * @param {import('./types.js').ModelCatalogRow} row
 * @returns {string}
 */
function brandKeyOf(row) {
  const family = (row?.family || 'common').toLowerCase()
  return family === 'bytedance' ? 'seedance' : family
}

/**
 * 品牌展示名。
 * @param {string} brandId
 * @returns {string}
 */
function brandNameOf(brandId) {
  return BRAND_NAME_MAP[brandId] ?? GENERIC_BRAND
}

/**
 * 目录行里该品牌的行，保持目录顺序。
 * @param {import('./types.js').ModelCatalogRow[]} rows
 * @param {string} brand
 * @returns {import('./types.js').ModelCatalogRow[]}
 */
function rowsOfBrand(rows, brand) {
  return (rows ?? []).filter((row) => row && row.id && brandKeyOf(row) === brand)
}

/**
 * 三级选择器的品牌层，按目录顺序去重。
 * @param {import('./types.js').ModelCatalogRow[]} rows
 * @returns {{ id: string, name: string }[]}
 */
export function brandsOf(rows) {
  /** @type {Map<string, { id: string, name: string }>} */
  const map = new Map()
  for (const row of rows ?? []) {
    if (!row || !row.id) continue
    const id = brandKeyOf(row)
    if (!map.has(id)) map.set(id, { id, name: brandNameOf(id) })
  }
  return [...map.values()]
}

/**
 * 某品牌下的模型层，保持目录顺序。
 * @param {import('./types.js').ModelCatalogRow[]} rows
 * @param {string} brand
 * @returns {{ id: string, name: string, desc: string, raw: import('./types.js').ModelCatalogRow }[]}
 */
export function modelsOfBrand(rows, brand) {
  return rowsOfBrand(rows, brand).map((row) => ({
    id: row.id,
    name: row.label || row.id,
    desc: row.subtitle || row.badge || '执行中枢精选模型',
    raw: row,
  }))
}

/**
 * 缺名渠道组的展示名。中枢的渠道组不保证带 label，默认线路必须落到中文，
 * 否则中文界面上会直接露出线路 id（例如 default）。
 */
export const DEFAULT_GROUP_LABEL = '默认渠道'

/**
 * 某个模型的渠道层。行没有渠道列表时返回 `[]`，调用方按「无渠道」降级。
 * @param {import('./types.js').ModelCatalogRow[]} rows
 * @param {string} modelId
 * @returns {import('./types.js').CascadeChannel[]}
 */
export function groupsOfModel(rows, modelId) {
  const row = (rows ?? []).find((item) => item && item.id === modelId)
  const groups = Array.isArray(row?.channelGroups) ? row.channelGroups : []
  return groups.map((group) => {
    const pricing = group?.pricing ?? {}
    const billingMode = pricing.billingMode
    const label = typeof group.label === 'string' && group.label.trim() ? group.label.trim() : ''
    // 中枢的渠道组不保证带 label；缺名时默认线路要落到中文「默认渠道」，
    // 否则按钮上会直接露出线路 id（例如 default），中文界面里就是英文泄漏。
    const isDefault = group.default === true || group.id === 'default'
    return {
      id: group.id,
      name: label || (isDefault ? DEFAULT_GROUP_LABEL : group.id),
      wireGroup: group.wireGroup || group.id,
      enabled: group.enabled !== false,
      isDefault,
      price:
        typeof pricing.pointsEstimate === 'number'
          ? `≈${pricing.pointsEstimate} 积分`
          : '按量计费',
      tag:
        group.badge || (billingMode === 'per_second' ? '按秒计费' : '按次专线'),
      billing: billingMode === 'per_second' ? '按秒计费' : '按条计费',
      ratio:
        typeof pricing.discountRate === 'number' && pricing.discountRate > 1
          ? `×${pricing.discountRate.toFixed(2)}`
          : '',
      discount:
        typeof pricing.discountRate === 'number' && pricing.discountRate < 1
          ? `${Math.round(pricing.discountRate * 10)} 折`
          : '',
      ...(group.constraints && typeof group.constraints === 'object'
        ? { constraints: group.constraints }
        : {}),
    }
  })
}

/**
 * 自动选中的渠道 id：优先中枢标记 `default: true` 的渠道，否则第一个启用的渠道，
 * 都没有时返回空串。
 *
 * 注意：返回的是渠道 id；提交给服务端的取值是该渠道的 `wireGroup`
 * （由 groupsOfModel 一并给出），两者在中枢可能不同。
 * @param {import('./types.js').CascadeChannel[]} groups
 * @returns {string}
 */
export function pickAutoGroup(groups) {
  const list = groups ?? []
  const preferred = list.find((group) => group?.isDefault === true)
  if (preferred) return preferred.id
  const enabled = list.find((group) => group?.enabled !== false)
  return enabled ? enabled.id : ''
}

/**
 * 品牌 id 对应的展示名；未知品牌回退为 `Vendor <id>`（与真源 vendorName 的回退同形）。
 * @param {{ id: string, name: string }[]} brands
 * @param {string} brandId
 * @returns {string}
 */
export function vendorName(brands, brandId) {
  const brand = (brands ?? []).find((item) => item?.id === brandId)
  return brand?.name ?? `Vendor ${brandId}`
}
