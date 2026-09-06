/**
 * validate.js: 能力矩阵 + 账号可用性校验（工具面与 HTTP 面共用的单一真源）。
 *
 * 同一份合并矩阵（config.platforms）喂 UI 表单裁剪（GET /dsh-publish/capabilities）
 * 与本模块的提交前拦截 —— 同源，保证 UI 与 agent 行为一致。
 */
import { PublishError, RECORD_TYPES } from './store.js'
import { accountAvailability } from './accounts.js'
import { ACCOUNT_SOURCE_MESSAGE, isPublishingAccount } from './account-policy.js'

/**
 * 媒体种类收集：`mediaKinds` = record.media_ids 对应的 kind 列表（调用方从 MediaStore 取）。
 * @param {{ kind: string }[]} mediaRows
 */
function countKinds(mediaRows) {
  const rows = Array.isArray(mediaRows) ? mediaRows : []
  return {
    videos: rows.filter((row) => row.kind === 'video').length,
    images: rows.filter((row) => row.kind === 'image').length,
    others: rows.filter((row) => row.kind === 'other').length,
    total: rows.length,
  }
}

/**
 * 平台能力冲突检查（一份内容 × 多平台账号）。
 * @param {string} type record type ('video' | 'image')
 * @param {{ videos: number, images: number, total: number }} counts
 * @param {{ cover: boolean }} flags
 * @param {Record<string, unknown>} platformRow
 * @param {string} platformName
 * @returns {string[]} 该平台的冲突描述
 */
function platformConflicts(type, counts, flags, platformRow, platformName) {
  /** @type {string[]} */
  const problems = []
  const mediaTypes = Array.isArray(platformRow.media_types) ? platformRow.media_types : []
  if (!mediaTypes.includes(type)) {
    problems.push(`平台 ${platformName} 不支持${type === 'video' ? '视频' : '图文'}内容（media_types: ${JSON.stringify(mediaTypes)}）`)
  }
  if (flags.cover && platformRow.supports_cover !== true) {
    problems.push(`平台 ${platformName} 不支持封面（supports_cover: false）`)
  }
  if (type === 'image' && typeof platformRow.max_images === 'number' && counts.images > platformRow.max_images) {
    problems.push(`平台 ${platformName} 图文最多 ${platformRow.max_images} 张图（当前 ${counts.images} 张）`)
  }
  return problems
}

/**
 * 内容自身校验（不依赖账号；create/update draft 即可执行）。
 * @param {{
 *   type: string,
 *   title?: string,
 *   description?: string,
 *   mediaRows?: Array<{ kind: string, id: string }>,
 *   coverRow?: { kind: string, id: string } | null,
 * }} draft
 * @returns {Array<{ code: string, field: string, message: string }>}
 */
export function validateContent(draft) {
  /** @type {Array<{ code: string, field: string, message: string }>} */
  const errors = []
  if (!RECORD_TYPES.includes(draft.type)) {
    errors.push({ code: 'invalid-type', field: 'type', message: `type 必须是 ${RECORD_TYPES.join(' | ')}，收到 ${JSON.stringify(draft.type)}` })
    return errors
  }
  const counts = countKinds(draft.mediaRows)
  if (counts.others > 0) {
    errors.push({ code: 'media-kind-unsupported', field: 'media', message: '存在无法识别类型的媒体文件（仅支持 image/* 与 video/*）' })
  }
  if (draft.type === 'video') {
    if (counts.videos === 0) {
      errors.push({ code: 'video-required', field: 'media', message: '视频发布至少需要一个视频文件' })
    }
  } else {
    if (counts.images === 0) {
      errors.push({ code: 'image-required', field: 'media', message: '图文发布至少需要一张图片' })
    }
    if (typeof draft.title !== 'string' || draft.title.trim() === '') {
      errors.push({ code: 'title-required', field: 'title', message: '图文发布需要标题' })
    }
  }
  if (draft.coverRow && draft.coverRow.kind !== 'image') {
    errors.push({ code: 'cover-not-image', field: 'cover', message: '封面必须是图片' })
  }
  const hasText = (typeof draft.title === 'string' && draft.title.trim() !== '') || (typeof draft.description === 'string' && draft.description.trim() !== '')
  if (!hasText) {
    errors.push({ code: 'text-required', field: 'description', message: '标题与描述至少填一项' })
  }
  return errors
}

/**
 * submit 前全量校验：内容 + 账号存在性 + 账号可用性 + 平台能力冲突。
 * @param {{
 *   type: string,
 *   title?: string,
 *   description?: string,
 *   mediaRows?: Array<{ kind: string, id: string }>,
 *   coverRow?: { kind: string, id: string } | null,
 *   account_ids: string[],
 * }} draft
 * @param {{ accounts: Record<string, unknown>[], platforms: Record<string, Record<string, unknown>> }} ctx
 * @returns {{ ok: boolean, errors: Array<{ code: string, field: string, message: string }> }}
 */
