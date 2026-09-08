import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, parse, relative } from 'node:path'
import type { SourceRef, WorkshopState } from './types.js'
import { WORKSHOP_ORIGINS, workshopDate } from './workshop-query.js'

export class WorkshopReadError extends Error {
  constructor(public readonly code: string, public readonly status = 409) {
    super(code)
    this.name = 'WorkshopReadError'
  }
}

export function safeRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 960
    && !/[\\\0:]/.test(value) && !isAbsolute(value)
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/** No implicit home, profile, symlink traversal or directory creation. */
export async function checkedDirectory(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new WorkshopReadError('SCOPE_UNVERIFIED')
  let resolvedPath = path
  if (process.platform === 'darwin') {
    for (const prefix of ['/var', '/tmp', '/etc']) {
      if (resolvedPath === prefix || resolvedPath.startsWith(`${prefix}/`)) {
        resolvedPath = '/private' + resolvedPath
        break
      }
    }
  }
  let current = parse(resolvedPath).root
  for (const part of relative(current, resolvedPath).split('/').filter(Boolean)) {
    current = join(current, part)
    const st = await lstat(current)
    if (!st.isDirectory() || st.isSymbolicLink()) throw new WorkshopReadError('SCOPE_UNVERIFIED')
  }
  return realpath(resolvedPath)
}

/** Bounded metadata read; callers supply an already authorized root and relative filename. */
export async function readWorkshopFile(root: string, name: string, limit: number): Promise<Buffer> {
  if (!safeRelativePath(name)) throw new WorkshopReadError('UNSAFE_PATH')
  const canonical = await checkedDirectory(root)
  const parts = name.split('/')
  const parent = await checkedDirectory(join(canonical, ...parts.slice(0, -1)))
  if (parent !== canonical && !parent.startsWith(`${canonical}/`)) throw new WorkshopReadError('UNSAFE_PATH')
  const rootIdentity = await lstat(canonical)
  const parentIdentity = await lstat(parent)
  const path = join(parent, parts.at(-1)!)
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new WorkshopReadError('UNSAFE_PATH')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const st = await handle.stat()
    if (st.ino !== before.ino || st.dev !== before.dev || !st.isFile() || st.size > limit) throw new WorkshopReadError('READ_LIMIT')
    const bytes = Buffer.alloc(Math.min(st.size + 1, limit + 1))
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    const after = await handle.stat()
    const currentRoot = await lstat(canonical), currentParent = await lstat(parent), currentFile = await lstat(path)
    if (currentRoot.ino !== rootIdentity.ino || currentRoot.dev !== rootIdentity.dev
      || currentParent.ino !== parentIdentity.ino || currentParent.dev !== parentIdentity.dev
      || currentFile.ino !== st.ino || currentFile.dev !== st.dev || currentFile.isSymbolicLink()) throw new WorkshopReadError('READ_CHANGED')
    if (offset > limit) throw new WorkshopReadError('READ_LIMIT')
    if (after.size !== st.size || after.mtimeMs !== st.mtimeMs || after.ctimeMs !== st.ctimeMs || offset !== st.size
      || await checkedDirectory(root) !== canonical || await checkedDirectory(parent) !== parent) throw new WorkshopReadError('READ_CHANGED')
    return bytes.subarray(0, offset)
  } finally { await handle.close() }
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1024
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const date = (value: unknown): boolean => value === null || workshopDate(value) !== null
const token = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/.test(value)

export function validSourceRef(value: unknown): value is SourceRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Record<string, unknown>
  const fields: Record<string, string[]> = { catalog: ['kind', 'catalogId', 'revision'], skillhub: ['kind', 'identity', 'version'],
    local: ['kind', 'contentHash'], git: ['kind', 'sourceId', 'repo', 'path', 'ref', 'commit'] }
  if (typeof r.kind !== 'string' || !Object.hasOwn(fields, r.kind) || Object.keys(r).some((key) => !fields[r.kind as string].includes(key))) return false
  switch (r.kind) {
    case 'catalog': return text(r.catalogId) && text(r.revision)
    case 'skillhub': return text(r.identity) && (r.version === null || text(r.version))
    case 'local': return typeof r.contentHash === 'string' && /^[a-f0-9]{64}$/.test(r.contentHash)
    case 'git': return text(r.sourceId) && typeof r.repo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.repo)
      && safeRelativePath(r.path) && text(r.ref) && typeof r.commit === 'string' && /^[a-f0-9]{40,64}$/.test(r.commit)
    default: return false
  }
}

