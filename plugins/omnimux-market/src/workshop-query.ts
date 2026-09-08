import { itemShelfTags, matchesDomainTag, skillToken } from './client/skill-picker-logic.js'
import { catalogSkillChannel, catalogSkillSlug } from './skill-aggregate.js'
import type {
  InstallOrigin, SourceStatus, WorkshopDomain, WorkshopInventoryInput,
  WorkshopQueryInput, WorkshopQueryRequest, WorkshopQueryResult, WorkshopSkill,
} from './types.js'

/** View order only. Membership and fallback matching remain owned by SkillShelf. */
export const WORKSHOP_DOMAINS: readonly WorkshopDomain[] = Object.freeze([
  '短剧漫剧', '专业影视', '动画', '商业广告', '电商', '教育', '创意实验', '音频音乐', '平台工具',
])
export const WORKSHOP_CATEGORIES = Object.freeze(['all', 'featured', ...WORKSHOP_DOMAINS])
export const WORKSHOP_ORIGINS: readonly InstallOrigin[] = Object.freeze([
  'omnimux', 'workbuddy', 'skillhub', 'local', 'unknown',
])
export const WORKSHOP_QUERY_LIMITS = Object.freeze({ pageSize: 80, pages: 20, candidates: 1600, wallMs: 30_000, snapshots: 8, ttlMs: 300_000 })

export class WorkshopQueryError extends Error {
  constructor(public readonly code: 'INVALID_REQUEST' | 'CURSOR_EXPIRED' | 'INVENTORY_UNAVAILABLE') {
    super(code)
    this.name = 'WorkshopQueryError'
  }
}

/** Unknown dates stay unknown; only explicit UTC timestamps may influence ordering. */
export function workshopDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  const canonical = new Date(time).toISOString()
  const normalized = value.length === 20 ? value.replace('Z', '.000Z') : value
  return canonical === normalized ? canonical : null
}

function knownCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** Explicit shelf tags take precedence; reuse the existing bounded fallback otherwise. */
export function workshopDomains(item: unknown): WorkshopDomain[] {
  if (!item || typeof item !== 'object') return []
  const explicit: string[] = itemShelfTags(item)
  return WORKSHOP_DOMAINS.filter((domain) => explicit.length ? explicit.includes(domain) : matchesDomainTag(item, domain))
}

export function workshopQueryKey(request: WorkshopQueryRequest): string {
  validateRequest(request)
  return JSON.stringify([request.view, request.query.trim().toLowerCase(), request.domain, request.source, request.uninstalledOnly])
}

function validateRequest(request: WorkshopQueryRequest): void {
  if (!request || !['discover', 'mine'].includes(request.view) || typeof request.query !== 'string'
    || !WORKSHOP_CATEGORIES.includes(request.domain) || !['all', ...WORKSHOP_ORIGINS].includes(request.source)
    || typeof request.uninstalledOnly !== 'boolean' || !Number.isSafeInteger(request.queryRevision) || request.queryRevision < 0
    || (request.view === 'mine' && request.domain === 'featured')
    || (request.cursor !== undefined && typeof request.cursor !== 'string')) throw new WorkshopQueryError('INVALID_REQUEST')
}

function matches(skill: WorkshopSkill, request: WorkshopQueryRequest): boolean {
  const fields = [skill.title, skill.description, skill.token, skill.skillKey].map((s) => s.toLowerCase())
  const words = request.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((word) => fields.some((field) => field.includes(word)))
    && (request.domain === 'all' || request.domain === 'featured' || skill.domains.includes(request.domain))
}

function recent(a: WorkshopSkill, b: WorkshopSkill): number {
  const at = a.updatedAt || a.publishedAt
  const bt = b.updatedAt || b.publishedAt
  const delta = (bt ? Date.parse(bt) : -Infinity) - (at ? Date.parse(at) : -Infinity)
  return (Number.isNaN(delta) ? 0 : delta) || (a.skillKey < b.skillKey ? -1 : a.skillKey > b.skillKey ? 1 : 0)
}

