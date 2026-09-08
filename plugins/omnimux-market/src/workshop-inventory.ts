import { createHash } from 'node:crypto'
import { opendir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { parseDocument, isScalar } from 'yaml'
import type { WorkshopInventoryRecord, WorkshopInventoryResult, WorkshopReadScope, WorkshopState } from './types.js'
import { checkedDirectory, emptyWorkshopState, parseWorkshopState, readWorkshopFile, WorkshopReadError } from './workshop-store.js'
import { workshopDomains, workshopSourceOptions } from './workshop-query.js'

export interface InventoryDependencies {
  /** Bound by the Host after authorization, not by a request path/scope parameter. */
  scope: WorkshopReadScope | null
  store?: { read(): Promise<WorkshopState> }
  now?: () => number
}

function metadata(bytes: Buffer): { title: string; description: string; version: string | null } {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match || Buffer.byteLength(match[0]) > 65536 || !text.slice(match[0].length).trim()) throw new WorkshopReadError('INVALID_SKILL')
  const doc = parseDocument(match[1], { uniqueKeys: true, schema: 'failsafe' })
  if (doc.errors.length) throw new WorkshopReadError('INVALID_SKILL')
  const get = (key: string): string | null => {
    const node = doc.get(key, true)
    return isScalar(node) && typeof node.value === 'string' && node.value.trim() ? node.value.trim() : null
  }
  const title = get('name'), description = get('description')
  if (!title || !description) throw new WorkshopReadError('INVALID_SKILL')
  return { title, description, version: get('version') }
}

/** Enumerate authorized roots without following external links or touching package resources. */
export class InventoryService {
  private revision = 0
  private fingerprint = ''
  private last: WorkshopInventoryResult | null = null
  private readonly now: () => number
  private pending: Promise<WorkshopInventoryResult> | null = null

  constructor(private readonly dependencies: InventoryDependencies) { this.now = dependencies.now || (() => performance.now()) }

  async reconcile(): Promise<WorkshopInventoryResult> {
    if (!this.pending) this.pending = this.scan().finally(() => { this.pending = null })
    return structuredClone(await this.pending)
  }

  private async scan(): Promise<WorkshopInventoryResult> {
    const scope = this.dependencies.scope
    if (!scope) return this.finish({ scopeKey: 'unverified', revision: 0, status: 'error', entries: [], records: [], sourceOptions: ['all'],
      reasons: ['SCOPE_UNVERIFIED'], scopeVerified: false, preferences: null })
    const records: WorkshopInventoryRecord[] = []
    const reasons = [...scope.reasons]
    const started = this.now()
    let state = emptyWorkshopState(scope.scopeKey)
    try { if (this.dependencies.store) state = parseWorkshopState(await this.dependencies.store.read(), scope.scopeKey) }
    catch (error) { reasons.push(error instanceof WorkshopReadError ? error.code : 'STATE_UNREADABLE') }
    if (state.scopeKey !== scope.scopeKey) throw new WorkshopReadError('SCOPE_UNVERIFIED')
    const roots = new Set<string>(), rootIds = new Set<string>(), keys = new Set<string>()
    let scanned = 0
    if (scope.roots.length > 64) reasons.push('ROOT_LIMIT')
    for (const root of scope.roots.slice(0, 64)) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(root.id) || rootIds.has(root.id)) { reasons.push('SCOPE_UNVERIFIED'); continue }
      rootIds.add(root.id)
      try {
        const canonical = await checkedDirectory(root.path)
        if (roots.has(canonical)) { reasons.push('SCOPE_DUPLICATE_ROOT'); continue }
        roots.add(canonical)
        const directory = await opendir(canonical)
        for await (const entry of directory) {
          if (++scanned > 1600 || this.now() - started >= 30_000) { reasons.push('INVENTORY_LIMIT'); break }
          if (entry.isSymbolicLink()) { reasons.push('EXTERNAL_LINK_UNVERIFIED'); continue }
          if (!entry.isDirectory()) continue
          if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(entry.name)) { reasons.push('IDENTITY_UNVERIFIED'); continue }
          const token = entry.name.toLowerCase()
          const relativePath = `${root.id}/${entry.name}`
          const saved = state.records.find((r) => r.relativePath === relativePath && r.token === token)
          const installId = saved?.installId || createHash('sha256').update(`${scope.scopeKey}\0${relativePath}`).digest('hex')
          let fields = { title: token, description: '', version: null as string | null }
          let verification: WorkshopInventoryRecord['verification'] = 'readable'
          const rowReasons: string[] = []
          try { fields = metadata(await readWorkshopFile(canonical, `${entry.name}/SKILL.md`, 1024 * 1024)) }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
            verification = error instanceof WorkshopReadError && error.code === 'INVALID_SKILL' ? 'invalid' : 'unreadable'
            rowReasons.push(error instanceof WorkshopReadError ? error.code : 'SKILL_UNREADABLE')
            reasons.push(...rowReasons)
          }
          if (keys.has(token)) { reasons.push('IDENTITY_CONFLICT'); continue }
          keys.add(token)
          if (state.policyTombstones.some((t) => t.skillKey === token)) rowReasons.push('POLICY_UNVERIFIED')
          rowReasons.push('ENABLED_UNVERIFIED')
          const skill = { skillKey: token, token, title: fields.title, description: fields.description,
            domains: workshopDomains({ title: fields.title, summary: fields.description, skill: token }),
            sourceRef: saved?.sourceRef || null, version: fields.version, recommended: false, downloads: null,
            updatedAt: null, publishedAt: null, installed: true, enabled: null }
          records.push({ installId, skill, origin: saved?.origin || 'unknown', verification,
            installedAt: saved?.installedAt || null, reasons: rowReasons })
        }
      } catch (error) { reasons.push(error instanceof WorkshopReadError ? error.code : 'ROOT_UNREADABLE') }
      if (scanned > 1600 || this.now() - started >= 30_000) break
    }
    for (const record of state.records) {
      if (!records.some((r) => r.installId === record.installId)) reasons.push('RECORD_NOT_RECONCILED')
    }
    if (!scope.complete) reasons.push('PROVIDER_SCOPE_UNVERIFIED')
    const status = reasons.length ? (records.length ? 'partial' : 'error') : 'complete'
    const result: WorkshopInventoryResult = { scopeKey: scope.scopeKey, revision: 0, status,
      entries: records.map((r) => ({ skill: r.skill, origin: r.origin })), records, sourceOptions: ['all'],
      reasons: [...new Set(reasons)], scopeVerified: scope.complete, preferences: state.preferences }
    if (status !== 'error') result.sourceOptions = workshopSourceOptions(result)
    return this.finish(result)
  }

  get(installId: string): WorkshopInventoryRecord {
    const record = this.last?.records.find((r) => r.installId === installId)
    if (!record) throw new WorkshopReadError('INSTALL_NOT_FOUND', 404)
    return structuredClone(record)
  }

  private finish(result: WorkshopInventoryResult): WorkshopInventoryResult {
    result.records.sort((a, b) => a.installId.localeCompare(b.installId))
    result.entries = [...result.entries].sort((a, b) => a.skill.skillKey.localeCompare(b.skill.skillKey))
    const fingerprint = createHash('sha256').update(JSON.stringify(result)).digest('hex')
    if (fingerprint !== this.fingerprint) { this.fingerprint = fingerprint; this.revision++ }
    result.revision = this.revision
    this.last = structuredClone(result)
    return result
  }
}
