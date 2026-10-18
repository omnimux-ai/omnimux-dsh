import { copyFile, lstat, open, realpath, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep, extname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { creationMediaLabel } from './creation-draft.js'
import { analysisMediaItems } from './analysis-input.js'

/** @typedef {{path:string, title:string, type:'video'|'image', media_index:number, clip?:{start_seconds:number,end_seconds:number}}} CreationFile */

function cancelled() {
  return Object.assign(new Error('素材准备已取消'), { name: 'AbortError' })
}

function checkSignal(signal) {
  if (signal?.aborted) throw cancelled()
}

function inside(root, path) {
  const part = relative(root, path)
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}

/** Both lexical and physical ownership are required; no selected path follows a symlink. */
async function ownedPath(path, root, kind, message) {
  try {
    if (typeof path !== 'string' || !isAbsolute(path) || typeof root !== 'string' || !isAbsolute(root)) throw new Error(message)
    const owner = resolve(root)
    const target = resolve(path)
    if (!inside(owner, target)) throw new Error(message)
    const rootInfo = await lstat(owner)
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error(message)
    let cursor = owner
    const segments = relative(owner, target).split(sep)
    for (let index = 0; index < segments.length; index++) {
      cursor = join(cursor, segments[index])
      const info = await lstat(cursor)
      if (info.isSymbolicLink()) throw new Error(message)
      if (index < segments.length - 1 && !info.isDirectory()) throw new Error(message)
      if (index === segments.length - 1 && (kind === 'directory' ? !info.isDirectory() : !info.isFile() || info.size <= 0)) throw new Error(message)
    }
    const [actualRoot, actualTarget] = await Promise.all([realpath(owner), realpath(target)])
    if (!inside(actualRoot, actualTarget)) throw new Error(message)
    return actualTarget
  } catch (error) {
    throw new Error(message, { cause: error })
  }
}

async function validateOutputDir(outputDir, paths) {
  const message = '素材准备目录无效，请重新准备'
  if (typeof paths?.videosDir !== 'string' || !isAbsolute(paths.videosDir) || typeof outputDir !== 'string' || !isAbsolute(outputDir)) throw new Error(message)
  const root = join(resolve(paths.videosDir), 'creation-references')
  const target = resolve(outputDir)
  if (relative(root, target) !== basename(target) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(basename(target))) throw new Error(message)
  return ownedPath(target, resolve(paths.videosDir), 'directory', message)
}

function rangeNumber(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return NaN
  return Number(value)
}

/** Match a saved local URL before using legacy ordinal keys; posters stay video-only. */
function savedSource(media, item, paths, key) {
  const expectedRoot = media.type === 'video' ? paths.videosDir : paths.imagesDir
  const localPrefix = '/omnimux/inspiration/local/media/'
  if (typeof media.url !== 'string' || !media.url.startsWith(localPrefix)) return { source: item.local_paths?.[key], root: expectedRoot }
  const match = media.url.match(/^\/omnimux\/inspiration\/local\/media\/(videos|images|covers)\/([^/?#\\]+)$/)
  if (!match || ['.', '..'].includes(match[2])) return {}
  const photoRecord = item.type !== 'video' && (['image', 'photo', 'gallery'].includes(String(item.type || ''))
    || ['photo', 'gallery'].includes(String(item.content_shape || '')) || item.media_kind === 'image')
  const coverPhoto = media.type === 'image' && match[1] === 'covers' && photoRecord
  if (!coverPhoto && match[1] !== (media.type === 'video' ? 'videos' : 'images')) return {}
  const root = coverPhoto ? paths.coversDir : expectedRoot
  if (typeof root !== 'string' || !isAbsolute(root)) return {}
  const source = Object.values(item.local_paths || {}).find((path) => typeof path === 'string' && isAbsolute(path)
    && relative(resolve(root), resolve(path)) === match[2])
  return { source, root }
}

function selectedInputs(item, draft, paths) {
  const media = analysisMediaItems(item)
  const references = Array.isArray(draft?.references) ? draft.references.filter((entry) => entry?.kind === 'media') : []
  const seen = new Set()
  return references.map((reference) => {
    const index = reference.media_index
    if (!Number.isInteger(index) || index < 0 || index >= media.length) throw new Error('所选素材序号无效，请重新选择')
    if (seen.has(index)) throw new Error('同一素材不能重复选择')
    seen.add(index)
    const type = media[index]?.type
    if (type !== 'image' && type !== 'video') throw new Error('所选素材类型不受支持')
    const ordinal = media.slice(0, index + 1).filter((entry) => entry?.type === type).length
    const key = type === 'image' ? `image_${ordinal}` : ordinal === 1 ? 'video' : `video_${ordinal}`
    let clip
    if (type === 'video') {
      const clips = Array.isArray(draft.clips) ? draft.clips.filter((entry) => entry?.media_index === index) : []
      const start = rangeNumber(clips[0]?.start_seconds)
      const end = rangeNumber(clips[0]?.end_seconds)
      if (clips.length !== 1 || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end) throw new Error(`请为${creationMediaLabel(item, index)}设置有效的起止时间`)
      clip = { start_seconds: start, end_seconds: end }
    }
    return { media_index: index, type, ...savedSource(media[index], item, paths, key), clip }
  })
}

async function cleanup(paths) {
  const results = await Promise.allSettled(paths.map(async (path) => {
    try { await unlink(path) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }))
  const failures = results.filter((entry) => entry.status === 'rejected')
  if (failures.length) throw new AggregateError(failures.map((entry) => entry.reason), '素材临时文件清理未完成')
}

/** Stop promptly even when a processor has not yet entered its cancellable queue. */
async function execute(videoProcess, request, signal, createdPaths) {
  checkSignal(signal)
  let onAbort
  let interrupted = false
  const operation = Promise.resolve().then(() => {
    checkSignal(signal)
    return videoProcess.execute({ ...request, signal })
  })
  const abort = signal && new Promise((_, reject) => {
    onAbort = () => { interrupted = true; reject(cancelled()) }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  try {
    const outcome = await (abort ? Promise.race([operation, abort]) : operation)
    checkSignal(signal)
    return outcome
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw cancelled()
    if (error?.code === 'ffmpeg-missing' || /(?:ffmpeg|ffprobe).*(?:not found|ENOENT)/i.test(String(error?.message))) throw new Error('本机缺少视频处理程序，无法准备视频片段', { cause: error })
    throw new Error('视频片段处理失败，请检查素材后重试', { cause: error })
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
    // A late processor response must not resurrect files after cancellation.
    if (interrupted) operation.then(() => cleanup(createdPaths), () => cleanup(createdPaths)).catch((error) => {
      // Main failure cleanup also reports any currently visible cleanup error.
      process.emitWarning(error, { code: 'creation-media-cleanup' })
    })
  }
}

async function probe(videoProcess, source, kind, signal, createdPaths) {
  const outcome = await execute(videoProcess, { capability: 'media_metadata', input: { mediaUrl: source, mediaKind: kind } }, signal, createdPaths)
  if (outcome?.mode !== 'live' || !outcome.result || typeof outcome.result !== 'object') throw new Error('无法核验视频素材，请重新准备')
  if (kind === 'video') {
    if (outcome.result.codec_type !== 'video' || typeof outcome.result.duration !== 'number' || !Number.isFinite(outcome.result.duration) || outcome.result.duration <= 0) throw new Error('视频素材缺少有效画面或真实时长')
  } else if (outcome.result.codec_type !== 'audio' && outcome.result.codec_type !== null) throw new Error('无法核验视频音轨，请重新准备')
  return outcome.result
}

async function reservePath(outputDir, type, source, createdPaths) {
  const extension = type === 'video' ? '.mp4' : /^\.[a-z0-9]{1,8}$/i.test(extname(source)) ? extname(source).toLowerCase() : '.img'
  const dest = join(outputDir, `${randomUUID()}${extension}`)
  const handle = await open(dest, 'wx', 0o600)
  createdPaths.push(dest)
  await handle.close()
  return dest
}

/**
 * Prepare only selected saved post media. Original assets remain untouched.
 * @param {{item:object,draft:object,paths:{dir:string,imagesDir:string,videosDir:string,coversDir?:string},videoProcess?:{execute:Function},signal?:AbortSignal,outputDir:string}} args
 * @returns {Promise<{files:CreationFile[],createdPaths:string[]}>}
 */
export async function prepareCreationMedia({ item, draft, paths, videoProcess, signal, outputDir }) {
  /** @type {string[]} */
  const createdPaths = []
  try {
    checkSignal(signal)
    const destination = await validateOutputDir(outputDir, paths)
    const selected = selectedInputs(item, draft, paths)
    if (selected.some((entry) => entry.type === 'video') && typeof videoProcess?.execute !== 'function') throw new Error('本地视频处理能力未就绪，暂时无法准备视频片段')
    for (const entry of selected) {
      entry.source = await ownedPath(entry.source, entry.root, 'file', `${creationMediaLabel(item, entry.media_index)}的素材文件无效或已移走`)
      checkSignal(signal)
    }
    /** @type {CreationFile[]} */
    const files = []
    for (const entry of selected) {
      checkSignal(signal)
      const label = creationMediaLabel(item, entry.media_index)
      if (entry.type === 'image') {
        const dest = await reservePath(destination, 'image', entry.source, createdPaths)
        await copyFile(entry.source, dest)
        checkSignal(signal)
        await ownedPath(dest, destination, 'file', '图片准备失败，请重新准备')
        files.push({ path: dest, title: label, type: 'image', media_index: entry.media_index })
        continue
      }
      const metadata = await probe(videoProcess, entry.source, 'video', signal, createdPaths)
      if (entry.clip.end_seconds > metadata.duration) throw new Error(`${label}的结束时间超过视频真实时长`)
      const sourceAudio = await probe(videoProcess, entry.source, 'audio', signal, createdPaths)
      const dest = await reservePath(destination, 'video', entry.source, createdPaths)
      const trimmed = await execute(videoProcess, {
        capability: 'video_trim', dest,
        input: { videoUrl: entry.source, startSeconds: entry.clip.start_seconds, endSeconds: entry.clip.end_seconds, precise: true, keepAudio: true },
      }, signal, createdPaths)
      if (trimmed?.mode !== 'live') throw new Error('视频片段尚未真实生成，请重新准备')
      await ownedPath(dest, destination, 'file', '视频片段未真实生成，请重新准备')
      const outputVideo = await probe(videoProcess, dest, 'video', signal, createdPaths)
      const expected = entry.clip.end_seconds - entry.clip.start_seconds
      if (Math.abs(outputVideo.duration - expected) > Math.max(0.15, expected * 0.02)) throw new Error('视频片段时长与所选范围不符，请重新准备')
      const outputAudio = await probe(videoProcess, dest, 'audio', signal, createdPaths)
      if (sourceAudio.codec_type === 'audio' && outputAudio.codec_type !== 'audio') throw new Error('视频片段未保留原始音轨，请重新准备')
      checkSignal(signal)
      files.push({ path: dest, title: `${label}片段`, type: 'video', media_index: entry.media_index, clip: entry.clip })
    }
    checkSignal(signal)
    return { files, createdPaths }
  } catch (error) {
    try { await cleanup(createdPaths) } catch (cleanupError) { throw new AggregateError([error, cleanupError], '素材准备失败，临时文件清理未完成') }
    throw error
  }
}
