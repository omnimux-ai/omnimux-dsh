/**
 * @file 附录 A 公式算例锚点 + 分级边界 + 纯函数门禁。
 *
 * 本测试文件是**业务正确性的根**：公式系数禁止调参凑测试，A1–A4 必须与设计文档逐位相等。
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildRecord, normalizeRecords, parseCreatedAt } from '../src/collect/tweet.js'
import {
  HOURS_ALIVE_MAX,
  HOURS_ALIVE_MIN,
  classifyTier,
  computeExposure,
  computeTweetStats,
  scoreTweets,
  toHoursAlive,
} from '../src/core/algorithm.js'
import { clamp, nullToZero, safeNumber } from '../src/core/metrics.js'
import { rankTweets, splitByTier } from '../src/core/sort.js'

/** 固定基准时刻（消除时钟依赖）。 */
const NOW_MS = Date.parse('2026-09-13T07:00:00.000Z')

const CORE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/core')

/**
 * 构造一条「N 小时前发布」的记录。
 * @param {{ id?: string, views: unknown, hoursAgo: number, replies?: unknown, likes?: unknown }} spec 规格
 * @param {string} [id] 推文 id
 * @returns {import('../src/collect/tweet.js').TweetRecord}
 */
function recordAt(spec, id = 't1') {
  return buildRecord(
    {
      id: spec.id ?? id,
      author: '测试作者',
      handle: 'tester',
      text: '测试推文正文',
      likes: spec.likes ?? 0,
      replies: spec.replies ?? 0,
      views: spec.views,
      created_at: new Date(NOW_MS - spec.hoursAgo * 3_600_000).toISOString(),
      url: `https://x.com/tester/status/${spec.id ?? id}`,
    },
    NOW_MS,
    'fixture',
  )
}

// ── §3.2 固定算例锚点 A1–A4 ────────────────────────────────────────────────

test('A1 极新爆款：(120000, R=2, replies=3) 逐位对齐', () => {
  const record = recordAt({ views: 120_000, hoursAgo: 2, replies: 3, likes: 812, id: '1001' })
  const stats = computeTweetStats(record, NOW_MS)

  assert.equal(stats.hoursAlive, 2)
  assert.equal(stats.pace, 60_000)
  assert.equal(stats.tier, 'viral')
  assert.equal(stats.exposure.timeDecay, 5.3)
  assert.equal(stats.exposure.freshnessBonus, 1.28 - 2 / 18)
  assert.equal(stats.exposure.competition, 1.14 - Math.log10(4) * 0.22)
  assert.equal(stats.exposure.baseRate, 0.04)
  assert.equal(stats.exposure.predicted, 14_980)
  assert.equal(stats.exposure.floored, false)
})

test('A2 老帖飙升：(200000, R=40, replies=900) 双触底且竞争项未触底', () => {
  const record = recordAt({ views: 200_000, hoursAgo: 40, replies: 900, id: '1002' })
  const stats = computeTweetStats(record, NOW_MS)

  assert.equal(stats.hoursAlive, 40)
  assert.equal(stats.pace, 5_000)
  assert.equal(stats.tier, 'surging')
  // 时间衰减触底（1.2）、时效触底（0.55），竞争项**未**触底。
  assert.equal(stats.exposure.timeDecay, 1.2)
  assert.equal(stats.exposure.freshnessBonus, 0.55)
  assert.equal(stats.exposure.competition, 1.14 - Math.log10(901) * 0.22)
  assert.ok(stats.exposure.competition > 0.42, '竞争项不应触底')
  assert.equal(stats.exposure.predicted, 65)
})

test('A3 零曝光兜底：(0, R=10, replies=0) 命中 20 下限', () => {
  const record = recordAt({ views: 0, hoursAgo: 10, replies: 0, id: '1007' })
  const stats = computeTweetStats(record, NOW_MS)

  assert.equal(stats.pace, 0)
  assert.equal(stats.tier, 'normal')
  assert.equal(stats.exposure.timeDecay, 2.5)
  assert.equal(stats.exposure.competition, 1.08)
  assert.equal(stats.exposure.predicted, 20)
  assert.equal(stats.exposure.floored, true)
})

test('A4 未来时间戳：(500, R=-3) 夹到 1/60 且不抛错', () => {
  const record = recordAt({ views: 500, hoursAgo: -3, replies: 0, id: 'dirty-future' })
  const stats = computeTweetStats(record, NOW_MS)

  assert.equal(stats.hoursAlive, HOURS_ALIVE_MIN)
  assert.ok(stats.hoursAliveRaw < 0, '原始差值应为负（诊断字段）')
  assert.equal(stats.pace, 30_000)
  assert.equal(stats.tier, 'viral')
  assert.equal(stats.exposure.predicted, Math.max(20, Math.round(30_000 * stats.exposure.timeDecay * stats.exposure.freshnessBonus * stats.exposure.competition * 0.04)))
  assert.deepEqual(record.anomalies, ['CLOCK_SKEW_FUTURE'])
  // R > 0，因此时间衰减拿不到 6 的上限。
  assert.ok(stats.exposure.timeDecay < 6)
  assert.equal(stats.exposure.timeDecay, 6 - (1 / 60) * 0.35)
})

