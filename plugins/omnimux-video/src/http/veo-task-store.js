/**
 * In-memory Veo generation task ledger for the Google Vids studio.
 * Host process lifetime only — enough for UI poll + insert.
 */

import path from 'node:path'

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

export function createVeoTaskStore() {
  /** @type {Map<string, VeoTask>} */
  const tasks = new Map()

  /**
   * @param {Partial<VeoTask> & { id: string, prompt: string }} seed
   */
  function create(seed) {
    const now = Date.now()
    /** @type {VeoTask} */
    const task = {
      id: seed.id,
      status: seed.status || 'queued',
      progress: typeof seed.progress === 'number' ? seed.progress : 0,
      phase: seed.phase || 'queued',
      message: seed.message || '任务已入队',
      prompt: seed.prompt,
      mode: seed.mode || 'create',
      durationSec: seed.durationSec || 10,
      title: seed.title || seed.prompt.slice(0, 16) || '未命名成片',
      createdAt: now,
      updatedAt: now,
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
 * Build a same-origin media URL for a completed local file.
 * @param {string} fileName
 */
export function veoMediaUrl(fileName) {
  const base = path.basename(fileName || '')
  if (!base || base !== fileName || base.includes('..')) {
    throw new Error('invalid media file name')
  }
  return `/omnimux-video/api/veo/media/${encodeURIComponent(base)}`
}
