/**
 * gxgen official inspiration industry vocabulary (Issue #2507).
 *
 * Single source of truth for the 18 industry ids. Import scripts, the
 * client dropdown, and the stock rewrite script all reuse this module.
 * Product forms (digital / physical / software / service) are not industries.
 */

/** @typedef {{ id: string, zh: string, en: string }} OfficialCategory */

/**
 * Official 18 industries in gxgen `sort_order` (other last).
 * @type {readonly OfficialCategory[]}
 */
export const OFFICIAL_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'baby_parenting', zh: '母婴亲子', en: 'Baby & Parenting' }),
  Object.freeze({ id: 'food_beverage', zh: '美食餐饮', en: 'Food & Beverage' }),
  Object.freeze({ id: 'education', zh: '教育培训', en: 'Education' }),
  Object.freeze({ id: 'fitness_sports', zh: '健身运动', en: 'Fitness & Sports' }),
  Object.freeze({ id: 'beauty_skincare', zh: '美妆护肤', en: 'Beauty & Skincare' }),
  Object.freeze({ id: 'fashion', zh: '时尚穿搭', en: 'Fashion' }),
  Object.freeze({ id: 'home_living', zh: '家居生活', en: 'Home & Living' }),
  Object.freeze({ id: 'tech_digital', zh: '数码科技', en: 'Tech & Digital' }),
  Object.freeze({ id: 'travel', zh: '旅行出行', en: 'Travel' }),
  Object.freeze({ id: 'health_wellness', zh: '健康养生', en: 'Health & Wellness' }),
  Object.freeze({ id: 'pets', zh: '宠物', en: 'Pets' }),
  Object.freeze({ id: 'gaming_entertainment', zh: '游戏娱乐', en: 'Gaming & Entertainment' }),
  Object.freeze({ id: 'finance', zh: '金融理财', en: 'Finance' }),
  Object.freeze({ id: 'realestate', zh: '房产家装', en: 'Real Estate' }),
  Object.freeze({ id: 'emotion_social', zh: '情感社交', en: 'Emotion & Social' }),
  Object.freeze({ id: 'legal_consulting', zh: '法律咨询', en: 'Legal & Consulting' }),
  Object.freeze({ id: 'business', zh: '商业服务', en: 'Business' }),
  Object.freeze({ id: 'other', zh: '其他', en: 'Other' }),
])

const OFFICIAL_IDS = new Set(OFFICIAL_CATEGORIES.map((row) => row.id))

/** Product morphology — never an industry id. */
const PRODUCT_FORMS = new Set([
  'digital',
  'physical',
  'software',
  'service',
  'software & apps',
  'physical products',
  'services',
  '软件应用',
  '实物产品',
  '线下服务',
])

/**
 * Extra aliases (folded) → official id. Official id / zh / en are registered
 * separately so this list stays the source-site and genshot leftovers.
 * @type {Record<string, string>}
 */
const EXTRA_ALIASES = {
  // genviral / source-site English
  fitness: 'fitness_sports',
  'health & wellness': 'health_wellness',
  'relationships & lifestyle': 'emotion_social',
  travel: 'travel',
  'food & cooking': 'food_beverage',
  'education & knowledge': 'education',
  'personal development': 'education',
  'home & design': 'home_living',
  'arts, hobbies & lifestyle': 'gaming_entertainment',
  uncategorized: 'other',
  // genshot Chinese (and a few English leftovers)
  家居用品: 'home_living',
  厨房用品: 'home_living',
  纺织品和软装: 'home_living',
  家用电器: 'home_living',
  家具: 'home_living',
  家居装修: 'home_living',
  工具和五金: 'home_living',
  女装和内衣: 'fashion',
  男装和内衣: 'fashion',
  孩子们的时尚: 'fashion',
  "kids' fashion": 'fashion',
  穆斯林时尚: 'fashion',
  鞋类: 'fashion',
  箱包: 'fashion',
  时尚配饰: 'fashion',
  珠宝配饰及衍生品: 'fashion',
  美容和个人护理: 'beauty_skincare',
  手机和电子产品: 'tech_digital',
  电脑和办公设备: 'tech_digital',
  宠物用品: 'pets',
  婴儿和孕妇用品: 'baby_parenting',
  运动和户外: 'fitness_sports',
  玩具和爱好: 'gaming_entertainment',
  汽车和摩托车: 'travel',
  食品和饮料: 'food_beverage',
  健康: 'health_wellness',
  '图书、杂志和音频': 'education',
  二手商品: 'other',
  预订和代金券: 'business',
  虚拟产品: 'business',
  收藏品: 'gaming_entertainment',
  // pippit Chinese
  科技: 'tech_digital',
  美食: 'food_beverage',
  时尚: 'fashion',
  个人护理: 'beauty_skincare',
  旅行: 'travel',
  美容: 'beauty_skincare',
  运动: 'fitness_sports',
  萌宠: 'pets',
  婴幼儿: 'baby_parenting',
  装饰: 'home_living',
  汽车: 'travel',
}

