/**
 * @file 采集层测试：argv 契约 / 错误码映射 / 异常标记 / hub 信封。
 *
 * 全程**零子进程、零网络**：`run` 与 `request` 一律注入假实现。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  AUTH_HINT,
  BRIDGE_HINT,
  buildTimelineArgv,
  classifyFailure,
  fetchTimelineFromOpencli,
  parseEnvelope,
} from '../src/collect/opencli-source.js'
import {
  buildHubRequest,
  fetchTimelineFromHub,
  unwrapEnvelope,
} from '../src/collect/hub-source.js'
import {
  applyCaps,
  fetchTimeline,
  fetchTimelineFromFixture,
} from '../src/collect/timeline-fetcher.js'
import { normalizeRecords } from '../src/collect/tweet.js'
import { ERROR_CODES, isInterceptError } from '../src/core/errors.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_MAIN = path.join(TEST_DIR, 'fixtures/timeline.json')
const FIXTURE_DIRTY = path.join(TEST_DIR, 'fixtures/timeline-dirty.json')

const NOW_MS = Date.parse('2026-09-13T07:00:00.000Z')

/** 本机实测的 OpenCLI 桥接失败原文（v1.8.8，2026-09-13）。 */
const REAL_BRIDGE_ERROR_STDERR = `ok: false
error:
  code: COMMAND_EXEC
  message: >-
    Pre-navigation to https://x.com failed: attach failed: Cannot access a chrome-extension:// URL of different
    extension. Tip: another Chrome extension may be interfering — try disabling other extensions
  help: Check that the site is reachable and the browser extension is running.
  exitCode: 1
`

/**
 * 读取夹具原始文本。
 * @param {string} file 夹具路径
 * @returns {string}
 */
function readFixture(file) {
  return readFileSync(file, 'utf8')
}

/**
 * 断言抛出物是带指定错误码的 InterceptError。
 * @param {unknown} error 抛出物
 * @param {string} code 期望错误码
 * @param {string} [hintIncludes] hint 中必须包含的片段
 */
function assertError(error, code, hintIncludes) {
  assert.ok(isInterceptError(error), `应抛 InterceptError，实际 ${String(error)}`)
  assert.equal(/** @type {any} */ (error).code, code)
  if (hintIncludes) {
    assert.ok(
      /** @type {any} */ (error).hint?.includes(hintIncludes),
      `hint 应包含「${hintIncludes}」，实际「${/** @type {any} */ (error).hint}」`,
    )
  }
}

// ── argv 契约 ───────────────────────────────────────────────────────────────

test('buildTimelineArgv 参数数组逐位精确', () => {
  assert.deepEqual(buildTimelineArgv({ limit: 20 }), [
    'twitter',
    'timeline',
    '-f',
    'json',
    '--limit',
    '20',
  ])
  assert.deepEqual(buildTimelineArgv({ limit: 3 }), [
    'twitter',
    'timeline',
    '-f',
    'json',
    '--limit',
    '3',
  ])
  // 默认类型为 for-you 时不追加 --type。
  assert.deepEqual(buildTimelineArgv({ limit: 3, type: 'for-you' }), [
    'twitter',
    'timeline',
    '-f',
    'json',
    '--limit',
    '3',
  ])
  // following 才追加。
  assert.deepEqual(buildTimelineArgv({ limit: 3, type: 'following' }), [
    'twitter',
    'timeline',
    '-f',
    'json',
    '--limit',
    '3',
    '--type',
    'following',
  ])
})

// ── 成功路径 ────────────────────────────────────────────────────────────────

