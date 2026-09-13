/**
 * @file 护栏与状态：冷却闸 / 指数退避 / 窗口限流 / 状态读写。
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { ERROR_CODES, InterceptError } from '../src/core/errors.js'
import {
  JITTER_RATIO,
  checkCooldown,
  computeBackoffDelay,
  describeCooldown,
  respectChunkDelay,
  shouldRetry,
  withRetry,
} from '../src/guard.js'
import {
  MAX_LEDGER_ENTRIES,
  STATE_VERSION,
  emptyState,
  formatCompactUtc,
  formatIsoUtc,
  formatLogLine,
  formatShanghai,
  isAlreadyDrafted,
  loadState,
  makeRunId,
  markDrafted,
  normalizeState,
  recordRun,
  resolveLogPath,
  resolvePluginPaths,
  sanitizeLogData,
  saveState,
} from '../src/run-store.js'

const NOW_MS = Date.parse('2026-09-13T07:00:00.000Z')

// ── 冷却闸 ──────────────────────────────────────────────────────────────────

test('checkCooldown：无历史记录时放行', () => {
  assert.deepEqual(checkCooldown(emptyState(), NOW_MS, { cooldownMs: 90_000 }), { allowed: true })
  assert.deepEqual(checkCooldown({ lastRunAtMs: null }, NOW_MS, { cooldownMs: 90_000 }), {
    allowed: true,
  })
})

test('checkCooldown：冷却期内拒绝并给出 waitMs', () => {
  const decision = checkCooldown(
    { lastRunAtMs: NOW_MS - 87_000 },
    NOW_MS,
    { cooldownMs: 90_000 },
  )
  assert.equal(decision.allowed, false)
  assert.equal(decision.reason, 'cooldown-active')
  assert.equal(decision.waitMs, 3000)
  assert.equal(decision.lastRunAtMs, NOW_MS - 87_000)
})

test('checkCooldown：超出冷却期后放行', () => {
  const decision = checkCooldown(
    { lastRunAtMs: NOW_MS - 90_000 },
    NOW_MS,
    { cooldownMs: 90_000 },
  )
  assert.equal(decision.allowed, true)
})

test('checkCooldown：时钟回拨不能绕过冷却', () => {
  const decision = checkCooldown(
    { lastRunAtMs: NOW_MS + 60_000 },
    NOW_MS,
    { cooldownMs: 90_000 },
  )
  assert.equal(decision.allowed, false)
  assert.ok(/** @type {number} */ (decision.waitMs) > 90_000)
})

test('checkCooldown：cooldownMs = 0 表示不设冷却', () => {
  assert.equal(checkCooldown({ lastRunAtMs: NOW_MS }, NOW_MS, { cooldownMs: 0 }).allowed, true)
})

test('describeCooldown 文案逐字匹配交付标准', () => {
  const decision = checkCooldown({ lastRunAtMs: NOW_MS - 87_000 }, NOW_MS, { cooldownMs: 90_000 })
  assert.equal(
    describeCooldown(decision, { cooldownMs: 90_000, nowMs: NOW_MS }),
    '距上次运行 87 秒，冷却 90 秒；加 --force 强制',
  )
})

// ── 指数退避 ────────────────────────────────────────────────────────────────

test('withRetry 休眠序列为 [1000, 2000, 4000]，第 4 次失败后不再重试', async () => {
  /** @type {number[]} */
  const sleeps = []
  let calls = 0

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1
          throw new InterceptError(ERROR_CODES.SOURCE_UNAVAILABLE, '源不可用', { retryable: true })
        },
        {
          attempts: 3,
          baseDelayMs: 1000,
          // random = 0.5 → 抖动系数为 0 → 延时精确等于 base * 2^(n-1)
          random: () => 0.5,
          sleep: async (ms) => {
            sleeps.push(ms)
          },
        },
      ),
    (error) => {
      assert.equal(/** @type {any} */ (error).code, ERROR_CODES.SOURCE_UNAVAILABLE)
      return true
    },
  )

  assert.deepEqual(sleeps, [1000, 2000, 4000])
  assert.equal(calls, 4, '首次尝试 + 3 次重试 = 4 次调用，之后不再重试')
})