const TAG_RULES = Object.freeze([
  Object.freeze({ id: 'fitness_sports', tags: Object.freeze(['fitness', 'get_fit', 'fitness_users']) }),
  Object.freeze({ id: 'beauty_skincare', tags: Object.freeze(['beauty', 'glow_up', 'beauty_users']) }),
  Object.freeze({ id: 'health_wellness', tags: Object.freeze(['sleep', 'wellness', 'anxiety', 'health']) }),
  Object.freeze({ id: 'emotion_social', tags: Object.freeze(['dating']) }),
  Object.freeze({ id: 'education', tags: Object.freeze(['education', 'course', 'study']) }),
  Object.freeze({ id: 'pets', tags: Object.freeze(['pet']) }),
  Object.freeze({ id: 'food_beverage', tags: Object.freeze(['food', 'recipe', 'cooking']) }),
])

/** @type {Map<string, string>} */
const ALIAS_TO_ID = new Map()

for (const row of OFFICIAL_CATEGORIES) {
  ALIAS_TO_ID.set(fold(row.id), row.id)
  ALIAS_TO_ID.set(fold(row.zh), row.id)
  ALIAS_TO_ID.set(fold(row.en), row.id)
}
for (const [alias, id] of Object.entries(EXTRA_ALIASES)) {
  if (!OFFICIAL_IDS.has(id)) throw new Error(`alias ${alias} points at unknown industry ${id}`)
  const key = fold(alias)
  const existing = ALIAS_TO_ID.get(key)
  if (existing && existing !== id) throw new Error(`alias conflict for ${alias}: ${existing} vs ${id}`)
  ALIAS_TO_ID.set(key, id)
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function fold(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function tagList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => fold(entry)).filter(Boolean)
}

/**
 * Conservative tag → industry. Exact folded tokens only.
 * Bare `ai_tool` / `mobile_app` never become tech_digital.
 * @param {unknown} tags
 * @returns {string}
 */
export function inferIndustryFromTags(tags) {
  const set = new Set(tagList(tags))
  if (set.size === 0) return 'other'
  for (const rule of TAG_RULES) {
    if (rule.tags.some((token) => set.has(token))) return rule.id
  }
  return 'other'
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isOfficialCategoryId(raw) {
  return OFFICIAL_IDS.has(fold(raw))
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isProductForm(raw) {
  return PRODUCT_FORMS.has(fold(raw))
}

/**
 * Industry id for a raw token, or empty when it is a form / unknown / blank.
 * Does not consult tags.
 * @param {unknown} raw
 * @returns {string}
 */
export function lookupOfficialCategory(raw) {
  const key = fold(raw)
  if (!key || PRODUCT_FORMS.has(key)) return ''
  return ALIAS_TO_ID.get(key) || ''
}

/**
 * Map any raw category string onto an official industry id.
 * Forms and unknowns fall through to tag inference, then `other`.
 * @param {unknown} raw
 * @param {{ tags?: unknown }} [options]
 * @returns {string}
 */
export function normalizeCategory(raw, options = {}) {
  const industry = lookupOfficialCategory(raw)
  if (industry) return industry
  return inferIndustryFromTags(options.tags)
}
