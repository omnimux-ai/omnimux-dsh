/**
 * 爆款对标视频智能推荐评分算法引擎（灵感社区复用版，与创作灵感首页完全对齐）。
 *
 * 核心设计原理：
 * 1. CES 综合互动质量（CES - Comprehensive Engagement Score）：
 *    对用户不同价值的互动行为进行阶梯式加权：
 *    - 点赞（Likes）：权重 1.0（轻量级好感）
 *    - 评论（Comments）：权重 2.0（话题讨论度）
 *    - 收藏（Saves/Favorites）：权重 3.5（高价值复刻/留存意向）
 *    - 分享（Shares）：权重 4.0（社交裂变破圈）
 * 2. 对数平滑流量势能（Logarithmic Volume Momentum）：
 *    采用 log10(views) 对数平滑映射，打破纯播放量导致的马太效应，防止远古大视频垄断。
 * 3. 时间引力衰减（Time Gravity Decay）：
 *    采用双曲引力衰减模型（半衰期 14 天，指数 1.2），近期高潜力内容享有高位曝光，远古爆款平滑衰减。
 * 4. 冷启动黑马扶持（Cold-Start Boost / 初级流量池机制）：
 *    针对 7 天内新发布且加权互动率高于 1.5% 的优质新视频，赋予最高 1.5x 的提权激励，让潜力新片迅速突围。
 * 5. 纯函数设计，无副作用，兼容首页聚合项与灵感库原始行。
 */

export const RECOMMENDATION_WEIGHTS = Object.freeze({
  like: 1.0,
  comment: 2.0,
  save: 3.5,
  share: 4.0,
})

export const RECOMMENDATION_CONFIG = Object.freeze({
  targetEngagementRate: 0.06, // 加权互动率达 6% 视为满分互动表现
  maxLogViews: 7.0, // 播放量达 10,000,000 (10M) 达到满分体量
  engagementWeight: 0.65, // 互动吸引力权重 65%
  volumeWeight: 0.35, // 播放量体量权重 35%
  halfLifeDays: 14, // 衰减半衰期 14 天
  decayGravity: 1.2, // 引力衰减指数
  coldStartDays: 7, // 冷启动保护窗口 7 天
  coldStartMinRate: 0.015, // 冷启动触发互动率门槛 1.5%
  coldStartMaxBoost: 1.5, // 冷启动最大扶持系数 1.5x
  defaultNeutralAgeDays: 30, // 缺失日期时的中性天数兜底
})

/**
 * 安全解析有限数值。
 * @param {unknown} val
 * @returns {number | null}
 */
