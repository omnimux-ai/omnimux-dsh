/**
 * 媒体字节回传三端点：扩展在页面会话内取到媒体字节后分块交给 host 落盘。
 *
 * TikTok/抖音的 CDN 只认页面会话（host 直接下载 403），所以字节由页面内
 * fetch 取得，再按 1MB 原始字节分块回传。协议（Issue #3526，spec
 * `specs/capture-media-relay.spec.md` §3.2）：
 *
 * 1. `POST /local/capture-media-session`：校验公开 URL 与 media 清单，创建
 *    `mediaDir/relay/<sessionId>/session.json`，返回 session_id；
 * 2. `POST /local/capture-media-chunk`：校验会话/序号/大小后追加写
 *    `media-<index>.part`，`final` 标记该 media 完成；
 * 3. `POST /local/capture-commit`：全部完成后做文件头校验、移动文件到
 *    videos/images，并复用 capture 的 `buildCaptureRecord` 写库。
 *
 * 会话目录是临时状态：TTL 到期、超限、提交失败都会整目录删除；提交成功
 * 只移动文件，不复制。字节从不进入库文件或日志。
 *
 * @typedef {{ mediaDir: string, videosDir: string, imagesDir: string, coversDir: string }} RelayPaths
 */

import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { buildCaptureRecord } from './capture-handler.js'
import { IMPORT_STATUS_READY, importStatusOf } from './import-status.js'
import { detectPlatformFromUrl } from './url-normalizer.js'
import { isPublicHttpUrl } from './url-policy.js'

/** 单个回传会话允许的媒体数量；与 capture 契约一致。 */
export const RELAY_MEDIA_LIMIT = 20
/**
 * 单块 base64 解码后的上限。
 *
 * 客户端每块 1MB 原始字节（base64 ≈1.37MB），这个上限是 host 侧的最后一道
 * 护栏，不是客户端的推荐块大小。
 */
export const RELAY_CHUNK_DECODED_MAX_BYTES = 2 * 1024 * 1024
/** 单文件落盘上限。 */
export const RELAY_MAX_FILE_BYTES = 512 * 1024 * 1024
/** 单会话全部媒体累计上限。 */
export const RELAY_MAX_TOTAL_BYTES = 1024 * 1024 * 1024
/** 未提交会话的保留时长；超时的会话目录由下次创建或读写时清理。 */
export const RELAY_SESSION_TTL_MS = 30 * 60 * 1000

/** 会话目录名，位于 `paths.mediaDir` 下。 */
const RELAY_DIR_NAME = 'relay'
/** 会话状态文件名。 */
const SESSION_FILE_NAME = 'session.json'
/** session_id 形态：`randomBytes(12)` 的十六进制，也是路径安全边界。 */
const SESSION_ID_RE = /^[0-9a-f]{24}$/
/** 本地媒体 URL 前缀，与 capture/导入路径一致。 */
const MEDIA_URL_PREFIX = '/omnimux/inspiration/local/media'
/** 可回传的媒体类型。 */
const MEDIA_TYPES = new Set(['video', 'image'])
/** 允许的 content_shape，与 capture 一致：未知值按缺失处理。 */
const CONTENT_SHAPES = new Set(['text', 'photo', 'gallery', 'video'])
/** 严格 base64：只接受规范编码，避免同一字节有多个拼写。 */
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function fail(status, error) {
  return { status, body: { error } }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 只接受公开 http(s) 地址，且返回去除首尾空白的原串。 */
function publicHttpUrl(value) {
  const url = typeof value === 'string' ? value.trim() : ''
  return url && isPublicHttpUrl(url) ? url : ''
}

function relayRoot(paths) {
  return join(paths.mediaDir, RELAY_DIR_NAME)
}

function sessionDir(paths, sessionId) {
  return join(relayRoot(paths), sessionId)
}

function partPath(paths, sessionId, index) {
  return join(sessionDir(paths, sessionId), `media-${index}.part`)
}

/**
 * 删除整个会话目录。目录不存在时是空操作，调用方不需要先判断。
 * @param {RelayPaths} paths
 * @param {string} sessionId
 */
function removeSessionDir(paths, sessionId) {
  rmSync(sessionDir(paths, sessionId), { recursive: true, force: true })
}

/**
 * 清理 `mediaDir/relay/` 下 mtime 超过 TTL 的会话目录。
 *
 * 扩展在 host 重启、浏览器崩溃等情况下会留下未提交的会话；只在创建新会话时
 * 扫描一次即可，不让后台任务常驻。返回被删掉的 session_id 列表，便于测试与
 * 诊断。
 * @param {RelayPaths} paths
 * @returns {string[]}
 */
export function cleanupStaleRelaySessions(paths) {
  const root = relayRoot(paths)
  if (!existsSync(root)) return []
  const removed = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    try {
      const info = statSync(dir)
      if (Date.now() - info.mtimeMs <= RELAY_SESSION_TTL_MS) continue
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      continue
    }
    rmSync(dir, { recursive: true, force: true })
    removed.push(entry.name)
  }
  return removed
}

