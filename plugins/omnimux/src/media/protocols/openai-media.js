import {
  createOpenAICompatibleAdapter,
  createOpenAICompatibleClient,
  createProviderRegistry,
  createProviderRuntime,
} from 'aigc-provider-runtime-kit/runtime'
import { OmnimuxError } from '../errors.js'
import { classifyQuotaFailure } from '../../errors/quota-classifier.js'
import { getJson } from '../job.js'
import { pickMediaUrl, pickTaskId, pickTaskStatus, TASK_PATH } from '../vendors/omnimux.js'

/**
 * @param {object} options
 * @param {typeof fetch} options.fetcher
 * @param {string} options.baseUrl
 * @param {string} options.apiKey
 * @param {string} options.taskId
 * @param {string} options.capability
 * @param {AbortSignal} [options.signal]
 * @param {() => Promise<void>} [options.sleep]
 */
export async function pollOpenAiMediaTask(options) {
  const sleep = options.sleep ?? (() => new Promise((resolve) => setTimeout(resolve, 1500)))
  const path = TASK_PATH[options.capability]
  if (!path) {
    throw new OmnimuxError('unknown-protocol', `openai-media has no task path for ${options.capability}`)
  }
  const url = `${options.baseUrl}/${path}/${options.taskId}`
  for (;;) {
    if (options.signal?.aborted) {
      throw new OmnimuxError('omnimux-aborted', `${options.capability} poll aborted`)
    }
    const json = await getJson(options.fetcher, url, options.apiKey, options.signal)
    const status = pickTaskStatus(json)
    if (status === 'completed' || status === 'success') return json
    if (status === 'failed' || status === 'error') {
      const classified = classifyQuotaFailure({ body: json })
      if (classified.kind === 'channel-unavailable') throw new OmnimuxError(classified.code, classified.message)
      if (classified.kind === 'quota-exceeded') throw new OmnimuxError('quota-exceeded', classified.message, { details: classified })
      throw new OmnimuxError('omnimux-failed', `${options.capability} task ${options.taskId} failed`)
    }
    await sleep()
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