test('withRetry 遇到不可重试错误立即抛出（不消耗退避）', async () => {
  /** @type {number[]} */
  const sleeps = []
  let calls = 0

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1
          throw new InterceptError(ERROR_CODES.SOURCE_BAD_PAYLOAD, '载荷坏了', { retryable: false })
        },
        { attempts: 3, baseDelayMs: 1000, random: () => 0.5, sleep: async (ms) => void sleeps.push(ms) },
      ),
    (error) => {
      assert.equal(/** @type {any} */ (error).code, ERROR_CODES.SOURCE_BAD_PAYLOAD)
      return true
    },
  )

  assert.equal(calls, 1)
  assert.deepEqual(sleeps, [])
})

test('withRetry 在瞬时失败后成功返回', async () => {
  /** @type {number[]} */
  const sleeps = []
  let calls = 0

  const result = await withRetry(
    async () => {
      calls += 1
      if (calls < 3) {
        throw new InterceptError(ERROR_CODES.SOURCE_UNAVAILABLE, '抖动', { retryable: true })
      }
      return 'ok'
    },
    { attempts: 3, baseDelayMs: 1000, random: () => 0.5, sleep: async (ms) => void sleeps.push(ms) },
  )

  assert.equal(result, 'ok')
  assert.equal(calls, 3)
  assert.deepEqual(sleeps, [1000, 2000])
})

test('withRetry 触发 onRetry 回调并报告尝试序号', async () => {
  /** @type {Array<{ attempt: number, delayMs: number }>} */
  const retries = []
  await assert.rejects(() =>
    withRetry(
      async () => {
        throw new InterceptError(ERROR_CODES.SOURCE_UNAVAILABLE, 'x', { retryable: true })
      },
      {
        attempts: 2,
        baseDelayMs: 1000,
        random: () => 0.5,
        sleep: async () => {},
        onRetry: (info) => void retries.push({ attempt: info.attempt, delayMs: info.delayMs }),
      },
    ),
  )
  assert.deepEqual(retries, [
    { attempt: 1, delayMs: 1000 },
    { attempt: 2, delayMs: 2000 },
  ])
})

test('computeBackoffDelay 抖动幅度不超过 ±20%', () => {
  assert.equal(computeBackoffDelay(1, 1000, () => 0.5), 1000)
  assert.equal(computeBackoffDelay(2, 1000, () => 0.5), 2000)
  assert.equal(computeBackoffDelay(3, 1000, () => 0.5), 4000)

  const lowest = computeBackoffDelay(1, 1000, () => 0)
  const highest = computeBackoffDelay(1, 1000, () => 0.999999)
  assert.equal(lowest, Math.round(1000 * (1 - JITTER_RATIO)))
  assert.ok(highest <= Math.round(1000 * (1 + JITTER_RATIO)))
})

test('shouldRetry 只认可重试的 InterceptError', () => {
  assert.equal(shouldRetry(new InterceptError(ERROR_CODES.SOURCE_UNAVAILABLE, 'x')), true)
  assert.equal(shouldRetry(new InterceptError(ERROR_CODES.SOURCE_BAD_PAYLOAD, 'x')), false)
  assert.equal(shouldRetry(new InterceptError(ERROR_CODES.SOURCE_AUTH, 'x')), false)
  assert.equal(shouldRetry(new Error('plain')), false)
  assert.equal(shouldRetry(null), false)
})

test('respectChunkDelay 只在配置为正数时休眠', async () => {
  /** @type {number[]} */
  const sleeps = []
  await respectChunkDelay({ chunkDelayMs: 2000 }, async (ms) => void sleeps.push(ms))
  await respectChunkDelay({ chunkDelayMs: 0 }, async (ms) => void sleeps.push(ms))
  await respectChunkDelay({}, async (ms) => void sleeps.push(ms))
  assert.deepEqual(sleeps, [2000])
})