/**
 * 会话是否已过期。
 *
 * `created_at` 是权威时间；目录 mtime 是清理函数使用的同一信号，两者任一超过
 * TTL 都按过期处理（fail-closed），这样被 TTL 清理判定为残留的目录也不会在
 * 下一次分块时被当成有效会话。
 * @param {Record<string, any>} session
 * @param {string} dir 会话目录
 */
function isExpiredSession(session, dir) {
  const createdAt = Date.parse(String(session.created_at || ''))
  if (!Number.isFinite(createdAt)) return true
  const now = Date.now()
  if (now - createdAt > RELAY_SESSION_TTL_MS) return true
  try {
    return now - statSync(dir).mtimeMs > RELAY_SESSION_TTL_MS
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return true
  }
}

/**
 * 读取并解析会话状态；不存在、损坏或过期都按「没有这个会话」处理。
 * @param {RelayPaths} paths
 * @param {unknown} rawSessionId
 * @returns {{ session: Record<string, any> } | { error: { status: number, body: { error: string } } }}
 */
function loadSession(paths, rawSessionId) {
  const sessionId = typeof rawSessionId === 'string' ? rawSessionId : ''
  if (!SESSION_ID_RE.test(sessionId)) return { error: fail(404, 'relay session not found') }
  const file = join(sessionDir(paths, sessionId), SESSION_FILE_NAME)
  if (!existsSync(file)) return { error: fail(404, 'relay session not found') }
  let state
  try {
    state = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    removeSessionDir(paths, sessionId)
    return { error: fail(404, 'relay session not found') }
  }
  if (
    !isPlainObject(state) ||
    !Array.isArray(state.media) ||
    state.session_id !== sessionId ||
    !isPlainObject(state.source) ||
    !publicHttpUrl(state.source.source_url)
  ) {
    removeSessionDir(paths, sessionId)
    return { error: fail(404, 'relay session not found') }
  }
  if (isExpiredSession(state, sessionDir(paths, sessionId))) {
    removeSessionDir(paths, sessionId)
    return { error: fail(404, 'relay session expired') }
  }
  return { session: state }
}

function writeSession(paths, state) {
  writeFileSync(join(sessionDir(paths, state.session_id), SESSION_FILE_NAME), JSON.stringify(state, null, 2), 'utf8')
}

/**
 * 把会话体的作品字段归一为 session.source。
 *
 * `source` 保留原始字段名（snake_case），提交时再映射到 `buildCaptureRecord`
 * 的 parsed 形状；`cover_url` 只做公开 URL 校验，不在这里下载。
 * @param {Record<string, any>} body
 */
function parseSessionSource(body) {
  const sourceUrl = publicHttpUrl(body.source_url)
  if (!sourceUrl) return { error: fail(400, 'source_url must be a public http(s) address') }

  let coverUrl = ''
  if (body.cover_url !== undefined && body.cover_url !== null && body.cover_url !== '') {
    coverUrl = publicHttpUrl(body.cover_url)
    if (!coverUrl) return { error: fail(400, 'cover_url must be a public http(s) address') }
  }

  const contentShape = typeof body.content_shape === 'string' && CONTENT_SHAPES.has(body.content_shape)
    ? body.content_shape
    : ''

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
    : []

  return {
    value: {
      source_url: sourceUrl,
      platform: typeof body.platform === 'string' ? body.platform.trim() : '',
      title: typeof body.title === 'string' ? body.title.trim() : '',
      content: typeof body.content === 'string' ? body.content : '',
      content_shape: contentShape,
      author: isPlainObject(body.author) ? body.author : {},
      stats: isPlainObject(body.stats) ? body.stats : {},
      posted_at: typeof body.posted_at === 'string' ? body.posted_at.trim() : '',
      cover_url: coverUrl,
      tags,
    },
  }
}

