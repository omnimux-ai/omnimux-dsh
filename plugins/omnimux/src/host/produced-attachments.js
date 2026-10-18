import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, lstatSync, realpathSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import {
  ComposerAttachmentError, ensureImportedDirectory, forbiddenSourcePathCode,
  IMPORTED_REL, isInsideDir, materializePaths, resolveSessionCwd,
} from './composer-attachments.js'

const sourcePattern = /^[a-z][a-z0-9-]{1,80}$/
const requestPattern = /^[a-zA-Z0-9_.:-]{1,160}$/
const hash = value => createHash('sha256').update(value).digest('hex')
const fail = (code, message = code) => { throw new ComposerAttachmentError(code, message) }
const publicFailure = code => ({ ok: false, error: code, message: code })

function waitForRequest(promise, signal) {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise((resolveResult, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolveResult, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

async function digestFile(path, signal) {
  signal?.throwIfAborted()
  const digest = createHash('sha256')
  for await (const bytes of createReadStream(path, { signal })) digest.update(bytes)
  signal?.throwIfAborted()
  return digest.digest('hex')
}

/**
 * Server-only bridge. No HTTP route accepts roots, cwd, or arbitrary file paths.
 * @param {{getSessionQuery: () => {observeSession?: Function} | null | undefined, receiptRoot: string}} options
 */
export function createProducedAttachmentService({ getSessionQuery, receiptRoot }) {
  const sources = new Map()
  const pending = new Map()

  function registerSource(sourcePlugin, root) {
    if (typeof sourcePlugin !== 'string' || !sourcePattern.test(sourcePlugin) || forbiddenSourcePathCode(root)) fail('invalid-attachment-source')
    let realRoot
    try {
      realRoot = realpathSync(root)
      if (!lstatSync(realRoot).isDirectory()) fail('invalid-attachment-source')
    } catch { fail('invalid-attachment-source') }
    const current = sources.get(sourcePlugin)
    if (current && current.realRoot !== realRoot) fail('attachment-source-conflict')
    const entry = current || { realRoot, roots: new Map() }
    const token = Symbol(sourcePlugin)
    entry.roots.set(token, resolve(root))
    sources.set(sourcePlugin, entry)
    return () => {
      entry.roots.delete(token)
      if (!entry.roots.size && sources.get(sourcePlugin) === entry) sources.delete(sourcePlugin)
    }
  }

  function resolveSource(entry, path) {
    const code = forbiddenSourcePathCode(path)
    if (code) fail(code)
    const absolute = resolve(path)
    if (![entry.realRoot, ...entry.roots.values()].some(root => isInsideDir(absolute, root))) fail('path-denied')
    try {
      const info = lstatSync(absolute)
      if (!info.isFile() || info.isSymbolicLink()) fail('not-a-file')
      const realPath = realpathSync(absolute)
      if (!isInsideDir(realPath, entry.realRoot)) fail('path-denied')
      return { path: realPath, size: info.size }
    } catch (error) {
      if (error instanceof ComposerAttachmentError) throw error
      fail('not-a-file')
    }
  }

  async function validPrevious(cwd, row, digest, signal) {
    if (!row?.ok || row.digest !== digest || typeof row.relativePath !== 'string') return false
    const path = resolve(cwd, row.relativePath)
    if (!isInsideDir(path, join(cwd, ...IMPORTED_REL.split('/')))) return false
    try {
      const info = lstatSync(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size !== row.size || realpathSync(path) !== path) return false
      return await digestFile(path, signal) === digest
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) return false
      throw error
    }
  }

  function publicResult(row) {
    if (!row.ok) return publicFailure(row.error)
    const { relativePath, title, extension, kind, size } = row
    return { ok: true, relativePath, title, extension, kind, size }
  }

  /**
   * @param {{ sessionId: string, sourcePlugin: string, files: {path: string, title?: string}[], requestId?: string }} input
   * @param {{signal?: AbortSignal}} [execution]
   * @returns {Promise<{results: {ok: boolean, relativePath?: string, title?: string, extension?: string, kind?: string, size?: number, error?: string, message?: string}[]}>}
   */
  async function materializeProduced(input, execution = {}) {
    const { sessionId, sourcePlugin, files, requestId } = input || {}
    const signal = execution.signal
    signal?.throwIfAborted()
    if (typeof sourcePlugin !== 'string' || !sourcePattern.test(sourcePlugin) || typeof sessionId !== 'string' || !sessionId.trim() || sessionId === 'default'
      || !Array.isArray(files) || !files.length || files.length > 32
      || files.some(file => !file || typeof file.path !== 'string' || (file.title !== undefined && typeof file.title !== 'string'))
      || (requestId !== undefined && (typeof requestId !== 'string' || !requestPattern.test(requestId)))) fail('invalid-payload')
    const entry = sources.get(sourcePlugin)
    if (!entry) fail('needs-attachment-source')
    const query = getSessionQuery?.()
    if (!query || typeof query.observeSession !== 'function') fail('needs-session-query')
    if (requestId && (!receiptRoot || !isAbsolute(receiptRoot))) fail('needs-attachment-storage')
    const fingerprint = hash(JSON.stringify({ sessionId, sourcePlugin, files }))
    const key = hash(JSON.stringify([sourcePlugin, sessionId, requestId || randomUUID()]))
    const previous = pending.get(key)
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('request-conflict')
      // A second caller's cancellation must not cancel the first caller's copy.
      const result = await waitForRequest(previous.promise, signal)
      signal?.throwIfAborted()
      return result
    }
    const promise = run().catch(error => {
      if (signal?.aborted || error?.name === 'AbortError') throw error
      fail(error instanceof ComposerAttachmentError ? error.code : 'attachment-copy-failed')
    })
    pending.set(key, { fingerprint, promise })
    try { return await promise } finally { pending.delete(key) }

    async function run() {
      const cwd = realpathSync(await resolveSessionCwd(sessionId, query))
      signal?.throwIfAborted()
      const receiptPath = requestId ? join(receiptRoot, `${key}.json`) : null
      let receipt = { fingerprint, cwd, results: [] }
      if (receiptPath) {
        await mkdir(receiptRoot, { recursive: true, mode: 0o700 })
        if (!lstatSync(receiptRoot).isDirectory() || lstatSync(receiptRoot).isSymbolicLink()) fail('attachment-storage-invalid')
        try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')) } catch (error) {
          if (error.code !== 'ENOENT') fail('attachment-receipt-invalid')
        }
        if (receipt.fingerprint !== fingerprint || receipt.cwd !== cwd) fail('request-conflict')
        if (!Array.isArray(receipt.results)) fail('attachment-receipt-invalid')
      }
      async function save() {
        if (!receiptPath) return
        const temp = `${receiptPath}.${randomUUID()}.tmp`
        try {
          await writeFile(temp, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' })
          await rename(temp, receiptPath)
        } catch (error) {
          try { await unlink(temp) } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') throw cleanupError }
          throw error
        }
      }
      const results = []
      for (const [index, file] of files.entries()) {
        signal?.throwIfAborted()
        let row
        try {
          if (sources.get(sourcePlugin) !== entry || !entry.roots.size) fail('needs-attachment-source')
          const source = resolveSource(entry, file.path)
          const digest = await digestFile(source.path, signal)
          const old = receipt.results[index]
          if (old?.ok && old.digest !== digest) fail('attachment-source-changed')
          if (await validPrevious(cwd, old, digest, signal)) row = old
          else {
            // Check target and source again immediately before the shared copier.
            ensureImportedDirectory(cwd)
            const verified = resolveSource(entry, file.path)
            if (verified.path !== source.path || verified.size !== source.size) fail('attachment-source-changed')
            const copied = (await materializePaths({ sessionId, paths: [verified.path], expectedDigests: [digest], resolveCwd: async () => cwd, signal })).results[0]
            if (!copied?.ok) fail(copied?.error || 'attachment-copy-failed')
            row = { ...publicResult(copied), digest, title: file.title?.trim() || copied.title }
          }
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError') throw error
          row = publicFailure(error instanceof ComposerAttachmentError ? error.code : 'attachment-copy-failed')
        }
        // Keep successful receipt rows when a later retry observes source failure.
        if (row.ok || !receipt.results[index]?.ok) receipt.results[index] = row
        await save()
        results.push(publicResult(row))
      }
      return { results }
    }
  }
  return { registerSource, materializeProduced }
}
