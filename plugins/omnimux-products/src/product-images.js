/**
 * 实物产品的商品图落盘。
 *
 * 实物导入不再启动无头浏览器：页面里的商品主图（HTML / JSON-LD / OpenGraph）
 * 才是这个品类的正文。图片以远程 URL 的形式被解析出来，但产品库的 `media[]`
 * 只接受磁盘上真实存在的绝对路径，所以这一步必须把它们真正下载下来 —— 只登记
 * URL 会让保存阶段直接以 `media-path-unavailable` 失败。
 *
 * 纪律与截图链路完全一致：
 * - 目录 `0o700`、文件 `0o600`，`tmp → fsync → rename` 原子落盘；
 * - 单张图失败只跳过这一张（电商图床挂一张不该毁掉整次导入）；
 * - 整批失败回滚本次已写入的文件并回答空列表，导入本身仍然成功。
 */
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { newRecordId } from './library.js'
import { mediaDirOf } from './paths.js'
import {
  MEDIA_DIR_MODE,
  MEDIA_FILE_MODE,
  hostSlug,
  randomSuffix,
  utcStampOf,
} from './screenshot-contract.js'

/** 一次导入最多沉淀多少张商品图：够做封面 + 画廊，又不至于把一批导入拖成下载器。 */
export const PRODUCT_IMAGES_MAX = 6

/** 单张图的上限。超出的图按「拿不到」处理，不做截断也不写半个文件。 */
export const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024

/** 单张图的下载预算。 */
export const PRODUCT_IMAGE_TIMEOUT_MS = 8000

/** 认得出的图片类型 → 落盘扩展名。类型不在表里就不写盘。 */
export const PRODUCT_IMAGE_EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
})

/**
 * 归一化候选图片地址：只留 http(s)、去重、按出现顺序截断。
 * @param {unknown} value
 * @returns {string[]}
 */
