/**
 * Poll-lifecycle policy: the single source of truth for how long a hub media
 * task may be polled, how long one poll request may take, and which failures
 * are worth retrying.
 *
 * Issue #1382. Before this module the two hub paths disagreed: `speech.js`
 * bounded its request with `AbortSignal.timeout(10 * 60_000)` while the media
 * poll loop (`protocols/openai-media.js`) was an unbounded `for (;;)`, and
 * `job.js:getJson` had no per-request timeout at all — a provider that never
 * answered hung the node forever.
 *
 * @module media/task-deadline
 */

import { OmnimuxError } from './errors.js'

/**
 * Poll deadline for one upstream media task, from submit to a terminal state.
 *
 * Media (video / image / audio) gets **20 minutes** (1_200_000 ms): slow video
 * models routinely exceed the 10-minute speech budget, and a tighter deadline
 * here would turn "used to finish" into "now times out". The speech path keeps
 * its historical 10 minutes (see `speech.js`), so this constant is the media
 * default and not a replacement for the speech timeout.
 *
 * Override per request with `deadlineMs`; never read an environment variable —
 * `omnimux tokens exec` and the Settings seat are the hub's configuration
 * surfaces, and a deadline is an implementation detail of the caller.
 *
 * The window is only re-checked between polls, and `DEFAULT_RETRY_BUDGET_MS`
 * bounds a poll's backoff waits rather than its in-flight request, so a run can
 * overshoot the deadline by at most one `DEFAULT_REQUEST_TIMEOUT_MS` (10s):
 * that per-request timeout, not the retry budget, is the real margin.
 */
export const DEFAULT_TASK_DEADLINE_MS = 20 * 60 * 1000

/**
 * Speech keeps the pre-#1382 budget (see the module docstring for why media is
 * longer). Kept here so both paths name one file instead of hardcoding.
 */
export const SPEECH_TASK_DEADLINE_MS = 10 * 60 * 1000

/** Gap between two polls (unchanged from the pre-#1382 loop: 1500ms). */
export const DEFAULT_POLL_INTERVAL_MS = 1500

/** Timeout of one poll GET. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

/** Wall-clock budget for one poll GET including its internal retries. */
export const DEFAULT_RETRY_BUDGET_MS = 7_000

/**
 * Retry backoff for one poll GET (mirrors the runtime-kit defaults, written
 * down explicitly so tests can pin the curve).
 */
export const POLL_RETRY_POLICY = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  factor: 2,
  jitter: 0.2,
})

/**
 * Workflow-side whole-run timeout (`EXECUTION_TIMEOUT_MS`,
 * `omnimux-workflow/src/workflow/execution/executionTypes.ts`).
 *
 * INVARIANT: every hub deadline must be strictly shorter than this, otherwise
 * a single stuck task would be masked by the whole-run timeout and the node
 * would report a weaker error than `omnimux-task-timeout`. Both plugins assert
 * their own side of this invariant (the hub cannot import the workflow's
 * constant across the hub/domain boundary).
 */
export const WORKFLOW_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Outer budget for one synchronous media call (submit + poll), handed to the
 * provider runtime as its `timeoutMs`.
 *
 * Strictly greater than the poll deadline on purpose: runtime-kit races the
 * whole adapter execution against `timeoutMs` and reports its own
 * `EXECUTION_ABORTED`, so an outer budget equal to (or below) the poll window
 * would replace the task-level `omnimux-task-timeout` with a weaker error —
 * exactly the two-layers-masking-each-other case D7 warns about. The slack is
 * also 30 minutes' worth of room below `EXECUTION_TIMEOUT_MS`.
 *
 * Before #1382 this was hardcoded to 10 minutes, which silently capped the
 * synchronous path below the poll deadline it was supposed to allow.
 */
export const MEDIA_EXECUTION_BUDGET_MS = DEFAULT_TASK_DEADLINE_MS + 60 * 1000

/** Error code of a poll that ran out of deadline (see `taskTimeout`). */
export const TASK_TIMEOUT_CODE = 'omnimux-task-timeout'

/**
 * Error code of a task the upstream does not know (HTTP 404 / 410 on the task
 * resource).
 *
 * Deliberately not a transport code: "that task does not exist" is an answer,
 * not a failure to get one. The workflow reads it as "nothing to reconcile" and
 * resubmits; without the distinction a restart-reconcile would report a bogus
 * request failure for a task the upstream had already dropped.
 */
export const TASK_UNKNOWN_CODE = 'omnimux-invalid-request'

/**
 * The only set of HTTP statuses a poll GET may retry: a repeat of the identical
 * request can plausibly succeed. Everything else (400/401/403/404/422…) is a
 * property of the request or the task and will not improve by retrying.
 */
export const RETRYABLE_STATUS = Object.freeze(new Set([408, 409, 429, 500, 502, 503, 504]))

/**
 * Upstream terminal states (a completed/failed task body, not an HTTP error).
 * `pickTaskStatus` normalizes the vendor aliases; this list is the retry-side
 * mirror used to classify a task-level failure as non-retryable.
 */
export const TERMINAL_TASK_STATUSES = Object.freeze(new Set(['completed', 'success', 'succeeded', 'failed', 'error', 'failure']))

