import { randomUUID, createHash } from 'node:crypto'
import { readdirSync, readFileSync, existsSync, openSync, closeSync, rmSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hubHomeDir } from '../host/paths.js'
import { atomicWriteFileSync } from '../auth/atomic-write.js'
import { DEFAULT_TASK_DEADLINE_MS } from './task-deadline.js'

/**
 * 获取媒体任务持久化账本目录。
 * @param {string} [customHome]
 * @returns {string}
 */
export function resolveMediaTasksDir(customHome) {
  const home = customHome || hubHomeDir()
  return join(home, 'omnimux', 'media-tasks')
}

/**
 * 校验 taskRef 标识符安全性，防止路径穿越攻击。
 * @param {string} taskRef
 * @returns {boolean}
 */
export function isValidTaskRef(taskRef) {
  if (typeof taskRef !== 'string') return false
  return /^mtask_[a-zA-Z0-9_-]{8,64}$/.test(taskRef.trim())
}

/**
 * 构造一份标准的媒体任务记录。
 *
 * @param {{
 *   capability: 'image' | 'video' | 'audio',
 *   model: string,
 *   operation?: string,
 *   providerId: string,
 *   protocol: string,
 *   baseUrl: string,
 *   wireModel: string,
 *   group?: string,
 *   taskPath: string,
 *   requestKey?: string,
 *   credentialRef?: string,
 *   deadlineMs?: number,
 * }} params
 * @returns {Record<string, unknown>}
 */
export function createMediaTaskRecord(params) {
  const now = Date.now()
  const randomSuffix = randomUUID().replace(/-/g, '').slice(0, 16)
  const taskRef = `mtask_${randomSuffix}`

  return {
    schemaVersion: 1,
    taskRef,
    requestKey: params.requestKey || `req_${randomSuffix}`,
    capability: params.capability,
    model: params.model,
    operation: params.operation || undefined,
    providerId: params.providerId,
    protocol: params.protocol,
    baseUrl: params.baseUrl,
    wireModel: params.wireModel,
    group: params.group || undefined,
    taskPath: params.taskPath,
    credentialRef: params.credentialRef || undefined,
    submittedAt: now,
    updatedAt: now,
    deadlineMs: params.deadlineMs ?? DEFAULT_TASK_DEADLINE_MS,
    status: 'submitting',
    upstreamTaskId: undefined,
    error: undefined,
    artifact: undefined,
  }
}

/**
 * 原子持久化单条媒体任务记录。
 *
 * @param {Record<string, unknown>} record
 * @param {{ storageDir?: string }} [opts]
 */
export function saveMediaTaskRecord(record, opts = {}) {
  if (!record || typeof record !== 'object' || !isValidTaskRef(String(record.taskRef))) {
    throw new Error(`Invalid media task record or taskRef: ${record?.taskRef}`)
  }
  const dir = opts.storageDir || resolveMediaTasksDir()
  const targetFile = join(dir, `${record.taskRef}.json`)
  const content = JSON.stringify(record, null, 2)
  atomicWriteFileSync(targetFile, content, { mode: 0o600, dirMode: 0o700 })
}

/**
 * 按照 taskRef 读取单条任务记录。
 *
 * @param {string} taskRef
 * @param {{ storageDir?: string }} [opts]
 * @returns {Record<string, unknown> | null}
 */