// ── 状态读写 ────────────────────────────────────────────────────────────────

test('resolvePluginPaths 组装状态目录 / 日志目录 / 报告目录', () => {
  const paths = resolvePluginPaths({ stateRoot: '/tmp/state' }, {})
  assert.equal(paths.stateRoot, '/tmp/state')
  assert.equal(paths.stateFile, '/tmp/state/state.json')
  assert.equal(paths.logDir, '/tmp/state/logs')
  assert.equal(paths.outDir, '/tmp/state/reports')
  assert.equal(resolveLogPath(paths, 'abc'), '/tmp/state/logs/run-abc.jsonl')

  const custom = resolvePluginPaths({ stateRoot: '/tmp/state', outDir: '/tmp/out' }, {})
  assert.equal(custom.outDir, '/tmp/out')
})

test('normalizeState 容忍各种坏输入并重置版本不符的状态', () => {
  assert.deepEqual(normalizeState(null), emptyState())
  assert.deepEqual(normalizeState('nope'), emptyState())
  assert.deepEqual(normalizeState({ version: 99, lastRunAtMs: 1 }), emptyState())

  const normalized = normalizeState({
    version: STATE_VERSION,
    lastRunAtMs: NOW_MS,
    draftedTweetIds: ['a', 1, '', 'b', null],
    runs: [{ runId: 'r1' }, 'junk', null],
  })
  assert.equal(normalized.lastRunAtMs, NOW_MS)
  assert.deepEqual(normalized.draftedTweetIds, ['a', 'b'])
  assert.deepEqual(normalized.runs, [{ runId: 'r1' }], '非对象条目被剔除')
})

test('loadState 对缺失文件 / 损坏 JSON 一律回退为空状态（不抛错）', async () => {
  const paths = resolvePluginPaths({ stateRoot: '/tmp/state' }, {})

  const missing = await loadState(paths, {
    readFile: async () => {
      throw new Error('ENOENT')
    },
  })
  assert.deepEqual(missing, emptyState())

  const corrupt = await loadState(paths, { readFile: async () => '{ broken' })
  assert.deepEqual(corrupt, emptyState())

  const blank = await loadState(paths, { readFile: async () => '   ' })
  assert.deepEqual(blank, emptyState())

  const ok = await loadState(paths, {
    readFile: async () => JSON.stringify({ version: STATE_VERSION, lastRunAtMs: 42, draftedTweetIds: [], runs: [] }),
  })
  assert.equal(ok.lastRunAtMs, 42)
})

test('saveState 写盘内容可被 loadState 读回', async () => {
  const paths = resolvePluginPaths({ stateRoot: '/tmp/state' }, {})
  /** @type {Map<string, string>} */
  const files = new Map()

  await saveState(
    paths,
    { version: STATE_VERSION, lastRunAtMs: NOW_MS, draftedTweetIds: ['x'], runs: [] },
    {
      writeFile: async (filePath, content) => {
        files.set(filePath, content)
      },
    },
  )

  const written = files.get('/tmp/state/state.json')
  assert.ok(written && written.endsWith('\n'), '状态文件应以换行结尾')
  const restored = await loadState(paths, { readFile: async () => String(written) })
  assert.equal(restored.lastRunAtMs, NOW_MS)
  assert.deepEqual(restored.draftedTweetIds, ['x'])
})

test('saveState 未注入 writeFile 时静默跳过', async () => {
  const paths = resolvePluginPaths({ stateRoot: '/tmp/state' }, {})
  await saveState(paths, emptyState(), {})
})

