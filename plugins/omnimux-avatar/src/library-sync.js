// 资产库同步：把形象主图与「多视角」目录归档到资产库「角色」分类。
// 一个形象一条资产（按 source 幂等），多视角是该资产下的目录引用。
import { existsSync } from 'node:fs'
import { avatarMultiViewDir } from './paths.js'
import { AvatarError } from './store.js'

const NAME_MAX = 40
const MAX_NAME_ATTEMPTS = 20
const MULTIVIEW_FOLDER = '多视角'
const FALLBACK_NAME = '虚拟形象'

// 资产库 seam 的错误码 → HTTP 状态；未列出的按上游失败（502）处理。
const STATUS_BY_CODE = {
  'name-conflict': 409,
  'asset-not-found': 404,
  'path-denied': 400,
  'path-not-found': 400,
  'name-invalid': 400,
  'type-invalid': 400,
}

const messageOf = (error) => (error instanceof Error ? error.message : String(error))

/** 读取一个宿主座位：缺失或读取抛错都按「未提供」处理。 */
function readSeat(ctx, name) {
  if (!ctx || typeof ctx !== 'object') return undefined
  const get = ctx.get
  if (typeof get !== 'function') return undefined
  try {
    return get.call(ctx, name)
  } catch {
    return undefined
  }
}

function isNameConflict(error) {
  return error?.code === 'name-conflict' || error?.status === 409
}

/** 该形象已完成且产物仍在盘上的任务（从最新往回找）。 */
function readyTaskOf(avatar, kind) {
  const tasks = Array.isArray(avatar?.tasks) ? avatar.tasks : []
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i]
    if (task.kind !== kind || task.status !== 'ready') continue
    if (typeof task.destPath === 'string' && task.destPath !== '' && existsSync(task.destPath)) return task
  }
  return null
}

/** 资产名裁剪到 40 字符以内；空白名回退为固定文案。 */
function baseNameOf(name) {
  const trimmed = String(name ?? '').trim().slice(0, NAME_MAX)
  return trimmed === '' ? FALLBACK_NAME : trimmed
}

/** 重名重试名：'<name> (2)'、'<name> (3)'…，总长不超过 40。 */
function suffixedName(base, attempt) {
  const suffix = ` (${attempt})`
  return `${base.slice(0, Math.max(1, NAME_MAX - suffix.length))}${suffix}`
}

/** 一条 file ref 是否就是该形象自己的「多视角」目录。 */
function isMultiViewRef(file, multiViewDir) {
  if (!file) return false
  if (file.kind === 'directory') return true
  if (file.original_name === MULTIVIEW_FOLDER) return true
  const real = typeof file.real_path === 'string' ? file.real_path.replace(/\/+$/, '') : ''
  return real !== '' && real === multiViewDir.replace(/\/+$/, '')
}

/**
 * 同步服务。
 * @param {{ ctx?: unknown, store: object, paths: object, assetLibrary?: object }} opts
 */
export function createLibrarySync({ ctx, store, paths, assetLibrary } = {}) {
  function resolveSeam() {
    const seam = assetLibrary ?? readSeat(ctx, 'assetLibrary')
    if (!seam || typeof seam.saveTypedAsset !== 'function' || typeof seam.attachFiles !== 'function') {
      throw new AvatarError('needs-assets', '资产库不可用', 503)
    }
    return seam
  }

  function mapError(error) {
    if (error instanceof AvatarError) return error
    const code = typeof error?.code === 'string' && error.code !== '' ? error.code : 'library-sync-failed'
    return new AvatarError(code, messageOf(error), STATUS_BY_CODE[code] ?? 502)
  }

  /** 资产现有引用：优先取带 kind 的视图，退回 findBySource 的原始引用。 */
  function existingFiles(seam, avatar, assetId) {
    if (typeof seam.getView === 'function') {
      let view = null
      try {
        view = seam.getView(assetId)
      } catch {
        view = null // 视图不可用不是同步失败：退回按来源查得的原始引用
      }
      if (view && Array.isArray(view.files)) return view.files
    }
    if (typeof seam.findBySource === 'function') {
      const found = seam.findBySource(avatar.assetSource)
      if (found && Array.isArray(found.files)) return found.files
    }
    return []
  }

  /** 首次建档：全局重名时按 (2)(3)… 重试，最多 20 次。 */
  async function saveCharacter(seam, avatar, destPath) {
    const base = baseNameOf(avatar.name)
    let lastConflict = null
    for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
      const name = attempt === 1 ? base : suffixedName(base, attempt)
      try {
        const result = await seam.saveTypedAsset({
          name,
          type: 'character',
          description: `虚拟形象 · ${avatar.name}`,
          tags: ['虚拟形象'],
          files: [destPath],
          source: avatar.assetSource,
        })
        const assetId = result?.asset?.id
        if (typeof assetId !== 'string' || assetId === '') {
          throw new AvatarError('library-sync-failed', '资产库未返回资产 id', 502)
        }
        return { assetId, name }
      } catch (error) {
        if (!isNameConflict(error)) throw mapError(error)
        lastConflict = error
      }
    }
    throw mapError(lastConflict ?? new AvatarError('name-conflict', '资产名重复次数过多', 409))
  }

  async function syncSheet(avatarId) {
    // 先确认形象存在，再看资产库座位：未知 id 必须报 404 而不是被能力缺失盖住。
    const avatar = store.get(avatarId)
    const seam = resolveSeam()
    const task = readyTaskOf(avatar, 'sheet')
    if (!task) throw new AvatarError('invalid_request', '该形象尚无已完成的主图', 400)

    const existing = typeof seam.findBySource === 'function' ? seam.findBySource(avatar.assetSource) : null
    if (existing?.id) {
      // 已有档案只追加新主图：不新建资产、不动封面。
      await seam.attachFiles({ assetId: existing.id, files: [task.destPath] })
      store.update(avatarId, { assetId: existing.id })
      return { assetId: existing.id, created: false }
    }

    const saved = await saveCharacter(seam, avatar, task.destPath)
    store.update(avatarId, { assetId: saved.assetId })
    return { assetId: saved.assetId, created: true }
  }

  async function syncMultiView(avatarId) {
    const avatar = store.get(avatarId)
    const seam = resolveSeam()
    const task = readyTaskOf(avatar, 'multiview')
    if (!task) throw new AvatarError('invalid_request', '该形象尚无已完成的多视角图', 400)

    const assetId = avatar.assetId ?? (await syncSheet(avatarId)).assetId
    const multiViewDir = avatarMultiViewDir(paths, avatarId)
    const files = existingFiles(seam, { ...avatar, assetId }, assetId)
    if (files.some((file) => isMultiViewRef(file, multiViewDir))) return { assetId, attached: false }

    await seam.attachFiles({ assetId, files: [multiViewDir] })
    return { assetId, attached: true }
  }

  /** 只读状态：不写任何账本。 */
  function status(avatarId) {
    const avatar = store.get(avatarId)
    const seam = resolveSeam()
    const multiViewDir = avatarMultiViewDir(paths, avatarId)
    const files = avatar.assetId ? existingFiles(seam, avatar, avatar.assetId) : []
    return {
      assetId: avatar.assetId ?? null,
      hasSheet: readyTaskOf(avatar, 'sheet') !== null,
      hasMultiViewFolder: files.some((file) => isMultiViewRef(file, multiViewDir)),
    }
  }

  return { syncSheet, syncMultiView, status }
}
