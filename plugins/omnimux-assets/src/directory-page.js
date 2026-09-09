import { AssetsError, digest, safeRelative } from './storage-types.js'
import { bucketOf, extOf } from './scanner.js'

/** Deterministic snapshot pagination; tokens are scoped to content, root and query. */
export function directoryPage(entries, scope, options = {}) {
  const limit = options.limit == null ? 100 : Number(options.limit)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new AssetsError('page-invalid', 'limit must be an integer between 1 and 200')
  const version = digest([scope, entries])
  let offset = 0
  if (options.cursor) {
    let token
    try {
      if (typeof options.cursor !== 'string' || options.cursor.length > 512) throw new Error('invalid cursor')
      token = JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
      if (!token || typeof token !== 'object' || typeof token.version !== 'string') throw new Error('invalid cursor')
    } catch { throw new AssetsError('page-invalid', 'invalid directory cursor') }
    if (token.version !== version) throw new AssetsError('plan-stale', 'directory changed; refresh from the first page')
    offset = token.offset
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= entries.length) throw new AssetsError('page-invalid', 'invalid directory cursor offset')
  }
  return { entries: entries.slice(offset, offset + limit), total: entries.length,
    nextCursor: offset + limit < entries.length ? Buffer.from(JSON.stringify({ version, offset: offset + limit })).toString('base64url') : null,
    epoch: options.epoch ?? 0 }
}

/** Build one layer from ledger refs without inventing materializable physical paths. */
export function logicalEntries(files, path = '') {
  if (path) safeRelative(path)
  const directories = new Map()
  const leaves = []
  const prefix = path ? `${path}/` : ''
  for (const file of files) {
    const logical = file.logical_path || file.original_name || file.id
    safeRelative(logical)
    if (!logical.startsWith(prefix)) continue
    const remainder = logical.slice(prefix.length)
    if (!remainder) continue
    const parts = remainder.split('/')
    const name = parts[0]
    if (parts.length > 1) {
      directories.set(name, { name, logical_path: `${prefix}${name}`, is_dir: true, kind: 'directory', virtual: true })
    } else {
      leaves.push({ name, logical_path: logical, fileId: file.id, id: file.id,
        kind: file.kind || bucketOf(extOf(name)), is_dir: file.kind === 'directory',
        status: file.status || (file.relative_path ? 'available' : 'unmigrated'),
        recovery_ref: file.recovery_ref, reason: file.recovery_ref?.reason })
    }
  }
  const rows = [...directories.values(), ...leaves.filter((row) => !row.is_dir || !directories.has(row.name))]
  rows.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || (a.name < b.name ? -1 : a.name > b.name ? 1 : String(a.fileId).localeCompare(String(b.fileId))))
  return rows
}