test('fetchTimelineFromOpencli 用注入的 run 调用且 argv 正确', async () => {
  /** @type {string[][]} */
  const calls = []
  const fixture = JSON.parse(readFixture(FIXTURE_MAIN))

  const result = await fetchTimelineFromOpencli(
    { limit: 20, nowMs: NOW_MS },
    {
      run: async (argv, options) => {
        calls.push(argv)
        assert.equal(options.timeoutMs, 30_000)
        return { stdout: JSON.stringify(fixture), stderr: '', code: 0 }
      },
    },
  )

  assert.deepEqual(calls, [['twitter', 'timeline', '-f', 'json', '--limit', '20']])
  assert.equal(result.source, 'opencli')
  assert.equal(result.records.length, 20)
  assert.equal(result.rawCount, 20)
  assert.equal(result.fetchedAtMs, NOW_MS)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.records[0].id, '1001')
  assert.equal(result.records[0].metrics.views, 120_000)
  assert.equal(result.records[0].authorHandle, 'ai_watch')
})

test('fetchTimelineFromOpencli 接受 { data: [...] } 信封', async () => {
  const result = await fetchTimelineFromOpencli(
    { limit: 5, nowMs: NOW_MS },
    {
      run: async () => ({
        stdout: JSON.stringify({ data: [{ id: '1', text: 'hi', views: '1k' }] }),
        stderr: '',
        code: 0,
      }),
    },
  )
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].metrics.views, 1000)
})

test('--limit 20 而源返回更多时截断并留痕', async () => {
  const many = Array.from({ length: 25 }, (_value, index) => ({
    id: `m${index}`,
    author: 'a',
    text: 't',
    views: '10',
    created_at: new Date(NOW_MS - 3_600_000).toISOString(),
  }))

  const result = await fetchTimelineFromOpencli(
    { limit: 20, nowMs: NOW_MS },
    { run: async () => ({ stdout: JSON.stringify(many), stderr: '', code: 0 }) },
  )

  assert.equal(result.records.length, 20)
  assert.equal(result.rawCount, 25)
  assert.equal(result.warnings.length, 1)
  assert.ok(result.warnings[0].includes('25'))
  assert.ok(result.warnings[0].includes('20'))
})

// ── 失败路径（严禁返回空数组） ──────────────────────────────────────────────

test('非 0 退出码映射为 SOURCE_UNAVAILABLE（不返回空数组）', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        { run: async () => ({ stdout: '', stderr: 'boom', code: 1 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_UNAVAILABLE)
      return true
    },
  )
})

test('本机实测的桥接失败串被识别为 SOURCE_UNAVAILABLE 且 hint 可执行', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        { run: async () => ({ stdout: '', stderr: REAL_BRIDGE_ERROR_STDERR, code: 1 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_UNAVAILABLE)
      const hint = /** @type {any} */ (error).hint
      assert.ok(hint.includes('opencli doctor'), `hint 应提示 opencli doctor：${hint}`)
      assert.ok(hint.includes('x.com'), `hint 应提示 x.com 登录态：${hint}`)
      assert.equal(/** @type {any} */ (error).retryable, true)
      return true
    },
  )
})

test('登录态失败串映射为 SOURCE_AUTH', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        { run: async () => ({ stdout: '', stderr: 'Error: not logged in to x.com', code: 1 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_AUTH)
      assert.equal(/** @type {any} */ (error).hint, AUTH_HINT)
      return true
    },
  )
})

test('可执行文件缺失映射为 SOURCE_UNAVAILABLE 且给出安装建议', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        { run: async () => ({ stdout: '', stderr: 'spawn opencli ENOENT', code: -1 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_UNAVAILABLE, 'which opencli')
      return true
    },
  )
})

test('stdout 非 JSON → SOURCE_BAD_PAYLOAD；JSON 但无数组 → 同样', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        { run: async () => ({ stdout: 'this is not json', stderr: '', code: 0 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_BAD_PAYLOAD)
      return true
    },
  )

  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        { run: async () => ({ stdout: JSON.stringify({ ok: true, count: 0 }), stderr: '', code: 0 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_BAD_PAYLOAD)
      return true
    },
  )
})

test('空 stdout → SOURCE_BAD_PAYLOAD（空数组只能表示「真的没有推文」）', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        { run: async () => ({ stdout: '', stderr: '', code: 0 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_BAD_PAYLOAD)
      return true
    },
  )
})

