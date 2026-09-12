import { OmnimuxError, unwrapAdapterError } from './errors.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { downloadMediaFile } from './job.js'
import { createOpenAiMediaRuntime, pollOpenAiMediaTask } from './protocols/openai-media.js'
import { parseMediaConfig, resolveMediaAuth, resolveMediaRoute } from './route.js'
import { mapOmnimuxInput, pickMediaUrl } from './vendors/omnimux.js'
import {
  assertGuardOutput,
  assertGuardSubmit,
} from '../catalog/contract/submit-guard/index.js'
import { probeMediaAssets } from './asset-probe.js'
import { MEDIA_EXECUTION_BUDGET_MS } from './task-deadline.js'
import { generateSpeech } from './speech.js'
import { hostLocalAssetsIfNeeded, isRemoteGateway } from './gateway-upload.js'
export { probeMediaAssets } from './asset-probe.js'
export { hostLocalAssetsIfNeeded, uploadMediaToGateway, isLocalMediaSource } from './gateway-upload.js'

const CAPABILITY_SEAM = Object.freeze({
  video: 'videoGenerate',
  image: 'imageGenerate',
  audio: 'audioGenerate',
})

/**
 * @param {string} capability
 * @param {{
 *   prompt?: string,
 *   dest: string,
 *   duration?: number,
 *   image?: string,
 *   speech?: string,
 *   audio?: string,
 *   references?: Array<{ role?: string, type: string, pathOrUrl: string, [key: string]: unknown }>,
 *   audioTrack?: { role?: string, type: string, pathOrUrl: string, [key: string]: unknown },
 *   voice?: string,
 *   style?: string,
 *   instrumental?: boolean,
 *   speed?: number,
 *   format?: string,
 *   aspectRatio?: string,
 *   resolution?: string,
 *   sound?: boolean,
 *   seed?: number,
 *   watermark?: boolean,
 *   outputFormat?: string,
 *   referenceTaskType?: string,
 *   generationType?: string,
 *   returnLastFrame?: boolean,
 *   webSearch?: boolean,
 *   nsfwCheck?: boolean,
 *   fileUrl?: string,
 *   linkUrl?: string,
 *   provider?: string,
 *   model?: string,
 *   operation?: string,
 *   image_tail?: string,
 *   imageTail?: string,
 *   taskId?: string,
 *   submittedAt?: number,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 *   requestTimeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   wait?: boolean,
 *   signal?: AbortSignal,
 *   env?: Record<string, string | undefined>,
 *   media?: unknown,
 *   fetcher?: typeof fetch,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   runtime?: { execute: (req: object) => Promise<{ taskId?: string, outputs: Array<{ type: string, url?: string }> }> },
 * }} input
 */
