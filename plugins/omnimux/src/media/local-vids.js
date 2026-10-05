/**
 * Local Google Vids channel (Issue #3167).
 *
 * The hub owns provider HTTP, so this module is the hub's client for one
 * explicitly selected **loopback** service: `vids2api`, which drives
 * `docs.google.com/videos` headlessly and answers an OpenAI-style video
 * surface (`POST /videos` → `GET /videos/{id}` → `GET /videos/{id}/content`).
 *
 * Product baseline: a brand-new user has neither the service nor its address.
 * The address is therefore required configuration — never a hardcoded default —
 * and every missing piece fails loudly instead of falling back to another
 * model. The capability is reachable only when the caller names this model.
 */

import { stat } from 'node:fs/promises'
import { assertGuardOutput } from '../catalog/contract/submit-guard/index.js'
import { OmnimuxError } from './errors.js'
import { downloadMediaFile } from './job.js'
import { pollOpenAiMediaTask } from './protocols/openai-media.js'
import { pickTaskId } from './vendors/omnimux.js'

/** Public catalog id of the local Google Vids text-to-video model. */
export const LOCAL_VIDS_MODEL_ID = 'google-vids-omni'

/** vids2api task surface, relative to the configured base URL. */
export const LOCAL_VIDS_TASK_PATH = 'videos'

/** vids2api clamps `seconds` to this range; mirror it before the request. */
export const LOCAL_VIDS_MIN_SECONDS = 4
export const LOCAL_VIDS_MAX_SECONDS = 12
export const LOCAL_VIDS_DEFAULT_SECONDS = 10

/** Configuration surface: the user's explicit opt-in, never a baked-in host. */
export const LOCAL_VIDS_BASE_URL_ENV = 'OMNIMUX_VIDS2API_BASE_URL'
export const LOCAL_VIDS_API_KEY_ENV = 'OMNIMUX_VIDS2API_API_KEY'

/** One submit round-trip; the generation itself is covered by the poll window. */
export const LOCAL_VIDS_SUBMIT_TIMEOUT_MS = 60_000

const UNCONFIGURED_MESSAGE =
  `本机 Google Vids 通道未配置：请设置 ${LOCAL_VIDS_BASE_URL_ENV} 指向本机 vids2api 服务地址后再试。`
const UNREACHABLE_HINT =
  `请确认本机 vids2api 服务已启动，且 ${LOCAL_VIDS_BASE_URL_ENV} 指向它。`

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ baseUrl: string, apiKey: string }}
 */