export function validateForSubmit(draft, ctx) {
  const errors = [...validateContent(draft)]
  if (!Array.isArray(draft.account_ids) || draft.account_ids.length === 0) {
    errors.push({ code: 'accounts-required', field: 'account_ids', message: '提交前需要至少选择一个账号（publish_assign_accounts）' })
    return { ok: false, errors }
  }
  const byId = new Map((ctx.accounts || []).map((row) => [String(row.id), row]))
  const counts = countKinds(draft.mediaRows)
  const flags = { cover: Boolean(draft.coverRow) }
  /** @type {Set<string>} */
  const seen = new Set()
  for (const accountId of draft.account_ids) {
    const key = String(accountId)
    if (seen.has(key)) continue
    seen.add(key)
    const row = byId.get(key)
    if (!isPublishingAccount(row)) {
      errors.push({ code: 'account-provider-mismatch', field: 'account_ids', message: `账号 ${key}：${ACCOUNT_SOURCE_MESSAGE}` })
      continue
    }
    const availability = accountAvailability(row)
    if (!availability.ok) {
      errors.push({ code: 'account-unavailable', field: 'account_ids', message: `账号 ${key}（${String(row.display_name || row.username || row.platform || '')}）不可用：${availability.reason}` })
      continue
    }
    const platform = String(row.platform || '').toLowerCase()
    const platformRow = ctx.platforms ? ctx.platforms[platform] : undefined
    if (!platformRow) {
      errors.push({ code: 'platform-unknown', field: 'account_ids', message: `账号 ${key} 的平台 ${platform || '(空)'} 不在能力矩阵中；可在配置 publish.platforms 中补充该平台定义` })
      continue
    }
    for (const problem of platformConflicts(draft.type, counts, flags, platformRow, platform)) {
      errors.push({ code: 'capability-conflict', field: 'accounts', message: problem })
    }
  }
  return { ok: errors.length === 0, errors }
}

/**
 * 校验失败 → 确定性错误（工具面与 HTTP 面共用形态）。
 * @param {Array<{ code: string, field: string, message: string }>} errors
 */
export function validationError(errors) {
  const code = errors.some((error) => error.code === 'account-provider-mismatch') ? 'account-provider-mismatch' : 'validation-failed'
  return new PublishError(code, {
    message: '提交前校验未通过',
    errors,
  })
}

/**
 * payload 形状校验（publish_create_draft / publish_update_draft 的输入面）。
 * 媒体的 path|media_id 二选一；返回规整后的 media 引用列表。
 * @param {unknown} payload
 * @returns {{ type?: string, title?: string, description?: string, topics?: string[], media: Array<{ kind?: string, path?: string, media_id?: string }>, cover?: { path?: string, media_id?: string }, settings?: Record<string, unknown>, account_ids?: string[] }}
 */
export function parseDraftPayload(payload) {
  if (payload === undefined || payload === null) return {}
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PublishError('invalid-arguments', 'payload must be a JSON object')
  }
  const raw = /** @type {Record<string, unknown>} */ (payload)
  /** @type {Record<string, unknown>} */
  // 注意：只有 raw 里出现的字段才进 out——patch 语义是「未提及的字段保持不变」，
  // 绝不能给 media 之类字段设缺省值（否则一个不含 media 的 patch 会清空素材）。
  const out = {}
  if ('type' in raw) out.type = raw.type
  if ('title' in raw) out.title = raw.title
  if ('description' in raw) out.description = raw.description
  if ('topics' in raw) {
    if (!Array.isArray(raw.topics) || raw.topics.some((t) => typeof t !== 'string')) {
      throw new PublishError('invalid-arguments', 'payload.topics must be an array of strings')
    }
    out.topics = raw.topics
  }
  if ('media' in raw) {
    if (!Array.isArray(raw.media)) throw new PublishError('invalid-arguments', 'payload.media must be an array')
    const media = raw.media.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new PublishError('invalid-arguments', `payload.media[${index}] must be an object`)
      }
      const row = /** @type {Record<string, unknown>} */ (item)
      const hasPath = typeof row.path === 'string' && row.path.trim() !== ''
      const hasId = typeof row.media_id === 'string' && row.media_id.trim() !== ''
      if (!hasPath && !hasId) {
        throw new PublishError('invalid-arguments', `payload.media[${index}] needs path (local file) or media_id (already imported)`)
      }
      if (row.kind !== undefined && typeof row.kind !== 'string') {
        throw new PublishError('invalid-arguments', `payload.media[${index}].kind must be a string`)
      }
      return {
        ...(hasPath ? { path: String(row.path).trim() } : {}),
        ...(hasId ? { media_id: String(row.media_id).trim() } : {}),
        ...(typeof row.kind === 'string' ? { kind: row.kind } : {}),
      }
    })
    out.media = media
  }
  if ('cover' in raw && raw.cover !== undefined && raw.cover !== null) {
    if (typeof raw.cover !== 'object' || Array.isArray(raw.cover)) {
      throw new PublishError('invalid-arguments', 'payload.cover must be an object with path or media_id')
    }
    const cover = /** @type {Record<string, unknown>} */ (raw.cover)
    const hasPath = typeof cover.path === 'string' && cover.path.trim() !== ''
    const hasId = typeof cover.media_id === 'string' && cover.media_id.trim() !== ''
    if (!hasPath && !hasId) {
      throw new PublishError('invalid-arguments', 'payload.cover needs path or media_id')
    }
    out.cover = {
      ...(hasPath ? { path: String(cover.path).trim() } : {}),
      ...(hasId ? { media_id: String(cover.media_id).trim() } : {}),
    }
  }
  if ('settings' in raw && raw.settings !== undefined && raw.settings !== null) {
    if (typeof raw.settings !== 'object' || Array.isArray(raw.settings)) {
      throw new PublishError('invalid-arguments', 'payload.settings must be an object')
    }
    out.settings = raw.settings
  }
  if ('account_ids' in raw && raw.account_ids !== undefined) {
    if (!Array.isArray(raw.account_ids) || raw.account_ids.some((v) => typeof v !== 'string')) {
      throw new PublishError('invalid-arguments', 'payload.account_ids must be an array of strings')
    }
    out.account_ids = raw.account_ids
  }
  return /** @type {any} */ (out)
}
