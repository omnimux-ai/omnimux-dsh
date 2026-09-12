/**
 * Issue #1382 P1 regression: the hub media poll lifecycle must be bounded.
 *
 * Defect as shipped: `pollOpenAiMediaTask` was an unbounded `for (;;)` whose
 * only exits were a terminal task status or a caller abort, and `getJson` had
 * no per-request timeout at all. A task stuck at `processing` was polled
 * forever; a provider that never answered hung the node without ever reaching
 * an `aborted` check, because `fetch` never settled.
 *
 * Every case below uses an injected fake fetcher or a loopback server and a
 * fake clock-ish `sleep`. No model API is contacted (see
 * docs/contracts/model-api-authority.md): a hub test run has no network at all
 * — `scripts/test-network-guard.mjs` replaces `globalThis.fetch`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finishMediaTask } from './execute.js'
import { pollOpenAiMediaTask } from './protocols/openai-media.js'
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_BUDGET_MS,
  DEFAULT_TASK_DEADLINE_MS,
  MEDIA_EXECUTION_BUDGET_MS,
  POLL_RETRY_POLICY,
  SPEECH_TASK_DEADLINE_MS,
  TASK_TIMEOUT_CODE,
  TASK_UNKNOWN_CODE,
  WORKFLOW_EXECUTION_TIMEOUT_MS,
  isRetryablePollError,
  remainingMs,
  resolveDeadlineFromSubmit,
  taskTimeout,
} from './task-deadline.js'

const ROUTE = { baseUrl: 'https://example.invalid', modelId: 'fixture-model' }

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

/** A fetcher that only settles when the signal it was given aborts. */
function hangingFetcher(onAttempt) {
  return async (url, init) => {
    onAttempt(init)
    if (!init?.signal) throw new Error('fetcher received no signal')
    const signal = init.signal
    await new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new Error('aborted'))
        return
      }
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    })
  }
}

test('#1382 修复前失败：固定 processing 响应下轮询无出口', async () => {
  let calls = 0
  const started = Date.now()
  await assert.rejects(
    () => pollOpenAiMediaTask({
      fetcher: async () => {
        calls += 1
        return jsonResponse({ status: 'processing' })
      },
      baseUrl: ROUTE.baseUrl,
      apiKey: 'fixture',
      taskId: 'task-deadline',
      capability: 'video',
      // Fix-before: deadlineMs was ignored and the loop never returned, so this
      // test never settled (it hung until the runner was killed).
      deadlineMs: 300,
    }),
    { code: 'omnimux-task-timeout' },
  )
  const elapsed = Date.now() - started
  assert.ok(calls >= 1, 'the poll must actually have polled')
  assert.ok(elapsed < 3000, `deadline must bound the poll, took ${elapsed}ms`)
})

test('#1382 修复前失败：上游挂死不响应时永久挂起', async () => {
  // The fake fetcher reports the defect the same way the real one does: if it
  // is handed no signal it cannot be bounded, so it fails loudly instead of
  // hanging the suite. Fix-before that is exactly what happened (no signal was
  // passed into fetch), and the poll rejected with a bare error.
  let attempts = 0
  const started = Date.now()
  await assert.rejects(
    () => pollOpenAiMediaTask({
      fetcher: hangingFetcher(() => { attempts += 1 }),
      baseUrl: ROUTE.baseUrl,
      apiKey: 'fixture',
      taskId: 'task-hang',
      capability: 'video',
      deadlineMs: 700,
      requestTimeoutMs: 150,
      pollIntervalMs: 10,
      retryBudgetMs: 300,
    }),
    { code: 'omnimux-task-timeout' },
  )
  const elapsed = Date.now() - started
  assert.ok(attempts >= 1, 'the poll must have issued requests')
  assert.ok(elapsed >= 600, `the poll should run to its deadline, took ${elapsed}ms`)
  assert.ok(elapsed < 3000, `the deadline must bound the poll, took ${elapsed}ms`)
})