// ── 分级边界（闭区间/开区间混合） ────────────────────────────────────────────

test('分级边界 5 条断言', () => {
  assert.equal(classifyTier(7999.99), 'surging')
  assert.equal(classifyTier(8000), 'surging')
  assert.equal(classifyTier(8000.01), 'viral')
  assert.equal(classifyTier(999.99), 'normal')
  assert.equal(classifyTier(1000), 'surging')
})

test('分级对非法输入退化为 normal（不抛错）', () => {
  assert.equal(classifyTier(Number.NaN), 'normal')
  assert.equal(classifyTier(Number.POSITIVE_INFINITY), 'normal')
})

// ── 存活时长夹取 ────────────────────────────────────────────────────────────

test('存活小时 R 夹取到 [1/60, 48]', () => {
  assert.equal(toHoursAlive(NOW_MS, NOW_MS).hours, HOURS_ALIVE_MIN)
  assert.equal(toHoursAlive(NOW_MS, NOW_MS - 49 * 3_600_000).hours, HOURS_ALIVE_MAX)
  assert.equal(toHoursAlive(NOW_MS, NOW_MS - 24 * 3_600_000).hours, 24)
  assert.equal(toHoursAlive(NOW_MS, NOW_MS + 5 * 3_600_000).clockSkew, true)
  assert.equal(toHoursAlive(NOW_MS, NOW_MS - 3_600_000).clockSkew, false)
})

// ── 曝光拆解边界 ────────────────────────────────────────────────────────────

test('曝光拆解各个 clamp 方向正确（防止 min/max 写反）', () => {
  const fresh = computeExposure(0, HOURS_ALIVE_MIN, 0)
  assert.ok(fresh.timeDecay > 5.99 && fresh.timeDecay < 6, 'R→0 时衰减接近但不等于 6')
  assert.ok(fresh.freshnessBonus < 1.28, 'R→0 时时效接近但不等于 1.28')

  const old = computeExposure(0, 48, 0)
  assert.equal(old.timeDecay, 1.2)
  assert.equal(old.freshnessBonus, 0.55)

  assert.equal(computeExposure(0, 1, 0).competition, 1.08)
  assert.equal(computeExposure(0, 1, 2000).competition, 0.42)
  assert.equal(computeExposure(0, 1, 999_999).competition, 0.42)
})

test('replies 为 null 时按 0 参与计算', () => {
  const withNull = computeExposure(1000, 2, Number.NaN)
  const withZero = computeExposure(1000, 2, 0)
  assert.deepEqual(withNull, withZero)
})

// ── 空值语义：null 与 0 严格区分 ────────────────────────────────────────────

test('views=null 按 0 参与计算，但不与真实 0 混同', () => {
  const missing = buildRecord(
    { id: 'x1', author: 'a', created_at: new Date(NOW_MS - 3_600_000).toISOString() },
    NOW_MS,
    'fixture',
  )
  assert.equal(missing.metrics.views, null)
  assert.ok(missing.anomalies.includes('VIEWS_MISSING'))

  const real = recordAt({ views: 0, hoursAgo: 1, id: 'x2' })
  assert.equal(real.metrics.views, 0)
  assert.deepEqual(real.anomalies, [])

  // 两条的 pace 都是 0（同样按 0 计算），但 degraded 状态不同。
  assert.equal(computeTweetStats(missing, NOW_MS).pace, computeTweetStats(real, NOW_MS).pace)
  const [missingScored] = scoreTweets([missing], NOW_MS)
  const [realScored] = scoreTweets([real], NOW_MS)
  assert.equal(missingScored.degraded, true)
  assert.equal(realScored.degraded, false)
})

test('safeNumber / clamp / nullToZero 契约', () => {
  assert.equal(safeNumber(5), 5)
  assert.equal(safeNumber(Number.NaN), null)
  assert.equal(safeNumber('5'), null)
  assert.equal(nullToZero(null), 0)
  assert.equal(nullToZero(7), 7)
  assert.equal(clamp(5, 1, 3), 3)
  assert.equal(clamp(0, 1, 3), 1)
  assert.equal(clamp(Number.NaN, 1, 3), 1)
  assert.equal(clamp(2, 1, 3), 2)
})

// ── 排序可复现性 ────────────────────────────────────────────────────────────

test('normalizeRecords 对非数组输入返回空数组（不抛错）', () => {
  assert.deepEqual(normalizeRecords(null, NOW_MS, 'fixture'), [])
  assert.deepEqual(normalizeRecords(undefined, NOW_MS, 'fixture'), [])
  assert.deepEqual(normalizeRecords({}, NOW_MS, 'fixture'), [])
  assert.deepEqual(normalizeRecords([], NOW_MS, 'fixture'), [])
})