test('markDrafted 去重、保序、可判定', () => {
  const state = markDrafted(emptyState(), ['a', 'b', 'a', '', null])
  assert.deepEqual(state.draftedTweetIds, ['a', 'b'])
  assert.equal(isAlreadyDrafted(state, 'a'), true)
  assert.equal(isAlreadyDrafted(state, 'c'), false)
  assert.equal(isAlreadyDrafted(state, ''), false)

  const again = markDrafted(state, ['b', 'c'])
  assert.deepEqual(again.draftedTweetIds, ['a', 'b', 'c'])
  assert.deepEqual(state.draftedTweetIds, ['a', 'b'], '原状态不得被就地修改')
})

test('recordRun 推进冷却戳并保留台账', () => {
  const entry = {
    runId: 'r1',
    startedAtMs: NOW_MS,
    finishedAtMs: NOW_MS + 100,
    source: 'opencli',
    fetched: 20,
    candidates: 14,
    viral: 5,
    surging: 9,
    warnings: [],
  }
  const state = recordRun(emptyState(), entry)
  assert.equal(state.lastRunAtMs, NOW_MS)
  assert.equal(state.runs.length, 1)
  assert.equal(state.runs[0].runId, 'r1')

  let many = emptyState()
  for (let index = 0; index < MAX_LEDGER_ENTRIES + 10; index += 1) {
    many = recordRun(many, { ...entry, runId: `r${index}` })
  }
  assert.equal(many.runs.length, MAX_LEDGER_ENTRIES)
  assert.equal(many.runs[many.runs.length - 1].runId, `r${MAX_LEDGER_ENTRIES + 9}`)
})

test('makeRunId 形如 YYYYMMDDTHHmmssZ-<4 位十六进制>', () => {
  const runId = makeRunId(NOW_MS, () => 0.5)
  assert.match(runId, /^\d{8}T\d{6}Z-[0-9a-f]{4}$/)
  // Math.floor(0.5 * 0x10000) = 32768 = 0x8000
  assert.equal(runId, '20260913T070000Z-8000')
  assert.equal(makeRunId(NOW_MS, () => 0), '20260913T070000Z-0000')
  assert.equal(formatCompactUtc(NOW_MS), '20260913T070000Z')
})

test('时间格式化：ISO UTC 与 Asia/Shanghai', () => {
  assert.equal(formatIsoUtc(NOW_MS), '2026-09-13T07:00:00.000Z')
  assert.equal(formatShanghai(NOW_MS), '2026-09-13 15:00:00')
})

test('formatLogLine 脱敏：敏感键只留键名', () => {
  const line = formatLogLine(NOW_MS, 'info', 'fetch.start', {
    limit: 20,
    apiKey: 'sk-super-secret',
    OMNIMUX_TOKEN: 'tok-123',
    authorization: 'Bearer abc',
    cookie: 'session=xyz',
    source: 'opencli',
  })
  const parsed = JSON.parse(line)

  assert.equal(parsed.ts, '2026-09-13T07:00:00.000Z')
  assert.equal(parsed.level, 'info')
  assert.equal(parsed.event, 'fetch.start')
  assert.equal(parsed.data.limit, 20)
  assert.equal(parsed.data.source, 'opencli')
  assert.equal(parsed.data.apiKey, '[redacted]')
  assert.equal(parsed.data.OMNIMUX_TOKEN, '[redacted]')
  assert.equal(parsed.data.authorization, '[redacted]')
  assert.equal(parsed.data.cookie, '[redacted]')
  assert.ok(!line.includes('sk-super-secret'))
  assert.ok(!line.includes('tok-123'))
  assert.ok(!line.includes('session=xyz'))
})

test('sanitizeLogData 把复杂值降维为类型或计数', () => {
  const sanitized = sanitizeLogData({
    list: [1, 2, 3],
    nested: { a: 1 },
    text: 'x'.repeat(300),
    flag: true,
    count: 5,
  })
  assert.equal(sanitized.list, 3)
  assert.equal(sanitized.nested, 'object')
  assert.equal(sanitized.flag, true)
  assert.equal(sanitized.count, 5)
  assert.equal(String(sanitized.text).length, 201)
})