/**
 * 校验 media 清单：≤20 条、type ∈ video|image、URL 公开、index 唯一且恰好
 * 覆盖 0..n-1。返回按 index 排序的清单，后续分块与落盘都保持这个顺序。
 * @param {unknown} rawMedia
 */
function parseSessionMedia(rawMedia) {
  if (!Array.isArray(rawMedia)) return { error: fail(400, 'media must be an array') }
  if (rawMedia.length === 0) return { error: fail(400, 'media must contain at least 1 item') }
  if (rawMedia.length > RELAY_MEDIA_LIMIT) {
    return { error: fail(400, `media must contain at most ${RELAY_MEDIA_LIMIT} items`) }
  }
  const media = []
  const seenIndexes = new Set()
  for (const [position, rawItem] of rawMedia.entries()) {
    if (!isPlainObject(rawItem)) return { error: fail(400, `media[${position}] must be an object`) }
    const index = rawItem.index
    if (!Number.isInteger(index) || index < 0 || index >= rawMedia.length) {
      return { error: fail(400, `media[${position}].index must be an integer between 0 and ${rawMedia.length - 1}`) }
    }
    if (seenIndexes.has(index)) return { error: fail(400, `media index ${index} is duplicated`) }
    seenIndexes.add(index)
    if (!MEDIA_TYPES.has(rawItem.type)) {
      return { error: fail(400, `media[${position}].type must be "video" or "image"`) }
    }
    const url = publicHttpUrl(rawItem.url)
    if (!url) return { error: fail(400, `media[${position}].url must be a public http(s) address`) }
    media.push({ index, type: rawItem.type, url })
  }
  media.sort((a, b) => a.index - b.index)
  return { value: media }
}

/**
 * 严格解码 base64。Node 的 `Buffer.from(x, 'base64')` 会静默忽略非法字符，
 * 这里用正则 + 规范编码回比把「解码失败」变成可判定的 null。
 * @param {unknown} value
 * @returns {Buffer | null}
 */
function decodeBase64Chunk(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64_RE.test(value)) return null
  const buffer = Buffer.from(value, 'base64')
  const canonical = value.replace(/=+$/, '')
  if (buffer.toString('base64').replace(/=+$/, '') !== canonical) return null
  return buffer
}

/** 按 media.index 找条目；非整数 index 视为无效。 */
function findMedia(session, rawIndex) {
  if (!Number.isInteger(rawIndex)) return null
  return session.media.find((item) => item.index === rawIndex) || null
}

/**
 * 创建回传会话。
 * @param {{ req?: { body?: unknown }, paths: RelayPaths }} ctx
 * @returns {{ status: number, body: Record<string, any> }}
 */
export function handleCaptureMediaSession(ctx) {
  const body = ctx.req?.body
  if (!isPlainObject(body)) return fail(400, 'capture-media-session body must be a JSON object')

  const source = parseSessionSource(body)
  if (source.error) return source.error
  const media = parseSessionMedia(body.media)
  if (media.error) return media.error

  cleanupStaleRelaySessions(ctx.paths)

  const sessionId = randomBytes(12).toString('hex')
  const dir = sessionDir(ctx.paths, sessionId)
  mkdirSync(dir, { recursive: true })
  const session = {
    session_id: sessionId,
    created_at: new Date().toISOString(),
    source: source.value,
    media: media.value.map((item) => ({
      index: item.index,
      type: item.type,
      url: item.url,
      seq: 0,
      bytes: 0,
      complete: false,
    })),
  }
  writeSession(ctx.paths, session)

  return {
    status: 201,
    body: {
      data: {
        session_id: sessionId,
        media: session.media.map((item) => ({ index: item.index })),
      },
    },
  }
}

/**
 * 追加一个媒体分块。
 *
 * 序号严格递增：`seq` 必须等于会话里记录的期望值，重复/乱序都是 409；解码后
 * 超过单块上限是 400；累计超过单文件/单会话上限是 413，并直接删掉会话目录
 * （失败即释放，不给残留字节继续增长的机会）。零字节的 final 块会被记录为
 * `complete + bytes:0`，由 commit 返回 409「空文件」。
 * @param {{ req?: { body?: unknown }, paths: RelayPaths }} ctx
 * @returns {{ status: number, body: Record<string, any> }}
 */