/** This input is an adapter contract, not proof that the runtime inventory was reconciled. */
export function workshopSourceOptions(inventory: WorkshopInventoryInput): Array<InstallOrigin | 'all'> {
  if (inventory.status === 'error') throw new WorkshopQueryError('INVENTORY_UNAVAILABLE')
  return ['all', ...WORKSHOP_ORIGINS.filter((origin) => inventory.entries.some((entry) => entry.origin === origin))]
}

function normalizeSkill(skill: WorkshopSkill): WorkshopSkill {
  return {
    ...skill, domains: WORKSHOP_DOMAINS.filter((domain) => skill.domains.includes(domain)),
    sourceRef: skill.sourceRef ? { ...skill.sourceRef } : null,
    version: typeof skill.version === 'string' && skill.version.trim() ? skill.version.trim() : null,
    recommended: false, cover: undefined,
    downloads: knownCount(skill.downloads), updatedAt: workshopDate(skill.updatedAt), publishedAt: workshopDate(skill.publishedAt),
    enabled: typeof skill.enabled === 'boolean' ? skill.enabled : null,
  }
}

/** Whole-card winners are selected BEFORE domain/search filtering; no lower-source field merging. */
export function normalizeWorkshopDiscovery(input: WorkshopQueryInput, includeRemote: boolean): WorkshopSkill[] {
  const inventory = new Map(input.inventory.entries.map((entry) => [entry.skill.skillKey, entry.skill]))
  const winners = new Map<string, WorkshopSkill>()
  for (const channel of ['custom', 'workbuddy'] as const) {
    for (const item of input.catalog.items) {
      if (catalogSkillChannel(item) !== channel) continue
      const token = skillToken({ slug: catalogSkillSlug(item) }).toLowerCase()
      if (!token || winners.has(token)) continue
      const installed = inventory.get(token)
      const domains = workshopDomains(item)
      winners.set(token, {
        skillKey: token, token, title: item.title || token, description: item.summary || '', domains,
        sourceRef: { kind: 'catalog', catalogId: item.id, revision: input.catalogRevision },
        version: typeof item.version === 'string' && item.version.trim() ? item.version.trim() : null,
        recommended: Object.hasOwn(item, 'recommended') && item.recommended === true && domains.length > 0,
        cover: item.cover && /^catalog\/covers\/[a-z0-9][a-z0-9-]*\.(png|jpg|jpeg|webp)$/.test(item.cover.asset) ? { ...item.cover } : undefined,
        downloads: knownCount(item.downloads), updatedAt: workshopDate(item.updatedAt), publishedAt: workshopDate(item.publishedAt),
        installed: !!installed, enabled: installed && typeof installed.enabled === 'boolean' ? installed.enabled : null,
      })
    }
  }
  if (includeRemote) {
    for (const row of input.remote) {
      const token = skillToken({ slug: row.card.slug }).toLowerCase()
      if (!token || winners.has(token)) continue
      const installed = inventory.get(token)
      winners.set(token, {
        skillKey: token, token, title: row.card.name, description: row.card.description, domains: workshopDomains(row.card),
        sourceRef: row.sourceRef ? { ...row.sourceRef } : null,
        version: row.sourceRef?.version || null, recommended: false,
        downloads: knownCount(row.downloads), updatedAt: workshopDate(row.updatedAt), publishedAt: workshopDate(row.publishedAt),
        installed: !!installed, enabled: installed && typeof installed.enabled === 'boolean' ? installed.enabled : null,
      })
    }
  }
  // Directory order, not channel order, determines controlled featured order.
  const order = new Map(input.catalog.items.map((item, index) => [item.id, index]))
  return [...winners.values()].sort((a, b) => {
    const ai = a.sourceRef?.kind === 'catalog' ? order.get(a.sourceRef.catalogId) ?? Infinity : Infinity
    const bi = b.sourceRef?.kind === 'catalog' ? order.get(b.sourceRef.catalogId) ?? Infinity : Infinity
    return ai - bi || 0
  })
}

