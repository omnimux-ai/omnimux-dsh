/**
 * 爆款对标筛选栏专业双语术语映射引擎。
 * 遵循 SaaS 科技类简化的专业术语命名规范与 DSH 语言环境规范。
 */

/**
 * 常用出海电商与短视频国家/地区二字码标准双语词典。
 * 覆盖北美、欧洲、东南亚、东亚、拉美等高频市场。
 */
export const REGION_DICT = {
  US: { zh: '美国', en: 'United States' },
  CA: { zh: '加拿大', en: 'Canada' },
  GB: { zh: '英国', en: 'United Kingdom' },
  DE: { zh: '德国', en: 'Germany' },
  FR: { zh: '法国', en: 'France' },
  IT: { zh: '意大利', en: 'Italy' },
  ES: { zh: '西班牙', en: 'Spain' },
  JP: { zh: '日本', en: 'Japan' },
  KR: { zh: '韩国', en: 'South Korea' },
  TH: { zh: '泰国', en: 'Thailand' },
  VN: { zh: '越南', en: 'Vietnam' },
  ID: { zh: '印度尼西亚', en: 'Indonesia' },
  MY: { zh: '马来西亚', en: 'Malaysia' },
  PH: { zh: '菲律宾', en: 'Philippines' },
  SG: { zh: '新加坡', en: 'Singapore' },
  BR: { zh: '巴西', en: 'Brazil' },
  MX: { zh: '墨西哥', en: 'Mexico' },
  AU: { zh: '澳大利亚', en: 'Australia' },
  SE: { zh: '瑞典', en: 'Sweden' },
  LV: { zh: '拉脱维亚', en: 'Latvia' },
  MD: { zh: '摩尔多瓦', en: 'Moldova' },
  NL: { zh: '荷兰', en: 'Netherlands' },
  PL: { zh: '波兰', en: 'Poland' },
  SA: { zh: '沙特阿拉伯', en: 'Saudi Arabia' },
  AE: { zh: '阿联酋', en: 'United Arab Emirates' },
  IN: { zh: '印度', en: 'India' },
  TR: { zh: '土耳其', en: 'Turkey' },
  ZA: { zh: '南非', en: 'South Africa' },
  CL: { zh: '智利', en: 'Chile' },
  CO: { zh: '哥伦比亚', en: 'Colombia' },
  PE: { zh: '秘鲁', en: 'Peru' },
  EG: { zh: '埃及', en: 'Egypt' },
}

/**
 * 核心行业类目双向标准词典（SaaS 科技与电商标准精简词表）。
 * 支持以英文或中文作为源键，归一化解析并输出当前语言的标准术语。
 */
