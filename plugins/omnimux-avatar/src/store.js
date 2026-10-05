// 虚拟形象存储：单文件账本 + 每个形象独立的数据目录。
// 写入一律先落 <file>.tmp 再 rename，磁盘上任何时刻都是一份完整账本。
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { avatarDirOf } from './paths.js'

const SCHEMA = 1
const NAME_MAX = 40
const DEFAULT_TIER = 'total'
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const TASK_STATUSES = new Set(['queued', 'generating', 'ready', 'failed'])

/** 插件自有错误：code 供 HTTP / 工具层映射，status 是 HTTP 状态码。 */
export class AvatarError extends Error {
  constructor(code, message, status = 500) {
    super(message)
    this.name = 'AvatarError'
    this.code = code
    this.status = status
  }
}

const clone = (value) => structuredClone(value)
const nowIso = () => new Date().toISOString()
const messageOf = (error) => (error instanceof Error ? error.message : String(error))

/** 'avt_' + 8 位十六进制。 */
function newAvatarId() {
  return `avt_${randomBytes(4).toString('hex')}`
}

/** 名称：去空白、1..40 字符、不含斜杠与控制字符。 */
function normalizeName(input) {
  if (typeof input !== 'string') throw new AvatarError('invalid_name', '形象名称必须是字符串', 400)
  const name = input.trim()
  if (name.length < 1 || name.length > NAME_MAX) {
    throw new AvatarError('invalid_name', `形象名称需为 1-${NAME_MAX} 个字符`, 400)
  }
  if (name.includes('/') || CONTROL_CHARS.test(name)) {
    throw new AvatarError('invalid_name', '形象名称不能包含斜杠或控制字符', 400)
  }
  return name
}

/** 设定：只保留已知字段，缺省补默认值。 */
function normalizeSheet(input) {
  const sheet = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  return {
    tier: typeof sheet.tier === 'string' && sheet.tier !== '' ? sheet.tier : DEFAULT_TIER,
    selection:
      sheet.selection && typeof sheet.selection === 'object' && !Array.isArray(sheet.selection)
        ? clone(sheet.selection)
        : {},
    brief: typeof sheet.brief === 'string' ? sheet.brief : '',
    seed: Number.isFinite(sheet.seed) ? sheet.seed : 0,
    image_url: typeof sheet.image_url === 'string' ? sheet.image_url : '',
  }
}

/** 局部更新设定：只覆盖显式传入的字段，未传的保持原值。 */
function mergeSheet(current, patch) {
  const next = clone(current)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return next
  if (typeof patch.tier === 'string' && patch.tier !== '') next.tier = patch.tier
  if (patch.selection && typeof patch.selection === 'object' && !Array.isArray(patch.selection)) {
    next.selection = clone(patch.selection)
  }
  if (typeof patch.brief === 'string') next.brief = patch.brief
  if (Number.isFinite(patch.seed)) next.seed = patch.seed
  if (typeof patch.image_url === 'string') next.image_url = patch.image_url
  return next
}

/** 任务记录：状态与类型只接受已知取值，时间戳由存储维护。 */
function normalizeTask(input, now) {
  const task = input && typeof input === 'object' ? input : {}
  return {
    taskId: typeof task.taskId === 'string' ? task.taskId : '',
    kind: task.kind === 'multiview' ? 'multiview' : 'sheet',
    model: typeof task.model === 'string' ? task.model : '',
    group: typeof task.group === 'string' ? task.group : '',
    status: TASK_STATUSES.has(task.status) ? task.status : 'queued',
    taskRef: task.taskRef ?? null,
    destPath: typeof task.destPath === 'string' ? task.destPath : '',
    error: task.error == null ? null : String(task.error),
    // 归档（资产库同步）失败的原因：图已产出，任务仍 ready，只把原因留在这里。
    syncError: task.syncError == null ? null : String(task.syncError),
    createdAt: typeof task.createdAt === 'string' && task.createdAt !== '' ? task.createdAt : now,
    updatedAt: now,
  }
}

