import { isPublishingAccount } from '../account-policy.js'
/**
 * capabilities.js: 矩阵驱动的表单裁剪判定（纯逻辑，浏览器与测试环境共享）。
 *
 * 数据来自 Host GET /omnimux/publish/capabilities（与 agent 工具校验同一份合并
 * 矩阵）——同源保证：UI 置灰的理由与 submit 拦截的理由出自同一张表。
 *
 * 该模块不 import React / window，node --test 可直接单测。
 */

/**
 * 平台能力行（未知平台安全缺省：什么都支持，不拦截）。
 * @param {Record<string, Record<string, unknown>> | undefined} platforms
 * @param {string} platform
 * @returns {Record<string, unknown>}
 */
export function platformRow(platforms, platform) {
  const key = String(platform || '').toLowerCase()
  const row = platforms && typeof platforms === 'object' ? platforms[key] : undefined
  return row && typeof row === 'object' ? /** @type {Record<string, unknown>} */ (row) : {}
}

/**
 * @param {Record<string, Record<string, unknown>>} platforms
 * @param {string} platform
 */
export function platformLabel(platforms, platform) {
  const row = platformRow(platforms, platform)
  return typeof row.label === 'string' && row.label ? row.label : String(platform || '')
}

/**
 * 平台是否支持该内容类型。
 * @param {Record<string, Record<string, unknown>>} platforms
 * @param {string} platform
 * @param {'video' | 'image'} type
 */
export function supportsType(platforms, platform, type) {
  const row = platformRow(platforms, platform)
  const mediaTypes = Array.isArray(row.media_types) ? row.media_types : null
  // 未知平台（不在矩阵）不拦截；在矩阵但缺 media_types 视为全支持
  if (mediaTypes === null) return true
  return mediaTypes.includes(type)
}

/**
 * 封面裁剪判定：所选账号的平台中存在不支持封面者 → 封面区置灰并给出理由。
 * @param {Record<string, Record<string, unknown>>} platforms
 * @param {string[]} platformsOfSelected 已选账号的平台列表
 * @returns {{ enabled: boolean, blockedPlatforms: string[] }}
 */
export function coverDecision(platforms, platformsOfSelected) {
  const seen = [...new Set((platformsOfSelected || []).map((p) => String(p || '').toLowerCase()))]
  const blocked = seen.filter((p) => platformRow(platforms, p).supports_cover !== true)
  return { enabled: blocked.length === 0, blockedPlatforms: blocked }
}

/**
 * 图文数量上限：取所选平台 max_images 的最小值（缺省不设限）。
 * @param {Record<string, Record<string, unknown>>} platforms
 * @param {string[]} platformsOfSelected
 * @returns {number | undefined}
 */
export function imageLimit(platforms, platformsOfSelected) {
  const seen = [...new Set((platformsOfSelected || []).map((p) => String(p || '').toLowerCase()))]
  const limits = seen
    .map((p) => platformRow(platforms, p).max_images)
    .filter((v) => typeof v === 'number' && v > 0)
  return limits.length > 0 ? Math.min(...limits) : undefined
}

/**
 * 表单整体裁剪视图：一次算完 Composer 需要的全部判定。
 * @param {{
 *   platforms: Record<string, Record<string, unknown>>,
 *   selectedAccounts: Array<Record<string, unknown>>,
 *   type: 'video' | 'image',
 *   imageCount?: number,
 * }} input
 */
export function formCapabilities(input) {
  const platforms = input.platforms || {}
  const selected = Array.isArray(input.selectedAccounts) ? input.selectedAccounts : []
  const platformsOfSelected = selected.map((row) => String(row.platform || '').toLowerCase())
  const cover = coverDecision(platforms, platformsOfSelected)
  const limit = input.type === 'image' ? imageLimit(platforms, platformsOfSelected) : undefined
  const imageCount = typeof input.imageCount === 'number' ? input.imageCount : 0
  return {
    cover,
    imageLimit: limit,
    imageOverLimit: typeof limit === 'number' && imageCount > limit,
    // 类型冲突：所选账号的平台里有不支持当前内容类型的
    typeConflicts: [...new Set(platformsOfSelected)]
      .filter((p) => !supportsType(platforms, p, input.type)),
  }
}

/**
 * 账号可用性（与 Host accounts.js 判定同义：status ∈ {active, expiring} 且
 * agent_usable !== false）。浏览器侧的 ViewRow 已由 hub /omnimux/accounts 计算好
 * status，这里只做展示层判定。
 * @param {Record<string, unknown>} row
 * @returns {{ ok: boolean, reason: 'expired' | 'error' | 'agentOff' | '' }}
 */
export function accountUsable(row) {
  if (!isPublishingAccount(row)) return { ok: false, reason: 'error' }
  const status = String(row.status || '').toLowerCase()
  if (status === 'expired') return { ok: false, reason: 'expired' }
  if (status && status !== 'active' && status !== 'expiring') return { ok: false, reason: 'error' }
  if (row.agent_usable === false) return { ok: false, reason: 'agentOff' }
  return { ok: true, reason: '' }
}

/**
 * 账号面板数据整形：平台 → 账号 两级分组（可用性标记随行）。
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Array<{ platform: string, accounts: Array<Record<string, unknown> & { usable: boolean, unusableReason: 'expired' | 'error' | 'agentOff' | '' }> }>}
 */
export function groupAccountsByPlatform(rows) {
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const byPlatform = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isPublishingAccount(row)) continue
    const platform = String(row.platform || '').toLowerCase() || 'other'
    if (!byPlatform.has(platform)) byPlatform.set(platform, [])
    byPlatform.get(platform).push(row)
  }
  return [...byPlatform.entries()]
    .map(([platform, accounts]) => ({
      platform,
      accounts: accounts.map((row) => {
        const verdict = accountUsable(row)
        return { ...row, usable: verdict.ok, unusableReason: verdict.reason }
      }),
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform))
}

/**
 * 话题输入解析：空格 / 中英文逗号分隔。
 * @param {string} raw
 * @returns {string[]}
 */
export function parseTopics(raw) {
  return String(raw || '')
    .split(/[\s,，]+/)
    .map((item) => item.replace(/^#/, '').trim())
    .filter((item) => item !== '')
}