export const INDUSTRY_CANONICAL_ENTRIES = [
  {
    aliases: ['digital', '3C数码', '数码家电', '数码', '消费电子', 'electronics', 'Consumer Electronics'],
    zh: '数码家电',
    en: 'Consumer Electronics',
  },
  {
    aliases: ['电脑和办公设备', '电脑办公', '办公设备', 'Computers & Office', 'computer & office', 'computers'],
    zh: '电脑办公',
    en: 'Computers & Office',
  },
  {
    aliases: ['Education & Knowledge', 'education & knowledge', '教育知识', '教育培训', '教育', '知识', 'Education & Learning'],
    zh: '教育培训',
    en: 'Education & Learning',
  },
  {
    aliases: ['Fitness', 'fitness', '运动健身', '健身', 'Sports & Fitness', 'sports & fitness', '运动'],
    zh: '运动健身',
    en: 'Sports & Fitness',
  },
  {
    aliases: ['Food & Cooking', 'food & cooking', '美食餐饮', '食品饮料', '美食', '烹饪', 'Food & Beverage', 'food & beverage'],
    zh: '食品饮料',
    en: 'Food & Beverage',
  },
  {
    aliases: ['家居装修', '家居生活', '家居家装', '家居', 'home', 'Home & Living', 'home & living', 'Home Improvement', 'home improvement'],
    zh: '家居生活',
    en: 'Home & Living',
  },
  {
    aliases: ['健康', '医疗健康', '健康保健', 'health', 'Health & Wellness', 'health & wellness'],
    zh: '医疗健康',
    en: 'Health & Wellness',
  },
  {
    aliases: ['女装和内衣', '女装内衣', '女装', 'women apparel', "Women's Apparel", "Women's Clothing & Underwear", 'apparel', 'clothing'],
    zh: '女装内衣',
    en: "Women's Apparel",
  },
  {
    aliases: ['beauty', '美妆个护', '美妆', '个护', 'Beauty & Personal Care', 'beauty & personal care', 'cosmetics'],
    zh: '美妆个护',
    en: 'Beauty & Personal Care',
  },
  {
    aliases: ['pets', '宠物用品', '宠物', 'Pet Supplies', 'pet supplies'],
    zh: '宠物用品',
    en: 'Pet Supplies',
  },
  {
    aliases: ['automotive', '汽车用品', '汽配', 'Automotive', 'car accessories'],
    zh: '汽车用品',
    en: 'Automotive',
  },
  {
    aliases: ['baby', 'maternity', '母婴用品', '母婴', 'Baby & Maternity', 'baby & maternity', 'toys'],
    zh: '母婴用品',
    en: 'Baby & Maternity',
  },
  {
    aliases: ['sports', '户外运动', '户外', 'Sports & Outdoors', 'sports & outdoors'],
    zh: '户外运动',
    en: 'Sports & Outdoors',
  },
  {
    aliases: ['Personal Development', 'personal development', '个人成长', '自我提升'],
    zh: '个人成长',
    en: 'Personal Development',
  },
  {
    aliases: ['gaming', '游戏动漫', '游戏', 'Gaming & Anime', 'gaming & anime'],
    zh: '游戏动漫',
    en: 'Gaming & Anime',
  },
  {
    aliases: ['books', '图书文娱', '图书', 'Books & Media', 'books & media'],
    zh: '图书文娱',
    en: 'Books & Media',
  },
]

/**
 * 快速别名查找索引（全小写键名）。
 */
const INDUSTRY_INDEX = new Map()
for (const entry of INDUSTRY_CANONICAL_ENTRIES) {
  for (const alias of entry.aliases) {
    INDUSTRY_INDEX.set(String(alias).trim().toLowerCase(), entry)
  }
}

/**
 * 从当前 t 函数或环境检测是否为英文环境。
 * @param {(key: string) => string} [t]
 * @returns {boolean}
 */
export function isEnglishLocale(t) {
  if (typeof t === 'function') {
    try {
      const loc = t('locale')
      if (loc && typeof loc === 'string' && loc !== 'locale') {
        return loc.toLowerCase().startsWith('en')
      }
    } catch {
      // ignore
    }
  }
  if (typeof document !== 'undefined' && document?.documentElement?.lang) {
    return document.documentElement.lang.toLowerCase().startsWith('en')
  }
  return false
}

/**
 * 将地区代码格式化为当前语言环境下的标准呈现名称。
 * @param {string} code 国家/地区二字码，如 'US', 'TH'
 * @param {(key: string) => string} [t]
 * @returns {string}
 */
export function formatRegionLabel(code, t) {
  const raw = String(code || '').trim()
  if (!raw) return ''
  const upper = raw.toUpperCase()
  const entry = REGION_DICT[upper]
  if (!entry) return raw
  return isEnglishLocale(t) ? entry.en : entry.zh
}

/**
 * 将类目名称格式化为当前语言环境下的标准精简商业术语。
 * @param {string} category 原始类目名（支持中/英文各种变体输入）
 * @param {(key: string) => string} [t]
 * @returns {string}
 */
export function formatIndustryLabel(category, t) {
  const raw = String(category || '').trim()
  if (!raw) return ''
  const key = raw.toLowerCase()
  const entry = INDUSTRY_INDEX.get(key)
  if (!entry) return raw
  return isEnglishLocale(t) ? entry.en : entry.zh
}