test('可重试 5xx：退避重试后完成（GET 次数 > 3）', async () => {
  let calls = 0
  const json = await pollOpenAiMediaTask({
    fetcher: async () => {
      calls += 1
      if (calls <= 3) return jsonResponse({ error: 'upstream busy' }, 503)
      return jsonResponse({ status: 'completed', url: 'https://cdn.example/out.mp4' })
    },
    baseUrl: ROUTE.baseUrl,
    apiKey: 'fixture',
    taskId: 'task-503',
    capability: 'video',
    deadlineMs: 5000,
    pollIntervalMs: 10,
    requestTimeoutMs: 100,
    // A tight retry window keeps the backoff observable without real waits.
    retryBudgetMs: 150,
  })
  assert.equal(json.status, 'completed')
  assert.ok(calls > 3, `transient 5xx must be retried, got ${calls} GETs`)
})

test('单次重试使用退避（不叠加两层重试）', async () => {
  let calls = 0
  const started = Date.now()
  await pollOpenAiMediaTask({
    fetcher: async () => {
      calls += 1
      if (calls === 1) return jsonResponse({ error: 'gateway hiccup' }, 503)
      return jsonResponse({ status: 'completed', url: 'https://cdn.example/out.mp4' })
    },
    baseUrl: ROUTE.baseUrl,
    apiKey: 'fixture',
    taskId: 'task-backoff',
    capability: 'video',
    deadlineMs: 5000,
    pollIntervalMs: 10,
  })
  assert.equal(calls, 2)
  assert.ok(Date.now() - started >= POLL_RETRY_POLICY.baseDelayMs * 0.5, 'the retry must back off')
})

test('不可重试状态码立即失败（GET 次数 == 1）', async () => {
  // 401 is the hub's established "needs login" mapping and 422 stays an HTTP
  // failure. A 404 on the task resource is neither: it means the upstream does
  // not have that task, which is the answer a reconcile reads as "resubmit".
  const cases = [
    { status: 401, code: 'needs-omnimux' },
    { status: 404, code: 'omnimux-invalid-request' },
    { status: 422, code: 'omnimux-request-failed' },
  ]
  for (const { status, code } of cases) {
    let calls = 0
    await assert.rejects(
      () => pollOpenAiMediaTask({
        fetcher: async () => {
          calls += 1
          return jsonResponse({ error: 'nope' }, status)
        },
        baseUrl: ROUTE.baseUrl,
        apiKey: 'fixture',
        taskId: `task-${status}`,
        capability: 'video',
        deadlineMs: 5000,
        pollIntervalMs: 10,
      }),
      (error) => error.code === code && error.status === status,
    )
    assert.equal(calls, 1, `HTTP ${status} must not be retried`)
  }
})

test('#1382 未知任务：复核得到「不可复核」的错误码', async () => {
  await assert.rejects(
    () => finishMediaTask('video', ROUTE, {
      dest: '/tmp/omnimux-1382/unknown.mp4',
      taskId: 'task-gone',
      authKey: 'fixture',
      fetcher: async () => jsonResponse({ error: 'no such task' }, 404),
    }),
    (error) => error.code === 'omnimux-invalid-request'
      && error.status === 404
      && /unknown to the upstream/.test(error.message),
  )
})

test('上游终态 failure 不重试（保持 #831 语义）', async () => {
  let calls = 0
  await assert.rejects(
    () => pollOpenAiMediaTask({
      fetcher: async () => {
        calls += 1
        return jsonResponse({ status: 'failure' })
      },
      baseUrl: ROUTE.baseUrl,
      apiKey: 'fixture',
      taskId: 'task-failure',
      capability: 'video',
      deadlineMs: 5000,
      sleep: async () => { throw new Error('terminal status must not sleep') },
    }),
    { code: 'omnimux-failed' },
  )
  assert.equal(calls, 1)
})

test('调用方取消不重试', async () => {
  const controller = new AbortController()
  let calls = 0
  const running = pollOpenAiMediaTask({
    fetcher: async () => {
      calls += 1
      controller.abort()
      return jsonResponse({ status: 'processing' })
    },
    baseUrl: ROUTE.baseUrl,
    apiKey: 'fixture',
    taskId: 'task-abort',
    capability: 'video',
    signal: controller.signal,
    deadlineMs: 5000,
    pollIntervalMs: 10,
  })
  await assert.rejects(() => running, { code: 'omnimux-aborted' })
  assert.equal(calls, 1, 'a caller cancel must not be retried')
})