/**
 * @param {unknown} deadlineMs Per-request override (may be absent/invalid).
 * @returns {number} A positive span in ms.
 */
export function deadlineSpanMs(deadlineMs) {
  return Number.isFinite(deadlineMs) && /** @type {number} */ (deadlineMs) > 0
    ? /** @type {number} */ (deadlineMs)
    : DEFAULT_TASK_DEADLINE_MS
}

/**
 * Absolute deadline for a task whose submit time is known.
 *
 * The anchor is `submittedAt`, not "now": a restart must not grant the task a
 * fresh window, otherwise the whole-run timeout becomes a meaningless ceiling.
 *
 * @param {number} submittedAt Epoch ms of the first submit.
 * @param {number} [deadlineMs] Per-request override.
 * @returns {number} Absolute deadline (epoch ms).
 */
export function resolveDeadlineFromSubmit(submittedAt, deadlineMs) {
  return submittedAt + deadlineSpanMs(deadlineMs)
}

/**
 * @param {number} [deadlineMs] Per-request override.
 * @returns {number} Absolute deadline (epoch ms) counted from now.
 */
export function resolveDeadline(deadlineMs) {
  return Date.now() + deadlineSpanMs(deadlineMs)
}

/**
 * Unified deadline resolution: anchored at `submittedAt` when it is a usable
 * epoch timestamp, otherwise counted from now.
 *
 * @param {{ deadlineMs?: number, submittedAt?: number }} [options]
 * @returns {number} Absolute deadline (epoch ms).
 */
export function resolveDeadlineAt(options = {}) {
  const submittedAt = options.submittedAt
  if (Number.isFinite(submittedAt) && /** @type {number} */ (submittedAt) > 0) {
    return resolveDeadlineFromSubmit(/** @type {number} */ (submittedAt), options.deadlineMs)
  }
  return resolveDeadline(options.deadlineMs)
}

/**
 * @param {number} deadlineAt Absolute deadline (epoch ms).
 * @param {number} [now] Injectable clock (tests).
 * @returns {number} Milliseconds left (may be negative).
 */
export function remainingMs(deadlineAt, now = Date.now()) {
  return deadlineAt - now
}

/**
 * Build the poll-deadline error. One code for every cause (deadline reached, or
 * the per-GET retry budget exhausted while the deadline was already gone):
 * callers only need to decide "this task timed out", while the cause stays in
 * the message and in `cause`.
 *
 * @param {string} capability
 * @param {string} taskId
 * @param {number} [deadlineMs] Span that was exceeded (for the message).
 * @param {unknown} [cause] Last transient failure, when there was one.
 * @returns {OmnimuxError}
 */
export function taskTimeout(capability, taskId, deadlineMs, cause) {
  const span = deadlineSpanMs(deadlineMs)
  const options = cause === undefined ? {} : { cause }
  return new OmnimuxError(
    TASK_TIMEOUT_CODE,
    `${capability} task ${taskId} exceeded the ${span}ms poll deadline`,
    options,
  )
}

/**
 * Was this poll failure "the upstream does not have that task"?
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isUnknownTaskError(error) {
  if (!error || typeof error !== 'object') return false
  const coded = /** @type {{ code?: unknown, status?: unknown }} */ (error)
  return coded.code === 'omnimux-request-failed' && (coded.status === 404 || coded.status === 410)
}

/**
 * Restate an unknown-task transport failure as the domain answer it is.
 *
 * @param {string} capability
 * @param {string} taskId
 * @param {unknown} [cause]
 * @returns {OmnimuxError}
 */
export function unknownTask(capability, taskId, cause) {
  const status = /** @type {{ status?: number }} */ (cause ?? {}).status
  return new OmnimuxError(
    TASK_UNKNOWN_CODE,
    `${capability} task ${taskId} is unknown to the upstream${status ? ` (HTTP ${status})` : ''}`,
    { ...(status ? { status } : {}), ...(cause === undefined ? {} : { cause }) },
  )
}

/**
 * Retry decision for one poll GET — the poll layer is the only retry authority
 * (`getJson` only marks, it never retries, so the two layers cannot multiply
 * their backoff).
 *
 * Never retried: caller cancellation, an upstream terminal failure, quota,
 * authentication, an unavailable channel (the taskId is already bound to a
 * channel; repeating the poll cannot change the answer) and the poll deadline.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isRetryablePollError(error) {
  if (!error || typeof error !== 'object') return false
  const coded = /** @type {{ code?: unknown, status?: unknown, name?: unknown, retryable?: unknown }} */ (error)
  if (coded.code === 'omnimux-aborted') return false
  if (coded.code === TASK_TIMEOUT_CODE) return false
  if (coded.code === 'quota-exceeded' || coded.code === 'needs-omnimux'
    || coded.code === 'CHANNEL_UNAVAILABLE' || coded.code === 'omnimux-failed'
    || coded.code === 'omnimux-invalid-request' || coded.code === 'omnimux-invalid-response') return false
  // A per-request timeout (`AbortSignal.timeout`) is a transient failure.
  if (coded.name === 'TimeoutError') return true
  if (typeof coded.status === 'number') return RETRYABLE_STATUS.has(coded.status)
  // A status-less request failure is connection jitter; the data-only flag is
  // the same statement made by the layer that saw the error.
  return coded.retryable === true
}
