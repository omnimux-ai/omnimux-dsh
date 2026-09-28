/**
 * Single place for Veo task title / duration / resolution / enqueue defaults.
 * Pure JS — safe for Host store and browser stage.
 */

export const VEO_DEFAULT_DURATION_SEC = 10
export const VEO_DEFAULT_RESOLUTION = '720p'
export const VEO_DEFAULT_MODE = 'create'
export const VEO_TITLE_MAX = 16
export const VEO_UNTITLED = '未命名成片'

/**
 * @param {string} prompt
 */
export function veoTaskTitle(prompt) {
  const text = typeof prompt === 'string' ? prompt.trim() : ''
  return text.slice(0, VEO_TITLE_MAX) || VEO_UNTITLED
}

/**
 * @param {{
 *   id: string,
 *   prompt: string,
 *   mode?: string,
 *   durationSec?: number,
 *   status?: 'queued' | 'generating' | 'completed' | 'failed',
 *   progress?: number,
 *   phase?: string,
 *   message?: string,
 * }} input
 */
export function seedVeoTask(input) {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  const status = input.status || 'queued'
  const durationSec = Number.isFinite(Number(input.durationSec)) && Number(input.durationSec) > 0
    ? Number(input.durationSec)
    : VEO_DEFAULT_DURATION_SEC
  return {
    id: input.id,
    prompt,
    mode: input.mode || VEO_DEFAULT_MODE,
    durationSec,
    title: veoTaskTitle(prompt),
    resolution: VEO_DEFAULT_RESOLUTION,
    status,
    progress: typeof input.progress === 'number'
      ? input.progress
      : (status === 'queued' ? 1 : 0),
    phase: input.phase || (status === 'queued' ? 'queued' : status),
    message: input.message || (status === 'queued' ? '任务已入队' : ''),
  }
}
