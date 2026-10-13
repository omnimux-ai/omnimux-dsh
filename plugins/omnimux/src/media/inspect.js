import { isAbsolute } from 'node:path'
import sharp from 'sharp'
import { probeTextImage } from '../text/image.js'
import { probeTextVideo } from '../text/video.js'
import { OmnimuxError } from './errors.js'
import { inspectVideoBytes } from '../../lib/video-inspect.js'

async function inspectImageBytes(bytes) {
  const image=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'})
  const meta=await image.metadata()
  if(!['png','jpeg','webp'].includes(meta.format)||!meta.width||!meta.height||(meta.pages??1)!==1)throw new OmnimuxError('omnimux-invalid-request','图片需要为有效的静态PNG、JPEG或WebP')
  await image.resize({width:1,height:1,fit:'inside'}).raw().toBuffer()
  return {width:meta.autoOrient?.width??meta.width,height:meta.autoOrient?.height??meta.height}
}

/** Free local byte inspection; no credentials, uploads or provider requests. */
export function createMediaInspector() {
  return { async inspect({ path, type, maxBytes, signal } = {}) {
    if (typeof path !== 'string' || !isAbsolute(path) || !['image','video'].includes(type)) throw new OmnimuxError('omnimux-invalid-request', '素材检查需要受管的本地文件')
    const result = type === 'image'
      ? await probeTextImage(path, { attachments: { imageLimits: { maxImageBytes: maxBytes ?? 5 * 1024 * 1024 } }, signal })
      : await probeTextVideo(path, { maxVideoBytes: maxBytes ?? 100 * 1024 * 1024, signal })
    const metadata = type === 'video' ? await inspectVideoBytes(result.data) : await inspectImageBytes(result.data)
    return { type, mime: result.mediaType, sizeBytes: result.sizeBytes, ...metadata }
  } }
}
