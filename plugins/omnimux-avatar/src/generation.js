// 生成编排：服务端拼装提示词，把执行交给中枢的 imageGenerate seam。
// 上游错误一律原样上抛（只做错误码/状态映射），绝不伪造成功或假进度。
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import {
  avatarDirOf,
  avatarMainImagePath,
  avatarMultiViewDir,
  avatarMultiViewImagePath,
} from './paths.js'
import {
  BuildMultiViewPrompt,
  BuildPrompt,
  MULTIVIEW_SIZE,
  ValidateSelection,
  ValidationError,
} from './rules.js'
import { AvatarError } from './store.js'

const BRIEF_MAX = 4000
const SHEET_ASPECT = '9:16'
// 渠道不可用不是生成失败：不写 failed 记录，也不把它降级成 502。
const AVAILABILITY_CODES = new Set(['needs-provider', 'needs-omnimux'])

const messageOf = (error) => (error instanceof Error ? error.message : String(error))
const str = (value) => (typeof value === 'string' ? value : '')

/** 'avt_task_' + 8 位十六进制，同时用作 requestKey。 */
function newTaskId() {
  return `avt_task_${randomBytes(4).toString('hex')}`
}

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

/** 归一化结果：规则层返回选项集合；防御性地兼容 { selection } 包装形态。 */
function normalizeSelection(tier, selection) {
  let normalized
  try {
    normalized = ValidateSelection(tier, selection)
  } catch (error) {
    if (error instanceof ValidationError) throw new AvatarError('invalid_selection', error.message, 400)
    throw error
  }
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    if (normalized.selection && typeof normalized.selection === 'object') return normalized.selection
    return normalized
  }
  return {}
}

function isEmptySelection(selection) {
  if (!selection || typeof selection !== 'object') return true
  return Object.values(selection).every((value) => !Array.isArray(value) || value.length === 0)
}

/** 该形象已完成且产物仍在盘上的任务（从最新往回找）。 */
function readyTaskOf(avatar, avatarId, paths, kind) {
  const tasks = Array.isArray(avatar?.tasks) ? avatar.tasks : []
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i]
    if (task.kind !== kind || task.status !== 'ready') continue
    const candidate = task.destPath || (kind === 'sheet' ? avatarMainImagePath(paths, avatarId) : '')
    if (candidate !== '' && existsSync(candidate)) return { ...task, destPath: candidate }
  }
  return null
}

/**
 * 生成服务。
 * @param {{
 *   ctx?: unknown,
 *   store: object,
 *   paths: object,
 *   imageGenerate?: object,
 *   onReady?: (avatarId: string, kind: 'sheet'|'multiview') => Promise<unknown>,
 * }} opts
 * @param {Function} [opts.onReady] 任务转为 ready 后的归档回调（资产库同步）。
 *   归档失败只记在任务的 syncError 上，绝不把已产出的图变成失败任务。
 */
