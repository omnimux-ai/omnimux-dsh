import { lstatSync, realpathSync, unlinkSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { alignMediaExtension, downloadMedia, isSavedMediaFile } from './downloader.js'
import { analysisMediaItems } from './analysis-input.js'
import { localMediaPaths } from './local-store.js'
import { mediaSourceId, publicCaptureUrl, sameMediaSource } from './captured-import.js'

const LOCAL_PREFIX = '/omnimux/inspiration/local/media/'

/** Only flat, real files owned by the corresponding library directory can be reused. */
function ownedFile(file, roots, type) {
  if (typeof file !== 'string' || !file) return ''
  try {
    const target = resolve(file)
    if (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) return ''
    for (const root of roots.filter(Boolean)) {
      const owner = resolve(root)
      if (lstatSync(owner).isSymbolicLink() || !lstatSync(owner).isDirectory()) continue
      if (dirname(target) === owner && dirname(realpathSync(target)) === realpathSync(owner) && isSavedMediaFile(target, type)) return target
    }
  } catch { /* A missing or moved file is a missing attachment, never a duplicate. */ }
  return ''
}

function mediaKey(items, index) {
  const type = items[index].type
  const ordinal = items.slice(0, index + 1).filter((entry) => entry.type === type).length
  return type === 'image' ? `image_${ordinal}` : ordinal === 1 ? 'video' : `video_${ordinal}`
}

function savedPath(item, record, paths, key) {
  if (item?.status === 'missing') return ''
  const root = item.type === 'video' ? paths?.videosDir : paths?.imagesDir
  if (typeof item.url === 'string' && item.url.startsWith(LOCAL_PREFIX)) {
    const match = item.url.match(/^\/omnimux\/inspiration\/local\/media\/(videos|images|covers)\/([^/?#\\]+)$/)
    if (!match || ['.', '..'].includes(match[2])) return ''
    const coverPhoto = item.type === 'image' && match[1] === 'covers' && record.type !== 'video'
    if (!coverPhoto && match[1] !== (item.type === 'video' ? 'videos' : 'images')) return ''
    const actualRoot = coverPhoto ? paths?.coversDir : root
    const file = Object.values(record.local_paths || {}).find((value) => typeof value === 'string'
      && basename(value) === match[2] && dirname(resolve(value)) === resolve(actualRoot || '.'))
    return ownedFile(file, [actualRoot], item.type)
  }
  return ownedFile(record.local_paths?.[key], [root], item.type)
}

/** Browser duplicate detection checks actual files, including legacy remote-link video rows. */
export function isCompleteSavedRecord(record, paths) {
  if (!record || (record.import_status && record.import_status !== 'ready')) return false
  const items = analysisMediaItems(record)
  if (items.length) return items.every((item, index) => Boolean(savedPath(item, record, paths, mediaKey(items, index))))
  return Boolean(record.content?.trim()) && !['photo', 'gallery', 'video'].includes(record.content_shape)
    && record.type !== 'video' && !(record.capture?.media_items?.length)
}

/** Remove only files this attempt created, and only after checking all persisted references. */
export function cleanupUnreferencedDownloads(files, store) {
  let rows
  try { rows = store.readAll() } catch { return }
  if (!Array.isArray(rows)) return
  const referenced = new Set(rows.flatMap((row) => localMediaPaths(row.local_paths)))
  for (const file of new Set(files || [])) {
    if (referenced.has(file)) continue
    try { unlinkSync(file) } catch { /* Cleanup must not hide the persistence failure. */ }
  }
}

/** Merge new source identities into fixed existing slots; never align them by array position. */
function fixedSlots(previous, incoming, paths) {
  const oldItems = analysisMediaItems(previous)
  const slots = oldItems.map((item, index) => {
    const file = savedPath(item, previous, paths, mediaKey(oldItems, index))
    const source_url = publicCaptureUrl(item.source_url || item.url)
    return { type: item.type, source_url, source_id: mediaSourceId({ ...item, source_url }),
      url: file ? (item.url?.startsWith(LOCAL_PREFIX) ? item.url : `${LOCAL_PREFIX}${item.type === 'video' ? 'videos' : 'images'}/${basename(file)}`) : '',
      file, status: file ? 'saved' : 'missing', error: file ? undefined : item.error || '素材文件尚未保存', download_url: source_url }
  })
  for (const item of incoming) {
    const source_url = publicCaptureUrl(item.url)
    const source_id = mediaSourceId(item)
    const index = slots.findIndex((slot) => sameMediaSource(slot, { ...item, source_url }))
    if (index >= 0) {
      const strongerId = /^(?:poster|image|video):/.test(slots[index].source_id) && source_id && !/^(?:poster|image|video):/.test(source_id)
      slots[index] = { ...slots[index], source_url: source_url || slots[index].source_url,
        source_id: strongerId ? source_id : slots[index].source_id || source_id, download_url: source_url || slots[index].download_url }
    } else if (!source_url && !source_id && oldItems.some((slot) => slot.type === item.type && !slot.source_url && !mediaSourceId(slot))) {
      // A second unidentified missing item cannot be safely assigned to an old slot.
      // Keep the old position missing instead of guessing or adding one on every retry.
      for (const slot of slots.filter((slot) => slot.type === item.type && !slot.source_url && !slot.source_id)) slot.error = '素材来源无法确认，请重新采集后补齐'
    } else {
      slots.push({ type: item.type, source_url, source_id, url: '', file: '', status: 'missing',
        error: '未取得可下载的素材地址', download_url: source_url })
    }
  }
  return slots
}

/**
 * Explicit browser preservation policy. Each transfer still uses the shared downloader;
 * successful attachments are checkpointed into their original positions.
 */
export async function downloadAvailableMedia(args, meta, { downloadCover, extractPoster, checkpoint }) {
  const previous = args.upgradeId ? args.store.get(args.upgradeId) || {} : {}
  const slots = fixedSlots(previous, meta.media_slots || meta.media_items || [], args.paths)
  const localPaths = { ...(previous.local_paths || {}) }
  const newFiles = new Set()
  const oldFiles = new Set(localMediaPaths(previous.local_paths))
  let coverPath = ownedFile(previous.local_paths?.cover, [args.paths?.coversDir, args.paths?.imagesDir], 'image')
  let coverRenderable = coverPath ? true : null
  const snapshot = () => {
    const mediaItems = slots.map((slot) => ({ type: slot.type, url: slot.url, status: slot.status,
      ...(slot.source_id ? { source_id: slot.source_id } : {}), ...(slot.source_url ? { source_url: slot.source_url } : {}),
      ...(slot.status === 'missing' ? { error: slot.error || '素材文件尚未保存' } : {}) }))
    return { mediaItems, localPaths: { ...localPaths }, localVideoPath: slots.find((slot) => slot.type === 'video' && slot.status === 'saved')?.file || '',
      localCoverPath: coverPath, coverRenderable, newFiles: [...newFiles],
      missingReasons: slots.filter((slot) => slot.status === 'missing').map((slot, index) => `${slot.type === 'video' ? '视频' : '图片'}未保存：${slot.error || `缺少素材 ${index + 1}`}`) }
  }
  try {
    for (let index = 0; index < slots.length; index++) {
      if (args.signal?.aborted) throw args.signal.reason || new DOMException('Aborted', 'AbortError')
      const slot = slots[index]
      const key = mediaKey(slots, index)
      if (slot.file) { localPaths[key] = slot.file; continue }
      if (slot.download_url) {
        let downloaded = ''
        try {
          downloaded = await downloadMedia(slot.download_url, slot.type === 'video' ? args.paths.videosDir : args.paths.imagesDir, {
            prefix: slot.type === 'video' ? 'video_' : 'image_', fetcher: args.fetcher, resolver: args.resolver, signal: args.signal,
          })
          newFiles.add(downloaded)
          const aligned = alignMediaExtension(downloaded)
          if (aligned !== downloaded) { newFiles.delete(downloaded); downloaded = aligned; newFiles.add(downloaded) }
          if (!isSavedMediaFile(downloaded, slot.type)) throw new Error(`下载内容不是有效的${slot.type === 'video' ? '视频' : '图片'}文件`)
          slot.file = downloaded
          slot.url = `${LOCAL_PREFIX}${slot.type === 'video' ? 'videos' : 'images'}/${basename(downloaded)}`
          slot.status = 'saved'
          slot.error = undefined
          localPaths[key] = downloaded
        } catch (error) {
          if (downloaded) {
            cleanupUnreferencedDownloads([downloaded], args.store)
            newFiles.delete(downloaded)
          }
          if (args.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error
          slot.error = args.formatErrorMessage(error)
        }
      }
      if (args.upgradeId && checkpoint) await checkpoint(snapshot())
    }
    if (!coverPath) {
      const firstImage = slots.find((slot) => slot.type === 'image' && slot.status === 'saved')
      if (firstImage) {
        coverPath = firstImage.file
        coverRenderable = true
        localPaths.cover = coverPath
      } else {
        // Passing only cover paths prevents optional preview cleanup touching reused videos.
        const coverPaths = {}
        let cover = await downloadCover(args, meta, coverPaths)
        if (!cover.path && slots.some((slot) => slot.type === 'video' && slot.status === 'saved')) {
          cover = await extractPoster(args, slots.find((slot) => slot.type === 'video' && slot.status === 'saved').file, coverPaths)
        }
        if (cover.path && !isSavedMediaFile(cover.path, 'image')) {
          if (!oldFiles.has(cover.path)) cleanupUnreferencedDownloads([cover.path], args.store)
          cover = { path: '', renderable: false }
        }
        if (cover.path) {
          coverPath = cover.path
          localPaths.cover = cover.path
          if (!oldFiles.has(cover.path)) newFiles.add(cover.path)
        }
        coverRenderable = cover.renderable
      }
    }
    return snapshot()
  } catch (error) {
    cleanupUnreferencedDownloads([...newFiles], args.store)
    throw error
  }
}
