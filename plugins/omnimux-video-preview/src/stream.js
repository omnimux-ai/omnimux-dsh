import { verifyVideoStreamGrant } from './stream-capability.js'
import { createReadStream, closeSync, constants, fstatSync, openSync } from 'node:fs'
import { extname } from 'node:path'

const MIME_MAP = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.qt': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase()
  return MIME_MAP[ext] || 'application/octet-stream'
}

export function parseRange(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return null
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return { invalid: true }

  const [, startStr, endStr] = match
  let start = startStr ? parseInt(startStr, 10) : undefined
  let end = endStr ? parseInt(endStr, 10) : undefined

  if (start === undefined && end === undefined) return { invalid: true }

  if (start === undefined) {
    // Suffix range: bytes=-500
    start = Math.max(0, totalSize - end)
    end = totalSize - 1
  } else if (end === undefined || end >= totalSize) {
    // Open range: bytes=100-
    end = totalSize - 1
  }

  if (isNaN(start) || isNaN(end) || start > end || start >= totalSize) {
    return { invalid: true }
  }

  return { start, end }
}

export function handleVideoStream(req, res) {
  let fd
  try {
    if (req.method && !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405); res.end(); return
    }
    const grant = verifyVideoStreamGrant(new URL(req.url || '', 'http://localhost'))
    if (!grant) { res.writeHead(404); res.end('Media permission required'); return }
    const absolutePath = grant.path
    try { fd = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW) }
    catch { res.writeHead(404); res.end('Media unavailable'); return }
    const stats = fstatSync(fd)
    if (!stats.isFile() || stats.dev !== grant.dev || stats.ino !== grant.ino) {
      res.writeHead(404); res.end('Media unavailable'); return
    }
    const totalSize = stats.size
    const mimeType = getMimeType(absolutePath)
    const rangeHeader = req.headers.range

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end()
      return
    }

    if (!rangeHeader) {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      const stream = createReadStream(absolutePath, { fd, autoClose: true })
      fd = undefined
      if (typeof req.on === 'function') req.on('close', () => stream.destroy())
      if (typeof stream.pipe === 'function') stream.pipe(res)
      return
    }

    const range = parseRange(rangeHeader, totalSize)
    if (!range || range.invalid) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end('Requested Range Not Satisfiable')
      return
    }

    const { start, end } = range
    const chunkSize = end - start + 1

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })

    const stream = createReadStream(absolutePath, { fd, autoClose: true, start, end })
    fd = undefined
    if (typeof req.on === 'function') req.on('close', () => stream.destroy())
    if (typeof stream.pipe === 'function') stream.pipe(res)
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