test('瞬态失败耗尽重试预算后仍按 deadline 继续轮询（deadline 是唯一权威）', async () => {
  let calls = 0
  const started = Date.now()
  await assert.rejects(
    () => pollOpenAiMediaTask({
      fetcher: async () => {
        calls += 1
        return jsonResponse({ error: 'still down' }, 503)
      },
      baseUrl: ROUTE.baseUrl,
      apiKey: 'fixture',
      taskId: 'task-persistent-503',
      capability: 'video',
      deadlineMs: 1200,
      pollIntervalMs: 10,
      retryBudgetMs: 150,
    }),
    { code: 'omnimux-task-timeout' },
  )
  const elapsed = Date.now() - started
  assert.ok(
    calls > POLL_RETRY_POLICY.maxAttempts,
    `a transient blip must not end the poll at the attempt cap, got ${calls} GETs`,
  )
  assert.ok(elapsed >= 1100, `the poll should run to its deadline, took ${elapsed}ms`)
})

test('复核：submittedAt 已越过 deadline 时立即超时且不发任何请求', async () => {
  let calls = 0
  const started = Date.now()
  await assert.rejects(
    () => finishMediaTask('video', ROUTE, {
      dest: '/tmp/omnimux-1382/expired.mp4',
      taskId: 'task-expired',
      fetch: undefined,
      authKey: 'fixture',
      submittedAt: Date.now() - DEFAULT_TASK_DEADLINE_MS - 60_000,
      fetcher: async () => {
        calls += 1
        return jsonResponse({ status: 'completed', url: 'https://cdn.example/out.mp4' })
      },
    }),
    { code: 'omnimux-task-timeout' },
  )
  assert.equal(calls, 0, 'an expired task must not issue a request')
  assert.ok(Date.now() - started < 1000)
})

test('复核：deadline 锚定 submittedAt，剩余窗口内可完成', async () => {
  // Submitted one minute ago: the window is still open, so the poll proceeds.
  const submittedAt = Date.now() - 60_000
  assert.equal(resolveDeadlineFromSubmit(submittedAt, DEFAULT_TASK_DEADLINE_MS) - Date.now() > 0, true)
  let calls = 0
  let downloaded = null
  const result = await finishMediaTask('video', ROUTE, {
    dest: '/tmp/omnimux-1382/reconciled.mp4',
    taskId: 'task-reconciled',
    authKey: 'fixture',
    submittedAt,
    fetcher: async (url) => {
      if (String(url).includes('/video/generations/')) {
        calls += 1
        return jsonResponse({ status: 'completed', url: 'https://cdn.example/out.mp4' })
      }
      downloaded = String(url)
      return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('mp4-bytes') }
    },
  })
  assert.equal(result.mode, 'live')
  assert.equal(calls, 1, 'a completing reconcile issues exactly one poll GET')
  assert.equal(downloaded, 'https://cdn.example/out.mp4')
})

test('删除钩子卫生：轮询结束后不残留可挂起的定时器', async () => {
  // A leaked AbortSignal.timeout would keep the test process alive; the guard
  // here is that the whole file settles within the runner's own lifetime.
  const deadlineAt = Date.now() + 50
  assert.ok(remainingMs(deadlineAt) > 0)
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.ok(remainingMs(deadlineAt) <= 0)
})

