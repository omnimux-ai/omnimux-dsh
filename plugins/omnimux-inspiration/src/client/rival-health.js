/**
 * 账号健康态的唯一判据源（#3111，规格 §8.1）。
 *
 * Host 只报事实（`refresh_state` / `error_code` / `consecutive_failures` /
 * `next_auto_refresh_at` / `last_refresh_at`），这里负责把它们翻译成账号行
 * 与状态条共用的四种健康态。判据放 Client 且只有一个函数：状态条的五段
 * 计数也在这里聚合，Host 若再判一次，两处必然漂移，「计数闭合」就会是
 * 两个实现互相打脸。
 *
 * 优先级：`需要重新导入 > 已停止 > 冷却中 > 正常`——不可自动恢复的终态
 * 优先于会自恢复的限流。`paused`（额度暂停）归入 `normal`：额度是池级
 * 事实，由 `pool.quota` 常驻表达，账号行不做第五态（用户 2026-10-05 拍板，
 * 规格 N12）。
 */

import { zh } from './locales.js'

const MS_PER_MINUTE = 60_000

/**
 * One account's health for the filter row.
 * @param {Record<string, any> | null | undefined} account
 * @param {number} [nowMs]
 * @returns {'reimport' | 'stopped' | 'cooling' | 'normal'}
 */
export function accountHealth(account, nowMs = Date.now()) {
  if (!account || account.refresh_state !== 'error') {
    if (account?.refresh_state === 'backoff' && coolingMinutesLeft(account, nowMs) !== null) {
      return 'cooling'
    }
    return 'normal'
  }
  // `error` 的两个互斥子类：身份类失败只能换链接重新导入，其余失败由
  // 行内「重试」承担。两个态的用户动作不同，合并会让一个状态挂两种修法。
  return account.error_code === 'identity-unverified' ? 'reimport' : 'stopped'
}

/**
 * Minutes until the backoff retry, always a whole minute and never below 1.
 * `null` means「not cooling」: the row falls back to `normal`, never to a
 * guessed zero.
 * @param {Record<string, any> | null | undefined} account
 * @param {number} [nowMs]
 * @returns {number | null}
 */
export function coolingMinutesLeft(account, nowMs = Date.now()) {
  if (!account || account.refresh_state !== 'backoff') return null
  const at = Date.parse(String(account.next_auto_refresh_at || ''))
  if (!Number.isFinite(at)) return null
  const left = at - nowMs
  if (!(left > 0)) return null
  return Math.max(1, Math.ceil(left / MS_PER_MINUTE))
}

/**
 * The「已停止」reason line, or `null` when the Host did not report a count.
 *
 * A missing `consecutive_failures` hides the whole reason line — the badge
 * stays, but no「连续 0 次刷新失败」placeholder is allowed on screen.
 * @param {Record<string, any> | null | undefined} account
 * @param {{ reason?: string }} [template] the zh dictionary template, overridable for tests
 * @returns {string | null}
 */
export function stoppedReasonText(account, template = {}) {
  const failures = account?.consecutive_failures
  if (typeof failures !== 'number' || !Number.isFinite(failures)) return null
  const pattern = template.reason ?? zh['rivalAccounts.health.stoppedReason']
  return pattern.replace('{n}', String(failures))
}

/**
 * Pool-level tally for `pool.summary`. The four buckets partition the pool:
 * `ok` is the default, so a `paused` account lands here and the segments close
 * onto `total` exactly.
 * @param {Array<Record<string, any>> | null | undefined} accounts
 * @param {number} [nowMs]
 * @returns {{ total: number, ok: number, cooling: number, reimport: number, stopped: number }}
 */
export function poolTally(accounts, nowMs = Date.now()) {
  const tally = { total: 0, ok: 0, cooling: 0, reimport: 0, stopped: 0 }
  for (const account of Array.isArray(accounts) ? accounts : []) {
    tally.total += 1
    const health = accountHealth(account, nowMs)
    if (health === 'reimport') tally.reimport += 1
    else if (health === 'stopped') tally.stopped += 1
    else if (health === 'cooling') tally.cooling += 1
    else tally.ok += 1
  }
  return tally
}

/**
 * Today's refresh allowance for `pool.quota`.
 *
 * The E9 snapshot reports both sides of the global daily ledger; E1's
 * `config_summary.limits` is the fallback for a snapshot that never landed.
 * `null` means neither side is on the wire — the quota line hides rather
 * than printing a guess.
 * @param {Record<string, any> | null | undefined} status the E9 snapshot
 * @param {Record<string, any> | null | undefined} configSummary E1's config_summary
 * @returns {{ left: number, total: number } | null}
 */
export function poolQuota(status, configSummary) {
  const used = Number(status?.budget_used?.global_calls)
  const total = Number(status?.budget_limits?.cloud_calls_global_per_day)
    || Number(configSummary?.limits?.cloud_calls_global_per_day)
  if (!Number.isFinite(total) || total <= 0) return null
  const spent = Number.isFinite(used) ? used : 0
  return { left: Math.max(0, total - spent), total }
}

/**
 * Minutes left on the manual pool-refresh cooldown, or `null` outside the
 * window. `windowMinutes` comes from the Host's own constant
 * (`MANUAL_COOLDOWN_MINUTES.all`), not from a UI guess.
 * @param {number | null | undefined} lastRefreshAt when the manual refresh was last issued
 * @param {number} [nowMs]
 * @param {number} [windowMinutes]
 * @returns {number | null}
 */
export function manualCooldownMinutesLeft(lastRefreshAt, nowMs = Date.now(), windowMinutes = 30) {
  const at = Number(lastRefreshAt)
  if (!Number.isFinite(at) || at <= 0) return null
  const left = at + windowMinutes * MS_PER_MINUTE - nowMs
  if (!(left > 0)) return null
  return Math.max(1, Math.ceil(left / MS_PER_MINUTE))
}

/**
 * Minutes since the pool's newest refresh, or `null` when no account ever
 * refreshed — the freshness segment hides itself in that case. Never returns
 * `0`: a refresh that just happened reads `1`, matching「数据更新于
 * {n} 分钟前」whose最小值是 1（规格 B13）。
 * @param {Array<Record<string, any>> | null | undefined} accounts
 * @param {number} [nowMs]
 * @returns {number | null}
 */
export function poolFreshnessMinutes(accounts, nowMs = Date.now()) {
  const newest = (Array.isArray(accounts) ? accounts : [])
    .map((account) => Date.parse(String(account?.last_refresh_at || '')))
    .filter((value) => Number.isFinite(value))
  if (newest.length === 0) return null
  const elapsed = nowMs - Math.max(...newest)
  return Math.max(1, Math.floor(elapsed / MS_PER_MINUTE))
}