export async function executeOmnimuxMedia(capability, input) {
  if (!input.dest) {
    throw new OmnimuxError('omnimux-invalid-request', 'dest is required')
  }
  const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : ''
  const media = parseMediaConfig(input.media)
  const route = resolveMediaRoute(capability, input, media, input.env)

  // taskId poll/finish: skip initial asset SubmitGuard and do not resubmit.
  if (taskId) {
    const auth = await resolveMediaAuth(route, {
      env: input.env,
      store: input.store,
      credentials: input.credentials,
    })
    return finishMediaTask(capability, route, { ...input, taskId, authKey: auth.apiKey })
  }

  const prompt = typeof input.prompt === 'string' ? input.prompt : ''
  const seam = CAPABILITY_SEAM[capability] ?? capability
  const assets = await probeMediaAssets(input, { capability, seam })
  const guardPlan = assertGuardSubmit(
    {
      prompt,
      model: route.modelId,
      operation: input.operation,
      speech: input.speech,
      duration: input.duration,
      voice: input.voice,
      style: input.style,
      instrumental: input.instrumental,
      speed: input.speed,
      format: input.format,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      sound: input.sound,
      seed: input.seed,
      watermark: input.watermark,
      outputFormat: input.outputFormat,
      referenceTaskType: input.referenceTaskType,
      generationType: input.generationType,
      returnLastFrame: input.returnLastFrame,
      webSearch: input.webSearch,
      nsfwCheck: input.nsfwCheck,
      fileUrl: input.fileUrl,
      linkUrl: input.linkUrl,
      assets,
      capability,
      seam,
    },
    {
      seam,
      capability,
      outputType: capability === 'video' || capability === 'image' || capability === 'audio' ? capability : undefined,
    },
  )

  const auth = await resolveMediaAuth(route, {
    env: input.env,
    store: input.store,
    credentials: input.credentials,
  })

  const wait = input.wait !== false
  const mappedInput = mapOmnimuxInput(capability, {
    prompt: guardPlan.prompt,
    model: guardPlan.modelId,
    duration: input.duration,
    image: input.image,
    speech: input.speech,
    audio: input.audio,
    references: input.references,
    audioTrack: input.audioTrack,
    voice: input.voice,
    style: input.style,
    instrumental: input.instrumental,
    speed: input.speed,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    operation: guardPlan.operationId,
    guardPlan,
  })

  if (capability === 'audio' && guardPlan.operationId === 'text_to_speech') {
    return generateSpeech({
      route, guardPlan, payload: mappedInput, apiKey: auth.apiKey,
      dest: input.dest, fetcher: input.fetcher, signal: input.signal,
    })
  }

  const shouldHost = (input.uploadLocalAssets ?? !input.runtime) && isRemoteGateway(route.baseUrl) && Boolean(auth.apiKey)
  const finalInput = shouldHost
    ? await hostLocalAssetsIfNeeded(mappedInput, {
      baseUrl: route.baseUrl,
      apiKey: auth.apiKey,
      fetcher: input.fetcher,
      signal: input.signal,
    })
    : mappedInput

  let result
  const isChannelRouting = Boolean(route.group || route.candidates?.some((c) => c.includes('@')))
  const candidates = (route.candidates && route.candidates.length > 0 ? route.candidates : [route.modelId])
    .slice(0, isChannelRouting ? 4 : 2)
  for (const [attempt, candidate] of candidates.entries()) {
    let submitted = false
    const runtime = input.runtime ?? createProtocolRuntime(
      { ...route, modelId: candidate }, input.fetcher, auth.apiKey, () => { submitted = true },
    )
    try {
      result = await runtime.execute({
        providerId: route.providerId,
        modelId: `${route.providerId}-${capability}`,
        input: { ...finalInput, model: candidate },
        // Covers submit *and* the poll this same call performs when it waits
        // (`metadata.wait`): the outer budget must sit above the poll deadline,
        // otherwise runtime-kit's own abort replaces `omnimux-task-timeout`.
        timeoutMs: MEDIA_EXECUTION_BUDGET_MS,
        metadata: { wait },
        ...(input.signal ? { signal: input.signal } : {}),
      })
      break
    } catch (error) {
      const unwrapped = unwrapAdapterError(error)
      const classified = classifyQuotaFailure({ error, cause: error, message: error?.message })
      if (classified.kind === 'quota-exceeded') {
        throw new OmnimuxError('quota-exceeded', classified.message)
      }
      const channelUnavailable = unwrapped?.code === 'CHANNEL_UNAVAILABLE'
        || (typeof unwrapped?.message === 'string' && (
          unwrapped.message.includes('无可用渠道')
          || unwrapped.message.includes('无权访问该分组')
          || unwrapped.message.includes('channel_unavailable')
          || unwrapped.message.includes('model_not_found')
        ))
      if (channelUnavailable && classified.kind === 'needs-omnimux') {
        throw new OmnimuxError(classified.code, classified.message)
      }
      if (channelUnavailable && !submitted && !input.signal?.aborted && attempt + 1 < candidates.length) continue
      throw unwrapped
    }
  }

  assertGuardOutput(guardPlan, result, { capability })

  const url = result.outputs.find((item) => item.type === capability)?.url
  const submittedId = result.taskId ?? null
  if (!wait && !url) {
    if (!submittedId) {
      throw new OmnimuxError('omnimux-invalid-response', 'submit returned no task_id')
    }
    return { mode: 'submitted', taskId: submittedId, url: null }
  }
  if (!url) {
    throw new OmnimuxError('omnimux-invalid-response', `runtime completed without a ${capability} url`)
  }
  await downloadMediaFile({
    dest: input.dest,
    url,
    capability,
    apiKey: auth.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
  })
  return { mode: 'live', taskId: submittedId, url }
}