export function readLocalVidsConfig(env = process.env) {
  const baseUrl = String(env[LOCAL_VIDS_BASE_URL_ENV] ?? '').trim().replace(/\/+$/, '')
  const apiKey = String(env[LOCAL_VIDS_API_KEY_ENV] ?? '').trim()
  return { baseUrl, apiKey }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampLocalVidsSeconds(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return LOCAL_VIDS_DEFAULT_SECONDS
  return Math.min(LOCAL_VIDS_MAX_SECONDS, Math.max(LOCAL_VIDS_MIN_SECONDS, Math.round(num)))
}

/**
 * @param {unknown} error
 * @param {string} baseUrl
 */
function unreachableError(error, baseUrl) {
  return new OmnimuxError(
    'omnimux-request-failed',
    `本机 Google Vids 服务不可达（${baseUrl}）。${UNREACHABLE_HINT}`,
    { cause: error },
  )
}

/**
 * Submit one text-to-video job and return its task id.
 *
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   prompt: string,
 *   seconds: number,
 *   fetcher: typeof fetch,
 *   signal?: AbortSignal,
 *   requestTimeoutMs?: number,
 * }} input
 * @returns {Promise<{ taskId: string, raw: unknown }>}
 */
async function submitLocalVidsTask(input) {
  const url = `${input.baseUrl}/${LOCAL_VIDS_TASK_PATH}`
  /** @type {Record<string, string>} */
  const headers = { 'content-type': 'application/json' }
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`
  const timeoutMs = input.requestTimeoutMs ?? LOCAL_VIDS_SUBMIT_TIMEOUT_MS
  const timer = AbortSignal.timeout(timeoutMs)
  const signal = input.signal ? AbortSignal.any([input.signal, timer]) : timer

  let response
  try {
    response = await input.fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt: input.prompt, seconds: input.seconds }),
      signal,
    })
  } catch (error) {
    if (input.signal?.aborted) throw new OmnimuxError('omnimux-aborted', '本机 Google Vids 提交已取消', { cause: error })
    throw unreachableError(error, input.baseUrl)
  }

  if (!response.ok) {
    let body = null
    try { body = await response.clone().json() } catch { body = null }
    const detail = body && typeof body === 'object' && typeof body.error === 'string' ? `（${body.error}）` : ''
    if (response.status === 401 || response.status === 403) {
      throw new OmnimuxError(
        'omnimux-invalid-request',
        `本机 Google Vids 服务拒绝了凭据（HTTP ${response.status}）${detail}：请核对 ${LOCAL_VIDS_API_KEY_ENV} 与服务的 VIDS_API_KEYS 是否一致。请求地址 ${url}`,
        { status: response.status },
      )
    }
    if (response.status === 400) {
      throw new OmnimuxError(
        'omnimux-invalid-request',
        `本机 Google Vids 服务拒绝了该请求（HTTP 400）${detail}：请求地址 ${url}`,
        { status: response.status, details: body },
      )
    }
    throw new OmnimuxError(
      'omnimux-request-failed',
      `本机 Google Vids 服务提交失败（HTTP ${response.status}）${detail}：请求地址 ${url}，请确认 ${LOCAL_VIDS_BASE_URL_ENV} 指向服务的 API 根（含 /v1）。`,
      { status: response.status, details: body },
    )
  }

  const raw = await response.json().catch(() => undefined)
  const taskId = pickTaskId(raw)
  if (!taskId) {
    throw new OmnimuxError('omnimux-invalid-response', '本机 Google Vids 服务未返回任务号')
  }
  return { taskId, raw }
}

/**
 * Run one local Google Vids text-to-video job and download the artifact.
 *
 * @param {{
 *   route: { modelId: string },
 *   guardPlan: import('../catalog/contract/submit-guard/guard.js').GuardPlan,
 *   payload?: Record<string, unknown>,
 *   dest: string,
 *   signal?: AbortSignal,
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   poll?: typeof pollOpenAiMediaTask,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 * }} input
 * @returns {Promise<{ mode: 'live', model: string, taskId: string, url: string, dest: string }>}
 */
export async function generateLocalVids(input) {
  const env = input.env ?? process.env
  const { baseUrl, apiKey } = readLocalVidsConfig(env)
  if (!baseUrl) {
    throw new OmnimuxError('omnimux-unconfigured', UNCONFIGURED_MESSAGE)
  }

  const prompt = typeof input.guardPlan?.prompt === 'string' && input.guardPlan.prompt.trim()
    ? input.guardPlan.prompt.trim()
    : (typeof input.payload?.prompt === 'string' ? input.payload.prompt.trim() : '')
  if (!prompt) {
    throw new OmnimuxError('omnimux-invalid-request', 'Google Vids 文生视频需要非空提示词')
  }

  const duration = input.guardPlan?.duration ?? input.payload?.duration
  const seconds = clampLocalVidsSeconds(duration)
  const fetcher = input.fetcher ?? fetch

  const { taskId } = await submitLocalVidsTask({
    baseUrl, apiKey, prompt, seconds, fetcher, signal: input.signal,
  })

  const poll = input.poll ?? pollOpenAiMediaTask
  const done = await poll({
    fetcher,
    baseUrl,
    apiKey,
    taskId,
    capability: 'video',
    taskPath: LOCAL_VIDS_TASK_PATH,
    signal: input.signal,
    ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs }),
    ...(input.pollIntervalMs === undefined ? {} : { pollIntervalMs: input.pollIntervalMs }),
    resolveFailureReason: true,
  })

  // vids2api's job record carries no artifact URL: the finished MP4 lives at a
  // separate content path, so the hub composes it from the task id.
  const contentUrl = `${baseUrl}/${LOCAL_VIDS_TASK_PATH}/${encodeURIComponent(taskId)}/content`
  await downloadMediaFile({
    dest: input.dest,
    url: contentUrl,
    capability: 'video',
    apiKey,
    providerId: 'vids2api',
    credentialOrigin: new URL(baseUrl).origin,
    fetcher,
    signal: input.signal,
  })

  let size = 0
  try {
    size = (await stat(input.dest)).size
  } catch (error) {
    throw new OmnimuxError(
      'omnimux-download-failed',
      `本机 Google Vids 未产出目标文件 ${input.dest}`,
      { cause: error, details: { taskId, contentUrl } },
    )
  }
  if (size === 0) {
    throw new OmnimuxError(
      'omnimux-download-failed',
      `本机 Google Vids 产出了空文件（0 字节）：${input.dest}`,
      { details: { taskId, contentUrl } },
    )
  }

  if (!input.guardPlan?.byok) {
    assertGuardOutput(
      input.guardPlan,
      { mode: 'live', outputs: [{ type: 'video', mime: 'video/mp4', url: contentUrl }] },
      { capability: 'video' },
    )
  }

  return {
    mode: 'live',
    model: input.route.modelId,
    taskId,
    url: contentUrl,
    dest: input.dest,
  }
}
