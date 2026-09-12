import { executeOmnimuxMedia } from './execute.js'
import { pollOpenAiMediaTask } from './protocols/openai-media.js'
import { parseMediaConfig, resolveMediaRoute } from './route.js'

export { OmnimuxError } from './errors.js'
export { downloadMediaFile as downloadAudioFile } from './job.js'
export { pollOpenAiMediaTask } from './protocols/openai-media.js'
export { pickTaskId, pickMediaUrl as pickAudioUrl } from './vendors/omnimux.js'

/**
 * Poll an audio task by id.
 *
 * `options.deadlineMs` / `options.pollIntervalMs` / `options.requestTimeoutMs`
 * override the poll lifecycle defaults (see `task-deadline.js`), and
 * `options.submittedAt` anchors the deadline at the original submit time so a
 * reconcile after a restart cannot restart the clock.
 *
 * @param {Parameters<typeof pollOpenAiMediaTask>[0]} options
 */
export function pollAudioTask(options) {
  return pollOpenAiMediaTask({ ...options, capability: options.capability || 'audio' })
}

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function readOmnimuxAudioConfig(env = process.env) {
  const route = resolveMediaRoute('audio', {}, parseMediaConfig(undefined), env)
  return { baseUrl: route.baseUrl, apiKey: route.apiKey, modelId: route.modelId }
}

/**
 * Speech operations return bytes synchronously; existing task IDs still poll.
 * @param {Parameters<typeof executeOmnimuxMedia>[1]} input
 */
export function executeOmnimuxAudio(input) {
  return executeOmnimuxMedia('audio', input)
}
