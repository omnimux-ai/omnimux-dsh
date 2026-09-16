import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

function keyPath() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.omnimux-video-preview-key')
}

function loadKey() {
  const path = keyPath()
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = fstatSync(fd)
      if (!info.isFile() || (info.mode & 0o077)) throw new Error('Unsafe preview key permissions')
      const key = readFileSync(fd)
      if (key.length !== 32) throw new Error('Invalid preview key')
      return key
    } finally { closeSync(fd) }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    mkdirSync(dirname(path), { recursive: true })
    try { writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' }) }
    catch (race) { if (race.code !== 'EEXIST') throw race }
    return loadKey()
  }
}

function signature(payload) {
  return createHmac('sha256', loadKey()).update(payload).digest('hex')
}

/** A trusted tool/analysis grants one canonical ordinary file, durable across restart. */
export function createVideoStreamUrl(filePath) {
  const path = realpathSync(filePath)
  const info = statSync(path)
  if (!info.isFile()) throw new Error('Preview requires an ordinary media file')
  const grant = Buffer.from(JSON.stringify({ path, dev: info.dev, ino: info.ino })).toString('base64url')
  return `/omnimux/video-preview/stream?${new URLSearchParams({ grant, signature: signature(grant) })}`
}

/** Verify before opening; the caller must compare the opened descriptor identity. */
export function verifyVideoStreamGrant(url) {
  const grant = url.searchParams.get('grant') || ''
  const mac = url.searchParams.get('signature') || ''
  if (!grant || !/^[a-zA-Z0-9_-]+$/.test(grant) || !/^[a-f0-9]{64}$/.test(mac)) return null
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(grant), 'hex'))) return null
  try {
    const data = JSON.parse(Buffer.from(grant, 'base64url').toString())
    if (typeof data.path !== 'string' || !Number.isSafeInteger(data.dev) || !Number.isSafeInteger(data.ino)) return null
    return data
  } catch { return null }
}