function toFiniteNumber(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * 从不同形态的记录（首页卡片 item 或灵感库原始 row）中稳健提取特征。
 * @param {object | null | undefined} record
 * @param {number} [nowMs]
 * @returns {{
 *   id: string,
 *   views: number,
 *   likes: number,
 *   comments: number,
 *   saves: number,
 *   shares: number,
 *   hasExplicitInteractions: boolean,
 *   ageDays: number,
 *   rawEngagementPercent: number | null
 * }}
 */
export function extractRecommendationFeatures(record, nowMs = Date.now()) {
  if (!record || typeof record !== 'object') {
    return {
      id: '',
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      hasExplicitInteractions: false,
      ageDays: RECOMMENDATION_CONFIG.defaultNeutralAgeDays,
      rawEngagementPercent: null,
    }
  }

  const id = String(record.id || '').trim()

  // 1. 提取播放量
  const stats = record.stats && typeof record.stats === 'object' ? record.stats : {}
  const views = toFiniteNumber(stats.views) ?? toFiniteNumber(record.views) ?? 0
  const safeViews = Math.max(0, views)

  // 2. 提取各项互动数
  const likes = toFiniteNumber(stats.likes) ?? toFiniteNumber(record.likes) ?? 0
  const comments = toFiniteNumber(stats.comments) ?? toFiniteNumber(record.comments) ?? 0
  const saves = toFiniteNumber(stats.saves)
    ?? toFiniteNumber(stats.favorites)
    ?? toFiniteNumber(record.saves)
    ?? toFiniteNumber(record.favorites)
    ?? (record.is_favorite ? 1 : 0)
  const shares = toFiniteNumber(stats.shares) ?? toFiniteNumber(record.shares) ?? 0

  const hasExplicitInteractions = (
    toFiniteNumber(stats.likes) !== null
    || toFiniteNumber(stats.comments) !== null
    || toFiniteNumber(stats.shares) !== null
    || toFiniteNumber(stats.saves) !== null
    || toFiniteNumber(stats.favorites) !== null
    || toFiniteNumber(record.likes) !== null
  )

  // 3. 提取天数
  let ageDays = null
  if (typeof record.days === 'number' && Number.isFinite(record.days) && record.days >= 0) {
    ageDays = record.days
  } else {
    const rawTime = record.published_at || record.posted_at || record.created_at
    if (typeof rawTime === 'string' && rawTime.trim() !== '') {
      const at = Date.parse(rawTime)
      if (Number.isFinite(at)) {
        const diffDays = Math.floor((nowMs - at) / 86400000)
        if (diffDays >= 0) ageDays = diffDays
      }
    }
  }
  if (ageDays === null) {
    ageDays = RECOMMENDATION_CONFIG.defaultNeutralAgeDays
  }

  // 4. 原始互动率读数
  const rawEngagement = toFiniteNumber(record.engagement)

  return {
    id,
    views: safeViews,
    likes: Math.max(0, likes),
    comments: Math.max(0, comments),
    saves: Math.max(0, saves),
    shares: Math.max(0, shares),
    hasExplicitInteractions,
    ageDays,
    rawEngagementPercent: rawEngagement,
  }
}

/**
 * 核心推荐算法评分函数：
 * 计算单条视频的推荐综合得分（分值通常在 0 ~ 100 之间，超级新爆款可能突破 100+）。
 *
 * @param {object | null | undefined} record
 * @param {number} [nowMs]
 * @returns {number} 最终推荐打分（保留 2 位小数）
 */
export function calculateRecommendationScore(record, nowMs = Date.now()) {
  const feat = extractRecommendationFeatures(record, nowMs)
  if (!feat.id) return 0

  const { views, likes, comments, saves, shares, hasExplicitInteractions, ageDays, rawEngagementPercent } = feat
  const cfg = RECOMMENDATION_CONFIG

  // 1. 计算加权互动率（Weighted Interaction Rate）
  let weightedRate = 0
  if (hasExplicitInteractions && views > 0) {
    const weightedSum = (
      likes * RECOMMENDATION_WEIGHTS.like
      + comments * RECOMMENDATION_WEIGHTS.comment
      + saves * RECOMMENDATION_WEIGHTS.save
      + shares * RECOMMENDATION_WEIGHTS.share
    )
    weightedRate = weightedSum / Math.max(views, 100)
  } else if (rawEngagementPercent !== null && rawEngagementPercent > 0) {
    // 降级使用卡片已经算好的基础互动率（折算为小数比例并给平均互动加权）
    weightedRate = (rawEngagementPercent / 100) * 1.5
  } else if (views > 0) {
    // 完全没有互动统计：根据播放量给中性保守估算（1.2%）
    weightedRate = 0.012
  } else {
    weightedRate = 0
  }

  // 互动表现打分：按目标满分率 targetEngagementRate 归一化到 [0, 1]
  const engagementScore = Math.min(1.0, Math.max(0, weightedRate / cfg.targetEngagementRate))

  // 2. 播放体量对数打分（Volume Momentum Factor）
  // 最小基数 10，最大千万播放 (10^7) 满分 1.0
  const effectiveViews = Math.max(10, views)
  const logViews = Math.log10(effectiveViews)
  const volumeScore = Math.min(1.0, Math.max(0, logViews / cfg.maxLogViews))

  // 3. 基础热度基准分（0 ~ 100）
  const baseScore = (cfg.engagementWeight * engagementScore + cfg.volumeWeight * volumeScore) * 100

  // 4. 时间引力衰减（Time Gravity Decay）
  // 双曲引力模型：Decay = 1 / (1 + age / halfLife) ^ gravity
  const safeAge = Math.max(0, ageDays)
  const decayFactor = 1 / Math.pow(1 + safeAge / cfg.halfLifeDays, cfg.decayGravity)

  // 5. 冷启动新苗扶持（Cold-Start Boost / 初级流量池保护机制）
  // 7天内且互动率表现达到门槛的潜力新内容，享有最高 1.5x 加成
  let coldStartBoost = 1.0
  if (safeAge <= cfg.coldStartDays && weightedRate >= cfg.coldStartMinRate) {
    const ageBonus = 1 - (safeAge / cfg.coldStartDays) // 0天 1.0, 7天 0.0
    coldStartBoost = 1.0 + (cfg.coldStartMaxBoost - 1.0) * ageBonus
  }

  // 6. 最终综合推荐分
  const finalScore = baseScore * decayFactor * coldStartBoost

  return Math.round(finalScore * 100) / 100
}

/**
 * 推荐算法排序函数：
 * 按综合推荐打分降序排列，得分相同按播放量降序，再按 id 升序稳定兜底。
 * 不改动原数组，返回全新排好序的数组。
 *
 * @template T
 * @param {Array<T>} items
 * @param {number} [nowMs]
 * @returns {Array<T>}
 */
export function sortTrendingByRecommendation(items, nowMs = Date.now()) {
  const list = Array.isArray(items) ? items.slice() : []
  if (list.length <= 1) return list

  // 预先缓存各元素的计算分数，避免排序比较时重复计算 O(N log N)
  const scoreMap = new Map()
  for (const item of list) {
    if (item && typeof item === 'object') {
      const score = calculateRecommendationScore(item, nowMs)
      scoreMap.set(item, score)
    }
  }

  return list.sort((a, b) => {
    const scoreA = scoreMap.get(a) ?? 0
    const scoreB = scoreMap.get(b) ?? 0
    if (scoreB !== scoreA) {
      return scoreB - scoreA
    }
    // 得分相同，播放量降序兜底
    const viewsA = Number(a?.views) || 0
    const viewsB = Number(b?.views) || 0
    if (viewsB !== viewsA) {
      return viewsB - viewsA
    }
    // 最终 id 升序稳定兜底
    const idA = String(a?.id || '')
    const idB = String(b?.id || '')
    return idA.localeCompare(idB)
  })
}
