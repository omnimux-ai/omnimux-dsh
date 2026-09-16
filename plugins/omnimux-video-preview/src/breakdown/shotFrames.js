/**
 * @file plugins/omnimux-video-preview/src/breakdown/shotFrames.js
 * Extract one representative still per breakdown shot and attach preview URLs.
 */

import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createVideoStreamUrl } from '../stream-capability.js'

const MIN_FRAME_BYTES = 500
const MAX_EDGE = 640

/**
 * Midpoint of a shot interval, rounded to 0.1s.
 * @param {object} shot
 * @returns {number}
 */
export function representativeShotTimeSeconds(shot) {
  const start = Number(shot?.start_seconds)
  const end = Number(shot?.end_seconds)
  const s = Number.isFinite(start) && start >= 0 ? start : 0
  const e = Number.isFinite(end) && end >= s ? end : s
  return Math.round(((s + e) / 2) * 10) / 10
}

/**
 * Safe JPEG filename for a shot id.
 * @param {string} shotId
 * @param {number} index
 * @returns {string}
 */
export function shotFrameFilename(shotId, index) {
  const raw = typeof shotId === 'string' && shotId.trim() ? shotId.trim() : `shot_${index + 1}`
  const safe = raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || `shot_${index + 1}`
  return `${safe}.jpg`
}

/**
 * Resolve videoProcess seam or video_process tool.
 * @param {object} [ctx]
 * @returns {object|null}
 */
function resolveVideoProcessService(ctx) {
  if (!ctx) return null
  if (typeof ctx.get === 'function') {
    const direct = ctx.get('videoProcess')
    if (direct && typeof direct.execute === 'function') return direct
  }
  const tools = ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : null)
  if (tools && typeof tools.get === 'function') {
    const tool = tools.get('video_process')
    if (tool && typeof tool.execute === 'function') return tool
  }
  return null
}

/**
 * @param {string} destPath
 * @returns {boolean}
 */
function isUsableFrameFile(destPath) {
  try {
    return existsSync(destPath) && statSync(destPath).size > MIN_FRAME_BYTES
  } catch {
    return false
  }
}

/**
 * Extract one JPEG via videoProcess, then ffmpeg.
 * @param {string} videoPath
 * @param {number} timeSeconds
 * @param {string} destPath
 * @param {object} [ctx]
 * @returns {Promise<boolean>}
 */
export async function extractShotFrame(videoPath, timeSeconds, destPath, ctx) {
  const t = Math.max(0, Number(timeSeconds) || 0)
  const videoProcess = resolveVideoProcessService(ctx)
  if (videoProcess) {
    try {
      await videoProcess.execute({
        capability: 'video_thumbnail_extract',
        input: { videoUrl: videoPath, timeSeconds: t, maxEdge: MAX_EDGE },
        dest: destPath,
      })
      if (isUsableFrameFile(destPath)) return true
    } catch {}
  }

  try {
    execFileSync(
      'ffmpeg',
      ['-v', 'error', '-y', '-ss', String(t), '-i', videoPath, '-frames:v', '1', '-q:v', '2', destPath],
      { timeout: 8000 },
    )
    return isUsableFrameFile(destPath)
  } catch {
    return false
  }
}

/**
 * Persist one still per shot next to the .vbreakdown file.
 * Mutates shots in place. Failures skip that shot only.
 *
 * @param {object} breakdownData
 * @param {object} [options]
 * @param {string} [options.dataPath]
 * @param {string} [options.basePath]
 * @param {object} [options.ctx]
 * @param {(videoPath: string, timeSeconds: number, destPath: string, ctx?: object) => Promise<boolean>} [options.extractFrame]
 * @returns {Promise<number>} number of frames attached
 */
export async function attachShotFrames(breakdownData, options = {}) {
  const videoPath = breakdownData && breakdownData.local_video_path
  const shots = breakdownData && Array.isArray(breakdownData.shots) ? breakdownData.shots : []
  if (!videoPath || !existsSync(videoPath) || shots.length === 0) return 0

  const dataPath = options.dataPath || ''
  const basePath = options.basePath
    || (dataPath.endsWith('.vbreakdown') ? dataPath.slice(0, -'.vbreakdown'.length) : dataPath)
  if (!basePath) return 0

  const framesDir = `${basePath}.frames`
  mkdirSync(framesDir, { recursive: true })

  const extractOne = typeof options.extractFrame === 'function' ? options.extractFrame : extractShotFrame
  let attached = 0

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]
    if (!shot || typeof shot !== 'object') continue
    const destPath = join(framesDir, shotFrameFilename(shot.id, i))
    const ok = await extractOne(videoPath, representativeShotTimeSeconds(shot), destPath, options.ctx)
    if (!ok) continue
    shot.frame_path = destPath
    try {
      shot.frame_url = createVideoStreamUrl(destPath)
    } catch {
      shot.frame_url = ''
    }
    shot.frame_file = basename(destPath)
    attached += 1
  }

  return attached
}

/**
 * Directory that holds extracted frames for a saved artifact.
 * @param {string} dataPath
 * @returns {string}
 */
export function shotFramesDirectory(dataPath) {
  const parent = dirname(dataPath)
  const stem = basename(dataPath).replace(/\.vbreakdown$/i, '')
  return join(parent, `${stem}.frames`)
}
