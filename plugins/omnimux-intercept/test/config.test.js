/**
 * @file 配置默认值与夹取（T01 交付标准 5）。
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  COOLDOWN_MS,
  DEFAULTS,
  LIMIT_MAX,
  LIMIT_MIN,
  MAX_TWEETS,
  RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  TIMEOUT_MS,
  clampLimit,
  meetsMinTier,
  parseFormat,
  parseLimit,
  parseMinExposure,
  parseMinTier,
  parseRankBy,
  parseSource,
  parseTimelineType,
  resolveConfig,
  resolveStateRoot,
  tierRank,
} from '../src/config.js'
import { ERROR_CODES, isInterceptError } from '../src/core/errors.js'

test('默认值符合设计契约', () => {
  assert.equal(DEFAULTS.limit, 20)
  assert.equal(DEFAULTS.type, 'for-you')
  assert.equal(DEFAULTS.rankBy, 'exposure')
  assert.equal(DEFAULTS.minTier, 'surging')
  assert.equal(DEFAULTS.cooldownMs, 90_000)
  assert.equal(DEFAULTS.retryAttempts, 3)
  assert.equal(DEFAULTS.retryBaseDelayMs, 1000)
  assert.equal(DEFAULTS.timeoutMs, 30_000)
  assert.equal(DEFAULTS.maxTweets, 200)

  assert.equal(COOLDOWN_MS, 90_000)
  assert.equal(TIMEOUT_MS, 30_000)
  assert.equal(MAX_TWEETS, 200)
  assert.equal(RETRY_ATTEMPTS, 3)
  assert.equal(RETRY_BASE_DELAY_MS, 1000)
  assert.equal(LIMIT_MIN, 1)
  assert.equal(LIMIT_MAX, 200)
})

test('clampLimit 把任意输入夹到 [1, 200]', () => {
  assert.equal(clampLimit(0), LIMIT_MIN)
  assert.equal(clampLimit(-10), LIMIT_MIN)
  assert.equal(clampLimit(1), 1)
  assert.equal(clampLimit(20), 20)
  assert.equal(clampLimit(200), 200)
  assert.equal(clampLimit(201), LIMIT_MAX)
  assert.equal(clampLimit(99_999), LIMIT_MAX)
  assert.equal(clampLimit('20'), 20)
  assert.equal(clampLimit('abc'), DEFAULTS.limit)
  assert.equal(clampLimit(undefined), DEFAULTS.limit)
  assert.equal(clampLimit(20.9), 20)
})

test('parseLimit 合法取值通过', () => {
  assert.equal(parseLimit('20'), 20)
  assert.equal(parseLimit(20), 20)
  assert.equal(parseLimit('1'), 1)
  assert.equal(parseLimit('200'), 200)
  assert.equal(parseLimit(' 42 '), 42)
})

test('parseLimit 非法取值抛 ARG_INVALID 且消息逐字匹配', () => {
  for (const bad of ['abc', '0', '201', '-1', '1.5', '', '1e3', 0, 201, -1, 1.5, null, undefined, {}]) {
    assert.throws(
      () => parseLimit(bad),
      (error) => {
        assert.ok(isInterceptError(error), `${String(bad)} 应抛 InterceptError`)
        assert.equal(error.code, ERROR_CODES.ARG_INVALID)
        assert.equal(error.message, '参数 --limit 必须是 1..200 的整数')
        assert.ok(error.hint && error.hint.includes('--limit'))
        return true
      },
      `${JSON.stringify(bad)} 应当被拒绝`,
    )
  }
})

test('resolveConfig 默认值与覆盖', () => {
  const defaults = resolveConfig({}, { DSH_HOME: '/tmp/dsh-home' })
  assert.equal(defaults.limit, 20)
  assert.equal(defaults.stateRoot, path.join('/tmp/dsh-home', 'omnimux-intercept'))
  assert.equal(defaults.cooldownMs, 90_000)
  assert.equal(defaults.timeoutMs, 30_000)
  assert.equal(defaults.maxTweets, 200)

  const overridden = resolveConfig(
    { limit: 999, type: 'following', rankBy: 'pace', minTier: 'viral', minExposure: 500, cooldownMs: 0 },
    { DSH_HOME: '/tmp/dsh-home' },
  )
  assert.equal(overridden.limit, 200, '超上限被夹取')
  assert.equal(overridden.type, 'following')
  assert.equal(overridden.rankBy, 'pace')
  assert.equal(overridden.minTier, 'viral')
  assert.equal(overridden.minExposure, 500)
  assert.equal(overridden.cooldownMs, 0)
})

test('resolveStateRoot 回退到 ~/.dsh', () => {
  const root = resolveStateRoot({})
  assert.ok(root.endsWith(path.join('.dsh', 'omnimux-intercept')), root)
  assert.equal(resolveStateRoot({ DSH_HOME: '  ' }).endsWith('omnimux-intercept'), true)
})

test('分级强度与门槛判定', () => {
  assert.equal(tierRank('normal'), 0)
  assert.equal(tierRank('surging'), 1)
  assert.equal(tierRank('viral'), 2)
  assert.equal(tierRank('bogus'), -1)

  assert.equal(meetsMinTier('viral', 'surging'), true)
  assert.equal(meetsMinTier('surging', 'surging'), true)
  assert.equal(meetsMinTier('normal', 'surging'), false)
  assert.equal(meetsMinTier('normal', 'normal'), true)
  assert.equal(meetsMinTier('bogus', 'surging'), false)
})

test('枚举参数校验', () => {
  assert.equal(parseTimelineType('for-you'), 'for-you')
  assert.equal(parseTimelineType('following'), 'following')
  assert.throws(() => parseTimelineType('bogus'), /--type/)

  assert.equal(parseRankBy('exposure'), 'exposure')
  assert.equal(parseRankBy('pace'), 'pace')
  assert.throws(() => parseRankBy('bogus'), /--rank-by/)

  assert.equal(parseMinTier('viral'), 'viral')
  assert.throws(() => parseMinTier('bogus'), /--min-tier/)

  assert.equal(parseMinExposure('0'), 0)
  assert.equal(parseMinExposure('100'), 100)
  assert.throws(() => parseMinExposure('-1'), /--min-exposure/)
  assert.throws(() => parseMinExposure('abc'), /--min-exposure/)

  assert.equal(parseSource('opencli'), 'opencli')
  assert.equal(parseSource('fixture'), 'fixture')
  assert.throws(() => parseSource('bogus'), /--source/)

  assert.equal(parseFormat('table'), 'table')
  assert.equal(parseFormat('genui'), 'genui')
  assert.throws(() => parseFormat('bogus'), /--format/)
})