export interface WorkshopQuerySnapshot {
  id: string
  createdAt: number
  scopeKey: string
  catalogRevision: string
  inventoryRevision: number
  queryRevision: number
  queryKey: string
  pageSize: number
  featured: WorkshopSkill[]
  items: WorkshopSkill[]
  complete: boolean
  sourceStatus: SourceStatus[]
}

/** Compute an offline snapshot. Callers must supply source exhaustion and inventory evidence. */
export function createWorkshopSnapshot(
  input: WorkshopQueryInput, request: WorkshopQueryRequest, id: string, now: number, pageSize = 48,
): WorkshopQuerySnapshot {
  const key = workshopQueryKey(request)
  if (!id || !input.inventory.scopeKey || !input.catalogRevision || !Number.isFinite(now) || now < 0
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > WORKSHOP_QUERY_LIMITS.pageSize
    || !Number.isSafeInteger(input.inventory.revision) || input.inventory.revision < 0 || request.cursor) {
    throw new WorkshopQueryError('INVALID_REQUEST')
  }
  // With a boolean installed contract, missing rows in partial inventory cannot mean uninstalled.
  if (input.inventory.status === 'error' || (request.view === 'discover' && input.inventory.status !== 'complete')) {
    throw new WorkshopQueryError('INVENTORY_UNAVAILABLE')
  }
  const keys = input.inventory.entries.map((entry) => entry.skill.skillKey)
  if (new Set(keys).size !== keys.length || input.inventory.entries.some((entry) =>
    !entry.skill.skillKey || entry.skill.skillKey !== skillToken({ slug: entry.skill.token }).toLowerCase()
    || !WORKSHOP_ORIGINS.includes(entry.origin))) throw new WorkshopQueryError('INVALID_REQUEST')
  const includeRemote = request.query.trim().length > 0
  const required: InstallOrigin[] = request.view === 'mine' ? [] : includeRemote ? ['omnimux', 'workbuddy', 'skillhub'] : ['omnimux', 'workbuddy']
  const sourceStatus = required.map((origin): SourceStatus => {
    const statuses = input.sourceStatus.filter((s) => s.origin === origin)
    return statuses.length === 1 ? { ...statuses[0] } : { origin, status: 'partial', fetched: 0, exhausted: false, code: 'SOURCE_UNVERIFIED' }
  })
  const complete = input.inventory.status === 'complete' && sourceStatus.every((s) => s.status === 'complete' && s.exhausted === true && knownCount(s.fetched) !== null)
  let featured: WorkshopSkill[] = []
  let items: WorkshopSkill[] = []
  if (request.view === 'mine') {
    items = input.inventory.entries.filter((entry) => request.source === 'all' || entry.origin === request.source)
      .map((entry) => ({ ...normalizeSkill(entry.skill), installed: true }))
      .filter((skill) => matches(skill, request))
  } else {
    const filtered = normalizeWorkshopDiscovery(input, includeRemote).filter((skill) => skill.domains.length > 0 && matches(skill, request))
    featured = filtered.filter((skill) => skill.recommended)
    items = request.domain === 'featured' ? [] : filtered.filter((skill) => !skill.recommended && (!request.uninstalledOnly || !skill.installed))
  }
  items.sort(recent)
  return { id, createdAt: now, scopeKey: input.inventory.scopeKey, catalogRevision: input.catalogRevision,
    inventoryRevision: input.inventory.revision, queryRevision: request.queryRevision, queryKey: key,
    pageSize, featured, items, complete, sourceStatus }
}

export interface WorkshopQueryVersions {
  scopeKey: string
  catalogRevision: string
  inventoryRevision: number
}

