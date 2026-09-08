import { randomUUID } from 'node:crypto'
import { AssetsError } from './mappings.js'
import { StoragePlanner } from './storage-plan.js'
import { previewMimeOf } from './scanner.js'
import { LEDGERS, TERMINAL_STATES, digest, safeRelative, validateLedger } from './storage-types.js'
import { sameRoot } from './storage-types.js'

/** Persistent, single-task migration coordinator. Source bytes are never deleted during migration. */
export class MigrationService {
  constructor(runtime, planner = new StoragePlanner(runtime.fs), fs = runtime.fs) {
    this.runtime = runtime
    this.planner = planner
    this.fs = fs
    this.task = null
    this.plan = null
    this.decisions = {}
    this.running = null
    this.pauseRequested = false
    this.fault = async () => {}
    runtime.migration = this
  }

  get control() { return this.runtime.paths.controlDir }
  taskPath(name) { return `tasks/${this.task.id}/${name}` }
  async save() {
    const home = await this.fs.identity(this.control)
    if (home.freeBytes < 500 * 1024 * 1024 + Buffer.byteLength(JSON.stringify(this.task)) * 6) throw new AssetsError('disk-space-insufficient', 'Home recovery reserve unavailable')
    this.task.seq += 1
    await this.fs.atomicJson(this.control, this.taskPath('task.json'), this.task)
  }
  async phase(state) { this.task.state = state; this.task.progress.phase = state; await this.save(); await this.fault(state) }
  heartbeat(values = {}) { Object.assign(this.task.progress, values, { heartbeatAt: new Date().toISOString() }); this.task.seq += 1 }

  transferProgress(entryId) {
    this.task.progress.attemptCopyBytes = 0
    this.task.progress.attemptVerifyBytes = 0
    return (values) => {
      const totals = { currentEntryId: entryId }
      if (Number.isFinite(values.copyBytes)) totals.attemptCopyBytes = values.copyBytes
      if (Number.isFinite(values.verifyBytes)) totals.attemptVerifyBytes = values.verifyBytes
      this.heartbeat(totals)
    }
  }

  launch(fn) {
    if (this.running) throw new AssetsError('storage-busy', 'task operation already running')
    const heartbeat = setInterval(() => this.heartbeat(), 500)
    this.running = fn().catch(async (error) => {
      this.task.error = { code: error.code || 'internal', message: error.message }
      this.task.resumePhase = this.task.state
      const nextPhase = this.task.state === 'committing' ? 'recovery_required' : error.code === 'storage-offline' ? 'waiting_volume' : 'failed_recoverable'
      if (nextPhase === 'failed_recoverable' || nextPhase === 'recovery_required') {
        this.task.progress.errorCount = (this.task.progress.errorCount || 0) + 1
      }
      await this.phase(nextPhase).catch(() => {})
    }).finally(() => { clearInterval(heartbeat); this.running = null })
    return { taskId: this.task.id }
  }

  assertTask(id, expectedSeq) {
    if (!this.task || id !== this.task.id) throw new AssetsError('path-not-found', 'migration task not found')
    if (expectedSeq != null && expectedSeq !== this.task.seq) throw new AssetsError('plan-stale', 'task changed; refresh before confirming')
  }

  async preflight(targetPath, expectedEpoch, requestId) {
    await this.runtime.initialize()
    await this.runtime.checkAvailable()
    if (this.running || this.exclusiveOperation) throw new AssetsError('storage-busy', 'task operation already running')
    if (!this.runtime.capabilities.supported) throw new AssetsError('storage-platform-unsupported', 'safe filesystem capabilities required')
    if (this.task && !TERMINAL_STATES.has(this.task.state)) {
      if (this.task.requestId === requestId && requestId) return { taskId: this.task.id }
      throw new AssetsError('storage-busy', 'finish or abandon the existing migration first')
    }
    if (expectedEpoch !== this.runtime.config.epoch) throw new AssetsError('stale-root', 'root epoch changed')
    const target = await this.fs.identity(targetPath)
    const control = await this.fs.identity(this.control)
    if (target.path === control.path || target.path.startsWith(`${control.path}/`) || control.path.startsWith(`${target.path}/`)) {
      throw new AssetsError('path-denied', 'target overlaps stable recovery control directory')
    }
    const id = randomUUID()
    this.task = { schema: 1, id, requestId, seq: 0, decisionRevision: 0, state: 'checking', rootEpoch: expectedEpoch,
      source: this.runtime.config.active, target, confirmedAt: null, error: null,
      progress: { phase: 'checking', scannedItems: 0, totalItems: null, completedFiles: 0, copyBytes: 0, verifyBytes: 0, skippedCount: 0, errorCount: 0, heartbeatAt: new Date().toISOString() } }
    this.plan = null
    this.decisions = {}
    await this.fs.atomicJson(this.control, 'active-task.json', { schema: 1, id })
    await this.save()
    return this.launch(async () => {
      const snapshot = await this.planner.scan(this.task.source.path, target.path, (progress) => this.heartbeat(progress))
      this.plan = this.planner.build(snapshot)
      if (this.plan.noop) { await this.phase('completed'); return }
      // The durable task id, not a second planner UUID, owns every recovery reference.
      const oldId = this.plan.id
      this.plan = JSON.parse(JSON.stringify(this.plan).replaceAll(oldId, id))
      this.plan.control = control
      this.plan.summary = this.planner.summarize(this.plan, this.decisions, control)
      this.plan.requiredBytes = this.plan.summary.space.find((row) => row.roots.some((root) => root.role === 'target')).requiredBytes
      this.plan.blockers = this.plan.blockers.filter((row) => row.reason !== 'disk-space-insufficient')
      for (const row of this.plan.summary.space) if (row.freeBytes < row.requiredBytes) this.plan.blockers.push({ reason: 'disk-space-insufficient', ...row })
      delete this.plan.planHash
      this.plan.planHash = digest(this.plan)
      this.task.planHash = this.plan.planHash
      this.task.summary = this.plan.summary
      this.task.progress.scannedItems = snapshot.sourceScan.entries.length + snapshot.targetScan.entries.length + snapshot.sourceScan.excluded.length + snapshot.targetScan.excluded.length
      this.task.progress.totalItems = this.plan.entries.length
      this.task.progress.totalCopyBytes = this.plan.summary.copyBytes
      this.task.progress.totalVerifyBytes = this.plan.summary.totalVerifyBytes
      await this.fs.atomicJson(this.control, this.taskPath('plan.json'), this.plan)
      await this.fs.atomicJson(this.control, this.taskPath('decisions.json'), this.decisions)
      await this.phase('awaiting_confirmation')
    })
  }