/** 账本里的一条形象记录：补齐缺字段，兼容手工改过的文件。 */
function normalizeRecord(input, now) {
  const record = input && typeof input === 'object' ? input : {}
  const id = typeof record.id === 'string' && record.id !== '' ? record.id : newAvatarId()
  return {
    id,
    name: typeof record.name === 'string' && record.name !== '' ? record.name : id,
    sheet: normalizeSheet(record.sheet),
    assetId: record.assetId == null ? null : String(record.assetId),
    assetSource:
      typeof record.assetSource === 'string' && record.assetSource !== ''
        ? record.assetSource
        : `omnimux-avatar:${id}`,
    tasks: Array.isArray(record.tasks) ? record.tasks.map((task) => normalizeTask(task, now)) : [],
    createdAt: typeof record.createdAt === 'string' && record.createdAt !== '' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt !== '' ? record.updatedAt : now,
  }
}

/**
 * 最近一次任务：按 createdAt 取最新，同一时刻取靠后写入的那条。
 * 列表接口与工具共用，避免两处各写一套「最新」定义。
 */
export function latestTaskOf(avatar) {
  const tasks = Array.isArray(avatar?.tasks) ? avatar.tasks : []
  let latest = null
  for (const task of tasks) {
    if (!latest) {
      latest = task
      continue
    }
    if (String(task.createdAt) >= String(latest.createdAt)) latest = task
  }
  return latest ? clone(latest) : null
}

/** 读取账本；文件缺失视为空库，内容不可解析则明确报错。 */
function loadState(paths) {
  if (!existsSync(paths.libraryFile)) return { revision: 0, avatars: [] }
  let raw
  try {
    raw = readFileSync(paths.libraryFile, 'utf8')
  } catch (error) {
    throw new AvatarError('library-corrupt', `无法读取形象账本：${messageOf(error)}`, 500)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AvatarError('library-corrupt', '形象账本不是合法 JSON', 500)
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.avatars)) {
    throw new AvatarError('library-corrupt', '形象账本结构不正确', 500)
  }
  const now = nowIso()
  return {
    revision: Number.isFinite(parsed.revision) ? parsed.revision : 0,
    avatars: parsed.avatars.map((record) => normalizeRecord(record, now)),
  }
}

/**
 * 形象库。
 * @param {{ paths: { dir?: string, dataDir?: string, libraryFile: string } }} opts
 */
