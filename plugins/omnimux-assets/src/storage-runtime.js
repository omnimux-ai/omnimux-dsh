import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolveAssetsPaths, resolveStoragePaths } from './paths.js'
import { createLibraryStore } from './library.js'
import { createArtifactStore } from './artifacts.js'
import { createMappingStore, AssetsError } from './mappings.js'
import { SafeStorageFS } from './storage-fs.js'
import { LEDGERS, emptyLedger, validateLedger, validateRoot, sameRoot } from './storage-types.js'

/** Owns the Home writer, one immutable operation snapshot, and the root switch barrier. */
export class AssetsRuntime {
  constructor(home, fs = new SafeStorageFS()) {
    this.paths = resolveStoragePaths({ homeDir: home })
    this.fs = fs
    this.bundle = null
    this.config = null
    this.frozen = null
    this.readBarrier = false
    this.writers = 0
    this.readers = 0
    this.waiters = []
    this.error = null
    this.capabilities = { supported: false }
    this.migration = null
    this.fs.onFailure = (error) => { this.error = error; this.frozen ||= 'worker-failure' }
    this.ready = null
    this.legacyJob = null
    this.legacyError = null
    this.disposed = false
  }

  async initialize() {
    if (this.ready) return this.ready
    this.ready = this.initializeOnce()
    return this.ready
  }

  async initializeOnce() {
    try {
      this.capabilities = await this.fs.probe()
      // This is the stable application-owned Home control directory, never the selected user tree.
      mkdirSync(this.paths.controlDir, { recursive: true, mode: 0o700 })
      await this.fs.lock(this.paths.controlDir, 'owner.lock')
      this.config = await this.fs.readJson(this.paths.controlDir, 'root.json', true)
      if (this.config) validateRoot(this.config)
      await this.migration?.recover()
      if (!this.config) {
        mkdirSync(this.paths.defaultRoot, { recursive: true, mode: 0o700 })
        const identity = await this.fs.identity(this.paths.defaultRoot)
        this.config = { schema: 1, homeId: randomUUID(), epoch: 0, commitId: null,
          active: { path: identity.path, identity, rootId: randomUUID() } }
        await this.fs.lock(identity.path)
        const previousMarker = await this.fs.readJson(identity.path, '.omnimux-assets/root.json', true)
        if (previousMarker) throw new AssetsError('recovery-required', 'registered root has no Home pointer; restore control information before writing')
        for (const name of LEDGERS) {
          const ledger = await this.fs.readJson(identity.path, name, true)
          if (ledger) validateLedger(ledger, name)
          else await this.fs.atomicJson(identity.path, name, emptyLedger(name))
        }
        await this.fs.lock(identity.path)
        const marker = await this.fs.readJson(identity.path, '.omnimux-assets/root.json', true)
        if (marker && marker.magic !== 'omnimux-assets') throw new AssetsError('reserved-name-conflict', 'unknown root marker')
        await this.fs.atomicJson(identity.path, '.omnimux-assets/root.json', { magic: 'omnimux-assets', schema: 1, rootId: this.config.active.rootId, state: 'active' })
        await this.fs.atomicJson(this.paths.controlDir, 'root.json', this.config)
      }
      await this.installBundle(this.config)
    } catch (error) {
      this.error = error
    }
    return this.status()
  }

  async installBundle(config) {
    validateRoot(config)
    const identity = await this.fs.identity(config.active.path)
    if (!sameRoot(identity, config.active.identity)) throw new AssetsError('root-identity-changed', 'active directory identity changed')
    await this.fs.lock(config.active.path)
    const marker = await this.fs.readJson(config.active.path, '.omnimux-assets/root.json')
    if (marker?.rootId !== config.active.rootId || marker.magic !== 'omnimux-assets' || marker.state === 'retired') {
      throw new AssetsError('recovery-required', 'root marker is not active for this Home')
    }
    const transaction = await this.fs.readJson(config.active.path, '.omnimux-assets/transaction.json', true)
    if (transaction?.pending && transaction.commitId !== config.commitId) throw new AssetsError('recovery-required', 'root has pending ledger transaction')
    const ledgers = {}
    for (const name of LEDGERS) ledgers[name] = validateLedger(await this.fs.readJson(config.active.path, name), name)
    const bundle = this.createBundle(config, ledgers)
    this.config = config
    this.bundle = Object.freeze(bundle)
    this.error = null
  }

  createBundle(config, ledgers) {
    const paths = resolveAssetsPaths({ homeDir: this.paths.home, rootPath: config.active.path })
    return Object.freeze({ root: config, epoch: config.epoch, paths,
      library: createLibraryStore({ paths, disableLazy: true, safeFS: this.fs, initialState: ledgers['library.json'] }),
      artifacts: createArtifactStore({ paths, safeFS: this.fs, initialState: ledgers['artifacts.json'] }),
      mappings: createMappingStore({ paths, safeFS: this.fs, initialState: ledgers['mappings.json'] }) })
  }

