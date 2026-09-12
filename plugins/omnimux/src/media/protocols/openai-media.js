import {
  createOpenAICompatibleAdapter,
  createOpenAICompatibleClient,
  createProviderRegistry,
  createProviderRuntime,
  withRetry,
} from 'aigc-provider-runtime-kit/runtime'
import { OmnimuxError } from '../errors.js'
import { classifyQuotaFailure } from '../../errors/quota-classifier.js'
import { getJson } from '../job.js'
import { pickMediaUrl, pickTaskId, pickTaskStatus, TASK_PATH } from '../vendors/omnimux.js'
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_RETRY_BUDGET_MS,
  POLL_RETRY_POLICY,
  isRetryablePollError,
  isUnknownTaskError,
  remainingMs,
  resolveDeadlineAt,
  taskTimeout,
  unknownTask,
} from '../task-deadline.js'

/**
 * Run one poll GET with its retry sequence.
 *
 * The retry window is bounded twice over: `attemptBudgetMs` caps the composed
 * signal so a backoff wait cannot run past it, and `POLL_RETRY_POLICY`
 * (`maxAttempts` 4) caps the attempt count. Both are far shorter than the task
 * deadline, so one GET can never consume the whole window.
 *
 * @param {object} options Poll options (see `pollOpenAiMediaTask`).
 * @param {string} url
 * @param {number} attemptBudgetMs
 */
async function pollOnceWithRetry(options, url, attemptBudgetMs) {
  const budgetTimer = AbortSignal.timeout(Math.max(1, attemptBudgetMs))
  const signal = options.signal ? AbortSignal.any([options.signal, budgetTimer]) : budgetTimer
  return withRetry(
    () => getJson(options.fetcher, url, options.apiKey, options.signal, {
      requestTimeoutMs: options.requestTimeoutMs,
    }),
    {
      ...POLL_RETRY_POLICY,
      signal,
      shouldRetry: (error) => isRetryablePollError(error),
    },
  )
}

/**
 * Poll one openai-media task until it reaches a terminal state, or until the
 * poll deadline expires.
 *
 * Issue #1382: this loop used to be an unbounded `for (;;)` whose only exits
 * were a terminal status or a caller abort — a task stuck at `processing`, or a
 * provider that never answered, kept the workflow node "generating" forever.
 * The deadline is now the single authority: there is deliberately no separate
 * attempt counter (a second limit would only mask the first).
 *
 * A poll that fails with a retryable error (connection jitter, a per-request
 * timeout, 429/408/409, a retryable 5xx) after its retries are used up does
 * **not** end the poll: it is one failed attempt, and the loop keeps polling
 * until the deadline. Ending it there would turn a transient blip into a failed
 * node — the "used to finish, now times out" regression this change exists to
 * avoid.
 *
 * @param {object} options
 * @param {typeof fetch} options.fetcher
 * @param {string} options.baseUrl
 * @param {string} options.apiKey
 * @param {string} options.taskId
 * @param {string} options.capability
 * @param {AbortSignal} [options.signal]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {number} [options.deadlineMs] Poll window; defaults to DEFAULT_TASK_DEADLINE_MS.
 * @param {number} [options.submittedAt] Anchor for the deadline (reconcile path).
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.requestTimeoutMs]
 * @param {number} [options.retryBudgetMs]
 */
export async function pollOpenAiMediaTask(options) {
  const interval = Number.isFinite(options.pollIntervalMs) && /** @type {number} */ (options.pollIntervalMs) > 0
    ? /** @type {number} */ (options.pollIntervalMs)
    : DEFAULT_POLL_INTERVAL_MS
  const sleep = options.sleep
    ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const path = TASK_PATH[options.capability]
  if (!path) {
    throw new OmnimuxError('unknown-protocol', `openai-media has no task path for ${options.capability}`)
  }
  const url = `${options.baseUrl}/${path}/${options.taskId}`
  // Anchored at the persisted submit time when the caller supplied one, so a
  // restart cannot hand the task a second, fresh window.
  const deadlineAt = resolveDeadlineAt({ deadlineMs: options.deadlineMs, submittedAt: options.submittedAt })
  let lastTransientError = null
  for (;;) {
    if (options.signal?.aborted) {
      throw new OmnimuxError('omnimux-aborted', `${options.capability} poll aborted`)
    }
    const left = remainingMs(deadlineAt)
    if (left <= 0) {
      throw taskTimeout(options.capability, options.taskId, options.deadlineMs, lastTransientError ?? undefined)
    }
    let json = null
    try {
      const budget = Math.min(left, options.retryBudgetMs ?? DEFAULT_RETRY_BUDGET_MS)
      json = await pollOnceWithRetry(options, url, budget)
      lastTransientError = null
    } catch (error) {
      // A cancel that landed during a backoff wait must keep its own identity.
      if (options.signal?.aborted) {
        throw new OmnimuxError('omnimux-aborted', `${options.capability} poll aborted`, { cause: error })
      }
      // "No such task" is an answer, not a transport failure: restate it as the
      // domain error a reconcile reads ("nothing to reconcile, resubmit").
      if (isUnknownTaskError(error)) {
        throw unknownTask(options.capability, options.taskId, error)
      }
      if (!isRetryablePollError(error)) throw error
      lastTransientError = error
    }
    if (json !== null) {
      const status = pickTaskStatus(json)
      if (status === 'completed' || status === 'success' || status === 'succeeded') return json
      if (status === 'failed' || status === 'error' || status === 'failure') {
        const classified = classifyQuotaFailure({ body: json })
        if (classified.kind === 'channel-unavailable') throw new OmnimuxError(classified.code, classified.message)
        if (classified.kind === 'quota-exceeded') throw new OmnimuxError('quota-exceeded', classified.message, { details: classified })
        throw new OmnimuxError('omnimux-failed', `${options.capability} task ${options.taskId} failed`)
      }
    }
    // Never sleep past the deadline: the last wait must not overshoot it.
    await sleep(Math.max(0, Math.min(interval, remainingMs(deadlineAt))))
  }
}

