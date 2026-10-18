/**
 * Pure helpers for inspiration → chat replication.
 * Zero DOM. Safe for node:test.
 *
 * Title sanitizer copies workflow folderName rules (do NOT import workflow).
 */

export const REPLICATION_SKILL = 'video-deconstruct'
/** Align with workflow MAX_PROJECT_TITLE_LENGTH; copy the constant, never import. */
export const MAX_TITLE = 200
export const FALLBACK_TITLE = '灵感复刻'

/**
 * @param {unknown} title
 * @returns {string}
 */
export function sanitizeFolderName(title) {
  const trimmed = String(title ?? '').trim()
  const replaced = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
    .replace(/[. ]+$/u, '')
  return replaced.replace(/^\.+$/u, '')
}

/**
 * Derive a Host-legal project title from an inspiration row.
 * @param {{ title?: unknown, source_url?: unknown, id?: unknown } | null | undefined} row
 * @returns {string}
 */
export function deriveProjectTitle(row) {
  const raw = String(row?.title || row?.source_url || row?.id || FALLBACK_TITLE).trim()
  const stripped = raw.replace(/^https?:\/\/(www\.)?/i, '')
  let name = sanitizeFolderName(stripped)
  if (name === '') name = FALLBACK_TITLE
  if (name.length > MAX_TITLE) name = name.slice(0, MAX_TITLE)
  return name
}

/**
 * @param {{ type?: unknown, local_paths?: { video?: unknown } } | null | undefined} row
 * @returns {'video' | 'image' | 'link'}
 */
export function resolveMediaType(row) {
  const t = String(row?.type || '').toLowerCase()
  if (t === 'video' || t === 'image' || t === 'link') return t
  if (row?.local_paths?.video) return 'video'
  return 'video'
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function readFiniteSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Duration waterfall for `duration_budget_seconds` / `duration_source`.
 * @param {object | null | undefined} row
 * @returns {{ seconds: number, source: 'stats' | 'deconstruction' | 'default_15s' }}
 */
export function resolveDurationBudget(row) {
  const stats = row?.stats && typeof row.stats === 'object' ? row.stats : {}
  const fromStats = readFiniteSeconds(row?.duration)
    ?? readFiniteSeconds(stats.duration)
    ?? readFiniteSeconds(stats.video_duration)
  if (fromStats != null) return { seconds: fromStats, source: 'stats' }

  const decon = row?.deconstruction && typeof row.deconstruction === 'object' ? row.deconstruction : {}
  const fromDecon = readFiniteSeconds(decon.duration)
    ?? readFiniteSeconds(decon.video_duration)
    ?? readFiniteSeconds(decon.length_seconds)
  if (fromDecon != null) return { seconds: fromDecon, source: 'deconstruction' }

  return { seconds: 15, source: 'default_15s' }
}

export const REPLICATION_PROMPT_BODY = '完全复刻原视频脚本和画面，仅将原视频中的商品替换成我的商品、如有口播内容需结合我的商品进行调整（没有则不需要出现口播），同时视频不需要出现字幕，原视频有出镜人物的话，新视频也需要有。复刻后的新脚本的时长需控制在时间范围内。'

/**
 * Prepared references use the exact saved user draft; legacy callers keep the prior prompt.
 * Inspiration id is on the session attachment (entityId / metadata.inspiration_id);
 * the legacy agent may call inspiration_get.
 * @param {object | null | undefined} [row]
 * @param {{ product?: unknown }} [opts]
 * @returns {string}
 */
export function buildReplicationPrompt(row, opts = {}) {
  if (row?.creation_reference != null) return typeof row.creation_reference.text === 'string' ? row.creation_reference.text : ''
  void opts.product
  return `/${REPLICATION_SKILL}\n\n${REPLICATION_PROMPT_BODY}`
}