  async checkAvailable() {
    if (this.error) throw this.error
    if (this.disposed) throw new AssetsError('storage-offline', 'runtime disposed')
    const current = validateRoot(await this.fs.readJson(this.paths.controlDir, 'root.json'))
    if (JSON.stringify(current) !== JSON.stringify(this.config)) throw new AssetsError('recovery-required', 'Home root pointer changed outside this runtime')
    if (!this.bundle) throw new AssetsError('storage-offline', 'asset library is unavailable')
    const identity = await this.fs.identity(this.config.active.path)
    if (!sameRoot(identity, this.config.active.identity)) throw new AssetsError('root-identity-changed', 'active library was replaced')
    const marker = await this.fs.readJson(this.config.active.path, '.omnimux-assets/root.json')
    if (marker.rootId !== this.config.active.rootId || marker.state !== 'active') throw new AssetsError('recovery-required', 'active root marker changed')
    const transaction = await this.fs.readJson(this.config.active.path, '.omnimux-assets/transaction.json', true)
    if (transaction?.pending && transaction.commitId !== this.config.commitId) throw new AssetsError('recovery-required', 'active ledger transaction changed')
    const ledgers = {}
    for (const name of LEDGERS) ledgers[name] = validateLedger(await this.fs.readJson(this.config.active.path, name), name)
    return this.createBundle(this.config, ledgers)
  }

  async operation(write, fn) {
    await this.initialize()
    if (this.error) throw this.error
    if (write && (this.frozen || this.writers > 0)) throw new AssetsError('storage-busy', 'migration owns the library; retry after recovery or completion')
    if (this.readBarrier) throw new AssetsError('storage-busy', 'root commit in progress; retry shortly')
    // Reserve before awaiting identity so freeze cannot race an admitted operation.
    if (write) this.writers += 1
    else this.readers += 1
    try {
      const bundle = await this.checkAvailable()
      const result = await fn(bundle)
      if (write) this.bundle = bundle
      return result
    } finally {
      if (write) this.writers -= 1
      else this.readers -= 1
      this.drain()
    }
  }

  read(fn) { return this.operation(false, fn) }
  write(fn) { return this.operation(true, fn) }

  /** Serialize compatibility work without retaining paths across a root switch. */
  async ensureLegacy() {
    await this.initialize()
    if (this.legacyJob) return this.legacyJob
    if (this.frozen || this.readBarrier || this.writers || this.disposed || !this.bundle?.library.hasLegacy()) return
    this.legacyJob = this.write((bundle) => bundle.library.materializeLegacy(bundle.mappings))
    try { await this.legacyJob; this.legacyError = null }
    catch (error) { this.legacyError = { code: error.code, message: error.message }; throw error }
    finally { this.legacyJob = null }
  }

  /** Transfer an admitted read lease to an already-open, helper-owned stream. */
  async preview(fn) {
    await this.initialize()
    if (this.readBarrier) throw new AssetsError('storage-busy', 'root commit in progress')
    this.readers += 1
    let opened = null
    let released = false
    const release = async () => {
      if (released) return
      released = true
      try { if (opened) await opened.close() }
      catch (error) { this.error = error; this.frozen ||= 'stream-close-failure' }
      finally { this.readers -= 1; this.drain() }
    }
    try {
      const bundle = await this.checkAvailable()
      const ref = await fn(bundle)
      if (typeof this.fs.openReadStream !== 'function') throw new AssetsError('storage-platform-unsupported', 'safe FD preview streaming capability is unavailable')
      opened = await this.fs.openReadStream(ref.storageRoot?.path ?? bundle.paths.dir, ref.relativePath, { expectedRoot: ref.storageRoot ?? bundle.root.active.identity })
      if (ref.expectedFingerprint && Object.entries(opened.identity).some(([key, value]) => ref.expectedFingerprint[key] !== value)) throw new AssetsError('plan-stale', 'preview fingerprint changed')
      opened.readable.once('end', () => { void release() })
      opened.readable.once('close', () => { void release() })
      opened.readable.once('error', () => { void release() })
      return { ...ref, readable: opened.readable, size: opened.size, release, epoch: bundle.epoch }
    } catch (error) { await release(); throw error }
  }

  drain() {
    for (const waiter of [...this.waiters]) {
      if (this.writers === 0 && (!waiter.reads || this.readers === 0)) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        waiter.resolve()
      }
    }
  }

  async freeze(taskId) {
    if (this.frozen && this.frozen !== taskId) throw new AssetsError('storage-busy', 'another task owns the library')
    this.frozen = taskId
    if (this.writers) await new Promise((resolve) => this.waiters.push({ resolve, reads: false }))
  }

  async beginCommit() {
    this.readBarrier = true
    if (this.writers || this.readers) await new Promise((resolve) => this.waiters.push({ resolve, reads: true }))
  }

  thaw() { this.frozen = null; this.readBarrier = false }

  status() {
    return { root: this.config?.active ?? { path: this.paths.defaultRoot }, defaultRoot: this.paths.defaultRoot,
      epoch: this.config?.epoch ?? 0, availability: this.error ? this.error.code : this.bundle ? 'online' : 'initializing',
      error: this.error ? { code: this.error.code, message: this.error.message } : null,
      capabilities: this.capabilities, frozen: Boolean(this.frozen), activeTask: this.migration?.task?.id ?? null }
  }

  dispose() { this.disposed = true; this.readBarrier = true; this.fs.dispose() }
}