test('退出码 0 但携带 ok:false 信封时仍按失败归类', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromOpencli(
        { limit: 20, nowMs: NOW_MS },
        {
          run: async () => ({
            stdout: JSON.stringify({
              ok: false,
              error: { code: 'COMMAND_EXEC', message: 'attach failed: chrome-extension:// mismatch' },
            }),
            stderr: '',
            code: 0,
          }),
        },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_UNAVAILABLE)
      return true
    },
  )
})

test('缺少注入的 run 或 nowMs 一律抛 INTERNAL（内部缺陷）', async () => {
  await assert.rejects(
    () => fetchTimelineFromOpencli({ limit: 20, nowMs: NOW_MS }, {}),
    (error) => {
      assertError(error, ERROR_CODES.INTERNAL)
      return true
    },
  )

  await assert.rejects(
    () => fetchTimelineFromOpencli({ limit: 20 }, { run: async () => ({ stdout: '[]', stderr: '', code: 0 }) }),
    (error) => {
      assertError(error, ERROR_CODES.INTERNAL, 'nowMs')
      return true
    },
  )
})

test('parseEnvelope 三种形态', () => {
  assert.equal(parseEnvelope('[]').kind, 'array')
  assert.equal(parseEnvelope('[{"id":"1"}]').kind, 'array')
  assert.equal(parseEnvelope('{"data":[]}').kind, 'array')
  assert.equal(parseEnvelope('{"ok":false,"error":{"message":"x"}}').kind, 'error')
  assert.equal(parseEnvelope(REAL_BRIDGE_ERROR_STDERR).kind, 'error')
  assert.equal(parseEnvelope(REAL_BRIDGE_ERROR_STDERR).code, 'COMMAND_EXEC')
  assert.equal(parseEnvelope('nonsense').kind, 'invalid')
  assert.equal(parseEnvelope('').kind, 'invalid')
})

test('classifyFailure 优先识别桥接失败而非登录失败', () => {
  const error = classifyFailure({
    code: 1,
    stderr: 'attach failed: Cannot access a chrome-extension:// URL; 401 unauthorized',
  })
  assert.equal(error.code, ERROR_CODES.SOURCE_UNAVAILABLE)
  assert.equal(error.hint, BRIDGE_HINT)
})

// ── 脏数据夹具：异常标记必须精确 ────────────────────────────────────────────

test('normalizeRecords 对 timeline-dirty.json 输出精确 anomalies 集合', () => {
  const records = normalizeRecords(JSON.parse(readFixture(FIXTURE_DIRTY)), NOW_MS, 'fixture')
  /** @type {Record<string, string[]>} */
  const byId = {}
  for (const record of records) byId[record.id] = record.anomalies

  assert.deepEqual(byId['dirty-future'], ['CLOCK_SKEW_FUTURE'])
  assert.deepEqual(byId['dirty-missing-views'], ['VIEWS_MISSING'])
  assert.deepEqual(byId['dirty-empty-views'], ['VIEWS_MISSING'])
  assert.deepEqual(byId['dirty-placeholder-views'], ['VIEWS_MISSING'])
  assert.deepEqual(byId['dirty-unparseable-views'], ['VIEWS_UNPARSEABLE'])
  assert.deepEqual(byId['dirty-invalid-time'], ['CREATED_AT_INVALID'])
  assert.deepEqual(byId['dirty-no-author'], ['AUTHOR_MISSING'])
  assert.deepEqual(byId['dirty-billion'], [])
  assert.deepEqual(byId['dirty-wan'], [])
  assert.deepEqual(byId['dirty-zero-replies'], [])
})

