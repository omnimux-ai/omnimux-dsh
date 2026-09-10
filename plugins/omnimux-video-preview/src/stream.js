import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

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

export function handleVideoStream(req, res, targetPath) {
  try {
    if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid path' }))
      return
    }

    const absolutePath = resolve(targetPath)
    if (!existsSync(absolutePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'File not found' }))
      return
    }

    const stats = statSync(absolutePath)
    if (!stats.isFile()) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Path is not a regular file' }))
      return
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
        'Access-Control-Allow-Origin': '*',
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
        'Access-Control-Allow-Origin': '*',
      })
      const stream = createReadStream(absolutePath)
      if (typeof req.on === 'function') req.on('close', () => stream.destroy())
      if (typeof stream.pipe === 'function') stream.pipe(res)
      return
    }

    const range = parseRange(rangeHeader, totalSize)
    if (!range || range.invalid) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
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
      'Access-Control-Allow-Origin': '*',
    })

    const stream = createReadStream(absolutePath, { start, end })
    if (typeof req.on === 'function') req.on('close', () => stream.destroy())
    if (typeof stream.pipe === 'function') stream.pipe(res)
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
  }
}
