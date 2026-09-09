/**
 * Core-2 ArtifactStore: report validation + source backfill + sha256
 * content-addressed copy + index persistence + revision.
 * Only ever writes inside this plugin's own `artifacts/` area.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { bucketOf, extOf } from './scanner.js'
import { newRecordId, AssetsError } from './mappings.js'

const DEFAULT_FS = { copyFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync }

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
  '.html': 'text/html', '.htm': 'text/html',
  '.json': 'application/json', '.jsonl': 'application/jsonl', '.ndjson': 'application/x-ndjson',
}

/** Minimal v0.1 prompt-privacy guard: refuse obvious API tokens. */
const SECRET_PATTERN = /sk-[A-Za-z0-9]{8,}/

const TEXT_LIKE_TYPES = new Set(['document', 'html', 'json', 'other'])
const SECRET_SCAN_MAX_BYTES = 2 * 1024 * 1024

/**
 * @param {typeof DEFAULT_FS} fs
 * @param {string} file
 * @param {string} text
 */
function atomicWrite(fs, file, text) {
  fs.mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

/**
 * @param {unknown} value
 */
function strOrEmpty(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * @param {{ paths?: { artifactsFile: string, artifactsDir: string }, fs?: Partial<typeof DEFAULT_FS>, createHash?: typeof createHash }} [opts]
 */
export function createArtifactStore(opts = {}) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const hashOf = opts.createHash ?? createHash
  const paths = opts.paths ?? {}

  function loadState() {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.artifactsFile, 'utf8'))
      if (raw && typeof raw === 'object' && Array.isArray(raw.artifacts)) {
        const artifacts = raw.artifacts.filter(
          (row) => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.content_ref === 'string',
        )
        return { schema: 1, revision: Number(raw.revision) || 0, artifacts }
      }
    } catch {
      // fall through to empty index
    }
    return { schema: 1, revision: 0, artifacts: [] }
  }

  let state = loadState()

  function persist() {
    atomicWrite(fs, paths.artifactsFile, `${JSON.stringify(state, null, 2)}\n`)
  }

  /**
   * Copy one produced file into the content-addressed store and append an
   * index record. Source metadata gets default backfills (missing agent
   * becomes "unknown", traced stays false unless agent+run_id were given).
   * @param {string} filePath absolute path of the produced file on this machine
   * @param {{ agent?: string, model?: string, prompt_hash?: string, run_id?: string, session_id?: string }} [source]
   * @param {string} [title]
   */
  function report(filePath, source = {}, title) {
    const path = typeof filePath === 'string' ? filePath.trim() : ''
    if (!path) throw new AssetsError('path-not-found', 'file does not exist')

    let info
    try {
      info = fs.statSync(path)
    } catch {
      throw new AssetsError('path-not-found', 'file does not exist')
    }
    if (!info.isFile()) throw new AssetsError('path-not-found', 'path is not a file')

    const src = source && typeof source === 'object' ? source : {}
    const agent = typeof src.agent === 'string' ? src.agent.trim() : ''
    const runId = typeof src.run_id === 'string' ? src.run_id.trim() : ''
    const finalTitle = typeof title === 'string' && title.trim() !== '' ? title.trim() : basename(path)

    const buffer = fs.readFileSync(path)
    const ext = extOf(basename(path))
    const type = bucketOf(ext)

    // Minimal privacy guard: metadata plus small text-like payloads.
    let probe = [finalTitle, agent, runId, strOrEmpty(src.model), strOrEmpty(src.prompt_hash)].join('\n')
    if (TEXT_LIKE_TYPES.has(type) && buffer.length <= SECRET_SCAN_MAX_BYTES) {
      probe += `\n${buffer.toString('utf8')}`
    }
    if (SECRET_PATTERN.test(probe)) {
      throw new AssetsError('secret-detected', 'refusing to store content that looks like a secret token')
    }

    const digest = hashOf('sha256').update(buffer).digest('hex')
    const prefix = digest.slice(0, 2)
    const relRef = `artifacts/${prefix}/${digest}${ext}`
    const destPath = join(paths.artifactsDir, prefix, `${digest}${ext}`)
    let exists = false
    try {
      exists = fs.statSync(destPath).isFile()
    } catch {
      exists = false
    }
    if (!exists) {
      fs.mkdirSync(dirname(destPath), { recursive: true, mode: 0o700 })
      fs.copyFileSync(path, destPath)
    }

    const record = {
      id: newRecordId('art'),
      title: finalTitle,
      type,
      mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
      size: typeof info.size === 'number' ? info.size : buffer.length,
      content_ref: relRef,
      source: {
        agent: agent !== '' ? agent : 'unknown',
        model: strOrEmpty(src.model),
        prompt_hash: strOrEmpty(src.prompt_hash),
        run_id: runId,
        session_id: strOrEmpty(src.session_id),
        // traced only when the report carried both agent and run_id
        traced: agent !== '' && runId !== '',
      },
      input_refs: [],
      tags: [],
      created_at: new Date().toISOString(),
    }
    state.artifacts.push(record)
    state.revision += 1
    persist()
    return { ...record, source: { ...record.source } }
  }

  /**
   * @param {{ type?: string }} [filter]
   */
  function list(filter = {}) {
    const type = filter && typeof filter.type === 'string' ? filter.type.trim() : ''
    const rows = type
      ? state.artifacts.filter((row) => row.type === type)
      : state.artifacts.slice()
    return rows.map((row) => ({ ...row, source: { ...row.source } }))
  }

  /**
   * @param {string} id
   */
  function get(id) {
    const found = state.artifacts.find((row) => row.id === id)
    return found ? { ...found, source: { ...found.source } } : null
  }

  function revision() {
    return state.revision
  }

  return { report, list, get, revision }
}