test('脏夹具的单位换算与时间解析结果正确', () => {
  const records = normalizeRecords(JSON.parse(readFixture(FIXTURE_DIRTY)), NOW_MS, 'fixture')
  const byId = new Map(records.map((record) => [record.id, record]))

  assert.equal(byId.get('dirty-billion')?.metrics.views, 1_100_000_000)
  assert.equal(byId.get('dirty-wan')?.metrics.views, 127_000)
  assert.equal(byId.get('dirty-thousands')?.metrics.views, 1234)
  assert.equal(byId.get('dirty-thousands')?.metrics.likes, 1234)

  // 相对时间必须以注入的 nowMs 为基准。
  assert.equal(byId.get('dirty-relative')?.createdAtMs, NOW_MS - 30 * 60_000)
  // 不可解析的时间按 nowMs 处理（R 会夹到 1/60），不抛错。
  assert.equal(byId.get('dirty-invalid-time')?.createdAtMs, NOW_MS)
  // 缺失浏览量保持 null，不与 0 混同。
  assert.equal(byId.get('dirty-missing-views')?.metrics.views, null)
  assert.equal(byId.get('dirty-empty-views')?.metrics.views, null)
  // 零回复是真实值 0。
  assert.equal(byId.get('dirty-zero-replies')?.metrics.replies, 0)
  // 无作者记录仍能用 url 兜底，此条连 url 都没有。
  assert.equal(byId.get('dirty-no-author')?.authorHandle, '')
})

test('主夹具（20 条）全部干净，无任何 anomaly', () => {
  const records = normalizeRecords(JSON.parse(readFixture(FIXTURE_MAIN)), NOW_MS, 'fixture')
  assert.equal(records.length, 20)
  const dirty = records.filter((record) => record.anomalies.length > 0)
  assert.deepEqual(dirty, [], '主夹具是「真实结构快照」，不应含脏数据')
})

test('主夹具三级分布符合预期（爆款 5 / 飙升 9 / 正常 6）', async () => {
  const { scoreTweets } = await import('../src/core/algorithm.js')
  const records = normalizeRecords(JSON.parse(readFixture(FIXTURE_MAIN)), NOW_MS, 'fixture')
  const scored = scoreTweets(records, NOW_MS)
  const counts = { viral: 0, surging: 0, normal: 0 }
  for (const row of scored) counts[row.stats.tier] += 1
  assert.deepEqual(counts, { viral: 5, surging: 9, normal: 6 })
})

// ── hub 降级适配 ────────────────────────────────────────────────────────────

test('buildHubRequest 按 capability 分流', () => {
  const timeline = buildHubRequest({ limit: 20 })
  assert.equal(timeline.platform, 'x')
  assert.equal(timeline.capability, 'x/user-tweets')
  assert.equal(timeline.params.limit, 20)
  assert.equal(timeline.params.timeline, 'for-you')

  const following = buildHubRequest({ limit: 5, type: 'following' })
  assert.equal(following.params.timeline, 'following')

  const single = buildHubRequest({ tweetId: '123' })
  assert.equal(single.capability, 'x/tweet')
  assert.equal(single.params.tweetId, '123')
})

test('unwrapEnvelope 处理 {code,data} 信封', () => {
  assert.deepEqual(unwrapEnvelope({ code: 0, data: [{ id: '1' }] }), [{ id: '1' }])
  assert.deepEqual(unwrapEnvelope({ code: 0, data: { items: [{ id: '2' }] } }), [{ id: '2' }])
  assert.deepEqual(unwrapEnvelope({ code: 0, data: { id: '3' } }), [{ id: '3' }])
  assert.deepEqual(unwrapEnvelope([{ id: '4' }]), [{ id: '4' }])
  assert.throws(() => unwrapEnvelope({ code: 500, message: 'quota exceeded' }), /quota exceeded/)
  assert.throws(() => unwrapEnvelope(null), /结构无法识别/)
})

