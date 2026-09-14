/**
 * Persist captured first screens into the products media directory.
 *
 * Screenshots stay in memory until the draft has passed `isUsableImport`, so a
 * rejected import leaves zero orphan files behind. Once writing starts, each
 * frame follows the same discipline as `library.js`'s own writes: `.tmp` →
 * `fsync` → `rename`, with the directory at `0o700` and the files at `0o600`
 * set explicitly rather than left to the process umask.
 *
 * Any failure rolls back what this call already wrote and answers an empty
 * list — a disk problem degrades the screenshot chain, it never fails the
 * import (spec §2.2, §7).
 */
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { newRecordId } from './library.js'
import { mediaDirOf } from './paths.js'
import {
  MEDIA_DIR_MODE,
  MEDIA_FILE_MODE,
  buildScreenshotName,
} from './screenshot-contract.js'

/**
 * @typedef {{ id: string, real_path: string, original_name: string }} MediaEntry
 */

/**
 * @param {{
 *   outcomes?: ReadonlyArray<object>,
 *   mediaDir?: string,
 *   paths?: { mediaDir?: string, libraryFile?: string },
 *   url?: string,
 *   host?: string,
 *   deps?: { write?: (file: string, buffer: Buffer) => Promise<void> },
 * }} [args]
 * @returns {Promise<MediaEntry[]>} the persisted rows, in capture order; `[]` on any failure
 */
export async function persistSiteScreenshots(args = {}) {
  const outcomes = (Array.isArray(args.outcomes) ? args.outcomes : [])
    // A zero-byte frame is not a screenshot; writing one would only mislead.
    .filter((row) => row?.ok === true && Number(row?.buffer?.length ?? 0) > 0)
  if (outcomes.length === 0) return []

  const dir = args.mediaDir ?? mediaDirOf(args.paths)
  if (!dir) return []

  const host = args.host ?? hostOf(args.url)
  const write = args.deps?.write ?? writeAtomic
  /** @type {MediaEntry[]} */
  const entries = []

  try {
    await mkdir(dir, { recursive: true, mode: MEDIA_DIR_MODE })
    await chmod(dir, MEDIA_DIR_MODE)
    for (const outcome of outcomes) {
      const name = buildScreenshotName(host, outcome.kind)
      const realPath = join(dir, name)
      await write(realPath, outcome.buffer)
      entries.push({ id: newRecordId('med'), real_path: realPath, original_name: name })
    }
    return entries
  } catch {
    await rollback(entries)
    return []
  }
}

/**
 * Best-effort removal of files this call already wrote.
 *
 * @param {ReadonlyArray<{ real_path?: string }>} entries
 * @returns {Promise<void>}
 */
export async function rollback(entries) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.real_path) continue
    try {
      await rm(entry.real_path, { force: true })
    } catch {
      // A file that refuses to go is not worth masking the real failure.
    }
  }
}

/**
 * Write one buffer atomically: temp file, fsync, explicit mode, rename.
 *
 * @param {string} file
 * @param {Buffer} buffer
 * @returns {Promise<void>}
 */
async function writeAtomic(file, buffer) {
  const tmp = `${file}.tmp`
  const handle = await open(tmp, 'w', MEDIA_FILE_MODE)
  try {
    await handle.writeFile(buffer)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await chmod(tmp, MEDIA_FILE_MODE)
  await rename(tmp, file)
}

/**
 * @param {unknown} url
 * @returns {string}
 */
function hostOf(url) {
  try {
    return new URL(String(url ?? '')).hostname
  } catch {
    return 'site'
  }
}