/** Cursors select frozen data only; they do not authorize access to a scope. */
export function pageWorkshopSnapshot(
  snapshot: WorkshopQuerySnapshot, request: WorkshopQueryRequest, versions: WorkshopQueryVersions, now: number,
): WorkshopQueryResult {
  const queryKey = workshopQueryKey(request)
  if (!Number.isFinite(now) || now < snapshot.createdAt || now - snapshot.createdAt >= WORKSHOP_QUERY_LIMITS.ttlMs
    || snapshot.queryKey !== queryKey || snapshot.queryRevision !== request.queryRevision
    || snapshot.catalogRevision !== versions.catalogRevision || snapshot.inventoryRevision !== versions.inventoryRevision
    || snapshot.scopeKey !== versions.scopeKey) throw new WorkshopQueryError('CURSOR_EXPIRED')
  let offset = 0
  if (request.cursor !== undefined) {
    try {
      const cursor: unknown = JSON.parse(request.cursor)
      if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== 1 || cursor[1] !== snapshot.id
        || !Number.isSafeInteger(cursor[2]) || cursor[2] <= 0 || cursor[2] % snapshot.pageSize !== 0
        || cursor[2] >= snapshot.items.length) throw new Error('cursor')
      offset = cursor[2]
    } catch { throw new WorkshopQueryError('CURSOR_EXPIRED') }
  }
  const next = offset + snapshot.pageSize
  return { schemaVersion: 1, snapshotId: snapshot.id, scopeKey: snapshot.scopeKey, queryKey,
    catalogRevision: snapshot.catalogRevision, queryRevision: snapshot.queryRevision, inventoryRevision: snapshot.inventoryRevision,
    featured: structuredClone(snapshot.featured), items: structuredClone(snapshot.items.slice(offset, next)),
    count: { value: snapshot.items.length, mode: snapshot.complete ? 'exact' : 'loaded' },
    completeness: snapshot.complete ? 'complete' : 'partial', sortScope: snapshot.complete ? 'complete-result' : 'loaded-result',
    nextCursor: next < snapshot.items.length ? JSON.stringify([1, snapshot.id, next]) : null,
    sourceStatus: structuredClone(snapshot.sourceStatus) }
}

/** Pure bounded cache replacement; caller owns memory and scope authorization. */
export function retainWorkshopSnapshot(
  snapshots: readonly WorkshopQuerySnapshot[], next: WorkshopQuerySnapshot, now: number,
): WorkshopQuerySnapshot[] {
  if (!Number.isFinite(now) || now < next.createdAt || now - next.createdAt >= WORKSHOP_QUERY_LIMITS.ttlMs) throw new WorkshopQueryError('CURSOR_EXPIRED')
  if (snapshots.some((s) => s.id === next.id)) throw new WorkshopQueryError('INVALID_REQUEST')
  return [...snapshots.filter((s) => now >= s.createdAt && now - s.createdAt < WORKSHOP_QUERY_LIMITS.ttlMs), next]
    .sort((a, b) => a.createdAt - b.createdAt).slice(-WORKSHOP_QUERY_LIMITS.snapshots)
}

/** Reject legacy envelopes or responses from an older query/catalog/inventory/scope. */
export function isWorkshopResponseApplicable(
  result: unknown, request: WorkshopQueryRequest, versions: WorkshopQueryVersions,
): boolean {
  if (!result || typeof result !== 'object') return false
  const row = result as Partial<WorkshopQueryResult>
  if (request.cursor !== undefined) {
    try {
      const cursor: unknown = JSON.parse(request.cursor)
      if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== 1 || cursor[1] !== row.snapshotId
        || !Number.isSafeInteger(cursor[2]) || cursor[2] <= 0) return false
    } catch { return false }
  }
  return row.schemaVersion === 1 && typeof row.snapshotId === 'string' && row.snapshotId.length > 0
    && row.queryRevision === request.queryRevision && row.queryKey === workshopQueryKey(request)
    && row.inventoryRevision === versions.inventoryRevision && row.catalogRevision === versions.catalogRevision
    && row.scopeKey === versions.scopeKey && Array.isArray(row.items) && Array.isArray(row.featured)
    && (row.completeness === 'complete' ? row.count?.mode === 'exact' && row.sortScope === 'complete-result'
      : row.completeness === 'partial' && row.count?.mode === 'loaded' && row.sortScope === 'loaded-result')
    && knownCount(row.count?.value) !== null
}