export function createAvatarStore({ paths } = {}) {
  if (!paths?.libraryFile) throw new AvatarError('invalid_paths', '形象库路径不可用', 500)
  const dir = paths.dir ?? dirname(paths.libraryFile)
  const dataDir = paths.dataDir ?? join(dir, 'data')
  mkdirSync(dir, { recursive: true })
  mkdirSync(dataDir, { recursive: true })

  const state = loadState(paths)

  /** 原子落盘：临时文件 + rename，失败即回滚内存状态。 */
  function persist() {
    mkdirSync(dir, { recursive: true })
    const tmp = `${paths.libraryFile}.tmp`
    writeFileSync(tmp, JSON.stringify({ schema: SCHEMA, revision: state.revision, avatars: state.avatars }, null, 2))
    renameSync(tmp, paths.libraryFile)
  }

  function mutate(apply) {
    const previousAvatars = state.avatars.map((record) => clone(record))
    const previousRevision = state.revision
    const result = apply()
    state.revision = previousRevision + 1
    try {
      persist()
    } catch (error) {
      state.avatars = previousAvatars
      state.revision = previousRevision
      throw new AvatarError('persist-failed', `形象库写入失败：${messageOf(error)}`, 500)
    }
    return result
  }

  function indexOf(id) {
    return state.avatars.findIndex((record) => record.id === id)
  }

  function requireIndex(id) {
    const index = indexOf(id)
    if (index < 0) throw new AvatarError('avatar-not-found', 'avatar not found', 404)
    return index
  }

  function list() {
    return state.avatars.map((record) => clone(record))
  }

  function find(id) {
    const index = indexOf(id)
    return index < 0 ? null : clone(state.avatars[index])
  }

  function get(id) {
    return clone(state.avatars[requireIndex(id)])
  }

  function create({ name, sheet } = {}) {
    const clean = normalizeName(name)
    if (state.avatars.some((record) => record.name === clean)) {
      throw new AvatarError('name-conflict', `形象名称「${clean}」已存在`, 409)
    }
    const now = nowIso()
    const id = newAvatarId()
    const record = {
      id,
      name: clean,
      sheet: normalizeSheet(sheet),
      assetId: null,
      assetSource: `omnimux-avatar:${id}`,
      tasks: [],
      createdAt: now,
      updatedAt: now,
    }
    return mutate(() => {
      state.avatars = [...state.avatars, record]
      return clone(record)
    })
  }

  function update(id, patch) {
    const index = requireIndex(id)
    const current = state.avatars[index]
    const input = patch && typeof patch === 'object' ? patch : {}

    let name = current.name
    if (input.name !== undefined) {
      name = normalizeName(input.name)
      if (state.avatars.some((record, i) => i !== index && record.name === name)) {
        throw new AvatarError('name-conflict', `形象名称「${name}」已存在`, 409)
      }
    }
    const sheet = input.sheet === undefined ? clone(current.sheet) : mergeSheet(current.sheet, input.sheet)
    const assetId =
      input.assetId === undefined ? current.assetId : input.assetId === null ? null : String(input.assetId)
    const next = { ...current, name, sheet, assetId, updatedAt: nowIso() }
    return mutate(() => {
      state.avatars = state.avatars.map((record, i) => (i === index ? next : record))
      return clone(next)
    })
  }

  /** 删除记录并回收该形象的数据目录。 */
  function remove(id) {
    const index = requireIndex(id)
    const removed = state.avatars[index]
    mutate(() => {
      state.avatars = state.avatars.filter((_, i) => i !== index)
    })
    rmSync(avatarDirOf({ dataDir }, id), { recursive: true, force: true })
    return { id: removed.id, deleted: true }
  }

  function revision() {
    return state.revision
  }

  function addTask(avatarId, task) {
    const index = requireIndex(avatarId)
    const record = normalizeTask(task, nowIso())
    if (record.taskId === '') throw new AvatarError('invalid_task', '任务缺少 taskId', 400)
    const current = state.avatars[index]
    const exists = current.tasks.some((item) => item.taskId === record.taskId)
    const tasks = exists
      ? current.tasks.map((item) =>
          item.taskId === record.taskId ? { ...record, createdAt: item.createdAt } : item
        )
      : [...current.tasks, record]
    const next = { ...current, tasks, updatedAt: nowIso() }
    return mutate(() => {
      state.avatars = state.avatars.map((item, i) => (i === index ? next : item))
      return clone(tasks.find((item) => item.taskId === record.taskId))
    })
  }

  function updateTask(avatarId, taskId, patch) {
    const index = requireIndex(avatarId)
    const current = state.avatars[index]
    const taskIndex = current.tasks.findIndex((item) => item.taskId === taskId)
    if (taskIndex < 0) throw new AvatarError('task-not-found', 'task not found', 404)
    const merged = normalizeTask({ ...current.tasks[taskIndex], ...(patch ?? {}) }, nowIso())
    const tasks = current.tasks.map((item, i) => (i === taskIndex ? merged : item))
    const next = { ...current, tasks, updatedAt: nowIso() }
    return mutate(() => {
      state.avatars = state.avatars.map((item, i) => (i === index ? next : item))
      return clone(merged)
    })
  }

  function removeTask(avatarId, taskId) {
    const index = requireIndex(avatarId)
    const current = state.avatars[index]
    if (!current.tasks.some((item) => item.taskId === taskId)) {
      throw new AvatarError('task-not-found', 'task not found', 404)
    }
    const tasks = current.tasks.filter((item) => item.taskId !== taskId)
    const next = { ...current, tasks, updatedAt: nowIso() }
    return mutate(() => {
      state.avatars = state.avatars.map((item, i) => (i === index ? next : item))
      return { taskId, deleted: true }
    })
  }

  function findTask(avatarId, taskId) {
    const index = requireIndex(avatarId)
    const task = state.avatars[index].tasks.find((item) => item.taskId === taskId)
    return task ? clone(task) : null
  }

  function listTasks(avatarId) {
    const index = requireIndex(avatarId)
    return state.avatars[index].tasks.map((task) => clone(task))
  }

  return {
    list,
    find,
    get,
    create,
    update,
    remove,
    revision,
    addTask,
    updateTask,
    removeTask,
    findTask,
    listTasks,
  }
}