/** Validate without migrating, repairing, or erasing unsupported data. */
export function parseWorkshopState(value: unknown, scopeKey: string): WorkshopState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkshopReadError('STATE_INVALID')
  const s = value as WorkshopState
  if (Number(s.schemaVersion) > 1) throw new WorkshopReadError('SCHEMA_NEWER')
  if (s.schemaVersion !== 1 || s.scopeKey !== scopeKey || !revision(s.revision)
    || !Array.isArray(s.records) || !Array.isArray(s.policyTombstones) || !s.preferences) throw new WorkshopReadError('STATE_INVALID')
  const p = s.preferences
  if (typeof p.autoUpdate !== 'boolean' || !revision(p.revision) || p.revision > s.revision
    || !date(p.lastCheckAt) || !date(p.nextEligibleAt)) throw new WorkshopReadError('STATE_INVALID')
  const ids = new Set<string>(), paths = new Set<string>(), keys = new Set<string>()
  for (const r of s.records) {
    if (!r || !text(r.installId) || !token(r.token) || r.skillKey !== r.token || !WORKSHOP_ORIGINS.includes(r.origin)
      || !safeRelativePath(r.relativePath) || typeof r.enabled !== 'boolean'
      || !/^[a-f0-9]{64}$/.test(r.contentHash) || !revision(r.revision) || r.revision > s.revision
      || !['verified', 'invalid', 'unreadable', 'recovering'].includes(r.verification)
      || !(r.version === null || text(r.version)) || !date(r.installedAt) || !date(r.updatedAt)
      || (r.sourceRef !== undefined && !validSourceRef(r.sourceRef))
      || ids.has(r.installId) || paths.has(r.relativePath) || keys.has(r.skillKey)) throw new WorkshopReadError('STATE_INVALID')
    ids.add(r.installId); paths.add(r.relativePath); keys.add(r.skillKey)
  }
  const tombstones = new Set<string>()
  for (const t of s.policyTombstones) {
    if (!t || t.scopeKey !== scopeKey || !token(t.token) || t.skillKey !== t.token || t.reason !== 'uninstalled'
      || !text(t.operationId) || !revision(t.revision) || t.revision > s.revision || tombstones.has(t.skillKey)) throw new WorkshopReadError('STATE_INVALID')
    tombstones.add(t.skillKey)
  }
  return { schemaVersion: 1, scopeKey: s.scopeKey, revision: s.revision,
    records: s.records.map((r) => ({ installId: r.installId, skillKey: r.skillKey, token: r.token, origin: r.origin,
      ...(r.sourceRef ? { sourceRef: structuredClone(r.sourceRef) } : {}), relativePath: r.relativePath, version: r.version,
      contentHash: r.contentHash, enabled: r.enabled, installedAt: r.installedAt, updatedAt: r.updatedAt, verification: r.verification, revision: r.revision })),
    preferences: { autoUpdate: p.autoUpdate, revision: p.revision, lastCheckAt: p.lastCheckAt, nextEligibleAt: p.nextEligibleAt },
    policyTombstones: s.policyTombstones.map((t) => ({ scopeKey: t.scopeKey, skillKey: t.skillKey, token: t.token,
      reason: t.reason, operationId: t.operationId, revision: t.revision })) }
}

export function emptyWorkshopState(scopeKey: string): WorkshopState {
  return { schemaVersion: 1, scopeKey, revision: 0, records: [], policyTombstones: [],
    preferences: { autoUpdate: false, revision: 0, lastCheckAt: null, nextEligibleAt: null } }
}

/** Pure CAS transition for a lock-owning fixture/transaction backend; never writes runtime files. */
export function compareAndSwapWorkshopState(current: WorkshopState, expected: number, next: WorkshopState): WorkshopState {
  const old = parseWorkshopState(current, current.scopeKey)
  const candidate = parseWorkshopState(next, old.scopeKey)
  if (!revision(expected) || old.revision !== expected || candidate.revision !== expected + 1) throw new WorkshopReadError('REVISION_CONFLICT')
  // A generic state CAS cannot authorize reinstall or clear durable uninstall intent.
  for (const t of old.policyTombstones) {
    const retained = candidate.policyTombstones.find((row) => row.skillKey === t.skillKey)
    if (!retained || JSON.stringify(retained) !== JSON.stringify(t)) throw new WorkshopReadError('TOMBSTONE_PROTECTED')
  }
  return candidate
}

/** Runtime store exposes read only. Missing state does not imply missing installed files. */
export class WorkshopStore {
  constructor(private readonly scopeKey: string, private readonly directory: string) {}

  async read(): Promise<WorkshopState> {
    try {
      const bytes = await readWorkshopFile(this.directory, 'state.v1.json', 4 * 1024 * 1024)
      return parseWorkshopState(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), this.scopeKey)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyWorkshopState(this.scopeKey)
      if (error instanceof WorkshopReadError) throw error
      throw new WorkshopReadError('STATE_UNREADABLE')
    }
  }

  recover(): { ready: false; code: string } {
    return { ready: false, code: 'RECOVERY_UNAVAILABLE' }
  }
}
