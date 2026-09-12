import { executeOmnimuxMedia } from './execute.js'
import { pollOpenAiMediaTask } from './protocols/openai-media.js'
import { parseMediaConfig, resolveMediaRoute } from './route.js'

export { OmnimuxError } from './errors.js'
export { downloadMediaFile as downloadVideoFile } from './job.js'
export { pollOpenAiMediaTask } from './protocols/openai-media.js'
export { pickTaskId, pickVideoUrl } from './vendors/omnimux.js'

/**
 * Poll a video task by id.
 *
 * `options.deadlineMs` / `options.pollIntervalMs` / `options.requestTimeoutMs`
 * override the poll lifecycle defaults (see `task-deadline.js`), and
 * `options.submittedAt` anchors the deadline at the original submit time so a
 * reconcile after a restart cannot restart the clock.
 *
 * @param {Parameters<typeof pollOpenAiMediaTask>[0]} options
 */
export function pollVideoTask(options) {
  return pollOpenAiMediaTask({ ...options, capability: options.capability || 'video' })
}

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function readOmnimuxConfig(env = process.env) {
  const route = resolveMediaRoute('video', {}, parseMediaConfig(undefined), env)
  return { baseUrl: route.baseUrl, apiKey: route.apiKey, modelId: route.modelId }
}

/**
 * @param {Parameters<typeof executeOmnimuxMedia>[1]} input
 */
export function executeOmnimuxVideo(input) {
  return executeOmnimuxMedia('video', input)
}
