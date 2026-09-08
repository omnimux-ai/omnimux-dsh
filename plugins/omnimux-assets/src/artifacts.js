/** Content-addressed artifact uploads using bounded, asynchronous safe I/O. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { bucketOf, extOf } from './scanner.js'
import { newRecordId, AssetsError } from './mappings.js'
import { validateLedger } from './storage-types.js'
import { SafeStorageFS } from './storage-fs.js'

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.avif': 'image/avif', '.heic': 'image/heic', '.tiff': 'image/tiff',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.m4v': 'video/mp4', '.flv': 'video/x-flv',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aiff': 'audio/aiff',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.html': 'text/html', '.htm': 'text/html', '.json': 'application/json',
  '.jsonl': 'application/jsonl', '.ndjson': 'application/x-ndjson',
}
const SECRET_PATTERN = /sk-[A-Za-z0-9]{8,}/
const TEXT_LIKE_TYPES = new Set(['document', 'html', 'json', 'other'])
const SECRET_SCAN_MAX_BYTES = 2 * 1024 * 1024
const strOrEmpty = (value) => typeof value === 'string' ? value : ''

/** Stores use a Runtime-provided ledger snapshot; standalone consumers must await report. */
export function createArtifactStore(opts = {}) {
  const fs = { mkdirSync, readFileSync, statSync, ...opts.fs }
  const hashOf = opts.createHash ?? createHash
  const paths = opts.paths ?? {}

  function loadState() {
    try {
      return validateLedger(JSON.parse(fs.readFileSync(paths.artifactsFile, 'utf8')), 'artifacts.json')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error instanceof AssetsError ? error : new AssetsError('ledger-corrupt', 'cannot load artifacts ledger')
      return { schema: 2, revision: 0, artifacts: [] }
    }
  }

  let state = opts.initialState ?? loadState()
  let reporting = false

  /** Copy, verify and persist one upload; never buffer the entire media payload. */
  async function report(filePath, source = {}, title) {
    if (reporting) throw new AssetsError('storage-busy', 'another artifact upload is active')
    const path = strOrEmpty(filePath).trim()
    if (!path) throw new AssetsError('path-not-found', 'file does not exist')
    const src = source && typeof source === 'object' ? source : {}
    const agent = strOrEmpty(src.agent).trim()
    const runId = strOrEmpty(src.run_id).trim()
    const finalTitle = strOrEmpty(title).trim() || basename(path)
    let probe = [finalTitle, agent, runId, strOrEmpty(src.model), strOrEmpty(src.prompt_hash)].join('\n')
    if (SECRET_PATTERN.test(probe)) throw new AssetsError('secret-detected', 'refusing to store content that looks like a secret token')
    const safe = opts.safeFS ?? new SafeStorageFS()
    reporting = true
    try {
      // Resolve allowed parent aliases once; the stream still opens only through
      // the canonical no-follow FD chain and verifies that root's identity.
      let sourceRoot
      let sourceInfo
      try {
        sourceRoot = await safe.identity(dirname(path))
        sourceInfo = await safe.request('stat', { root: sourceRoot.path, rel: basename(path) })
      } catch (error) {
        if (error.code === 'storage-offline') throw new AssetsError('path-not-found', 'file does not exist')
        throw error
      }
      if (sourceInfo.kind === 'directory') throw new AssetsError('path-not-found', 'path is not a file')
      if (sourceInfo.kind !== 'file') throw new AssetsError('path-denied', 'source is not a safe regular file')
      const expected = await safe.hash(sourceRoot.path, basename(path))
      const total = Number(expected.size)
      const ext = extOf(basename(path))
      const type = bucketOf(ext)
      if (TEXT_LIKE_TYPES.has(type) && total <= SECRET_SCAN_MAX_BYTES) {
        if (typeof safe.openReadStream !== 'function') throw new AssetsError('storage-platform-unsupported', 'safe FD text privacy scan capability is unavailable')
        const opened = await safe.openReadStream(sourceRoot.path, basename(path), { expectedRoot: sourceRoot })
        try {
          const chunks = []
          let size = 0
          const hash = hashOf('sha256')
          for await (const chunk of opened.readable) {
            size += chunk.length
            if (size > SECRET_SCAN_MAX_BYTES) throw new AssetsError('plan-stale', 'text changed during privacy scan')
            chunks.push(chunk)
            hash.update(chunk)
          }
          if (hash.digest('hex') !== expected.sha256) throw new AssetsError('plan-stale', 'text changed during privacy scan')
          probe += `\n${Buffer.concat(chunks).toString('utf8')}`
        } finally { await opened.close() }
        if (SECRET_PATTERN.test(probe)) throw new AssetsError('secret-detected', 'refusing to store content that looks like a secret token')
      }
      const digest = expected.sha256
      const relRef = `artifacts/${digest.slice(0, 2)}/${digest}${ext}`
      const root = paths.dir || dirname(paths.artifactsFile)
      if (!opts.safeFS) fs.mkdirSync(root, { recursive: true, mode: 0o700 })
      let existing = null
      try { existing = await safe.hash(root, relRef) }
      catch (error) { if (error.code !== 'storage-offline') throw error }
      if (existing && existing.sha256 !== digest) throw new AssetsError('plan-stale', 'existing content-addressed blob has different bytes')
      if (!existing) {
        const stagedRel = `.omnimux-assets/upload/${randomUUID()}`
        await safe.copyVerify({ sourceRoot: sourceRoot.path, sourceRel: basename(path), root, targetRel: stagedRel, expected, reserve: 500 * 1024 * 1024 })
        await safe.install({ root, stagedRel, rel: relRef, sha256: digest })
      }
      const record = {
        id: newRecordId('art'), title: finalTitle, type, mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
        size: total, ownership: 'managed', content_ref: relRef,
        source: { agent: agent || 'unknown', model: strOrEmpty(src.model), prompt_hash: strOrEmpty(src.prompt_hash),
          run_id: runId, session_id: strOrEmpty(src.session_id), traced: agent !== '' && runId !== '' },
        input_refs: [], tags: [], created_at: new Date().toISOString(),
      }
      const next = { ...state, artifacts: [...state.artifacts, record], revision: state.revision + 1 }
      await safe.atomicJson(root, basename(paths.artifactsFile), next)
      state = next
      return { ...record, source: { ...record.source } }
    } finally {
      reporting = false
      if (!opts.safeFS) safe.dispose()
    }
  }

  function list(filter = {}) {
    const type = strOrEmpty(filter?.type).trim()
    return state.artifacts.filter((row) => !type || row.type === type).map((row) => ({ ...row, source: { ...row.source } }))
  }

  function get(id) {
    const found = state.artifacts.find((row) => row.id === id)
    return found ? { ...found, source: { ...found.source } } : null
  }

  function revision() { return state.revision }
  return { report, list, get, revision }
}
