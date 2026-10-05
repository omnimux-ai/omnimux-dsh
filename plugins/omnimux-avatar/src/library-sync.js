// 资产库同步：把形象主图与「多视角」目录归档到资产库「角色」分类。
// 一个形象一条资产（按 source 幂等），多视角是该资产下的目录引用。
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
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

/**
 * 一条 file ref 是否就是该形象自己的「多视角」目录。
 * 资产库把来源复制进受管目录后只剩 relative_path + original_name，因此除了目录真身
 * （real_path 等于该形象的多视角目录）还要认目录名；kind=directory 只用于排除
 * 同名普通文件，任何别的目录引用都不算。
 */
function isMultiViewRef(file, multiViewDir) {
  if (!file) return false
  const expected = String(multiViewDir ?? '').replace(/\/+$/, '')
  const real = typeof file.real_path === 'string' ? file.real_path.replace(/\/+$/, '') : ''
  if (real !== '' && expected !== '' && real === expected) return true
  const relative = typeof file.relative_path === 'string' ? file.relative_path.replace(/\/+$/, '') : ''
  const name =
    typeof file.original_name === 'string' && file.original_name !== ''
      ? file.original_name
      : basename(relative) || basename(real)
  if (name !== MULTIVIEW_FOLDER) return false
  return file.kind === undefined || file.kind === 'directory'
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

  /** 一次主图同步：已有来源档案只追加新主图，否则首次建档。 */
  async function syncSheetOnce(avatarId) {
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

  // 首次建档的并发护栏：同一形象同一时刻只跑一次「查来源 → 建档」，
  // 后到的调用复用同一个 promise，避免并发首建造出两条资产。
  const firstIngest = new Map()

  /**
   * 同步主图到资产库；同一形象的并发调用共用同一次建档。
   * @param {string} avatarId
   */
  function syncSheet(avatarId) {
    const pending = firstIngest.get(avatarId)
    if (pending) return pending
    const run = syncSheetOnce(avatarId).finally(() => {
      if (firstIngest.get(avatarId) === run) firstIngest.delete(avatarId)
    })
    firstIngest.set(avatarId, run)
    return run
  }

  /**
   * 把多视角目录挂到资产上。记录里的 assetId 已失效（资产重建后 id 变了）时按来源键
   * 找回同一条资产、回写修复后的 id 再重试一次；来源键也找不到才算真的失败。
   */
  async function attachMultiView(seam, avatar, multiViewDir) {
    const files = [multiViewDir]
    try {
      await seam.attachFiles({ assetId: avatar.assetId, files })
      return avatar.assetId
    } catch (error) {
      if (error?.code !== 'asset-not-found') throw mapError(error)
      const found = typeof seam.findBySource === 'function' ? seam.findBySource(avatar.assetSource) : null
      if (!found?.id || found.id === avatar.assetId) throw mapError(error)
      try {
        await seam.attachFiles({ assetId: found.id, files })
      } catch (retryError) {
        throw mapError(retryError)
      }
      store.update(avatar.id, { assetId: found.id })
      return found.id
    }
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

    const attachedTo = await attachMultiView(seam, { ...avatar, assetId }, multiViewDir)
    return { assetId: attachedTo, attached: true }
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