test('fetchTimelineFromHub 用假 request 完成字段映射', async () => {
  /** @type {Array<{ tool: string, args: any }>} */
  const calls = []
  const result = await fetchTimelineFromHub(
    { limit: 20, nowMs: NOW_MS },
    {
      request: async (tool, args) => {
        calls.push({ tool, args })
        return {
          code: 0,
          data: [
            {
              id: 'hub-1',
              author: 'hub 作者',
              handle: 'hub_user',
              text: '来自 hub 的推文',
              likes: '1.2k',
              retweets: 30,
              replies: 5,
              views: '3.4m',
              created_at: '2026-09-13T06:00:00.000Z',
              url: 'https://x.com/hub_user/status/hub-1',
            },
          ],
        }
      },
    },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].tool, 'omnimux_social_data')
  assert.equal(calls[0].args.platform, 'x')
  assert.equal(result.source, 'hub')
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].metrics.views, 3_400_000)
  assert.equal(result.records[0].metrics.likes, 1200)
  assert.equal(result.records[0].authorHandle, 'hub_user')
  assert.equal(result.records[0].source, 'hub')
})

test('fetchTimelineFromHub 在 code !== 0 时抛错而非返回空数组', async () => {
  await assert.rejects(
    () =>
      fetchTimelineFromHub(
        { limit: 20, nowMs: NOW_MS },
        { request: async () => ({ code: 500, message: 'quota exceeded' }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_UNAVAILABLE, 'opencli')
      return true
    },
  )
})

// ── 采集编排与上限 ──────────────────────────────────────────────────────────

test('applyCaps 施加条数硬上限并留痕', () => {
  const result = {
    records: Array.from({ length: 5 }, (_value, index) => ({ id: String(index) })),
    source: 'fixture',
    fetchedAtMs: NOW_MS,
    rawCount: 5,
    warnings: [],
  }
  const capped = applyCaps(/** @type {any} */ (result), { maxTweets: 3 })
  assert.equal(capped.records.length, 3)
  assert.equal(capped.warnings.length, 1)
  assert.ok(capped.warnings[0].includes('3'))

  const untouched = applyCaps(/** @type {any} */ (result), { maxTweets: 100 })
  assert.equal(untouched.records.length, 5)
  assert.deepEqual(untouched.warnings, [])
})

test('fetchTimelineFromFixture 读取夹具并归一', async () => {
  const result = await fetchTimelineFromFixture(
    { fixturePath: FIXTURE_MAIN, limit: 20, nowMs: NOW_MS },
    { readFile: async (filePath) => readFixture(filePath) },
  )
  assert.equal(result.source, 'fixture')
  assert.equal(result.records.length, 20)
  assert.equal(result.rawCount, 20)
})

test('fetchTimelineFromFixture 缺路径/坏 JSON 时给出可执行错误', async () => {
  await assert.rejects(
    () => fetchTimelineFromFixture({ nowMs: NOW_MS }, { readFile: async () => '[]' }),
    (error) => {
      assertError(error, ERROR_CODES.ARG_INVALID, '--fixture')
      return true
    },
  )

  await assert.rejects(
    () =>
      fetchTimelineFromFixture(
        { fixturePath: '/tmp/x.json', nowMs: NOW_MS },
        { readFile: async () => '{ not json' },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_BAD_PAYLOAD)
      return true
    },
  )
})

test('fetchTimeline 主源失败时降级到 hub 并留痕', async () => {
  const result = await fetchTimeline(
    { source: 'opencli', limit: 20, nowMs: NOW_MS },
    {
      run: async () => ({ stdout: '', stderr: REAL_BRIDGE_ERROR_STDERR, code: 1 }),
      request: async () => ({
        code: 0,
        data: [{ id: 'h1', author: 'a', text: 't', views: '1k', created_at: '2026-09-13T06:00:00.000Z' }],
      }),
    },
  )
  assert.equal(result.source, 'hub')
  assert.equal(result.records.length, 1)
  assert.ok(result.warnings.some((warning) => warning.includes('降级到 OmniMux hub')))
})

test('fetchTimeline 主源失败且不允许降级时直接抛出', async () => {
  await assert.rejects(
    () =>
      fetchTimeline(
        { source: 'opencli', limit: 20, nowMs: NOW_MS, allowHubFallback: false },
        { run: async () => ({ stdout: '', stderr: REAL_BRIDGE_ERROR_STDERR, code: 1 }) },
      ),
    (error) => {
      assertError(error, ERROR_CODES.SOURCE_UNAVAILABLE)
      return true
    },
  )
})