export function handleCaptureMediaChunk(ctx) {
  const body = ctx.req?.body
  if (!isPlainObject(body)) return fail(400, 'capture-media-chunk body must be a JSON object')

  const loaded = loadSession(ctx.paths, body.session_id)
  if (loaded.error) return loaded.error
  const { session } = loaded
  const sessionId = session.session_id

  const media = findMedia(session, body.index)
  if (!media) return fail(400, `media index ${String(body.index)} is not part of this session`)
  if (media.complete === true) return fail(409, `media ${media.index} is already complete`)
  if (!Number.isInteger(body.seq) || body.seq !== media.seq) {
    return fail(409, `media ${media.index} chunk seq must be ${media.seq}`)
  }

  const chunk = decodeBase64Chunk(body.data)
  if (chunk === null) return fail(400, 'data must be a base64 string')
  if (chunk.length > RELAY_CHUNK_DECODED_MAX_BYTES) {
    return fail(400, `each chunk must decode to at most ${RELAY_CHUNK_DECODED_MAX_BYTES} bytes`)
  }

  const fileBytes = media.bytes + chunk.length
  if (fileBytes > RELAY_MAX_FILE_BYTES) {
    removeSessionDir(ctx.paths, sessionId)
    return fail(413, `media ${media.index} exceeds the ${RELAY_MAX_FILE_BYTES} byte file limit`)
  }
  const totalBytes = session.media.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0) + chunk.length
  if (totalBytes > RELAY_MAX_TOTAL_BYTES) {
    removeSessionDir(ctx.paths, sessionId)
    return fail(413, `this session exceeds the ${RELAY_MAX_TOTAL_BYTES} byte session limit`)
  }

  // 零字节的 final 块是合法协议输入（页面读到 0 字节），这里如实记录
  // `complete + bytes:0`，让 commit 用 409 明确拒绝，而不是让调用方挂在半途。
  const final = body.final === true
  appendFileSync(partPath(ctx.paths, sessionId, media.index), chunk)
  media.bytes = fileBytes
  media.seq = body.seq + 1
  if (final) media.complete = true
  writeSession(ctx.paths, session)

  return {
    status: 200,
    body: { data: { index: media.index, bytes: media.bytes, complete: media.complete } },
  }
}

/** 读取文件头若干字节；读取失败按空 buffer 处理，由调用方判定不匹配。 */
function readHead(filePath, length = 12) {
  const fd = openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const read = readSync(fd, buffer, 0, length, 0)
    return buffer.subarray(0, read)
  } finally {
    closeSync(fd)
  }
}

/**
 * 文件头是否与声明的媒体类型匹配：
 * video 接受 ISO-BMFF `ftyp`（mp4）或 EBML `1A45DFA3`（webm）；
 * image 接受 JPEG `FFD8` 或 PNG `89504E47`。
 * @param {'video' | 'image'} type
 * @param {Buffer} head
 */
function magicMatches(type, head) {
  if (type === 'video') {
    const ftyp = head.length >= 8 && head.subarray(4, 8).toString('latin1') === 'ftyp'
    const ebml = head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
    return ftyp || ebml
  }
  const jpeg = head.length >= 2 && head[0] === 0xff && head[1] === 0xd8
  const png = head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
  return jpeg || png
}

/** 落盘文件名：`video_<sid>_<index>.mp4` / `image_<sid>_<index>.jpg`。 */
function relayFileName(type, sessionId, index) {
  const extension = type === 'video' ? '.mp4' : '.jpg'
  const prefix = type === 'video' ? 'video' : 'image'
  return `${prefix}_${sessionId}_${index}${extension}`
}

/** 与 capture 的重复判定一致：已有附件，或非视频的 ready 行。 */
function isRelayDuplicate(item) {
  if (!item || typeof item !== 'object') return false
  if ((item.media_items?.length || 0) > 0) return true
  return item.type !== 'video' && importStatusOf(item) === IMPORT_STATUS_READY
}

/**
 * 用会话里的源字段与落盘文件拼出库记录。
 *
 * 复用 capture 的 `buildCaptureRecord`：media_items/local_paths/type/
 * content_shape/import_status 的推导与直接抓取保持同一套语义，前端卡片无需
 * 区分字节来源。封面不单独下载，沿用页面给的远端 cover_url。
 * @param {{ session: Record<string, any>, files: Array<Record<string, any>>, ctx: Record<string, any> }} args
 */
