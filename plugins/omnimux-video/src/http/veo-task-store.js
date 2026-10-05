/**
 * In-memory Veo generation task ledger for the Google Vids studio.
 * Host process lifetime only — enough for UI poll + insert.
 */

import path from 'node:path'
import { seedVeoTask } from '../shared/veoTaskSeed.js'

/**
 * @typedef {{
 *   id: string,
 *   status: 'queued' | 'generating' | 'completed' | 'failed',
 *   progress: number,
 *   phase: string,
 *   message: string,
 *   prompt: string,
 *   mode: string,
 *   durationSec: number,
 *   title: string,
 *   operation?: string,
 *   seconds?: number,
 *   aspect_ratio?: string,
 *   image_url?: string,
 *   video_id?: string,
 *   videoUrl?: string,
 *   localPath?: string,
 *   fileName?: string,
 *   fileSize?: number,
 *   resolution?: string,
 *   error?: string,
 *   createdAt: number,
 *   updatedAt: number,
 * }} VeoTask
 */

/**
 * 四模式请求字段（Issue #3181）：随任务记录透传，供后续中枢调用读取。
 * `durationSec` 仍是客户端读取的时长字段，`seconds` 是中枢请求字段，两者同时保留。
 * @type {readonly string[]}
 */
const VIDS_TASK_FIELDS = Object.freeze([
  'operation',
  'seconds',
  'resolution',
  'aspect_ratio',
  'image_url',
  'video_id',
])

export function createVeoTaskStore() {
  /** @type {Map<string, VeoTask>} */
  const tasks = new Map()

  /**
   * @param {Partial<VeoTask> & { id: string, prompt: string }} seed
   */
  function create(seed) {
    const now = Date.now()
    const seeded = seedVeoTask({
      id: seed.id,
      prompt: seed.prompt,
      mode: seed.mode,
      durationSec: seed.durationSec,
      status: seed.status,
      progress: seed.progress,
      phase: seed.phase,
      message: seed.message,
    })
    /** @type {VeoTask} */
    const task = {
      ...seeded,
      // Allow explicit title override only when caller already computed via seedVeoTask.
      title: seed.title || seeded.title,
      createdAt: now,
      updatedAt: now,
    }
    // seedVeoTask 只产出固定字段集，这里显式透传四模式请求字段（含覆盖默认 resolution）。
    for (const field of VIDS_TASK_FIELDS) {
      const value = seed[field]
      if (value !== undefined && value !== null) task[field] = value
    }
    tasks.set(task.id, task)
    return snapshot(task)
  }

  /**
   * @param {string} id
   * @param {Partial<VeoTask>} patch
   */
  function update(id, patch) {
    const cur = tasks.get(id)
    if (!cur) return null
    Object.assign(cur, patch, { updatedAt: Date.now() })
    if (typeof cur.progress === 'number') {
      cur.progress = Math.max(0, Math.min(100, Math.round(cur.progress)))
    }
    return snapshot(cur)
  }

  /** @param {string} id */
  function get(id) {
    const cur = tasks.get(id)
    return cur ? snapshot(cur) : null
  }

  // Host seam via veoTasks.list — not a missing HTTP GET /tasks route.
  function list() {
    return [...tasks.values()].map(snapshot).sort((a, b) => b.createdAt - a.createdAt)
  }

  /** @param {VeoTask} task */
  function snapshot(task) {
    return { ...task }
  }

  return { create, update, get, list }
}

/**
 * Accept only a plain basename that cannot escape the media directory.
 * @param {string} fileName
 * @returns {string | null}
 */
export function safeMediaBase(fileName) {
  const base = path.basename(fileName || '')
  if (!base || base !== fileName || base.includes('..')) return null
  return base
}

/**
 * Build a same-origin media URL for a completed local file.
 * Rejects the same names as {@link safeMediaBase} (throws so callers cannot
 * silently publish a missing videoUrl).
 * @param {string} fileName
 */
export function veoMediaUrl(fileName) {
  const base = safeMediaBase(fileName)
  if (!base) {
    throw new Error('invalid media file name')
  }
  return `/omnimux-video/api/veo/media/${encodeURIComponent(base)}`
}