/**
 * Poll a task by id and download its artifact — the hub's reconcile entry.
 *
 * Issue #1382: this path reads no process-local state (the hub keeps no task
 * ledger), which is exactly why it can finish a task submitted by a *previous*
 * process. What it gained here is a bound and an anchor: `submittedAt` (the
 * persisted first-submit time) fixes the deadline so a restart cannot restart
 * the clock, and past that deadline the call fails immediately without issuing
 * a single request.
 *
 * @param {string} capability
 * @param {ReturnType<typeof resolveMediaRoute>} route
 * @param {{
 *   dest: string,
 *   taskId: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 *   authKey?: string,
 *   env?: Record<string, string | undefined>,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   submittedAt?: number,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 *   requestTimeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} input
 */
export async function finishMediaTask(capability, route, input) {
  let apiKey = input.authKey
  if (apiKey === undefined) {
    const auth = await resolveMediaAuth(route, {
      env: input.env,
      store: input.store,
      credentials: input.credentials,
    })
    apiKey = auth.apiKey
  }
  const done = await pollOpenAiMediaTask({
    fetcher: input.fetcher ?? fetch,
    baseUrl: route.baseUrl,
    apiKey,
    taskId: input.taskId,
    capability,
    signal: input.signal,
    ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
    ...(input.deadlineMs !== undefined ? { deadlineMs: input.deadlineMs } : {}),
    ...(input.pollIntervalMs !== undefined ? { pollIntervalMs: input.pollIntervalMs } : {}),
    ...(input.requestTimeoutMs !== undefined ? { requestTimeoutMs: input.requestTimeoutMs } : {}),
    ...(input.sleep !== undefined ? { sleep: input.sleep } : {}),
  })
  const url = pickMediaUrl(done)
  if (!url) {
    throw new OmnimuxError('omnimux-invalid-response', `task ${input.taskId} completed without a ${capability} url`)
  }
  // A poll has no original submit operation to recover, but it still crosses
  // the output boundary. Validate the completed result shape here; the
  // download layer below validates the response MIME before it writes bytes.
  assertGuardOutput(
    { operation: { output: { type: capability } } },
    { mode: 'live', outputs: [{ type: capability, url }] },
    { capability },
  )
  await downloadMediaFile({
    dest: input.dest,
    url,
    capability,
    apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
  })
  return { mode: 'live', taskId: input.taskId, url }
}

/**
 * @param {ReturnType<typeof resolveMediaRoute>} route
 * @param {typeof fetch} [fetcher]
 * @param {string} [apiKey]
 * @param {(taskId: string) => void} [onSubmitted]
 */
function createProtocolRuntime(route, fetcher, apiKey = route.apiKey, onSubmitted) {
  if (route.protocol === 'openai-media') {
    return createOpenAiMediaRuntime({
      fetcher,
      apiKey: apiKey || '',
      baseUrl: route.baseUrl,
      providerId: route.providerId,
      modelId: route.modelId,
      capability: route.capability,
      onSubmitted,
    })
  }
  throw new OmnimuxError('unknown-protocol', `unsupported media protocol '${route.protocol}'`)
}
