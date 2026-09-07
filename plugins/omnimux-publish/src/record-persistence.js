import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isObject } from './shared/values.js'
import { isPublishRecord } from './record-schema.js'
import { PublishError } from './publish-error.js'

/** @typedef {Pick<typeof import('node:fs'), 'mkdirSync' | 'readFileSync' | 'renameSync' | 'writeFileSync'>} RecordFs */
/** @type {RecordFs} */
export const RECORD_FS = { mkdirSync, readFileSync, renameSync, writeFileSync }

/** @param {RecordFs} fs @param {string | undefined} file @returns {import('./record-types.js').RecordState} */
export function loadRecordState(fs, file) {
  const empty = { schema: 1, revision: 0, records: [] }
  if (!file) return empty
  /** @type {unknown} */
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return empty
  }
  if (!isObject(raw) || !Array.isArray(raw.records)) return empty
  // Never drop partially valid rows and then overwrite their original disk data.
  if (!raw.records.every(isPublishRecord)) {
    throw new PublishError('invalid-record', 'records.json contains an incomplete or invalid record; original data was not modified')
  }
  return { schema: 1, revision: Number(raw.revision) || 0, records: raw.records }
}

/** @param {RecordFs} io @param {string | undefined} file @param {import('./record-types.js').RecordState} state */
export function persistRecordState(io, file, state) {
  if (!file) throw new PublishError('invalid-arguments', 'recordsFile is required to persist records')
  io.mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  io.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  io.renameSync(tmp, file)
}