function buildRelayRecord(args) {
  const { session, files, ctx } = args
  const source = session.source || {}
  const mediaItems = files.map((file) => ({
    type: file.type,
    url: `${MEDIA_URL_PREFIX}/${file.type === 'video' ? 'videos' : 'images'}/${file.fileName}`,
  }))
  const localPaths = {}
  let videoCount = 0
  let imageCount = 0
  for (const file of files) {
    if (file.type === 'video') {
      const number = ++videoCount
      localPaths[number === 1 ? 'video' : `video_${number}`] = file.path
    } else {
      const number = ++imageCount
      localPaths[`image_${number}`] = file.path
    }
  }

  const detect = typeof ctx.detectPlatformFromUrl === 'function' ? ctx.detectPlatformFromUrl : detectPlatformFromUrl
  const detected = detect(source.source_url)
  const platform = detected && detected !== 'unknown' ? detected : (source.platform || 'unknown')

  return buildCaptureRecord({
    parsed: {
      sourceUrl: source.source_url,
      title: source.title || '',
      content: source.content || '',
      contentShape: source.content_shape || '',
      coverUrl: source.cover_url || '',
      tags: Array.isArray(source.tags) ? source.tags : [],
      author: isPlainObject(source.author) ? source.author : {},
      stats: isPlainObject(source.stats) ? source.stats : {},
      postedAt: source.posted_at || '',
    },
    platform,
    download: {
      mediaItems,
      localPaths,
      savedByUrl: new Map(),
      errors: [],
    },
    cover: { path: '', renderable: null },
  })
}

/**
 * 提交会话：校验完成状态与文件头 → 去重 → 移动文件 → 写库。
 *
 * 失败会删除整个会话目录；duplicate 命中时同样删除（字节不再需要）。文件头
 * 全部校验通过才移动，避免一半文件已落到 videos/images 的中间状态。
 * @param {{ req?: { body?: unknown }, paths: RelayPaths, store: Record<string, any>, [key: string]: any }} ctx
 * @returns {{ status: number, body: Record<string, any> }}
 */
export function handleCaptureCommit(ctx) {
  const body = ctx.req?.body
  if (!isPlainObject(body)) return fail(400, 'capture-commit body must be a JSON object')

  const loaded = loadSession(ctx.paths, body.session_id)
  if (loaded.error) return loaded.error
  const { session } = loaded
  const sessionId = session.session_id
  /** 已移动到正式目录的文件；提交失败要和会话目录一起回收，不留孤儿。 */
  const moved = []
  try {
    const incomplete = session.media.find((item) => item.complete !== true)
    if (incomplete) {
      removeSessionDir(ctx.paths, sessionId)
      return fail(409, `media ${incomplete.index} has not finished uploading`)
    }
    const empty = session.media.find((item) => !(Number(item.bytes) > 0))
    if (empty) {
      removeSessionDir(ctx.paths, sessionId)
      return fail(409, `media ${empty.index} is empty`)
    }

    const files = []
    for (const item of session.media) {
      const sourcePath = partPath(ctx.paths, sessionId, item.index)
      if (!existsSync(sourcePath)) {
        removeSessionDir(ctx.paths, sessionId)
        return fail(400, `media ${item.index} upload file is missing`)
      }
      if (!magicMatches(item.type, readHead(sourcePath))) {
        removeSessionDir(ctx.paths, sessionId)
        return fail(400, `media ${item.index} bytes do not match the declared ${item.type} type`)
      }
      const fileName = relayFileName(item.type, sessionId, item.index)
      const directory = item.type === 'video' ? ctx.paths.videosDir : ctx.paths.imagesDir
      files.push({ index: item.index, type: item.type, fileName, path: join(directory, fileName), sourcePath })
    }
    files.sort((a, b) => a.index - b.index)

    // 去重在移动之前：命中已有行时既不改库，也不在正式目录留下这一次的文件。
    const existing = ctx.store.findByUrl(session.source.source_url)
    if (isRelayDuplicate(existing)) {
      removeSessionDir(ctx.paths, sessionId)
      return { status: 200, body: { data: existing, existing: true } }
    }

    mkdirSync(ctx.paths.videosDir, { recursive: true })
    mkdirSync(ctx.paths.imagesDir, { recursive: true })
    for (const file of files) {
      renameSync(file.sourcePath, file.path)
      moved.push(file.path)
    }
    const record = buildRelayRecord({ session, files, ctx })
    const saved = ctx.store.add(record, { allowDuplicate: true })
    removeSessionDir(ctx.paths, sessionId)
    return { status: 201, body: { data: saved } }
  } catch (error) {
    for (const filePath of moved) rmSync(filePath, { force: true })
    removeSessionDir(ctx.paths, sessionId)
    throw error
  }
}