  entries(id, { kind = '', cursor = 0, limit = 100, planHash, decisionRevision, unmigratedSetHash } = {}) {
    this.assertTask(id)
    if ((planHash != null && planHash !== this.plan?.planHash) ||
        (decisionRevision != null && Number(decisionRevision) !== this.task.decisionRevision) ||
        (unmigratedSetHash != null && unmigratedSetHash !== this.task.unmigratedSetHash)) throw new AssetsError('plan-stale', 'entry snapshot changed')
    const rows = kind === 'adopted' ? (this.plan?.targetValues['library.json'].assets ?? []).flatMap((asset) => asset.files.map((file) => ({ id: `${asset.id}:${file.id}`, operation: 'adopted', recordId: asset.id, fileId: file.id, targetRel: file.relative_path, logical_path: file.logical_path, status: file.status, ownership: file.ownership }))) :
      kind === 'versions' ? (this.plan?.entries ?? []).filter((entry) => this.decisions[entry.id]?.action === 'overwrite').map((entry) => ({ ...entry, operation: 'versions', recoveryRel: `.omnimux-assets/versions/${this.task.id}/${entry.id}` })) :
      kind === 'excluded' ? this.plan?.exclusions ?? [] : kind === 'unmigrated' ? this.task.unmigrated ?? [] :
      (this.plan?.entries ?? []).filter((entry) => !kind || (kind === 'conflict' ? entry.operation.includes('conflict') : entry.operation === kind))
    const start = Number(cursor); const count = Number(limit)
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 1 || count > 200) throw new AssetsError('invalid-page', 'invalid entry page')
    return { entries: rows.slice(start, start + count).map((entry) => ({ ...entry, decision: this.decisions[entry.id] ?? null })), nextCursor: start + count < rows.length ? start + count : null,
      total: rows.length, decisionRevision: this.task.decisionRevision, unmigratedSetHash: this.task.unmigratedSetHash,
      blockers: this.plan?.blockers ?? [], planHash: this.plan?.planHash, conflictSetHash: this.plan?.conflictSetHash }
  }

  async preview(id, entryId, side) {
    this.assertTask(id)
    if (!['source', 'target'].includes(side)) throw new AssetsError('path-denied', 'invalid preview side')
    const entry = this.plan?.entries.find((row) => row.id === entryId)
    if (!entry) throw new AssetsError('path-denied', 'preview entry is not in this plan')
    const receipt = await this.receipt(entry)
    const root = this.plan[side]
    const relativePath = side === 'source' ? entry.sourceRel : receipt?.originalHash ? receipt.backupRel : entry.targetRel
    const expectedFingerprint = side === 'source' ? entry.sourceFingerprint : receipt?.originalHash ? receipt.backupIdentity : entry.targetFingerprint
    if (!expectedFingerprint || (Number(expectedFingerprint.mode) & 0o170000) !== 0o100000) throw new AssetsError('path-denied', 'preview requires a planned regular file')
    const mime = previewMimeOf(entry.sourceRel)
    if (!mime) throw new AssetsError('path-unsupported', 'unsupported preview media')
    return this.runtime.preview(() => ({ storageRoot: root, relativePath, expectedFingerprint, mime }))
  }

  assertDecision(input) {
    if (input.expectedDecisionRevision != null) {
      if (input.expectedDecisionRevision !== this.task.decisionRevision) throw new AssetsError('plan-stale', 'decision revision changed')
    } else if (input.expectedSeq != null && input.expectedSeq !== this.task.seq) {
      throw new AssetsError('plan-stale', 'legacy task token changed')
    }
  }

  async decide(id, input) {
    this.assertTask(id)
    this.assertDecision(input)
    if (this.running || !['awaiting_confirmation', 'waiting_conflict', 'paused'].includes(this.task.state)) throw new AssetsError('storage-busy', 'cannot change decisions in this phase')
    if (input.planHash !== this.plan.planHash) throw new AssetsError('plan-stale', 'plan token changed')
    let decisions = input.entries
    if (input.conflictSetHash) {
      if (input.conflictSetHash !== this.plan.conflictSetHash || !['overwrite', 'skip'].includes(input.action)) throw new AssetsError('plan-stale', 'batch conflict set changed')
      decisions = this.plan.entries.filter((entry) => entry.operation === 'conflict').map((entry) => ({ id: entry.id, action: input.action, expectedFingerprint: entry.fingerprint }))
    }
    if (!Array.isArray(decisions) || !decisions.length) throw new AssetsError('conflict-required', 'explicit conflict decisions required')
    const next = structuredClone(this.decisions)
    for (const decision of decisions) {
      const entry = this.plan.entries.find((row) => row.id === decision.id)
      if (!entry || !entry.operation.includes('conflict') || decision.expectedFingerprint !== entry.fingerprint || !['overwrite', 'skip', 'keep-both'].includes(decision.action)) {
        throw new AssetsError('plan-stale', 'decision is outside the displayed conflict set')
      }
      if (decision.action === 'overwrite' && entry.operation !== 'conflict') throw new AssetsError('path-denied', 'structure and hardlink conflicts cannot be overwritten')
      if (decision.action === 'keep-both') {
        safeRelative(decision.newName)
        if (['.omnimux-assets', ...LEDGERS].includes(decision.newName.split('/')[0])) throw new AssetsError('reserved-name-conflict', 'destination is an application control path')
        if (this.plan.entries.some((row) => row.id !== entry.id && (row.targetRel === decision.newName || next[row.id]?.newName === decision.newName))) throw new AssetsError('name-conflict', 'destination is already in this plan')
        if (decision.newName === entry.targetRel) throw new AssetsError('name-conflict', 'choose a different destination')
      }
      const members = entry.groupEntries ? this.plan.entries.filter((row) => entry.groupEntries.includes(row.id)) : [entry]
      for (const member of members) {
        if (await this.receipt(member)) throw new AssetsError('conflict-required', 'an executed decision cannot be changed; resume or compensate first')
        const newName = decision.action === 'keep-both' ? decision.newName + (entry.conflictPrefix ? member.sourceRel.slice(entry.conflictPrefix.length) : '') : undefined
        if (newName) {
          safeRelative(newName)
          await this.fs.request('destination', { root: this.plan.target.path, rel: newName })
          const key = newName.normalize('NFD').toLowerCase()
          if (this.plan.entries.some((row) => !members.includes(row) && (next[row.id]?.newName ?? row.targetRel).normalize('NFD').toLowerCase() === key)) throw new AssetsError('name-conflict', 'new destination aliases another planned path')
        }
        next[member.id] = { action: decision.action, ...(newName ? { newName } : {}), fingerprint: member.fingerprint,
          ...(entry.conflictPrefix ? { oldPrefix: entry.conflictPrefix, newPrefix: decision.newName, groupId: entry.groupId } : {}) }
      }
    }
    if (digest(next) === digest(this.decisions)) return { ok: true, decisionRevision: this.task.decisionRevision }
    if (this.exclusiveOperation) throw new AssetsError('storage-busy', 'decision write already running')
    this.exclusiveOperation = true
    try {
      this.assertDecision(input)
      const revision = this.task.decisionRevision + 1
      await this.fs.atomicJson(this.control, this.taskPath('decisions.json'), { schema: 1, planHash: this.plan.planHash, revision, entries: next })
      this.decisions = next
      this.task.decisionRevision = revision
      this.task.summary = this.planner.summarize(this.plan, next, this.plan.control)
      this.task.progress.totalCopyBytes = this.task.summary.copyBytes
      this.task.progress.totalVerifyBytes = this.task.summary.totalVerifyBytes
      await this.save()
      return { ok: true, decisionRevision: revision }
    } finally { this.exclusiveOperation = false }
  }

  async confirm(id, input) {
    this.assertTask(id)
    this.assertDecision(input)
    if (this.exclusiveOperation) throw new AssetsError('storage-busy', 'decision write in progress')
    if (input.confirm !== true || input.planHash !== this.plan?.planHash) throw new AssetsError('plan-stale', 'confirm the displayed plan explicitly')
    if (this.task.state !== 'awaiting_confirmation' || this.running) throw new AssetsError('storage-busy', 'plan is not awaiting confirmation')
    if (this.plan.blockers.length) throw new AssetsError('conflict-required', 'resolve blocking entries before migration')
    if (this.plan.entries.some((entry) => entry.operation.includes('conflict') && !this.decisions[entry.id])) throw new AssetsError('conflict-required', 'decide every conflict before starting')
    await this.checkSpace()
    for (const decision of Object.values(this.decisions)) if (decision.newName) await this.fs.request('destination', { root: this.plan.target.path, rel: decision.newName })
    this.task.confirmedAt = new Date().toISOString()
    await this.save()
    return this.launch(async () => {
      await this.phase('freezing')
      await this.runtime.freeze(id)
      await this.prepareTarget()
      await this.runEntries()
    })
  }

  async receipt(entry) { return await this.fs.readJson(this.control, this.taskPath(`entries/${entry.id}.json`), true) }
  async writeReceipt(entry, receipt) {
    await this.fs.atomicJson(this.control, this.taskPath(`entries/${entry.id}.json`), receipt)
    await this.fault(receipt.phase)
  }

  async optionalHash(root, rel) {
    const row = await this.fs.request('stat', { root, rel, optional: true })
    return row ? this.fs.hash(root, rel) : null
  }

  /** Retain ambiguous leftovers; persist a fresh attempt before creating bytes. */
  async copyAttempt(entry, receipt, field, sourceRoot, sourceRel, expected) {
    await this.checkSpace()
    let actual = await this.optionalHash(this.plan.target.path, receipt[field])
    let reusable = actual && actual.sha256 === expected.sha256 && actual.mtimeNs === expected.mtimeNs && (Number(actual.mode) & 0o777) === (Number(expected.mode) & 0o777)
    if (reusable) {
      const sourceMetadata = await this.fs.request('metadata', { root: sourceRoot, rel: sourceRel })
      const stagedMetadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: receipt[field] })
      reusable = sourceMetadata.provenanceHash === stagedMetadata.provenanceHash && !stagedMetadata.extendedMetadata.some((name) => name !== 'com.apple.provenance')
    }
    if (actual && !reusable) {
      receipt.retained ||= []
      receipt.retained.push({ rel: receipt[field], identity: actual })
      this.task.retainedBytes = (this.task.retainedBytes ?? 0) + Number(actual.size)
      await this.save()
      receipt[field] = `${receipt[field]}-${randomUUID()}`
      await this.writeReceipt(entry, receipt)
      actual = null
    }
    if (!actual) actual = await this.fs.copyVerify({ sourceRoot, sourceRel, root: this.plan.target.path,
      targetRel: receipt[field], expected, reserve: this.plan.reserve, protectMetadata: true }, this.transferProgress(entry.id))
    if (actual.sha256 !== expected.sha256) throw new AssetsError('plan-stale', 'copy differs from confirmed content')
    const [sourceMetadata, copiedMetadata] = await Promise.all([
      this.fs.request('metadata', { root: sourceRoot, rel: sourceRel }),
      this.fs.request('metadata', { root: this.plan.target.path, rel: receipt[field] }),
    ])
    if (actual.mtimeNs !== expected.mtimeNs || (Number(actual.mode) & 0o777) !== (Number(expected.mode) & 0o777) ||
        sourceMetadata.provenanceHash !== copiedMetadata.provenanceHash ||
        copiedMetadata.extendedMetadata.some((name) => name !== 'com.apple.provenance')) throw new AssetsError('metadata-unsupported', 'staged metadata differs; original retained')
    return actual
  }

  async prepareTarget() {
    await this.fs.lock(this.plan.source.path)
    await this.fs.lock(this.plan.target.path)
    await this.verifyIdentity()
    const transaction = await this.fs.readJson(this.plan.target.path, '.omnimux-assets/transaction.json', true)
    const marker = await this.fs.readJson(this.plan.target.path, '.omnimux-assets/root.json', true)
    if (transaction?.pending && transaction.taskId !== this.task.id) throw new AssetsError('storage-busy', 'target belongs to another transaction')
    if (!this.task.targetPrepared && transaction?.pending && transaction.taskId === this.task.id) {
      this.task.targetPrepared = true
      this.task.targetMarkerBefore = this.plan.targetMarker ?? null
      await this.save()
    }
    if (!this.task.targetPrepared) {
      await this.planner.validate(this.plan, true)
      this.task.targetPrepared = true
      this.task.targetMarkerBefore = marker
      this.task.targetTransactionBefore = transaction
      await this.save()
    } else if (marker && marker.rootId !== this.plan.targetRootId) {
      throw new AssetsError('root-identity-changed', 'target marker was replaced')
    }
    await this.fs.atomicJson(this.plan.target.path, '.omnimux-assets/transaction.json', { schema: 1, pending: true,
      taskId: this.task.id, homeId: this.runtime.config.homeId, commitId: this.task.id })
    await this.fs.atomicJson(this.plan.target.path, '.omnimux-assets/root.json', { magic: 'omnimux-assets', schema: 1,
      rootId: this.plan.targetRootId, state: 'pending' })
  }

  async verifyIdentity() {
    if (!sameRoot(await this.fs.identity(this.plan.source.path), this.plan.source) || !sameRoot(await this.fs.identity(this.plan.target.path), this.plan.target)) {
      throw new AssetsError('root-identity-changed', 'source or target identity changed')
    }
  }

  async rebuildProgress() {
    const totals = { completedFiles: 0, skippedCount: 0, copyBytes: 0, verifyBytes: 0, payloadVerifyBytes: 0, versionVerifyBytes: 0, versionCopyBytes: 0 }
    for (const entry of this.plan.entries) {
      const receipt = await this.receipt(entry)
      if (receipt?.phase === 'skipped') totals.skippedCount++
      if (receipt?.originalHash) {
        await this.verifyInstalled(entry, { sha256: receipt.originalHash, targetRel: receipt.backupRel, afterIdentity: receipt.backupIdentity, provenanceHash: receipt.backupProvenanceHash })
        totals.versionVerifyBytes += Number(receipt.backupIdentity.size)
        totals.versionCopyBytes += Number(receipt.backupIdentity.size)
      }
      if (receipt?.phase !== 'installed_verified') continue
      totals.completedFiles++
      if (entry.kind === 'file' && !receipt.reused) totals.copyBytes += entry.bytes
      if (entry.kind === 'file') totals.payloadVerifyBytes += entry.bytes
    }
    totals.verifyBytes = totals.payloadVerifyBytes + totals.versionVerifyBytes
    this.heartbeat({ ...totals, attemptCopyBytes: 0, attemptVerifyBytes: 0 })
  }

  async checkSpace() {
    const key = `${this.plan.id}:${this.task.decisionRevision}:${this.task.retainedBytes ?? 0}`
    if (this.spaceKey !== key) { this.spaceSummary = this.planner.summarize({ ...this.plan, retainedBytes: this.task.retainedBytes ?? 0 }, this.decisions, this.plan.control); this.spaceKey = key }
    const summary = this.spaceSummary
    for (const volume of summary.space) {
      const identity = await this.fs.identity(volume.roots[0].path)
      const required = this.task.targetPrepared ? volume.reserve + volume.costs.journal : volume.requiredBytes
      if (identity.freeBytes < required) throw new AssetsError('disk-space-insufficient', 'migration volume reserve unavailable')
    }
    this.task.summary = summary
  }

  /** Persist staged inode ownership before exposing a directory in the user tree. */
  async ensureDirectory(rel, sourceRel, expected) {
    const receiptPath = this.taskPath(`directories/${digest(rel)}.json`)
    let receipt = await this.fs.readJson(this.control, receiptPath, true)
    const existing = await this.fs.request('stat', { root: this.plan.target.path, rel, optional: true })
    if (existing) {
      if (existing.kind !== 'directory' || (receipt?.createdIdentity && ['dev', 'ino'].some((key) => existing.identity[key] !== receipt.createdIdentity[key]))) {
        throw new AssetsError('plan-stale', 'directory ownership changed; external destination retained')
      }
      if (!receipt) return { reused: true, identity: existing.identity }
    } else {
      if (receipt?.phase === 'installed') throw new AssetsError('plan-stale', 'installed directory disappeared')
      if (!receipt) {
        const stagedRel = `.omnimux-assets/transactions/${this.task.id}/directories/${randomUUID()}`
        await this.fs.mkdir(this.plan.target.path, stagedRel)
        const staged = await this.fs.request('stat', { root: this.plan.target.path, rel: stagedRel })
        receipt = { rel, sourceRel, expected, stagedRel, createdIdentity: staged.identity, phase: 'prepared' }
        await this.fs.atomicJson(this.control, receiptPath, receipt)
      }
      await this.fs.request('install_directory', { root: this.plan.target.path, rel, stagedRel: receipt.stagedRel, expected: receipt.createdIdentity })
    }
    receipt.phase = 'installed'
    const installed = await this.fs.request('stat', { root: this.plan.target.path, rel })
    receipt.installedIdentity = installed.identity
    await this.fs.atomicJson(this.control, receiptPath, receipt)
    return { reused: false, identity: receipt.createdIdentity }
  }

  async prepareDirectories(entry, targetRel) {
    const sourceParts = entry.sourceRel.split('/').slice(0, -1)
    const targetParts = targetRel.split('/').slice(0, -1)
    for (let index = 0; index < targetParts.length; index++) {
      const rel = targetParts.slice(0, index + 1).join('/')
      const sourceRel = sourceParts.slice(0, index + 1 - (targetParts.length - sourceParts.length)).join('/')
      const directory = this.plan.directories?.find((row) => row.relative_path === sourceRel)
      await this.ensureDirectory(rel, sourceRel, directory?.identity ?? null)
    }
  }

  async finalizeDirectories() {
    const scan = await this.fs.request('scan', { root: this.control, rel: this.taskPath('directories'), metadataOnly: true }).catch((error) => {
      if (error.code === 'storage-offline') return { entries: [] }
      throw error
    })
    const receipts = []
    for (const row of scan.entries.filter((row) => row.kind === 'file')) receipts.push(await this.fs.readJson(this.control, row.relative_path))
    receipts.sort((a, b) => b.rel.split('/').length - a.rel.split('/').length)
    for (const receipt of receipts) {
      if (receipt.expected) {
        await this.fs.request('directory_metadata', { root: this.plan.target.path,
          rel: receipt.rel, sourceRoot: this.plan.source.path, sourceRel: receipt.sourceRel, expected: receipt.expected, createdIdentity: receipt.createdIdentity })
      }
      const actual = await this.fs.request('stat', { root: this.plan.target.path, rel: receipt.rel })
      const metadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: receipt.rel })
      receipt.phase = 'finalized'
      receipt.finalizedIdentity = actual.identity
      receipt.finalizedMetadata = metadata
      await this.fs.atomicJson(this.control, this.taskPath(`directories/${digest(receipt.rel)}.json`), receipt)
      const entry = this.plan.entries.find((e) => (e.operation === 'mkdir' || (e.kind === 'directory' && this.decisions[e.id]?.action === 'keep-both')) &&
        (this.decisions[e.id]?.newName || e.targetRel) === receipt.rel)
      if (entry) {
        const entryReceipt = await this.receipt(entry)
        if (entryReceipt) {
          entryReceipt.afterIdentity = actual.identity
          entryReceipt.provenanceHash = metadata.provenanceHash ?? null
          entryReceipt.finalizedMetadata = metadata
          await this.writeReceipt(entry, entryReceipt)
        }
      }
    }
  }

  async runEntries() {
    await this.verifyIdentity()
    await this.checkSpace()
    await this.rebuildProgress()
    await this.phase('copying')
    for (const entry of this.plan.entries) {
      if (this.pauseRequested) { this.pauseRequested = false; await this.phase('paused'); return }
      await this.verifyIdentity()
      const decision = this.decisions[entry.id]
      let receipt = await this.receipt(entry)
      const targetRel = decision?.action === 'keep-both' ? decision.newName : entry.targetRel
      if (receipt?.phase === 'installed_verified') {
        await this.verifyInstalled(entry, receipt)
        continue
      }
      if (receipt?.phase === 'skipped') continue
      if (entry.operation === 'unmigrated' || decision?.action === 'skip') {
        await this.writeReceipt(entry, { entryId: entry.id, phase: 'skipped', sourceRel: entry.sourceRel })
        this.task.progress.skippedCount += 1
        continue
      }
      if (entry.operation !== 'reuse') await this.prepareDirectories(entry, targetRel)
      if (entry.operation === 'mkdir' || (entry.kind === 'directory' && decision?.action === 'keep-both')) {
        const directory = await this.ensureDirectory(targetRel, entry.sourceRel, entry.sourceFingerprint)
        if (directory.reused && decision?.action === 'keep-both') throw new AssetsError('plan-stale', 'unowned keep-both destination')
        await this.writeReceipt(entry, { entryId: entry.id, kind: 'directory', phase: 'installed_verified', targetRel, reused: directory.reused, afterIdentity: directory.identity })
        continue
      }
      if (entry.operation === 'reuse') {
        const source = await this.fs.hash(this.plan.source.path, entry.sourceRel)
        if (digest(source) !== digest(entry.sourceFingerprint)) throw new AssetsError('plan-stale', 'reuse source changed after planning')
        const actual = await this.fs.hash(this.plan.target.path, targetRel)
        if (actual.sha256 !== entry.sourceFingerprint.sha256 || actual.mtimeNs !== source.mtimeNs || (Number(actual.mode) & 0o777) !== (Number(source.mode) & 0o777)) throw new AssetsError('plan-stale', 'reused content or metadata changed')
        const metadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: targetRel })
        const sourceMetadata = await this.fs.request('metadata', { root: this.plan.source.path, rel: entry.sourceRel })
        if (metadata.extendedMetadata.some((name) => name !== 'com.apple.provenance') || metadata.provenanceHash !== sourceMetadata.provenanceHash) throw new AssetsError('plan-stale', 'reused target metadata changed')
        await this.writeReceipt(entry, { entryId: entry.id, phase: 'installed_verified', targetRel, sha256: actual.sha256, afterIdentity: actual, provenanceHash: metadata.provenanceHash ?? null, reused: true })
        continue
      }
      if (entry.kind !== 'file') throw new AssetsError('conflict-required', 'directory structure conflict must be skipped')
      const stagedRel = `.omnimux-assets/transactions/${this.task.id}/payload/${entry.id}`
      const backupRel = `.omnimux-assets/versions/${this.task.id}/${entry.id}`
      receipt ||= { entryId: entry.id, phase: 'planned', targetRel, stagedRel, backupRel, sha256: entry.sourceFingerprint.sha256 }
      await this.writeReceipt(entry, receipt)
      // An install may have committed before its completion receipt reached disk.
      if (['installing', 'installed_verified'].includes(receipt.phase)) {
        let actual = null
        try { actual = await this.fs.hash(this.plan.target.path, targetRel) }
        catch (error) { if (error.code !== 'storage-offline') throw error }
        if (actual?.sha256 === receipt.sha256) {
          if (!receipt.stagedIdentity || actual.ino !== receipt.stagedIdentity.ino || actual.dev !== receipt.stagedIdentity.dev) {
            throw new AssetsError('plan-stale', 'installed identity is not the staged inode')
          }
          if (['mode', 'mtimeNs', 'size'].some((key) => actual[key] !== receipt.stagedIdentity[key])) throw new AssetsError('plan-stale', 'interrupted install metadata changed')
          const metadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: targetRel })
          if (metadata.extendedMetadata.some((name) => name !== 'com.apple.provenance') || (receipt.provenanceHash !== undefined && (metadata.provenanceHash ?? null) !== receipt.provenanceHash)) throw new AssetsError('plan-stale', 'interrupted install attributes changed')
          receipt.phase = 'installed_verified'; receipt.afterIdentity = actual; await this.writeReceipt(entry, receipt); continue
        }
        // The write-ahead intent can survive even though install never ran.
        // Retry only the verified pre-install state, never an unknown destination.
        const overwrite = decision?.action === 'overwrite'
        if ((!overwrite && actual) || (overwrite && digest(actual) !== digest(entry.targetFingerprint))) {
          throw new AssetsError('plan-stale', 'interrupted install has unknown destination bytes')
        }
        const staged = await this.fs.hash(this.plan.target.path, receipt.stagedRel)
        if (staged.sha256 !== receipt.sha256) throw new AssetsError('plan-stale', 'interrupted staged content changed')
        receipt.phase = overwrite ? 'backup_verified' : 'staged_verified'
      }
      if (receipt.phase === 'planned') {
        const staged = await this.copyAttempt(entry, receipt, 'stagedRel', this.plan.source.path, entry.sourceRel, entry.sourceFingerprint)
        receipt.phase = 'staged_verified'; receipt.stagedHash = staged.sha256; receipt.stagedIdentity = staged
        receipt.provenanceHash = (await this.fs.request('metadata', { root: this.plan.target.path, rel: receipt.stagedRel })).provenanceHash ?? null
        await this.writeReceipt(entry, receipt)
      }
      const overwrite = decision?.action === 'overwrite'
      if (overwrite && receipt.phase === 'staged_verified') {
        const backup = await this.copyAttempt(entry, receipt, 'backupRel', this.plan.target.path, targetRel, entry.targetFingerprint)
        receipt.phase = 'backup_verified'; receipt.originalHash = backup.sha256; receipt.backupIdentity = backup
        receipt.backupProvenanceHash = (await this.fs.request('metadata', { root: this.plan.target.path, rel: receipt.backupRel })).provenanceHash ?? null
        await this.writeReceipt(entry, receipt)
      }
      receipt.phase = 'installing'
      await this.writeReceipt(entry, receipt)
      const installed = await this.fs.install({ root: this.plan.target.path, stagedRel: receipt.stagedRel, rel: targetRel,
        sha256: entry.sourceFingerprint.sha256, ...(overwrite ? { expected: entry.targetFingerprint, backupRel: receipt.backupRel } : {}) })
      receipt.phase = 'installed_verified'; receipt.afterIdentity = installed
      await this.writeReceipt(entry, receipt)
      this.task.progress.completedFiles += 1
      await this.save()
    }
    await this.finalizeDirectories()
    await this.rebuildProgress()
    await this.phase('verifying')
    const after = await this.buildLedgers()
    this.updatePartial(after)
    if (this.task.unmigratedCount && this.task.acceptedPartial !== this.task.unmigratedSetHash) { await this.phase('awaiting_partial'); return }
    await this.phase('ready')
    await this.commit(this.task.id)
  }

  /** Project the exact unavailable source set, including refs without operations. */
  updatePartial(values) {
    const rows = []
    const add = (ledger, recordId, row) => {
      if (!['unmigrated', 'excluded'].includes(row.status)) return
      const entryId = row.recovery_ref?.entryId ?? row.migration_entry
      const entry = this.plan.entries.find((item) => item.id === entryId)
      rows.push({ origin: 'source', ledger, recordId, fileId: row.id, entryId: entryId ?? null,
        logical_path: row.logical_path ?? entry?.sourceRel ?? row.original_name ?? null, status: row.status,
        reasonCode: row.reasonCode ?? row.recovery_ref?.reasonCode ?? entry?.reasonCode ?? (row.status === 'excluded' ? 'source-excluded' : 'source-unavailable'),
        recovery_ref: row.recovery_ref ?? { taskId: this.task.id, entryId }, retainedAt: entry?.sourceRel ?? row.logical_path ?? null })
    }
    for (const [ledger, key] of [['library.json', 'assets'], ['artifacts.json', 'artifacts'], ['mappings.json', 'mappings']]) {
      const sourceIds = new Set(this.plan.sourceValues[ledger][key].map((row) => row.id))
      for (const record of values[ledger][key]) if (sourceIds.has(record.id)) {
        if (key === 'assets') for (const file of record.files) add(ledger, record.id, file)
        else add(ledger, record.id, record)
      }
    }
    for (const item of this.plan.exclusions.filter((row) => row.origin === 'source' && row.relative_path)) {
      if (rows.some((row) => row.retainedAt === item.relative_path)) continue
      rows.push({ origin: 'source', ledger: null, recordId: null, fileId: null, entryId: null,
        logical_path: item.relative_path, status: 'excluded', reasonCode: 'source-excluded',
        recovery_ref: { taskId: this.task.id }, retainedAt: item.relative_path })
    }
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    this.task.unmigrated = rows
    this.task.unmigratedSetHash = digest(rows)
    this.task.unmigratedCount = rows.length
  }

  async verifyInstalled(entry, receipt) {
    if (!receipt?.targetRel) return
    if (!receipt.sha256) {
      const actual = await this.fs.request('stat', { root: this.plan.target.path, rel: receipt.targetRel, optional: true })
      if (!actual || actual.kind !== 'directory') throw new AssetsError('plan-stale', 'installed directory missing or not a directory')
      const expected = receipt.afterIdentity ?? receipt.finalizedIdentity ?? receipt.installedIdentity ?? receipt.createdIdentity
      if (expected && ['dev', 'ino', 'mode', 'mtimeNs'].some((key) => actual.identity[key] !== expected[key])) {
        throw new AssetsError('plan-stale', 'installed directory metadata changed before commit')
      }
      if (receipt.metadataCheck !== false) {
        const metadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: receipt.targetRel })
        if (metadata.extendedMetadata.some((name) => name !== 'com.apple.provenance') ||
            (receipt.provenanceHash !== undefined && (metadata.provenanceHash ?? null) !== receipt.provenanceHash)) {
          throw new AssetsError('plan-stale', 'installed directory extended metadata changed')
        }
      }
      return
    }
    const actual = await this.fs.hash(this.plan.target.path, receipt.targetRel)
    const expected = receipt.afterIdentity ?? receipt.stagedIdentity
    if (actual.sha256 !== receipt.sha256 || (expected && ['dev', 'ino', 'mode', 'mtimeNs', 'ctimeNs', 'size', 'nlink'].some((key) => actual[key] !== expected[key]))) {
      throw new AssetsError('plan-stale', 'installed content or metadata changed before commit')
    }
    if (receipt.metadataCheck === false) return
    const metadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: receipt.targetRel })
    if (metadata.extendedMetadata.some((name) => name !== 'com.apple.provenance') ||
        (receipt.provenanceHash !== undefined && (metadata.provenanceHash ?? null) !== receipt.provenanceHash)) throw new AssetsError('plan-stale', 'installed extended metadata changed')
  }

  async verifyDirectories() {
    for (const row of this.plan.targetDirectories ?? []) {
      const actual = await this.fs.request('stat', { root: this.plan.target.path, rel: row.relative_path })
      if (actual.kind !== 'directory' || ['dev', 'ino', 'mode', 'mtimeNs'].some((key) => actual.identity[key] !== row.identity[key])) throw new AssetsError('plan-stale', 'in-place directory metadata changed')
      const metadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: row.relative_path })
      if (digest(metadata.extendedMetadata) !== digest(row.extendedMetadata) || metadata.provenanceHash !== row.provenanceHash) throw new AssetsError('plan-stale', 'in-place directory attributes changed')
    }
    const scan = await this.fs.request('scan', { root: this.control, rel: this.taskPath('directories'), metadataOnly: true }).catch((error) => {
      if (error.code === 'storage-offline') return { entries: [] }
      throw error
    })
    for (const row of scan.entries.filter((row) => row.kind === 'file')) {
      const receipt = await this.fs.readJson(this.control, row.relative_path)
      if (receipt.reused) continue
      const expectedIdentity = receipt.finalizedIdentity ?? receipt.installedIdentity ?? receipt.createdIdentity
      if (!expectedIdentity) continue
      const actual = await this.fs.request('stat', { root: this.plan.target.path, rel: receipt.rel })
      if (actual.kind !== 'directory' || ['dev', 'ino', 'mode', 'mtimeNs'].some((key) => actual.identity[key] !== expectedIdentity[key])) {
        throw new AssetsError('plan-stale', 'created directory metadata changed before commit')
      }
      if (receipt.finalizedMetadata) {
        const metadata = await this.fs.request('metadata', { root: this.plan.target.path, rel: receipt.rel })
        if (digest(metadata.extendedMetadata) !== digest(receipt.finalizedMetadata.extendedMetadata) ||
            metadata.provenanceHash !== receipt.finalizedMetadata.provenanceHash) {
          throw new AssetsError('plan-stale', 'created directory attributes changed before commit')
        }
      }
    }
  }

  async buildLedgers() {
    await this.verifyDirectories()
    const source = structuredClone(this.plan.sourceValues)
    const target = structuredClone(this.plan.targetValues)
    const receipts = new Map()
    for (const entry of this.plan.entries) {
      const receipt = await this.receipt(entry)
      if (receipt?.phase === 'installed_verified') await this.verifyInstalled(entry, receipt)
      if (receipt?.originalHash) await this.verifyInstalled(entry, { sha256: receipt.originalHash, targetRel: receipt.backupRel,
        afterIdentity: receipt.backupIdentity, provenanceHash: receipt.backupProvenanceHash })
      receipts.set(entry.id, receipt)
    }
    const versions = new Map(this.plan.entries.filter((entry) => this.decisions[entry.id]?.action === 'overwrite').map((entry) => [entry.targetRel, receipts.get(entry.id)?.backupRel]))
    for (const asset of target['library.json'].assets) for (const file of asset.files) {
      if (versions.has(file.relative_path)) { file.relative_path = versions.get(file.relative_path); file.ownership = 'managed' }
    }
    for (const artifact of target['artifacts.json'].artifacts) if (versions.has(artifact.content_ref)) { artifact.content_ref = versions.get(artifact.content_ref); artifact.ownership = 'managed' }
    for (const mapping of target['mappings.json'].mappings) {
      if (versions.has(mapping.relative_path)) mapping.relative_path = versions.get(mapping.relative_path)
    }
    const rewrite = (row, field) => {
      if (!row.migration_entry) return
      const receipt = receipts.get(row.migration_entry)
      if (!receipt || receipt.phase === 'skipped') {
        delete row[field]; delete row.real_path; row.status = 'unmigrated'
        row.recovery_ref = { taskId: this.task.id, entryId: row.migration_entry }
      } else {
        row[field] = receipt.targetRel
        row.status = 'available'
        row.ownership = receipt.reused ? 'adopted' : versions.has(receipt.targetRel) ? 'adopted' : 'managed'
      }
      delete row.migration_entry
    }
    for (const asset of source['library.json'].assets) for (const file of asset.files) rewrite(file, 'relative_path')
    const sourcePaths = new Map(this.plan.entries.map((entry) => [entry.sourceRel, receipts.get(entry.id)]))
    const rewriteTyped = (ref, paths, artifact) => {
      if (typeof ref !== 'string' || !ref.startsWith('asset://')) return ref
      const match = ref.match(/^asset:\/\/(character|scene|style|prop|knowledge|custom|artifact|tmp|workspace)\/(.+)$/)
      if (!match || match[1] === 'workspace') return ref
      const prefix = match[1] === 'artifact' ? 'artifacts/' : match[1] === 'tmp' ? 'tmp/' : ''
      const path = prefix + match[2]
      const mapped = paths.get(path)
      if (mapped === undefined) return ref
      if (!mapped || mapped.phase === 'skipped') {
        artifact.status = 'unmigrated'; artifact.recovery_ref = { taskId: this.task.id, reasonCode: 'input-unavailable' }
        delete artifact.content_ref
        return ref
      }
      return mapped.targetRel.startsWith(prefix) ? `asset://${match[1]}/${mapped.targetRel.slice(prefix.length)}` : `asset://custom/${mapped.targetRel}`
    }
    for (const artifact of source['artifacts.json'].artifacts) {
      rewrite(artifact, 'content_ref')
      if (artifact.input_refs) artifact.input_refs = artifact.input_refs.map((ref) => rewriteTyped(ref, sourcePaths, artifact))
    }
    const versionPaths = new Map([...versions].map(([path, targetRel]) => [path, { targetRel }]))
    for (const artifact of target['artifacts.json'].artifacts) if (artifact.input_refs) artifact.input_refs = artifact.input_refs.map((ref) => rewriteTyped(ref, versionPaths, artifact))
    for (const mapping of source['mappings.json'].mappings) rewrite(mapping, 'relative_path')
    const sourceRecords = new Map([
      ...source['library.json'].assets.map((row) => [row.id, { ...row, status: row.files.some((file) => ['unmigrated', 'excluded'].includes(file.status)) ? 'unmigrated' : 'available' }]),
      ...source['artifacts.json'].artifacts.map((row) => [row.id, row]),
      ...source['mappings.json'].mappings.map((row) => [row.id, row]),
    ])
    let changed = true
    while (changed) {
      changed = false
      for (const artifact of source['artifacts.json'].artifacts) {
        if (artifact.status === 'unmigrated') continue
        if ((artifact.input_refs ?? []).some((ref) => typeof ref === 'string' && !ref.startsWith('asset://') && ['unmigrated', 'excluded'].includes(sourceRecords.get(ref)?.status))) {
          artifact.status = 'unmigrated'; artifact.reasonCode = 'input-unavailable'
          artifact.recovery_ref = { taskId: this.task.id, reasonCode: 'input-unavailable' }
          delete artifact.content_ref; changed = true
        }
      }
    }
    const result = {}
    for (const [name, key] of [['library.json', 'assets'], ['artifacts.json', 'artifacts'], ['mappings.json', 'mappings']]) {
      result[name] = { ...target[name], ...source[name], schema: key === 'assets' ? 3 : 2,
        revision: Math.max(source[name].revision, target[name].revision) + 1,
        [key]: [...source[name][key], ...target[name][key]] }
    }
    result['library.json'].migrated_mappings = true
    const inventory = new Map()
    const addInventory = async (rel, ownership, owner) => {
      if (!rel) return
      let item = inventory.get(rel)
      if (!item) {
        const actual = await this.fs.hash(this.plan.target.path, rel).catch((error) => {
          if (error.code === 'path-denied') return null
          throw error
        })
        if (!actual) return
        item = { relative_path: rel, kind: 'file', ownership: ownership ?? 'unknown', size: Number(actual.size), sha256: actual.sha256, identity: actual, owners: [] }
        inventory.set(rel, item)
      }
      if (ownership !== 'managed') item.ownership = ownership ?? 'unknown'
      item.owners.push(owner)
    }
    for (const asset of result['library.json'].assets) for (const file of asset.files) await addInventory(file.relative_path, file.ownership, asset.id)
    for (const artifact of result['artifacts.json'].artifacts) {
      await addInventory(artifact.content_ref, artifact.ownership, artifact.id)
      if (artifact.status === 'unmigrated') continue
      for (const ref of artifact.input_refs ?? []) {
        const match = typeof ref === 'string' && ref.match(/^asset:\/\/(character|scene|style|prop|knowledge|custom|artifact|tmp)\/(.+)$/)
        if (match) {
          await addInventory((match[1] === 'artifact' ? 'artifacts/' : match[1] === 'tmp' ? 'tmp/' : '') + match[2], 'unknown', artifact.id)
        } else if (typeof ref === 'string') {
          const referencedAsset = result['library.json'].assets.find((a) => a.id === ref)
          if (referencedAsset) {
            for (const file of referencedAsset.files) {
              if (file.relative_path) await addInventory(file.relative_path, file.ownership, artifact.id)
            }
          }
        }
      }
    }
    for (const mapping of result['mappings.json'].mappings) await addInventory(mapping.relative_path, mapping.ownership, mapping.id)
    result['library.json'].file_inventory = [...inventory.values()]
    for (const name of LEDGERS) validateLedger(result[name], name)
    return result
  }

  async acceptPartial(id, input) {
    this.assertTask(id)
    if (input.confirm !== true || input.planHash !== this.plan.planHash || input.unmigratedSetHash !== this.task.unmigratedSetHash || this.task.state !== 'awaiting_partial') throw new AssetsError('plan-stale', 'confirm the exact unavailable set')
    this.task.acceptedPartial = input.unmigratedSetHash
    await this.save()
    return this.launch(() => this.commit(id))
  }

  async commit(id) {
    this.assertTask(id)
    await this.verifyIdentity()
    await this.checkSpace()
    const after = await this.buildLedgers()
    this.updatePartial(after)
    if (this.task.unmigratedCount && this.task.acceptedPartial !== this.task.unmigratedSetHash) { await this.phase('awaiting_partial'); return }
    await this.phase('committing')
    const newRoot = { ...this.runtime.config, epoch: this.task.rootEpoch + 1, commitId: id,
      active: { path: this.plan.target.path, identity: this.plan.target, rootId: this.plan.targetRootId } }
    const commit = { schema: 1, commitId: id, expectedEpoch: this.task.rootEpoch, oldRoot: this.runtime.config, newRoot,
      before: this.plan.targetBeforeValues ?? this.plan.targetValues, after, hashes: Object.fromEntries(LEDGERS.map((name) => [name, digest(after[name])])) }
    for (const name of LEDGERS) {
      await this.fs.atomicJson(this.plan.target.path, `.omnimux-assets/transactions/${id}/before/${name}`, commit.before[name])
      await this.fs.atomicJson(this.plan.target.path, `.omnimux-assets/transactions/${id}/after/${name}`, after[name])
    }
    this.task.commitHash = digest(commit)
    this.task.commitRoots = { oldRoot: commit.oldRoot, newRoot: commit.newRoot }
    await this.save()
    await this.fs.atomicJson(this.plan.target.path, `.omnimux-assets/transactions/${id}/commit.json`, commit)
    await this.fs.atomicJson(this.control, this.taskPath('commit.json'), commit)
    await this.fault('commit_intent')
    await this.finishCommit(commit)
  }

  async loadCommit() {
    let commit = null
    let corrupt = false
    try { commit = await this.fs.readJson(this.control, this.taskPath('commit.json'), true) }
    catch (error) { if (error.code !== 'ledger-corrupt') throw error; corrupt = true }
    if (!commit && this.plan) {
      commit = await this.fs.readJson(this.plan.target.path, `.omnimux-assets/transactions/${this.task.id}/commit.json`, true)
      if (commit && (!this.task.commitHash || digest(commit) !== this.task.commitHash)) throw new AssetsError('recovery-required', 'commit mirror does not match durable intent')
    }
    if (commit) {
      if (commit.schema !== 1 || commit.commitId !== this.task.id || commit.expectedEpoch !== this.task.rootEpoch ||
          commit.newRoot?.active?.path !== this.plan.target.path || commit.oldRoot?.active?.path !== this.plan.source.path ||
          (this.task.commitHash && digest(commit) !== this.task.commitHash)) throw new AssetsError('recovery-required', 'invalid commit identity')
      for (const name of LEDGERS) {
        validateLedger(commit.after?.[name], name)
        if (digest(commit.after[name]) !== commit.hashes?.[name]) throw new AssetsError('recovery-required', 'invalid commit ledger hash')
      }
      return commit
    }
    const marker = this.plan && await this.fs.readJson(this.plan.target.path, '.omnimux-assets/root.json', true)
    if (corrupt || this.task.commitHash || this.runtime.config?.commitId === this.task.id ||
        (marker?.commitId === this.task.id && ['ready', 'active'].includes(marker.state))) {
      throw new AssetsError('recovery-required', 'commit evidence is missing; preserve both roots')
    }
    return null
  }

  async finishCommit(commit) {
    await this.runtime.beginCommit()
    await this.fs.lock(commit.oldRoot.active.path)
    await this.fs.lock(commit.newRoot.active.path)
    await this.verifyIdentity()
    const pointer = await this.fs.readJson(this.control, 'root.json')
    const committed = pointer.commitId === commit.commitId
    if (!committed && digest(pointer) !== digest(commit.oldRoot)) throw new AssetsError('recovery-required', 'Home pointer differs from commit preimage')
    const marker = await this.fs.readJson(commit.newRoot.active.path, '.omnimux-assets/root.json')
    if (marker.rootId !== commit.newRoot.active.rootId) throw new AssetsError('root-identity-changed', 'commit target marker changed')
    // A committed active root may already contain newer writes. Never replay its after-images.
    const preserveNewWrites = committed && marker.state === 'active' && marker.commitId === commit.commitId
    const verifyCommit = async () => {
      await this.verifyDirectories()
      for (const item of commit.after['library.json'].file_inventory ?? []) {
        await this.verifyInstalled(null, { targetRel: item.relative_path, sha256: item.sha256, afterIdentity: item.identity, metadataCheck: false })
      }
    }
    if (!preserveNewWrites) await verifyCommit()
    for (const name of LEDGERS) {
      const current = await this.fs.readJson(commit.newRoot.active.path, name, true)
      if (preserveNewWrites) { validateLedger(current, name); continue }
      if (current && digest(current) !== commit.hashes[name] && digest(current) !== digest(commit.before[name])) {
        throw new AssetsError('plan-stale', 'target ledger changed outside the commit')
      }
      await this.fs.atomicJson(commit.newRoot.active.path, name, commit.after[name])
      await this.fault(`ledger_${name}`)
      if (digest(await this.fs.readJson(commit.newRoot.active.path, name)) !== commit.hashes[name]) throw new AssetsError('recovery-required', 'committed ledger hash mismatch')
    }
    if (!committed) {
      await this.fs.atomicJson(commit.newRoot.active.path, '.omnimux-assets/root.json', { magic: 'omnimux-assets', schema: 1, rootId: commit.newRoot.active.rootId, state: 'ready', commitId: commit.commitId })
      await this.fault('before_root')
      await verifyCommit()
      await this.fs.atomicJson(this.control, 'root.json', commit.newRoot)
      await this.fault('after_root')
    }
    this.runtime.config = commit.newRoot
    await this.fs.atomicJson(commit.newRoot.active.path, '.omnimux-assets/transaction.json', { schema: 1, pending: false, commitId: commit.commitId })
    await this.fs.atomicJson(commit.newRoot.active.path, '.omnimux-assets/root.json', { magic: 'omnimux-assets', schema: 1, rootId: commit.newRoot.active.rootId, state: 'active', commitId: commit.commitId })
    await this.fs.atomicJson(commit.oldRoot.active.path, '.omnimux-assets/root.json', { magic: 'omnimux-assets', schema: 1, rootId: commit.oldRoot.active.rootId, state: 'retired', commitId: commit.commitId })
    await this.runtime.installBundle(commit.newRoot)
    this.task.completedAt ||= new Date().toISOString()
    this.task.retentionUntil ||= new Date(Date.parse(this.task.completedAt) + 7 * 86400000).toISOString()
    this.task.cleanup = { eligible: false, reason: 'retention-and-reference-verification-required' }
    await this.phase(this.task.unmigratedCount ? 'completed_with_skips' : 'completed')
    await this.fs.atomicJson(this.control, this.taskPath('report.json'), { taskId: this.task.id, state: this.task.state, idMap: this.plan.idMap,
      exclusions: this.plan.exclusions, unmigrated: this.task.unmigrated, unmigratedSetHash: this.task.unmigratedSetHash, unmigratedCount: this.task.unmigratedCount || 0, retainedSource: true, retentionUntil: this.task.retentionUntil })
    this.runtime.thaw()
  }

  async pause(id) {
    this.assertTask(id)
    if (TERMINAL_STATES.has(this.task.state) || this.task.state === 'committing') throw new AssetsError('storage-busy', 'terminal tasks and commit cannot be paused')
    this.pauseRequested = true
    if (!this.running) { this.pauseRequested = false; await this.phase('paused') }
    return { ok: true }
  }

  async resume(id) {
    this.assertTask(id)
    if (this.running) throw new AssetsError('storage-busy', 'task still running')
    if (TERMINAL_STATES.has(this.task.state)) throw new AssetsError('storage-busy', 'terminal migrations cannot be resumed; create a new plan')
    if (!this.task.confirmedAt) throw new AssetsError('conflict-required', 'preflight must be confirmed before resume')
    return this.launch(async () => {
      await this.runtime.freeze(id)
      await this.verifyIdentity()
      await this.fs.lock(this.plan.source.path)
      await this.fs.lock(this.plan.target.path)
      const commit = await this.loadCommit()
      if (commit) await this.finishCommit(commit)
      else if (this.task.abandonRequested) await this.compensate()
      else { await this.prepareTarget(); await this.runEntries() }
    })
  }

  async recover() {
    const active = await this.fs.readJson(this.control, 'active-task.json', true)
    if (!active) return
    if (typeof active.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(active.id)) throw new AssetsError('ledger-corrupt', 'invalid active migration id')
    this.task = await this.fs.readJson(this.control, `tasks/${active.id}/task.json`)
    if (this.task?.schema !== 1 || this.task.id !== active.id) throw new AssetsError('ledger-corrupt', 'invalid migration receipt')
    this.plan = await this.fs.readJson(this.control, this.taskPath('plan.json'), true)
    const savedDecisions = await this.fs.readJson(this.control, this.taskPath('decisions.json'), true) ?? {}
    if (savedDecisions.schema === 1) {
      if (savedDecisions.planHash !== this.plan?.planHash || !Number.isSafeInteger(savedDecisions.revision)) throw new AssetsError('ledger-corrupt', 'decision snapshot does not match plan')
      this.decisions = savedDecisions.entries
      this.task.decisionRevision = savedDecisions.revision
    } else { this.decisions = savedDecisions; this.task.decisionRevision ??= 0 }
    if (TERMINAL_STATES.has(this.task.state)) return
    if (this.task.confirmedAt) this.runtime.frozen = this.task.id
    if (this.task.confirmedAt && this.plan) {
      await this.fs.lock(this.plan.source.path)
      await this.fs.lock(this.plan.target.path)
      await this.verifyIdentity()
    }
    const commit = await this.loadCommit()
    if (commit) {
      await this.fs.lock(commit.oldRoot.active.path)
      await this.fs.lock(commit.newRoot.active.path)
      await this.finishCommit(commit)
    } else if (this.task.confirmedAt) { this.task.resumePhase = this.task.state; await this.phase('paused') }
    else if (this.task.state === 'checking') await this.phase('failed_recoverable')
  }

  async abandon(id, input) {
    this.assertTask(id)
    if (input.confirm !== true) throw new AssetsError('confirmation-required', 'abandon requires explicit confirmation')
    if (TERMINAL_STATES.has(this.task.state) || this.running || this.runtime.config?.commitId === id) throw new AssetsError('storage-busy', 'cannot abandon terminal, running or committed migration')
    if (this.exclusiveOperation) throw new AssetsError('storage-busy', 'task operation already running')
    this.exclusiveOperation = true
    try {
      await this.runtime.freeze(id)
      if (await this.loadCommit()) throw new AssetsError('recovery-required', 'commit intent requires roll-forward before another migration')
      if (this.task.confirmedAt && !this.task.targetPrepared) {
        const transaction = await this.fs.readJson(this.plan.target.path, '.omnimux-assets/transaction.json', true)
        if (transaction?.pending && transaction.taskId === id) {
          this.task.targetPrepared = true
          this.task.targetMarkerBefore = this.plan.targetMarker ?? null
        }
      }
      this.task.abandonRequested = true
      await this.save()
      return await this.compensate()
    } finally { this.exclusiveOperation = false }
  }

  async compensate() {
    await this.phase('abandoning')
    if (this.task.confirmedAt && this.task.targetPrepared) {
      await this.fs.lock(this.plan.source.path)
      const lease = await this.fs.lock(this.plan.target.path)
      await this.verifyIdentity()
      const marker = await this.fs.readJson(this.plan.target.path, '.omnimux-assets/root.json', true)
      if (marker && marker.rootId !== this.plan.targetRootId) throw new AssetsError('root-identity-changed', 'target marker changed before compensation')
      for (const entry of this.plan.entries) {
        const receipt = await this.receipt(entry)
        if (!receipt || receipt.reused || entry.kind !== 'file' || !['installing', 'installed_verified'].includes(receipt.phase) || receipt.compensation?.phase === 'done') continue
        const actual = await this.optionalHash(this.plan.target.path, receipt.targetRel)
        let undo = receipt.compensation
        if (undo?.phase === 'applying' && ((!undo.originalHash && !actual) ||
            (actual && actual.sha256 === undo.originalHash && actual.ino === undo.restoreIdentity?.ino && actual.dev === undo.restoreIdentity?.dev))) {
          undo.phase = 'done'; await this.writeReceipt(entry, receipt); continue
        }
        if (!undo && receipt.phase === 'installing' &&
            ((!actual && !receipt.originalHash) || (actual && digest(actual) === digest(entry.targetFingerprint)))) {
          receipt.compensation = { phase: 'done', notInstalled: true }; await this.writeReceipt(entry, receipt); continue
        }
        const expected = receipt.afterIdentity ?? receipt.stagedIdentity
        if (!actual || actual.sha256 !== receipt.sha256 || (expected && (actual.ino !== expected.ino || actual.dev !== expected.dev))) {
          throw new AssetsError('plan-stale', 'target changed; compensation preserves unknown content')
        }
        if (receipt.afterIdentity && !undo && digest(actual) !== digest(receipt.afterIdentity)) throw new AssetsError('plan-stale', 'installed identity changed')
        if (!undo) {
          undo = receipt.compensation = { phase: 'planned', originalHash: receipt.originalHash ?? null, expected: actual,
            restoreRel: `.omnimux-assets/transactions/${this.task.id}/restore/${entry.id}`,
            currentRel: `.omnimux-assets/transactions/${this.task.id}/abandon/${entry.id}` }
          await this.writeReceipt(entry, receipt)
        }
        if (digest(actual) !== digest(undo.expected)) throw new AssetsError('plan-stale', 'compensation destination changed')
        if (undo.originalHash) {
          const backup = await this.fs.hash(this.plan.target.path, receipt.backupRel)
          if (backup.sha256 !== undo.originalHash) throw new AssetsError('recovery-required', 'restoration version changed')
          // Attempt paths belong to the entry receipt, including interrupted restore copies.
          receipt.restoreRel = undo.restoreRel; receipt.currentRel = undo.currentRel
          undo.restoreIdentity = await this.copyAttempt(entry, receipt, 'restoreRel', this.plan.target.path, receipt.backupRel, backup)
          await this.copyAttempt(entry, receipt, 'currentRel', this.plan.target.path, receipt.targetRel, actual)
          undo.restoreRel = receipt.restoreRel; undo.currentRel = receipt.currentRel
        }
        undo.phase = 'applying'; await this.writeReceipt(entry, receipt)
        if (undo.originalHash) await this.fs.install({ root: this.plan.target.path, stagedRel: undo.restoreRel,
          rel: receipt.targetRel, sha256: undo.originalHash, expected: actual, backupRel: undo.currentRel })
        else await this.fs.unlinkOwned({ root: this.plan.target.path, rel: receipt.targetRel, expected: actual })
        await this.fault('compensation_applied')
        undo.phase = 'done'; await this.writeReceipt(entry, receipt)
      }
      await this.fs.atomicJson(this.plan.target.path, '.omnimux-assets/transaction.json', this.task.targetTransactionBefore ?? { schema: 1, pending: false, abandoned: this.task.id })
      await this.fs.atomicJson(this.plan.target.path, '.omnimux-assets/root.json', this.task.targetMarkerBefore ??
        { magic: 'omnimux-assets', schema: 1, rootId: this.plan.targetRootId, state: 'unregistered' })
      await this.fs.unlock(lease)
    }
    await this.phase('abandoned')
    this.runtime.thaw()
    return { ok: true, retainedRecoveryMaterials: true }
  }

  /** Connected record/file components prevent collecting a successful sibling of an unresolved ref. */
  cleanupGraph(values, receipts) {
    const links = new Map()
    const blocked = new Set()
    const connect = (a, b) => {
      if (!links.has(a)) links.set(a, new Set())
      if (!links.has(b)) links.set(b, new Set())
      links.get(a).add(b); links.get(b).add(a)
    }
    const paths = new Map()
    for (const entry of this.plan.entries) {
      const key = `entry:${entry.id}`
      connect(key, key)
      paths.set(entry.id, receipts.get(entry.id)?.targetRel ?? entry.targetRel)
      if (receipts.get(entry.id)?.originalHash) connect(key, `path:${receipts.get(entry.id).backupRel}`)
      if (receipts.get(entry.id)?.phase !== 'installed_verified') blocked.add(key)
    }
    const add = (row, key, source = false) => {
      connect(key, key)
      if (row.status === 'unmigrated' || row.status === 'excluded' || row.recovery_ref) blocked.add(key)
      if (row.migration_entry) connect(key, `entry:${row.migration_entry}`)
      const rel = row.relative_path ?? row.content_ref
      if (rel) {
        connect(key, `${source ? 'source' : 'path'}:${rel}`)
        if (!source && rel.startsWith('.omnimux-assets/versions/')) blocked.add(key)
        for (const entry of this.plan.entries) {
          const candidate = source ? entry.sourceRel : paths.get(entry.id)
          if (candidate && (candidate === rel || candidate.startsWith(`${rel}/`) || rel.startsWith(`${candidate}/`))) connect(key, `entry:${entry.id}`)
        }
      }
      if (row.real_path?.startsWith(`${this.plan.source.path}/`)) {
        const oldRel = row.real_path.slice(this.plan.source.path.length + 1)
        for (const entry of this.plan.entries) if (entry.sourceRel === oldRel || entry.sourceRel.startsWith(`${oldRel}/`)) blocked.add(`entry:${entry.id}`)
      }
      for (const ref of row.input_refs ?? []) {
        if (typeof ref === 'string') {
          connect(key, `record:${ref}`)
          for (const entry of this.plan.entries) if (ref === paths.get(entry.id) || ref.endsWith(`/${paths.get(entry.id)}`)) connect(key, `entry:${entry.id}`)
        } else blocked.add(key)
      }
    }
    for (const [ledgers, source] of [[this.plan.sourceValues, true], [values, false]]) {
      for (const asset of ledgers['library.json'].assets) {
        const key = `record:${asset.id}`; add(asset, key, source)
        for (const file of asset.files) { connect(key, `record:${file.id}`); add(file, key, source) }
      }
      for (const artifact of ledgers['artifacts.json'].artifacts) add(artifact, `record:${artifact.id}`, source)
      for (const mapping of ledgers['mappings.json'].mappings) add(mapping, `record:${mapping.id}`, source)
    }
    const queue = [...blocked]
    for (let i = 0; i < queue.length; i++) for (const neighbor of links.get(queue[i]) ?? []) if (!blocked.has(neighbor)) { blocked.add(neighbor); queue.push(neighbor) }
    return new Set(this.plan.entries.filter((entry) => blocked.has(`entry:${entry.id}`)).map((entry) => entry.id))
  }

  async cleanupSnapshot() {
    await this.runtime.checkAvailable()
    await this.verifyIdentity()
    if (this.runtime.config.commitId !== this.task.id || this.runtime.config.active.path !== this.plan.target.path) throw new AssetsError('plan-stale', 'cleanup requires the committed target root')
    const sourceMarker = await this.fs.readJson(this.plan.source.path, '.omnimux-assets/root.json')
    if (sourceMarker.state !== 'retired' || sourceMarker.commitId !== this.task.id) throw new AssetsError('plan-stale', 'source is no longer retired for this migration')
    const values = {}; const old = {}; const receipts = new Map(); const guards = []
    for (const [root, ledgers] of [[this.plan.target.path, values], [this.plan.source.path, old]]) for (const name of LEDGERS) {
      const before = await this.fs.hash(root, name)
      ledgers[name] = validateLedger(await this.fs.readJson(root, name), name)
      if (digest(await this.fs.hash(root, name)) !== digest(before)) throw new AssetsError('plan-stale', 'ledger changed during cleanup verification')
      guards.push({ root, rel: name, expected: before })
    }
    if (digest(old) !== this.plan.sourceLedgerHashes) throw new AssetsError('plan-stale', 'retired source ledger changed; preserve its files')
    for (const entry of this.plan.entries) receipts.set(entry.id, await this.receipt(entry))
    return { blocked: this.cleanupGraph(values, receipts), receipts, guards }
  }

  async cleanup(id, manifestHash, confirm = false) {
    this.assertTask(id)
    if (this.running || this.exclusiveOperation) throw new AssetsError('storage-busy', 'task operation already running')
    this.exclusiveOperation = true
    let frozen = false
    try {
      await this.runtime.freeze(id); frozen = true
      await this.fs.lock(this.plan.source.path)
      await this.fs.lock(this.plan.target.path)
      const retention = Date.parse(this.task.retentionUntil)
      if (!['completed', 'completed_with_skips'].includes(this.task.state) || !Number.isFinite(retention) || Date.now() < retention) {
        throw new AssetsError('conflict-required', 'cleanup retention has not elapsed')
      }
      let manifest = await this.fs.readJson(this.control, this.taskPath('cleanup.json'), true)
      if (!manifest || !confirm) {
        const { blocked, receipts } = await this.cleanupSnapshot()
        const entries = []
        for (const entry of this.plan.entries) {
          if (blocked.has(entry.id) || entry.ownership !== 'managed' || entry.kind !== 'file' || entry.sourceFingerprint.nlink !== '1') continue
          const receipt = receipts.get(entry.id)
          const current = await this.optionalHash(this.plan.target.path, receipt.targetRel)
          const source = await this.optionalHash(this.plan.source.path, entry.sourceRel)
          if (current?.sha256 === entry.sourceFingerprint.sha256 && source && digest(source) === digest(entry.sourceFingerprint)) {
            entries.push({ entryId: entry.id, root: this.plan.source.path, rel: entry.sourceRel, targetRel: receipt.targetRel, expected: source })
          }
        }
        const hash = digest(entries)
        if (!confirm) return { entries, manifestHash: hash, eligible: entries.length > 0 }
        if (hash !== manifestHash) throw new AssetsError('plan-stale', 'cleanup manifest changed')
        manifest = { schema: 1, manifestHash: hash, entries, confirmedAt: new Date().toISOString() }
        await this.fs.atomicJson(this.control, this.taskPath('cleanup.json'), manifest)
      }
      if (manifest.manifestHash !== manifestHash || digest(manifest.entries) !== manifestHash) throw new AssetsError('plan-stale', 'confirm the exact cleanup manifest')
      let cleaned = 0; const retained = []
      for (const item of manifest.entries) {
        const receiptPath = this.taskPath(`cleanup/${item.entryId}.json`)
        const prior = await this.fs.readJson(this.control, receiptPath, true)
        if (prior?.phase === 'done') { cleaned++; continue }
        // Rebuild under the same freeze immediately before every destructive operation.
        const { blocked, guards } = await this.cleanupSnapshot()
        const target = await this.optionalHash(this.plan.target.path, item.targetRel)
        const source = await this.optionalHash(item.root, item.rel)
        if (!source && prior?.phase === 'deleting') {
          await this.fs.atomicJson(this.control, receiptPath, { ...prior, phase: 'done' }); cleaned++; continue
        }
        if (blocked.has(item.entryId) || !target || target.sha256 !== item.expected.sha256 || !source || digest(source) !== digest(item.expected)) {
          retained.push(item.entryId)
          await this.fs.atomicJson(this.control, receiptPath, { phase: 'retained', reason: 'reference-or-content-changed', entryId: item.entryId })
          continue
        }
        await this.fs.atomicJson(this.control, receiptPath, { phase: 'deleting', entryId: item.entryId, expected: item.expected })
        await this.fault('cleanup_deleting')
        // The helper revalidates target bytes and source identity on its FD chain before unlink.
        await this.fs.unlinkOwned({ ...item, guards: [...guards, { root: this.plan.target.path, rel: item.targetRel, expected: target }] })
        await this.fault('cleanup_deleted')
        await this.fs.atomicJson(this.control, receiptPath, { phase: 'done', entryId: item.entryId })
        cleaned++
      }
      await this.fs.atomicJson(this.control, this.taskPath('cleanup.json'), { ...manifest, cleaned, retained, completedAt: new Date().toISOString() })
      return { cleaned, retained }
    } finally { if (frozen) this.runtime.thaw(); this.exclusiveOperation = false }
  }
}
