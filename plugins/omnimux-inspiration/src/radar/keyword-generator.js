/**
 * 商品短视频关键词雷达生成器 (基于海外爆款短视频 10 大模态逆向拆解)
 */

export const RADAR_DIMENSIONS = Object.freeze([
  { id: 'review', name: '真实测评类', suffix: 'review', desc: '博主开箱试用与上身体验' },
  { id: 'benefits', name: '功效价值类', suffix: 'benefits', desc: '直接解决什么核心痛点与价值' },
  { id: 'pain_point', name: '痛点场景类', suffix: 'travel hack', desc: '前3秒直击出行安检或收纳窘境' },
  { id: 'before_after', name: '前后对比类', suffix: 'refill hack', desc: '视觉冲击力强的灌装与反差' },
  { id: 'daily_routine', name: '翻包日常类', suffix: 'whats in my bag', desc: '贴近生活方式的自然随身好物' },
  { id: 'how_it_works', name: '构造解密类', suffix: 'how it works leakproof', desc: '单向阀门与机械防漏细节' },
  { id: 'outcome', name: '终极状态类', suffix: 'smell good all day', desc: '全天留香、社交自信情绪向往' },
  { id: 'aesthetic', name: '明星外观类', suffix: 'cute aesthetic mini spray', desc: '粉色爱心印花与视觉吸睛' },
  { id: 'honest_review', name: '无广避坑类', suffix: 'honest review is it worth it', desc: '反直觉避坑实测与真实口碑' },
  { id: 'versus', name: '对标PK类', suffix: 'vs funnel decanting', desc: '老旧漏斗对比新式直充黑科技' },
])

/**
 * @param {object} product
 * @returns {Array<{ id: string, dimension: string, keyword: string, intent: string, hook_hint: string }>}
 */
export function generateRadarKeywords(product = {}) {
  const brand = (product.brand || '').trim() || 'Brand'
  const title = (product.name || product.title || '').trim() || 'Product'
  
  // 提取品类核心英语单词
  let coreTerm = 'perfume atomizer'
  const lowerTitle = title.toLowerCase()
  if (lowerTitle.includes('perfume') || lowerTitle.includes('香水')) {
    coreTerm = 'perfume atomizer'
  } else if (lowerTitle.includes('spray') || lowerTitle.includes('喷雾')) {
    coreTerm = 'mini spray bottle'
  } else if (lowerTitle.includes('greens') || lowerTitle.includes('nutrition') || lowerTitle.includes('纤维')) {
    coreTerm = 'greens powder'
  }

  const brandClean = brand.toLowerCase() === 'brand' ? '' : brand

  return [
    {
      id: 'kw_1',
      dimension: '真实测评类',
      keyword: `${brandClean ? brandClean + ' ' : ''}${coreTerm} review`.trim(),
      intent: '定位博主开箱试用与上身体验，天然具备高完播信任度',
      hook_hint: '“Wait, did I just find the easiest way to carry perfume?”',
    },
    {
      id: 'kw_2',
      dimension: '功效价值类',
      keyword: `mini refillable ${coreTerm} benefits`,
      intent: '展示便携随身补充的核心优势，解答观众直接利益点',
      hook_hint: '“3 reasons why everyone is ditching big perfume bottles.”',
    },
    {
      id: 'kw_3',
      dimension: '痛点场景类',
      keyword: `travel ${coreTerm} TSA airport hack`,
      intent: '前3秒直击机场安检被没收、大瓶笨重等尴尬出行窘境',
      hook_hint: '“TSA confiscated my expensive perfume... NEVER again!”',
    },
    {
      id: 'kw_4',
      dimension: '前后对比类',
      keyword: `${coreTerm} bottom pump refill hack`,
      intent: '视觉冲击力极强，展示传统漏斗洒出 vs 底部一秒直充反差',
      hook_hint: '“Refill in 3 seconds from the bottom without leaking a drop.”',
    },
    {
      id: 'kw_5',
      dimension: '翻包日常类',
      keyword: `${coreTerm} whats in my bag aesthetic`,
      intent: '贴近生活方式的自然种草，融入通勤、约会随身带场景',
      hook_hint: '“What is inside my mini aesthetic purse for date night?”',
    },
    {
      id: 'kw_6',
      dimension: '构造解密类',
      keyword: `portable ${coreTerm} how it works leakproof`,
      intent: '特写底部精密单向阀门与防漏工艺，带来机械沉浸感',
      hook_hint: '“The secret leakproof valve inside this viral mini bottle.”',
    },
    {
      id: 'kw_7',
      dimension: '终极状态类',
      keyword: `smell rich all day on a budget perfume hack`,
      intent: '唤醒用户对“全天优雅留香、高社交自信”的情绪价值向往',
      hook_hint: '“How to smell like a million bucks everywhere you go.”',
    },
    {
      id: 'kw_8',
      dimension: '明星外观类',
      keyword: `pink heart cute mini ${coreTerm}`,
      intent: '聚焦粉色爱心印花与高颜值外观，专为年轻女性视觉吸睛',
      hook_hint: '“The cutest pink heart perfume bottle you will ever see.”',
    },
    {
      id: 'kw_9',
      dimension: '无广避坑类',
      keyword: `tiktok viral ${coreTerm} honest review is it worth it`,
      intent: '反直觉避坑实测（实测到底漏不漏），大幅拉高完播与信任',
      hook_hint: '“Does this viral TikTok perfume bottle actually work or is it trash?”',
    },
    {
      id: 'kw_10',
      dimension: '对标PK类',
      keyword: `bottom pump ${coreTerm} vs funnel decanting`,
      intent: '传统繁琐漏斗倒液 vs 底部直充黑科技正面对决，激发换新欲',
      hook_hint: '“Traditional messy funnel vs bottom pump: the ultimate test.”',
    },
  ]
}