/**
 * @param {{
 *   fetcher?: typeof fetch,
 *   apiKey: string,
 *   baseUrl: string,
 *   providerId: string,
 *   modelId: string,
 *   capability: string,
 *   poll?: typeof pollOpenAiMediaTask,
 *   onSubmitted?: (taskId: string) => void,
 * }} options
 */
export function createOpenAiMediaRuntime(options) {
  const fetcher = options.fetcher ?? fetch
  const capability = options.capability
  const endpoint = TASK_PATH[capability]
  if (!endpoint) {
    throw new OmnimuxError('unknown-protocol', `openai-media has no endpoint for ${capability}`)
  }
  const client = createOpenAICompatibleClient({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    fetcher: async (...args) => {
      const response = await fetcher(...args)
      // runtime-kit keeps only error.message; classify code-only envelopes first.
      if (!response.ok && typeof response.clone === 'function') {
        let body
        try { body = await response.clone().text() } catch { body = undefined }
        const failure = classifyQuotaFailure({ status: response.status, body })
        if (failure.kind === 'channel-unavailable') {
          throw new OmnimuxError(failure.code, failure.message, { status: response.status })
        }
      }
      return response
    },
  })
  const registry = createProviderRegistry({
    providers: [{
      id: options.providerId,
      name: options.providerId,
      baseUrl: options.baseUrl,
      protocol: 'openai',
      enabled: true,
    }],
    models: [{
      id: `${options.providerId}-${capability}`,
      providerId: options.providerId,
      modelId: options.modelId,
      displayName: options.modelId,
      capability,
      enabled: true,
      parameterSchema: {
        prompt: { type: 'string', required: true },
        duration: { type: 'number' },
        image: { type: 'string' },
      },
    }],
  })
  const poll = options.poll ?? pollOpenAiMediaTask
  const adapter = createOpenAICompatibleAdapter({
    client,
    providerIds: [options.providerId],
    endpoints: { [capability]: endpoint },
    async normalize(raw, context) {
      const wait = context.metadata?.wait !== false
      const immediate = pickMediaUrl(raw)
      if (immediate) {
        return {
          status: 'completed',
          providerId: context.provider.id,
          modelId: context.model.id,
          capability,
          taskId: pickTaskId(raw),
          outputs: [{ type: capability, url: immediate }],
          raw,
        }
      }
      const taskId = pickTaskId(raw)
      if (!taskId) {
        throw new OmnimuxError('omnimux-invalid-response', `${capability} submit returned no task_id or url`)
      }
      options.onSubmitted?.(taskId)
      if (!wait) {
        return {
          status: 'completed',
          providerId: context.provider.id,
          modelId: context.model.id,
          capability,
          taskId,
          outputs: [],
          raw,
        }
      }
      const done = await poll({
        fetcher,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        taskId,
        capability,
        signal: context.signal,
      })
      const url = pickMediaUrl(done)
      if (!url) {
        throw new OmnimuxError('omnimux-invalid-response', `task ${taskId} completed without a ${capability} url`)
      }
      return {
        status: 'completed',
        providerId: context.provider.id,
        modelId: context.model.id,
        capability,
        taskId,
        outputs: [{ type: capability, url }],
        raw: done,
      }
    },
  })
  return createProviderRuntime({
    registry,
    adapters: [adapter],
  })
}
