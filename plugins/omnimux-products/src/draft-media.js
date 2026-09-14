/**
 * 草稿媒体登记表：让「创建态」也能看到刚写盘的截图。
 *
 * 背景：链接解析会把两张首屏截图写进媒体目录并返回带 id 的 `media[]`，但产品
 * 记录此时还不存在，既有的 `?preview=` 通路要求产品已存在，于是「粘贴链接后立刻
 * 看截图」拿不到图。
 *
 * 这一层只登记「id → 绝对路径」，不做持久化、不改任何写语义：重启即空，条目过期
 * 自动淘汰。安全边界与另一条通路一致 —— 只接受 id，且路径必须落在本插件媒体目录
 * 内；目录外的路径一律拒绝。
 *
 * Spec: `specs/product-secondary-page.spec.md` §2.3（AC-301 / AC-403）。
 */
import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { previewMimeOf } from './library.js'

/** 最多记住多少条（一次导入最多两张，够多轮导入用）。 */
export const DRAFT_MEDIA_MAX = 200

/** 草稿媒体的存活时间：未保存草稿的缩略图属会话级资产。 */
export const DRAFT_MEDIA_TTL_MS = 15 * 60 * 1000

/**
 * @param {{
 *   mediaDir?: string,
 *   ttlMs?: number,
 *   max?: number,
 *   now?: () => number,
 * }} [opts]
 */
export function createDraftMediaRegistry(opts = {}) {
  const mediaDir = typeof opts.mediaDir === 'string' ? opts.mediaDir : ''
  const ttlMs = Number.isFinite(opts.ttlMs) ? Number(opts.ttlMs) : DRAFT_MEDIA_TTL_MS
  const max = Number.isFinite(opts.max) ? Number(opts.max) : DRAFT_MEDIA_MAX
  const now = typeof opts.now === 'function' ? opts.now : Date.now

  /** @type {Map<string, { realPath: string, at: number }>} */
  const entries = new Map()

  /** 顺带清扫过期条目 —— 无定时器，靠每次读写触发。 */
  function sweep(at) {
    for (const [id, row] of entries) {
      if (at - row.at >= ttlMs) entries.delete(id)
    }
  }

  /**
   * 登记一次导入携带的媒体行。没有 id 或没有路径的行直接跳过。
   * @param {Array<{ id?: unknown, real_path?: unknown }> | null | undefined} media
   * @returns {number} 本次登记的条数
   */
  function register(media) {
    if (!mediaDir) return 0
    const list = Array.isArray(media) ? media : []
    const at = now()
    sweep(at)
    let added = 0
    for (const row of list) {
      const id = typeof row?.id === 'string' ? row.id : ''
      const realPath = typeof row?.real_path === 'string' ? row.real_path : ''
      if (!id || !realPath) continue
      entries.set(id, { realPath, at })
      added += 1
    }
    // 容量上限：按插入顺序淘汰最旧的一条。
    while (entries.size > max) {
      const oldest = entries.keys().next().value
      entries.delete(oldest)
    }
    return added
  }

  /**
   * id → 可读流信息。命中不到、过期、越界、文件不存在或类型不可预览时回答 `null`，
   * 由调用方统一回 404。
   * @param {unknown} mediaId
   * @returns {{ absolutePath: string, mime: string, size: number } | null}
   */
  function resolvePreview(mediaId) {
    if (!mediaDir) return null
    const id = typeof mediaId === 'string' ? mediaId : ''
    if (!id) return null
    const at = now()
    sweep(at)
    const row = entries.get(id)
    if (!row) return null

    const base = resolve(mediaDir)
    const target = resolve(row.realPath)
    if (target !== base && !target.startsWith(base + sep)) return null
    if (!existsSync(target)) return null
    const mime = previewMimeOf(target)
    if (!mime) return null

    let size = 0
    try {
      size = statSync(target).size
    } catch {
      return null
    }
    return { absolutePath: target, mime, size }
  }

  return { register, resolvePreview, size: () => entries.size }
}