export function getMediaTaskRecord(taskRef, opts = {}) {
  if (!isValidTaskRef(taskRef)) return null
  const dir = opts.storageDir || resolveMediaTasksDir()
  const targetFile = join(dir, `${taskRef.trim()}.json`)
  if (!existsSync(targetFile)) return null

  try {
    const raw = readFileSync(targetFile, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.taskRef === taskRef.trim()) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/**
 * 遍历账本读取所有任务记录。
 *
 * @param {{ storageDir?: string }} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
function listAllMediaTaskRecords(opts = {}) {
  const dir = opts.storageDir || resolveMediaTasksDir()
  if (!existsSync(dir)) return []

  const results = []
  try {
    const files = readdirSync(dir)
    for (const file of files) {
      if (!file.startsWith('mtask_') || !file.endsWith('.json')) continue
      const targetFile = join(dir, file)
      try {
        const raw = readFileSync(targetFile, 'utf8')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.taskRef) {
          results.push(parsed)
        }
      } catch {
        // 忽略单文件损坏
      }
    }
  } catch {
    return []
  }
  return results
}

/**
 * 按上游任务 ID (upstreamTaskId) 检索唯一任务记录。
 *
 * @param {string} upstreamTaskId
 * @param {{ storageDir?: string }} [opts]
 * @returns {Record<string, unknown> | null}
 */
export function findMediaTaskByUpstreamId(upstreamTaskId, opts = {}) {
  if (!upstreamTaskId || typeof upstreamTaskId !== 'string') return null
  const cleanId = upstreamTaskId.trim()
  if (!cleanId) return null

  const all = listAllMediaTaskRecords(opts)
  const matches = all.filter((r) => r.upstreamTaskId === cleanId)
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    // 存在多条冲突时按最新提交时间优先
    matches.sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0))
    return matches[0]
  }
  return null
}

/**
 * 按 requestKey 检索任务记录（幂等去重防护）。
 *
 * @param {string} requestKey
 * @param {{ storageDir?: string }} [opts]
 * @returns {Record<string, unknown> | null}
 */
export function findMediaTaskByRequestKey(requestKey, opts = {}) {
  if (!requestKey || typeof requestKey !== 'string') return null
  const cleanKey = requestKey.trim()
  if (!cleanKey) return null

  const all = listAllMediaTaskRecords(opts)
  const matches = all.filter((r) => r.requestKey === cleanKey)
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    matches.sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0))
    return matches[0]
  }
  return null
}

/**
 * 原子更新任务记录的指定字段。
 *
 * @param {string} taskRef
 * @param {Record<string, unknown>} patch
 * @param {{ storageDir?: string }} [opts]
 * @returns {Record<string, unknown>}
 */
export function updateMediaTaskRecord(taskRef, patch, opts = {}) {
  const current = getMediaTaskRecord(taskRef, opts)
  if (!current) {
    throw new Error(`Media task not found: ${taskRef}`)
  }

  const updated = {
    ...current,
    ...patch,
    taskRef: current.taskRef, // 保证关键不可变字段不被污染
    schemaVersion: current.schemaVersion,
    submittedAt: current.submittedAt,
    capability: current.capability,
    updatedAt: Date.now(),
  }

  saveMediaTaskRecord(updated, opts)
  return updated
}

/**
 * 针对指定 requestKey 建立原子排他锁，防止并发提交产生竞态条件。
 *
 * @param {string} requestKey
 * @param {{ storageDir?: string }} [opts]
 * @returns {{ acquired: boolean, release: () => void }}
 */
export function acquireMediaTaskLock(requestKey, opts = {}) {
  if (!requestKey || typeof requestKey !== 'string') {
    return { acquired: true, release: () => {} }
  }
  const cleanKey = requestKey.trim()
  if (!cleanKey) {
    return { acquired: true, release: () => {} }
  }
  const dir = opts.storageDir || resolveMediaTasksDir()
  const locksDir = join(dir, 'locks')
  try {
    mkdirSync(locksDir, { recursive: true, mode: 0o700 })
  } catch {}

  const safeHex = createHash('sha256').update(cleanKey).digest('hex')
  const lockFile = join(locksDir, `${safeHex}.lock`)

  try {
    const fd = openSync(lockFile, 'wx', 0o600)
    closeSync(fd)
    return {
      acquired: true,
      release: () => {
        try {
          rmSync(lockFile, { force: true })
        } catch {}
      },
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EEXIST') {
      try {
        const stat = statSync(lockFile)
        if (Date.now() - stat.mtimeMs > 60_000) {
          rmSync(lockFile, { force: true })
          const fd = openSync(lockFile, 'wx', 0o600)
          closeSync(fd)
          return {
            acquired: true,
            release: () => {
              try {
                rmSync(lockFile, { force: true })
              } catch {}
            },
          }
        }
      } catch {}
      return { acquired: false, release: () => {} }
    }
    return { acquired: true, release: () => {} }
  }
}
