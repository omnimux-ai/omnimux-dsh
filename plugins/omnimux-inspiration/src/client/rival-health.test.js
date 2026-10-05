import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accountHealth,
  coolingMinutesLeft,
  manualCooldownMinutesLeft,
  poolFreshnessMinutes,
  poolQuota,
  poolTally,
  stoppedReasonText,
} from './rival-health.js'

/**
 * #3111 四态判据（规格 §8.1）。期望值逐字取自规格字典与判据表：
 *
 *   需要重新导入 > 已停止 > 冷却中 > 正常
 *
 * `paused` 归入「正常」——用户 2026-10-05 拍板：状态条四段计数必须闭合到
 * 账号总数，账号行不做第五态。
 */

const NOW = Date.parse('2026-10-05T08:00:00.000Z')

const stopped = (extra = {}) => ({
  refresh_state: 'error',
  error_code: 'cloud-error',
  consecutive_failures: 3,
  ...extra,
})

describe('accountHealth — 四态判据（规格 §8.1）', () => {
  it('error + identity-unverified → reimport（需要重新导入）', () => {
    assert.equal(
      accountHealth({ refresh_state: 'error', error_code: 'identity-unverified' }),
      'reimport',
    )
  })

  it('error + 非身份类 error_code → stopped（已停止）', () => {
    assert.equal(accountHealth({ refresh_state: 'error', error_code: 'cloud-error' }), 'stopped')
    assert.equal(accountHealth({ refresh_state: 'error', error_code: 'no-content' }), 'stopped')
    assert.equal(accountHealth({ refresh_state: 'error', error_code: null }), 'stopped')
  })

  it('backoff + 可解析 next_auto_refresh_at → cooling', () => {
    assert.equal(
      accountHealth({
        refresh_state: 'backoff',
        next_auto_refresh_at: new Date(NOW + 18 * 60_000).toISOString(),
      }, NOW),
      'cooling',
    )
  })

  it('backoff 缺 next_auto_refresh_at → normal', () => {
    assert.equal(accountHealth({ refresh_state: 'backoff' }, NOW), 'normal')
  })

  it('idle / queued / running / paused → normal（paused 归入正常，计数闭合）', () => {
    for (const state of ['idle', 'queued', 'running', 'paused']) {
      assert.equal(accountHealth({ refresh_state: state }, NOW), 'normal')
    }
    assert.equal(accountHealth({}, NOW), 'normal')
    assert.equal(accountHealth(null, NOW), 'normal')
  })
})

describe('coolingMinutesLeft', () => {
  it('向上取整，最小 1', () => {
    const account = {
      refresh_state: 'backoff',
      next_auto_refresh_at: new Date(NOW + 18.4 * 60_000).toISOString(),
    }
    assert.equal(coolingMinutesLeft(account, NOW), 19)
    const soon = {
      refresh_state: 'backoff',
      next_auto_refresh_at: new Date(NOW + 1).toISOString(),
    }
    assert.equal(coolingMinutesLeft(soon, NOW), 1)
  })

  it('非 backoff 或时间缺失/已过期 → null', () => {
    assert.equal(coolingMinutesLeft({ refresh_state: 'idle' }, NOW), null)
    assert.equal(coolingMinutesLeft({ refresh_state: 'backoff' }, NOW), null)
    assert.equal(
      coolingMinutesLeft({
        refresh_state: 'backoff',
        next_auto_refresh_at: new Date(NOW - 60_000).toISOString(),
      }, NOW),
      null,
    )
  })
})

describe('stoppedReasonText — 连续失败原因行', () => {
  it('带计数时填数（逐字模板 `连续 {n} 次刷新失败`）', () => {
    assert.equal(stoppedReasonText(stopped()), '连续 3 次刷新失败')
    assert.equal(stoppedReasonText(stopped({ consecutive_failures: 1 })), '连续 1 次刷新失败')
  })

  it('{n} 未上报时返回 null：原因行整行不渲染，无占位符', () => {
    assert.equal(stoppedReasonText(stopped({ consecutive_failures: undefined })), null)
    assert.equal(stoppedReasonText(stopped({ consecutive_failures: '3' })), null)
    assert.equal(stoppedReasonText(stopped({ consecutive_failures: null })), null)
    assert.equal(stoppedReasonText(stopped({ consecutive_failures: Number.NaN })), null)
  })
})