export function productImageUrls(value) {
  const list = Array.isArray(value) ? value : []
  const out = []
  const seen = new Set()
  for (const row of list) {
    const url = typeof row === 'string' ? row.trim() : ''
    if (!/^https?:\/\//i.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= PRODUCT_IMAGES_MAX) break
  }
  return out
}

/**
 * 商品图的落盘文件名：`product-<host>-<n>-<stamp>-<rand>.<ext>`。
 * 前缀与截图链路的 `site-` 区分开，`viewportKindOf` 不会把商品图误认成首屏截图。
 *
 * @param {string} host
 * @param {number} index 从 1 开始
 * @param {string} ext
 * @param {string} [stamp]
 * @param {string} [rand]
 * @returns {string}
 */
export function buildProductImageName(host, index, ext, stamp, rand) {
  const at = typeof stamp === 'string' && stamp ? stamp : utcStampOf()
  const tail = typeof rand === 'string' && rand ? rand : randomSuffix()
  const slot = String(Math.max(1, Math.trunc(Number(index)) || 1)).padStart(2, '0')
  const suffix = typeof ext === 'string' && ext ? ext : 'jpg'
  return `product-${hostSlug(host)}-${slot}-${at}-${tail}.${suffix}`
}

/**
 * 从一个响应里读出图片本体。类型不认识、空体、超大一律回答 null。
 *
 * @param {{ ok?: boolean, headers?: { get?: Function }, arrayBuffer?: Function } | null | undefined} response
 * @param {number} maxBytes
 * @returns {Promise<{ buffer: Buffer, ext: string } | null>}
 */
async function readImageResponse(response, maxBytes) {
  if (!response || response.ok === false) return null
  const mime = String(response.headers?.get?.('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const ext = PRODUCT_IMAGE_EXT[mime]
  if (!ext) return null
  const declared = Number(response.headers?.get?.('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (typeof response.arrayBuffer !== 'function') return null
  const raw = await response.arrayBuffer()
  const buffer = Buffer.from(raw)
  if (buffer.length === 0 || buffer.length > maxBytes) return null
  return { buffer, ext }
}

/**
 * 下载单张商品图。任何失败（超时、网络错、类型不认识、过大）都只是「这张拿不到」。
 *
 * @param {Function} fetcher
 * @param {string} url
 * @param {{ timeoutMs?: number, maxBytes?: number }} [opts]
 * @returns {Promise<{ buffer: Buffer, ext: string } | null>}
 */
async function downloadImage(fetcher, url, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : PRODUCT_IMAGE_TIMEOUT_MS
  const maxBytes = Number.isFinite(opts.maxBytes) ? Number(opts.maxBytes) : PRODUCT_IMAGE_MAX_BYTES
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer = null
  if (controller && timeoutMs > 0) {
    timer = setTimeout(() => { controller.abort() }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
  }
  try {
    const response = await fetcher(url, {
      headers: { accept: 'image/*' },
      ...(controller ? { signal: controller.signal } : {}),
    })
    return await readImageResponse(response, maxBytes)
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 原子写入：临时文件 → fsync → 显式权限 → rename。
 *
 * @param {string} file
 * @param {Buffer} buffer
 * @returns {Promise<void>}
 */
async function writeAtomic(file, buffer) {
  const tmp = `${file}.tmp`
  const handle = await open(tmp, 'w', MEDIA_FILE_MODE)
  try {
    await handle.writeFile(buffer)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await chmod(tmp, MEDIA_FILE_MODE)
  await rename(tmp, file)
}

/**
 * 把本次已经写下的文件删掉。回收失败不掩盖真正的失败。
 * @param {ReadonlyArray<{ real_path?: string }>} entries
 * @returns {Promise<void>}
 */
async function rollbackImages(entries) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.real_path) continue
    try {
      await rm(entry.real_path, { force: true })
    } catch {
      // 删不掉的文件不值得覆盖真正的失败原因。
    }
  }
}

/**
 * 下载并落盘商品图。
 *
 * @param {{
 *   images?: unknown,
 *   url?: string,
 *   host?: string,
 *   paths?: { mediaDir?: string, libraryFile?: string },
 *   mediaDir?: string,
 *   fetcher?: Function,
 *   timeoutMs?: number,
 *   maxBytes?: number,
 *   deps?: { write?: (file: string, buffer: Buffer) => Promise<void> },
 * }} [args]
 * @returns {Promise<Array<{ id: string, real_path: string, original_name: string }>>}
 */
export async function persistProductImages(args = {}) {
  const urls = productImageUrls(args.images)
  if (urls.length === 0) return []

  const dir = args.mediaDir ?? mediaDirOf(args.paths)
  if (!dir) return []

  const fetcher = args.fetcher ?? (typeof fetch === 'function' ? fetch : null)
  if (typeof fetcher !== 'function') return []

  const host = args.host ?? hostOf(args.url)
  const write = args.deps?.write ?? writeAtomic
  /** @type {Array<{ id: string, real_path: string, original_name: string }>} */
  const entries = []

  try {
    await mkdir(dir, { recursive: true, mode: MEDIA_DIR_MODE })
    await chmod(dir, MEDIA_DIR_MODE)
  } catch {
    return []
  }

  try {
    for (let index = 0; index < urls.length; index += 1) {
      const downloaded = await downloadImage(fetcher, urls[index], {
        timeoutMs: args.timeoutMs,
        maxBytes: args.maxBytes,
      })
      if (!downloaded) continue
      const name = buildProductImageName(host, index + 1, downloaded.ext)
      const realPath = join(dir, name)
      await write(realPath, downloaded.buffer)
      entries.push({ id: newRecordId('med'), real_path: realPath, original_name: name })
    }
    return entries
  } catch {
    await rollbackImages(entries)
    return []
  }
}

/**
 * @param {unknown} url
 * @returns {string}
 */
function hostOf(url) {
  try {
    return new URL(String(url ?? '')).hostname
  } catch {
    return 'shop'
  }
}
