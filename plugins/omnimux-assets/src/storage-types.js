import { createHash } from 'node:crypto'
/** Domain error shared by stores and the storage transaction layer. */
export class AssetsError extends Error {
  constructor(code, message) { super(message); this.name = 'AssetsError'; this.code = code }
}

export function sameRoot(actual, expected) {
  return ['path', 'dev', 'ino', 'fsid'].every((key) => actual[key] === expected[key])
}

export const STORAGE_SCHEMA = 1
export const LEDGERS = ['library.json', 'artifacts.json', 'mappings.json']
export const TERMINAL_STATES = new Set(['completed', 'completed_with_skips', 'abandoned'])
export const STORAGE_STATUS = Object.freeze({
  'storage-busy': 409, 'plan-stale': 409, 'conflict-required': 409,
  'root-identity-changed': 409, 'recovery-required': 409, 'stale-root': 409,
  'metadata-unsupported': 422, 'invalid-page': 400,
  'storage-offline': 503, 'directory-unreadable': 503, 'page-invalid': 400, 'ledger-corrupt': 422, 'schema-unsupported': 422,
  'reserved-name-conflict': 422, 'unsafe-hardlink': 422, 'path-denied': 422,
  'storage-platform-unsupported': 501, 'disk-space-insufficient': 413,
})

/** Validate a disk-relative POSIX reference without normalizing away traversal. */
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      value.startsWith('/') || /^[A-Za-z]:/.test(value) ||
      value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new AssetsError('path-denied', 'expected a safe relative POSIX path')
  }
  return value
}

/** Stable content hash for immutable plans and explicit confirmation sets. */
export function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Reject malformed or unknown ledgers rather than silently constructing an empty library. */
export function validateLedger(raw, name) {
  const key = name.replace('.json', '') === 'library' ? 'assets' : name.replace('.json', '')
  const schemas = key === 'assets' ? [2, 3] : [1, 2]
  if (!raw || typeof raw !== 'object' || !schemas.includes(raw.schema)) {
    throw new AssetsError('schema-unsupported', `unsupported ${name} schema`)
  }
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0 || !Array.isArray(raw[key])) {
    throw new AssetsError('ledger-corrupt', `invalid ${name}`)
  }
  const ids = new Set()
  for (const row of raw[key]) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
      throw new AssetsError('ledger-corrupt', `invalid or duplicate record in ${name}`)
    }
    ids.add(row.id)
    if (key === 'assets') {
      if (typeof row.name !== 'string' || !Array.isArray(row.files)) throw new AssetsError('ledger-corrupt', 'invalid asset')
      for (const file of row.files) {
        if (!file || typeof file.id !== 'string') throw new AssetsError('ledger-corrupt', 'invalid file ref')
        if (file.relative_path) safeRelative(file.relative_path)
        if (file.logical_path) safeRelative(file.logical_path)
        if (!file.relative_path && !file.real_path && !['unmigrated', 'excluded'].includes(file.status)) {
          throw new AssetsError('ledger-corrupt', 'file ref has no content or unavailable status')
        }
      }
    } else if (key === 'artifacts') {
      if (row.content_ref) safeRelative(row.content_ref)
      else if (row.status !== 'unmigrated') throw new AssetsError('ledger-corrupt', 'artifact has no content')
    } else if (row.relative_path) safeRelative(row.relative_path)
    else if (typeof row.real_path !== 'string' && row.status !== 'unmigrated') throw new AssetsError('ledger-corrupt', 'invalid mapping')
  }
  return raw
}

export function emptyLedger(name) {
  const key = name === 'library.json' ? 'assets' : name.replace('.json', '')
  return { schema: key === 'assets' ? 3 : 2, revision: 0, ...(key === 'assets' ? { migrated_mappings: false, file_inventory: [] } : {}), [key]: [] }
}

export function validateRoot(raw) {
  if (!raw || raw.schema !== 1 || !Number.isSafeInteger(raw.epoch) || raw.epoch < 0 ||
      typeof raw.homeId !== 'string' || typeof raw.active?.path !== 'string' ||
      !raw.active.path.startsWith('/') || typeof raw.active.rootId !== 'string' || !raw.active.identity) {
    throw new AssetsError('ledger-corrupt', 'invalid storage root pointer; recovery required')
  }
  return raw
}