describe('poolTally — 五段计数闭合', () => {
  it('四段互斥且之和等于总数', () => {
    const accounts = [
      { refresh_state: 'idle' },
      { refresh_state: 'paused' },
      { refresh_state: 'queued' },
      { refresh_state: 'running' },
      { refresh_state: 'idle' },
      { refresh_state: 'backoff', next_auto_refresh_at: new Date(NOW + 42 * 60_000).toISOString() },
      { refresh_state: 'backoff', next_auto_refresh_at: new Date(NOW + 18 * 60_000).toISOString() },
      { refresh_state: 'error', error_code: 'identity-unverified' },
    ]
    const tally = poolTally(accounts, NOW)
    assert.equal(tally.total, 8)
    assert.equal(tally.ok, 5)
    assert.equal(tally.cooling, 2)
    assert.equal(tally.reimport, 1)
    assert.equal(tally.stopped, 0)
    assert.equal(tally.ok + tally.cooling + tally.reimport + tally.stopped, tally.total)
  })

  it('含已停止账号时计数闭合仍成立', () => {
    const accounts = [
      { refresh_state: 'idle' },
      { refresh_state: 'error', error_code: 'cloud-error', consecutive_failures: 4 },
      { refresh_state: 'backoff', next_auto_refresh_at: new Date(NOW + 5 * 60_000).toISOString() },
      { refresh_state: 'error', error_code: 'identity-unverified' },
    ]
    const tally = poolTally(accounts, NOW)
    assert.deepEqual(
      [tally.total, tally.ok, tally.cooling, tally.reimport, tally.stopped],
      [4, 1, 1, 1, 1],
    )
  })

  it('空池返回全零', () => {
    const tally = poolTally([], NOW)
    assert.deepEqual(
      [tally.total, tally.ok, tally.cooling, tally.reimport, tally.stopped],
      [0, 0, 0, 0, 0],
    )
  })
})

describe('poolFreshnessMinutes — 数据新鲜度', () => {
  it('取最新 last_refresh_at 的分钟差，最小 1（规格 B13：不出现 `0 分钟前`）', () => {
    const accounts = [
      { last_refresh_at: new Date(NOW - 3 * 60_000).toISOString() },
      { last_refresh_at: new Date(NOW - 30 * 60_000).toISOString() },
      { last_refresh_at: null },
    ]
    assert.equal(poolFreshnessMinutes(accounts, NOW), 3)
    assert.equal(
      poolFreshnessMinutes([{ last_refresh_at: new Date(NOW - 500).toISOString() }], NOW),
      1,
    )
  })

  it('无数据 → null（该段不渲染）', () => {
    assert.equal(poolFreshnessMinutes([], NOW), null)
    assert.equal(poolFreshnessMinutes([{ last_refresh_at: null }], NOW), null)
  })
})

describe('poolQuota — 今日剩余刷新额度', () => {
  it('从 E9 快照读「上限 − 已用」', () => {
    const quota = poolQuota(
      { budget_used: { global_calls: 4 }, budget_limits: { cloud_calls_global_per_day: 50 } },
      null,
    )
    assert.deepEqual(quota, { left: 46, total: 50 })
  })

  it('快照缺失时回退 E1 config_summary.limits；两者都没有 → null（该段不渲染）', () => {
    assert.deepEqual(
      poolQuota(null, { limits: { cloud_calls_global_per_day: 50 } }),
      { left: 50, total: 50 },
    )
    assert.equal(poolQuota(null, null), null)
  })

  it('已用超出上限时剩余不取负', () => {
    const quota = poolQuota(
      { budget_used: { global_calls: 52 }, budget_limits: { cloud_calls_global_per_day: 50 } },
      null,
    )
    assert.equal(quota.left, 0)
  })
})

describe('manualCooldownMinutesLeft — 手动刷新冷却', () => {
  it('窗口内返回剩余分钟（向上取整），窗口外或从未刷新返回 null', () => {
    const windowMinutes = 30
    assert.equal(manualCooldownMinutesLeft(NOW - 10 * 60_000, NOW, windowMinutes), 20)
    assert.equal(manualCooldownMinutesLeft(NOW - 29.5 * 60_000, NOW, windowMinutes), 1)
    assert.equal(manualCooldownMinutesLeft(NOW - 31 * 60_000, NOW, windowMinutes), null)
    assert.equal(manualCooldownMinutesLeft(0, NOW, windowMinutes), null)
    assert.equal(manualCooldownMinutesLeft(undefined, NOW, windowMinutes), null)
  })
})
