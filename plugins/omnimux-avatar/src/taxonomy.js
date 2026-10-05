// 形象分类数据集（taxonomy）的加载与访问。
// 数据随插件分发（Config-as-Code），进程内只读并缓存解析结果与内容摘要。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePluginDataDir } from './paths.js'

// 提示词拼接的固定分类顺序，与 Go 端 promptOrder 逐项一致。
export const promptOrder = Object.freeze([
  'gender', 'ethnicity_origin_base', 'age', 'skin_tone', 'height',
  'body_type', 'proportions', 'freak_head', 'freak_neck', 'eye_shape',
  'eye_color', 'freak_face', 'facial_hair', 'hair', 'hair_colour',
  'distinctive', 'aesthetic', 'accessory',
])

// 对外服务的六个字段，等价于 Go TaxonomyData 的结构体字段集合。
const SERVED_KEYS = Object.freeze([
  'version', 'source', 'tier_group', 'category_priority', 'categories', 'prompt_map',
])

let cachedBytes = null
let cachedTaxonomy = null
let cachedServed = null
let cachedETag = null

/** 数据集原始字节，供摘要计算与测试使用。 */
export function readTaxonomyBytes() {
  if (cachedBytes === null) {
    cachedBytes = readFileSync(join(resolvePluginDataDir(), 'taxonomy.json'))
  }
  return cachedBytes
}

/** 完整解析结果（含文件里的 rules / counts 附加段）。 */
export function Taxonomy() {
  if (cachedTaxonomy === null) {
    cachedTaxonomy = JSON.parse(readTaxonomyBytes().toString('utf8'))
  }
  return cachedTaxonomy
}

/**
 * 对外暴露的数据集视图：仅保留 Go 结构体反序列化得到的六个字段，
 * 文件里的 rules / counts 不属于该契约，必须剔除。
 */
export function servedTaxonomy() {
  if (cachedServed === null) {
    const tax = Taxonomy()
    cachedServed = {}
    for (const key of SERVED_KEYS) cachedServed[key] = tax[key]
  }
  return cachedServed
}

/** 原始文件字节的 sha256 前 16 位十六进制，与 Go 端算法一致。 */
export function ETag() {
  if (cachedETag === null) {
    cachedETag = createHash('sha256').update(readTaxonomyBytes()).digest('hex').slice(0, 16)
  }
  return cachedETag
}

/** 档位是否合法：扫描 tier_group.options 的 id。 */
export function ValidTier(tier) {
  return servedTaxonomy().tier_group.options.some((o) => o.id === tier)
}

/** 按 id 查找分类，未命中返回 null。 */
export function CategoryByID(id) {
  return Taxonomy().categories.find((c) => c.id === id) ?? null
}

/** 在指定分类内按 id 查找选项，未命中返回 null。 */
export function OptionByID(catId, optId) {
  const category = CategoryByID(catId)
  if (!category) return null
  return category.options.find((o) => o.id === optId) ?? null
}

/** 解析选项的提示词片段，缺失时回退为原始选项 id。 */
export function Fragment(catId, optId) {
  const arr = Taxonomy().prompt_map?.categories?.[catId]
  const hit = arr?.find((o) => o.id === optId)
  return hit ? hit.fragment : optId
}