test('rankTweets 同输入连续两次结果完全一致', () => {
  const fixture = [
    recordAt({ views: 1000, hoursAgo: 1, id: 'b' }),
    recordAt({ views: 1000, hoursAgo: 1, id: 'a' }),
    recordAt({ views: 900_000, hoursAgo: 1, id: 'c' }),
  ]
  const scored = scoreTweets(fixture, NOW_MS)
  const first = rankTweets(scored, 'exposure').map((row) => row.record.id)
  const second = rankTweets(scored, 'exposure').map((row) => row.record.id)
  assert.deepEqual(first, second)
  // 同分按 id 升序稳定兜底。
  assert.deepEqual(first, ['c', 'a', 'b'])
})

test('rankTweets 按 pace 排序且不改动入参数组', () => {
  const scored = scoreTweets(
    [
      recordAt({ views: 1000, hoursAgo: 1, id: 'slow' }),
      recordAt({ views: 900_000, hoursAgo: 1, id: 'fast' }),
    ],
    NOW_MS,
  )
  const snapshot = scored.map((row) => row.record.id)
  const ranked = rankTweets(scored, 'pace')
  assert.deepEqual(ranked.map((row) => row.record.id), ['fast', 'slow'])
  assert.deepEqual(scored.map((row) => row.record.id), snapshot, '入参数组不得被就地排序')
})

test('splitByTier 分桶且保持入参顺序', () => {
  const scored = scoreTweets(
    [
      recordAt({ views: 500_000, hoursAgo: 1, id: 'viral' }),
      recordAt({ views: 3000, hoursAgo: 1, id: 'surging' }),
      recordAt({ views: 10, hoursAgo: 1, id: 'normal' }),
    ],
    NOW_MS,
  )
  const buckets = splitByTier(scored)
  assert.deepEqual(buckets.viral.map((row) => row.record.id), ['viral'])
  assert.deepEqual(buckets.surging.map((row) => row.record.id), ['surging'])
  assert.deepEqual(buckets.normal.map((row) => row.record.id), ['normal'])
})

// ── 时间解析 ────────────────────────────────────────────────────────────────

test('parseCreatedAt 支持 ISO 8601 / epoch / 相对时间，且以注入的 nowMs 为基准', () => {
  assert.equal(parseCreatedAt('2026-09-13T06:00:00.000Z', NOW_MS).createdAtMs, NOW_MS - 3_600_000)
  assert.equal(parseCreatedAt('2026-09-13T06:00:00Z', NOW_MS).createdAtMs, NOW_MS - 3_600_000)
  assert.equal(parseCreatedAt(NOW_MS - 3_600_000, NOW_MS).createdAtMs, NOW_MS - 3_600_000)
  assert.equal(parseCreatedAt('30 分钟前', NOW_MS).createdAtMs, NOW_MS - 30 * 60_000)
  assert.equal(parseCreatedAt('2 小时前', NOW_MS).createdAtMs, NOW_MS - 2 * 3_600_000)
  assert.equal(parseCreatedAt('3 天前', NOW_MS).createdAtMs, NOW_MS - 3 * 86_400_000)
  assert.equal(parseCreatedAt('5m', NOW_MS).createdAtMs, NOW_MS - 5 * 60_000)
  assert.equal(parseCreatedAt('2 hours', NOW_MS).createdAtMs, NOW_MS - 2 * 3_600_000)
  assert.equal(parseCreatedAt('刚刚', NOW_MS).createdAtMs, NOW_MS)

  const invalid = parseCreatedAt('not-a-date', NOW_MS)
  assert.equal(invalid.anomaly, 'CREATED_AT_INVALID')
  assert.equal(invalid.createdAtMs, NOW_MS, '不可解析时按 R=1/60 继续，不抛错')
})

// ── 纯函数门禁（硬边界 1） ──────────────────────────────────────────────────

test('纯函数门禁：src/core/** 源码不得出现任何副作用入口', () => {
  const files = readdirSync(CORE_DIR).filter((file) => file.endsWith('.js'))
  assert.ok(files.length >= 4, `core 目录应至少有 4 个模块，实际 ${files.length}`)

  const forbidden = ['Date.now', 'process.', "require(", "from 'node:", 'import fs', 'setTimeout', 'console.']

  for (const file of files) {
    const source = readFileSync(path.join(CORE_DIR, file), 'utf8')
    for (const token of forbidden) {
      assert.ok(
        !source.includes(token),
        `${file} 不应出现副作用入口 ${token}（§7.1 纯函数边界）`,
      )
    }
  }
})

test('公式只出现在 core/algorithm.js（grep 计数为 1）', () => {
  const srcDir = path.resolve(CORE_DIR, '..')
  const hits = []

  /**
   * 递归收集源文件。
   * @param {string} dir 目录
   */
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) hits.push(full)
    }
  }
  walk(srcDir)

  const owners = hits.filter((file) => readFileSync(file, 'utf8').includes('Math.log10'))
  assert.deepEqual(
    owners.map((file) => path.relative(srcDir, file)),
    ['core/algorithm.js'],
    '竞争折扣公式只允许出现在 core/algorithm.js',
  )
})
