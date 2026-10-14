import { isAbsolute } from 'node:path'
import { inspectImageBytes } from './image-inspect.js'
import { probeTextImage } from '../text/image.js'
import { probeTextVideo } from '../text/video.js'
import { OmnimuxError } from './errors.js'
import { inspectVideoBytes } from '../../lib/video-inspect.js'

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
