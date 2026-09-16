import { closeSync, constants, fstatSync, ftruncateSync, openSync, readFileSync, readSync, realpathSync, writeSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { createVideoStreamUrl } from './stream-capability.js'

function localStreamPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/omnimux/video-preview/stream?')) return null
  return new URL(value, 'http://localhost').searchParams.get('path')
}

function probeMedia(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Media must be an ordinary file')
    const bytes = Buffer.alloc(512); readSync(fd, bytes, 0, bytes.length, 0)
    const signature = bytes.toString('ascii')
    const image = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || /^GIF8[79]a/.test(signature) || (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP')
    // Container signatures cover the formats admitted by the existing player,
    // including QuickTime files whose first atom predates ftyp.
    const quickTime = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(signature.slice(4, 8))
      && bytes.readUInt32BE(0) >= 8
    const video = quickTime || signature.startsWith('OggS')
      || (signature.startsWith('FLV') && bytes[3] === 1 && bytes.readUInt32BE(5) >= 9)
      || bytes.subarray(0, 16).equals(Buffer.from('3026b2758e66cf11a6d900aa0062ce6c', 'hex'))
      || (bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47)
      || (bytes[4] === 0x47 && bytes[196] === 0x47 && bytes[388] === 0x47)
      || bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      || (signature.startsWith('RIFF') && signature.slice(8, 12) === 'AVI ')
    if (!image && !video) throw new Error('Selected file does not contain supported media')
  } finally { closeSync(fd) }
}

/** Explicit trusted-tool migration; document contents never authorize their own file paths. */
export function refreshBreakdownMedia(filePath, authorizedMediaPaths) {
  if (!['.json', '.vbreakdown'].includes(extname(filePath).toLowerCase()) || !Array.isArray(authorizedMediaPaths) || authorizedMediaPaths.length === 0) {
    throw new Error('Select the breakdown file and explicitly list media paths to authorize')
  }
  const allowed = new Set(authorizedMediaPaths.map((path) => {
    if (typeof path !== 'string' || !path) throw new Error('Invalid selected media path')
    return realpathSync(resolve(path))
  }))
  const fd = openSync(filePath, constants.O_RDWR | constants.O_NOFOLLOW)
  try {
    const info = fstatSync(fd)
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Invalid breakdown file')
    const data = JSON.parse(readFileSync(fd, 'utf8'))
    const validAnalysis = data && !Array.isArray(data) && Array.isArray(data.shots)
      && data.shots.every((shot) => shot && typeof shot === 'object' && typeof shot.id === 'string' && (shot.speech === undefined || typeof shot.speech === 'string'))
      && (data.is_video_breakdown === true || (Array.isArray(data.structure) && data.structure.every((stage) => stage && typeof stage === 'object' && !Array.isArray(stage))))
    if (!validAnalysis || !data.video || typeof data.video !== 'object' || Array.isArray(data.video)) throw new Error('Invalid breakdown document')
    let refreshed = 0
    for (const field of ['stream_url', 'cover_url']) {
      const path = localStreamPath(data.video[field])
      if (!path) continue
      const canonical = realpathSync(path)
      if (!allowed.has(canonical)) throw new Error('A referenced media path needs explicit authorization')
      probeMedia(canonical)
      data.video[field] = createVideoStreamUrl(canonical)
      refreshed++
    }
    if (refreshed) {
      const bytes = Buffer.from(`${JSON.stringify(data, null, 2)}\n`)
      let offset = 0
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset)
      ftruncateSync(fd, bytes.length)
    }
    return { path: resolve(filePath), refreshed, video: data.video }
  } finally { closeSync(fd) }
}