export function createGeneration({ ctx, store, paths, imageGenerate, onReady } = {}) {
  /** 执行面：显式注入优先，否则每次调用时向宿主取（座位可能后注册）。 */
  function resolveSeam() {
    const seam = imageGenerate ?? readSeat(ctx, 'imageGenerate')
    if (!seam || typeof seam.execute !== 'function') {
      throw new AvatarError('needs-provider', '图像生成渠道不可用', 503)
    }
    return seam
  }

  /** 记录失败任务并返回可抛出的错误；渠道不可用不落 failed 记录。 */
  function failureOf(avatarId, base, error) {
    const code = typeof error?.code === 'string' && error.code !== '' ? error.code : 'generation-failed'
    const message = messageOf(error)
    if (AVAILABILITY_CODES.has(code)) return new AvatarError(code, message, 503)
    store.addTask(avatarId, { ...base, status: 'failed', error: message })
    return new AvatarError(code, message, 502)
  }

  /**
   * 任务刚转为 ready 时触发一次归档（主图建档 / 多视角目录追加）。
   * 归档失败不改变任务状态，只把原因写进 syncError，并原样返回任务。
   */
  async function archiveReady(avatarId, task, kind) {
    if (typeof onReady !== 'function' || task?.status !== 'ready') return task
    try {
      await onReady(avatarId, kind)
      return store.updateTask(avatarId, task.taskId, { syncError: null }) ?? task
    } catch (error) {
      const message = messageOf(error)
      try {
        return store.updateTask(avatarId, task.taskId, { syncError: message }) ?? task
      } catch {
        return { ...task, syncError: message }
      }
    }
  }

  async function submitSheet(input = {}) {
    const { avatarId, model, group, tier, selection, brief = '', seed = 0, image_url = '' } = input
    store.get(avatarId)

    const normalized = normalizeSelection(tier, selection)
    const briefText = typeof brief === 'string' ? brief : ''
    if (briefText.length > BRIEF_MAX) {
      throw new AvatarError('invalid_request', `方向说明不能超过 ${BRIEF_MAX} 个字符`, 400)
    }
    if (isEmptySelection(normalized) && briefText.trim() === '') {
      throw new AvatarError('invalid_request', '至少选择一个选项或填写方向说明', 400)
    }

    const prompt = BuildPrompt(tier, normalized, briefText)
    // 渠道不可用要在动磁盘之前失败：不建目录、不写任务。
    const seam = resolveSeam()
    const dest = avatarMainImagePath(paths, avatarId)
    mkdirSync(avatarDirOf(paths, avatarId), { recursive: true })

    const taskId = newTaskId()
    const base = {
      taskId,
      kind: 'sheet',
      model: str(model),
      group: str(group),
      status: 'queued',
      taskRef: null,
      destPath: dest,
      error: null,
    }

    let result
    try {
      result = await seam.execute({
        prompt,
        dest,
        model,
        group,
        operation: image_url ? undefined : 'text_to_image',
        image: image_url || undefined,
        aspectRatio: SHEET_ASPECT,
        seed: seed > 0 ? seed : undefined,
        requestKey: taskId,
        wait: false,
      })
    } catch (error) {
      throw failureOf(avatarId, base, error)
    }

    const task = store.addTask(avatarId, {
      ...base,
      status: result?.mode === 'live' ? 'ready' : 'generating',
      taskRef: result?.taskRef ?? null,
      destPath: result?.dest ?? dest,
    })
    store.update(avatarId, {
      sheet: {
        tier,
        selection: normalized,
        brief: briefText,
        seed: seed > 0 ? seed : 0,
        image_url: typeof image_url === 'string' ? image_url : '',
      },
    })
    const archived = await archiveReady(avatarId, task, 'sheet')
    return { task: archived, mode: result?.mode ?? null, dest: task.destPath, taskRef: task.taskRef }
  }

  async function submitMultiView(input = {}) {
    const { avatarId, model, group } = input
    const avatar = store.get(avatarId)

    // 参考图必须是该形象自己的成图，而不是靠 URL 子串判断归属。
    const sheetTask = readyTaskOf(avatar, avatarId, paths, 'sheet')
    if (!sheetTask) throw new AvatarError('invalid_request', '该形象尚无已完成的主图', 400)

    const seam = resolveSeam()
    const dest = avatarMultiViewImagePath(paths, avatarId)
    mkdirSync(avatarMultiViewDir(paths, avatarId), { recursive: true })
    const prompt = BuildMultiViewPrompt(avatar.sheet?.selection ?? {}, avatar.sheet?.brief ?? '')

    const taskId = newTaskId()
    const base = {
      taskId,
      kind: 'multiview',
      model: str(model),
      group: str(group),
      status: 'queued',
      taskRef: null,
      destPath: dest,
      error: null,
    }

    let result
    try {
      result = await seam.execute({
        prompt,
        dest,
        model,
        group,
        image: sheetTask.destPath,
        aspectRatio: MULTIVIEW_SIZE,
        requestKey: taskId,
        wait: false,
      })
    } catch (error) {
      throw failureOf(avatarId, base, error)
    }

    const task = store.addTask(avatarId, {
      ...base,
      status: result?.mode === 'live' ? 'ready' : 'generating',
      taskRef: result?.taskRef ?? null,
      destPath: result?.dest ?? dest,
    })
    const archived = await archiveReady(avatarId, task, 'multiview')
    return { task: archived, mode: result?.mode ?? null, dest: task.destPath, taskRef: task.taskRef }
  }

  async function refreshTask({ avatarId, taskId } = {}) {
    const task = store.findTask(avatarId, taskId)
    if (!task) throw new AvatarError('task-not-found', 'task not found', 404)
    // 终态不再轮询；没有 taskRef 的排队任务没有可续取的句柄，原样返回。
    if (task.status === 'ready' || task.status === 'failed') return task
    if (!task.taskRef) return task

    const seam = resolveSeam()
    try {
      const result = await seam.execute({ task_ref: task.taskRef, dest: task.destPath, wait: true })
      const ready = store.updateTask(avatarId, taskId, {
        status: 'ready',
        destPath: result?.dest ?? task.destPath,
        taskRef: result?.taskRef ?? task.taskRef,
        error: null,
      })
      return await archiveReady(avatarId, ready, task.kind === 'multiview' ? 'multiview' : 'sheet')
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : ''
      // 取不到状态 ≠ 生成失败：渠道不可用时保持非终态，不写假的 failed。
      if (AVAILABILITY_CODES.has(code)) throw new AvatarError(code, messageOf(error), 503)
      return store.updateTask(avatarId, taskId, { status: 'failed', error: messageOf(error) })
    }
  }

  return { submitSheet, submitMultiView, refreshTask }
}