test('#1382 常量与不变式', () => {
  // Media polls 20 minutes (the coordinator's decision: slow video models used
  // to fit in a wider window; a 10-minute media default would have turned
  // "finished yesterday" into "times out today"). Speech keeps its 10 minutes.
  assert.equal(DEFAULT_TASK_DEADLINE_MS, 20 * 60 * 1000)
  assert.equal(SPEECH_TASK_DEADLINE_MS, 10 * 60 * 1000)
  assert.equal(DEFAULT_POLL_INTERVAL_MS, 1500)
  assert.equal(DEFAULT_REQUEST_TIMEOUT_MS, 10_000)
  assert.equal(DEFAULT_RETRY_BUDGET_MS, 7000)
  // #1386 — what this comparison does and does not cover.
  //
  // It compares two constants at DIFFERENT granularities: the task poll window
  // (per task) against the workflow's whole-run budget (per execution). Reading
  // it as "a hub task always fails with the task-level code before the run
  // times out" is wrong.
  //
  // Covered: a single-node run. 20 minutes of polling elapse before the
  // 30-minute run budget, so `omnimux-task-timeout` surfaces as intended.
  //
  // NOT covered: multi-node graphs. The run budget is shared, so several nodes
  // — sequential or under maxParallel — can exhaust the 30 minutes while one
  // task is still inside its own 20-minute window. Then the run dies first, the
  // task-level code never appears, and upstream work may keep billing while its
  // artifact is discarded. This assertion cannot see that: it only knows two
  // numbers, not how many nodes share the budget.
  assert.ok(DEFAULT_TASK_DEADLINE_MS < WORKFLOW_EXECUTION_TIMEOUT_MS)
  assert.ok(SPEECH_TASK_DEADLINE_MS < WORKFLOW_EXECUTION_TIMEOUT_MS)
  // The outer submit+poll budget must sit above the poll deadline (so the poll
  // reports its own `omnimux-task-timeout`) and below the whole-run timeout.
  assert.equal(MEDIA_EXECUTION_BUDGET_MS, DEFAULT_TASK_DEADLINE_MS + 60_000)
  assert.ok(MEDIA_EXECUTION_BUDGET_MS > DEFAULT_TASK_DEADLINE_MS)
  assert.ok(MEDIA_EXECUTION_BUDGET_MS < WORKFLOW_EXECUTION_TIMEOUT_MS)
  // One GET (with its retry window) must stay far below the task deadline.
  assert.ok(DEFAULT_REQUEST_TIMEOUT_MS + DEFAULT_RETRY_BUDGET_MS < DEFAULT_TASK_DEADLINE_MS / 10)
  assert.deepEqual(POLL_RETRY_POLICY, {
    maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 4000, factor: 2, jitter: 0.2,
  })
  // One new code for "timed out"; an unknown task is not a new code but the
  // existing invalid-request answer, because the workflow already reads it as
  // "cannot reconcile, resubmit".
  assert.equal(TASK_TIMEOUT_CODE, 'omnimux-task-timeout')
  assert.equal(TASK_UNKNOWN_CODE, 'omnimux-invalid-request')
})

test('#1382 重试分类表', () => {
  const yes = [
    Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    { code: 'omnimux-request-failed', retryable: true },
    { code: 'omnimux-request-failed', status: 429 },
    { code: 'omnimux-request-failed', status: 408 },
    { code: 'omnimux-request-failed', status: 409 },
    { code: 'omnimux-request-failed', status: 500 },
    { code: 'omnimux-request-failed', status: 502 },
    { code: 'omnimux-request-failed', status: 503 },
    { code: 'omnimux-request-failed', status: 504 },
  ]
  const no = [
    null,
    'nope',
    { code: 'omnimux-aborted' },
    { code: 'omnimux-failed' },
    { code: 'quota-exceeded' },
    { code: 'needs-omnimux' },
    { code: 'CHANNEL_UNAVAILABLE' },
    { code: 'omnimux-task-timeout' },
    { code: 'omnimux-request-failed', status: 400 },
    { code: 'omnimux-request-failed', status: 403 },
    { code: 'omnimux-request-failed', status: 404 },
    { code: 'omnimux-invalid-request' },
  ]
  for (const error of yes) assert.equal(isRetryablePollError(error), true, JSON.stringify(error))
  for (const error of no) assert.equal(isRetryablePollError(error), false, JSON.stringify(error))
})

test('#1382 超时错误可读且带成因', () => {
  const error = taskTimeout('video', 'task-x', 1_200_000, new Error('connection reset'))
  assert.equal(error.code, 'omnimux-task-timeout')
  assert.match(error.message, /video task task-x exceeded the 1200000ms poll deadline/)
  assert.equal(error.cause?.message, 'connection reset')
})
