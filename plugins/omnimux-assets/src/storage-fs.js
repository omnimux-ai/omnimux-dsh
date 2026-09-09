import { spawn, spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { privatePythonRuntime, verifyPythonRuntime } from './python-runtime.js'

/** Small synchronous ledger/GC operations share the same FD-safe implementation. */
export function storageSync(op, args, execution = privatePythonRuntime()) {
  verifyPythonRuntime(execution)
  const result = spawnSync(execution.executable, execution.args, {
    env: execution.env,
    input: `${JSON.stringify({ ...args, op, id: 1 })}\n`, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024, timeout: 120000,
  })
  if (result.error || result.status !== 0) throw new AssetsError('storage-platform-unsupported', 'safe filesystem worker unavailable')
  const frames = result.stdout.trim().split('\n').map((line) => JSON.parse(line))
  const frame = frames.findLast((item) => item.result !== undefined || item.error)
  if (!frame) throw new AssetsError('recovery-required', 'worker returned no completion receipt')
  if (frame.error) throw new AssetsError(frame.error.code, frame.error.message)
  return frame.result
}

import { AssetsError } from './storage-types.js'

/** One non-detached worker owns FD locks until dispose or parent IPC EOF. */
export class SafeStorageFS {
  constructor(pythonPath) {
    this.requestedPythonPath = pythonPath
    this.execution = null
    this.pythonPath = null
    this.child = null
    this.pending = new Map()
    this.streams = new Map()
    this.disposed = false
    this.sequence = 0
    this.onFailure = () => {}
  }

  start() {
    if (this.disposed) throw new AssetsError('recovery-required', 'filesystem worker is disposed')
    if (this.child) return
    this.execution ??= privatePythonRuntime()
    if (this.requestedPythonPath != null && this.requestedPythonPath !== this.execution.executable) throw new AssetsError('storage-platform-unsupported', 'only the verified plugin-private Python is supported')
    verifyPythonRuntime(this.execution)
    this.pythonPath = this.execution.executable
    const child = spawn(this.execution.executable, this.execution.args, { env: this.execution.env, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    let buffer = ''
    let failed = false
    const fail = (error) => {
      if (failed) return
      failed = true
      child.kill()
      if (this.child === child) this.child = null
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
      this.pending.clear()
      for (const [readable, owner] of this.streams) {
        if (owner === child) readable.destroy(error)
      }
      this.onFailure(error)
    }
    child.on('error', () => fail(new AssetsError('storage-platform-unsupported', 'Python filesystem worker is unavailable')))
    child.on('exit', () => fail(new AssetsError('recovery-required', 'filesystem worker exited; recover before writing')))
    child.stderr.resume()
    child.stdout.once('end', () => {
      child.kill()
      fail(new AssetsError('recovery-required', 'filesystem worker output closed'))
    })
    child.stdin.on('error', () => fail(new AssetsError('recovery-required', 'filesystem worker input closed')))
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      if (buffer.length > 80 * 1024 * 1024) { child.kill(); return }
      let end = buffer.indexOf('\n')
      while (end >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        let frame
        try { frame = JSON.parse(line) } catch { child.kill(); return }
        const request = this.pending.get(frame.id)
        if (request) {
          clearTimeout(request.timer)
          if (frame.progress) {
            request.progress(frame.progress)
            request.timer = setTimeout(() => { child.kill() }, request.deadline)
          } else {
            this.pending.delete(frame.id)
            if (frame.error) request.reject(new AssetsError(frame.error.code, frame.error.message))
            else request.resolve(frame.result)
          }
        }
        end = buffer.indexOf('\n')
      }
    })
  }

  request(op, args = {}, progress = () => {}, deadline = 120000) {
    this.start()
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.child?.kill() }, deadline)
      this.pending.set(id, { resolve, reject, progress, timer, deadline })
      this.child.stdin.write(`${JSON.stringify({ ...args, op, id })}\n`, (error) => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(new AssetsError('recovery-required', 'worker IPC closed')) }
      })
    })
  }

  /**
   * Open a regular file once in the helper and pull bounded chunks from that FD.
   * @param {string} root Canonical absolute root (no symlink components).
   * @param {string} relativePath Root-relative POSIX file path.
   * @param {{expectedRoot?: {path: string, dev: string, ino: string, fsid: string}}} options
   * @returns {Promise<{readable: Readable, size: number, identity: object, close: () => Promise<void>}>}
   */
  async openReadStream(root, relativePath, { expectedRoot } = {}) {
    const opening = this.request('stream_open', { root, rel: relativePath, expectedRoot })
    const owner = this.child
    const opened = await opening
    const workerEnded = () => owner.exitCode !== null || owner.signalCode !== null
    let pulling = false
    let eof = false
    let closeError = null
    let finishClose
    const closed = new Promise((resolve) => { finishClose = resolve })
    const release = async () => {
      if (workerEnded()) return
      if (this.child !== owner || this.disposed || owner.stdin.writableEnded) {
        await new Promise((resolve) => owner.once('exit', resolve))
        return
      }
      try { await this.request('stream_close', { key: opened.key }) }
      catch (error) {
        if (!workerEnded()) {
          owner.kill()
          await new Promise((resolve) => owner.once('exit', resolve))
        }
        throw error
      }
    }
    const readable = new Readable({
      highWaterMark: 64 * 1024,
      autoDestroy: true,
      read: () => {
        if (pulling || eof || readable.destroyed) return
        if (this.child !== owner || this.disposed) {
          readable.destroy(new AssetsError('recovery-required', 'stream worker is unavailable'))
          return
        }
        pulling = true
        void this.request('stream_read', { key: opened.key }).then((frame) => {
          pulling = false
          if (readable.destroyed) return
          const chunk = Buffer.from(frame.data, 'base64')
          if (chunk.length > 64 * 1024) throw new AssetsError('recovery-required', 'oversized stream frame')
          eof = frame.eof
          if (chunk.length) readable.push(chunk)
          if (eof) readable.push(null)
        }).catch((error) => { pulling = false; readable.destroy(error) })
      },
      destroy: (error, callback) => {
        void release().then(() => callback(error), (failure) => {
          closeError = failure
          callback(error ?? failure)
        }).finally(() => {
          this.streams.delete(readable)
          finishClose()
        })
      },
    })
    // Failure can arrive before the caller attaches its listener; retain the error
    // on the stream without making a worker exit an unhandled process exception.
    readable.on('error', () => {})
    this.streams.set(readable, owner)
    if (this.child !== owner || this.disposed) readable.destroy(new AssetsError('recovery-required', 'stream worker closed during open'))
    return {
      readable, size: opened.size, identity: opened.identity,
      close: async () => {
        readable.destroy()
        await closed
        if (closeError) throw closeError
      },
    }
  }

  sync(op, args) {
    if (this.disposed) throw new AssetsError('recovery-required', 'filesystem worker is disposed')
    this.execution ??= privatePythonRuntime()
    return storageSync(op, args, this.execution)
  }
  probe() { return this.request('probe', {}, undefined, 10000) }
  identity(root) { return this.request('identity', { root }) }
  lock(root, rel = '.omnimux-assets/owner.lock') { return this.request('lock', { root, rel }) }
  unlock(lease) { return this.request('unlock', lease) }
  scan(root, progress) { return this.request('scan', { root }, progress) }
  hash(root, rel, progress) { return this.request('hash', { root, rel }, progress) }
  copyVerify(entry, progress) { return this.request('copy', entry, progress) }
  install(entry) { return this.request('install', entry) }
  atomicJson(root, rel, value) { return this.request('json', { root, rel, value }) }
  readJson(root, rel, optional = false) { return this.request('read', { root, rel, optional }) }
  mkdir(root, rel) { return this.request('mkdir', { root, rel }) }
  unlinkOwned(entry) { return this.request('unlink', entry) }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.child?.stdin.end()
    for (const readable of this.streams.keys()) readable.destroy()
  }
}
