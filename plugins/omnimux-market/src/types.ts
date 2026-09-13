export type SortBy = 'score' | 'downloads' | 'stars' | 'installs' | 'updated_at'

export type SkillChannel = 'custom' | 'workbuddy' | 'skillhub'

export type SkillInstallBackend = 'catalog' | 'skillhub'

/** Shared catalog input; only the Host-controlled catalog may grant recommendations. */
export interface CatalogSkillItem {
  id: string
  tab?: string
  kind?: string
  title?: string
  subtitle?: string
  summary?: string
  category?: string
  tags?: string[]
  skill?: string
  avatar?: string
  source?: { type?: string; repo?: string; path?: string }
  recommended?: boolean
  cover?: { asset: string; alt: string }
  downloads?: number | null
  updatedAt?: string | null
  publishedAt?: string | null
  version?: string | null
  /** 双语真源投影（可选：155 项遗留技能没有）。判据见 skill-bilingual.ts。 */
  titleZh?: string
  titleEn?: string
  summaryZh?: string
  summaryEn?: string
}

/**
 * 技能双语字段域。官方货架条目投影后 4 字段恒为 `string`（缺失即 `''`）；
 * 声明为可选以兼容历史快照、远程候选行与库存适配器。
 */
export interface BilingualSkillFields {
  titleZh?: string
  titleEn?: string
  summaryZh?: string
  summaryEn?: string
}

/** 运行时准入门禁的审计摘要：写进快照，便于区分「没跑门禁」与「全部通过」。 */
export interface AdmissionSummary {
  /** 本次快照是否真的执行过门禁（无官方货架条目时为 false）。 */
  enforced: boolean
  skippedCount: number
  /** 被拒条目 id，升序，最多保留 50 条；超出部分只计 skippedCount。 */
  skippedIds: string[]
}

export interface CatalogDoc {
  items: CatalogSkillItem[]
}

export type WorkshopDomain = '短剧漫剧' | '专业影视' | '动画' | '商业广告' | '电商'
  | '教育' | '创意实验' | '音频音乐' | '平台工具'
export type InstallOrigin = 'omnimux' | 'workbuddy' | 'skillhub' | 'local' | 'unknown'
export type SourceRef =
  | { kind: 'catalog'; catalogId: string; revision: string }
  | { kind: 'git'; sourceId: string; repo: string; path: string; ref: string; commit: string }
  | { kind: 'skillhub'; identity: string; version: string | null }
  | { kind: 'local'; contentHash: string }

export interface WorkshopSkill extends BilingualSkillFields {
  skillKey: string
  token: string
  title: string
  description: string
  domains: WorkshopDomain[]
  /** Null for historical or legacy inputs without provable provenance. */
  sourceRef: SourceRef | null
  version: string | null
  recommended: boolean
  cover?: { asset: string; alt: string }
  downloads: number | null
  updatedAt: string | null
  publishedAt: string | null
  installed: boolean
  enabled: boolean | null
}

/** Supplied by an independently verified inventory adapter, never derived from search. */
export interface WorkshopInventoryEntry {
  skill: WorkshopSkill
  origin: InstallOrigin
}

export interface WorkshopInventoryInput {
  scopeKey: string
  revision: number
  status: 'complete' | 'partial' | 'error'
  entries: readonly WorkshopInventoryEntry[]
}

export interface SourceStatus {
  origin: InstallOrigin
  status: 'complete' | 'partial' | 'error'
  fetched: number
  exhausted: boolean
  code?: string
}

/** Evidence is separate from legacy placeholder statistics and scraped timestamps. */
export interface WorkshopRemoteCandidate {
  card: SkillCard
  sourceRef: Extract<SourceRef, { kind: 'skillhub' }> | null
  downloads: number | null
  updatedAt: string | null
  publishedAt: string | null
}

export interface WorkshopQueryInput {
  /** Trusted catalog only; never accept this object from a query request or imported package. */
  catalog: CatalogDoc
  catalogRevision: string
  remote: readonly WorkshopRemoteCandidate[]
  sourceStatus: readonly SourceStatus[]
  inventory: WorkshopInventoryInput
}

export interface WorkshopQueryRequest {
  view: 'discover' | 'mine'
  query: string
  domain: 'all' | 'featured' | WorkshopDomain
  source: InstallOrigin | 'all'
  uninstalledOnly: boolean
  queryRevision: number
  cursor?: string
}

export interface WorkshopQueryResult {
  schemaVersion: 1
  snapshotId: string
  scopeKey: string
  queryKey: string
  catalogRevision: string
  queryRevision: number
  inventoryRevision: number
  featured: WorkshopSkill[]
  items: WorkshopSkill[]
  count: { value: number; mode: 'exact' | 'loaded' }
  completeness: 'complete' | 'partial'
  sortScope: 'complete-result' | 'loaded-result'
  nextCursor: string | null
  sourceStatus: SourceStatus[]
  /** 可选：老快照/老客户端不认该字段，`isWorkshopResponseApplicable` 不校验它。 */
  admission?: AdmissionSummary
}

export interface FetchOptions {
  timeoutMs: number
  userAgent: string
}

export interface PluginConfig {
  apiBase: string
  webBase: string
  skillsDir: string
  timeoutMs: number
  userAgent: string
  maxResults: number
  sortBy: SortBy
  /** Keep plaza React tree with display:none after first open. Default true. */
  plazaKeepAlive: boolean
  /** Host SkillHub JSON memo TTL in seconds (plugins / skills search). Default 90. */
  plazaCacheTtlSec: number
  /** plugin_search 上限（1–8）。 */
  pluginMaxResults: number
  /** connector_search 上限（1–8）。 */
  connectorMaxResults: number
  /** 追加不可卸包；不能覆盖 CORE 四项。 */
  protectedBundlesExtra: string[]
  /** 技能聚合默认参与渠。 */
  aggregateChannels: SkillChannel[]
  /** WorkBuddy 技能市场扩展目录；空则 env → ~/.workbuddy/skills-marketplace。 */
  workbuddySkillsMarketplace: string
  /** 远程 SkillHub 失败时不阻断本地渠。 */
  aggregateRemoteSoftFail: boolean
}

export interface MarketToolSpec {
  name: string
  description: string
  parameters: Record<string, { type: string; required?: boolean; description?: string; items?: { type: string } }>
  output: {
    schema: { type: 'object'; additionalProperties: true }
    render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
    presentationMeta: (args: unknown, value: unknown) => Record<string, unknown>
  }
  presentCall: (args: Record<string, unknown>) => { card: 'generic'; title: string; kind?: string; content: unknown[] }
  presentResult: (args: unknown, info: { isError?: boolean; meta?: Record<string, unknown> }) => { card: 'generic'; title: string; content: unknown[] }
  timeoutMs?: number
  execute: (args: Record<string, unknown>, exec?: unknown) => Promise<unknown>
}

export type SecurityStatus = 'benign' | 'scanning' | 'suspicious' | 'malicious'

export interface SecurityReport {
  status: SecurityStatus
  statusText: string
  reportUrl?: string
}

export interface SecurityReports {
  keen?: SecurityReport
  sanbu?: SecurityReport
}

export interface SkillIntegrity {
  signed: boolean
  contentHash?: string
  signature?: string
}

export interface SkillCard extends BilingualSkillFields {
  id: string
  slug: string
  name: string
  description: string
  category: string
  categoryLabel: string
  version: string
  downloads: number
  stars: number
  installs: number
  iconUrl?: string
  pageUrl: string
  owner?: string
  installed?: boolean
  rating?: number
  verified?: boolean
  publisherName?: string
  security?: SecurityReports
  integrity?: SkillIntegrity
  channel: SkillChannel
  catalogId?: string
  installBackend?: SkillInstallBackend
  tags?: string[]
  recommended?: boolean
  cover?: { asset: string; alt?: string }
}

export interface SearchResult {
  query: string
  queries?: string[]
  category?: string
  sortBy: SortBy
  items: SkillCard[]
  total: number
  offset: number
  hasMore: boolean
  fallback?: boolean
  totalApprox?: boolean
  channelsServed?: SkillChannel[]
  channelCounts?: Partial<Record<SkillChannel, number>>
  channelErrors?: Partial<Record<SkillChannel, string>>
}

export interface InstalledSkill {
  slug: string
  name: string
  description: string
  version?: string
  path: string
}

export interface InstallResult {
  slug: string
  name: string
  version: string
  path: string
  files: number
}

export interface SkillHubSkillRaw {
  slug?: string
  name?: string
  displayName?: string
  description?: string
  description_zh?: string
  summary?: string
  summary_zh?: string
  category?: string
  downloads?: number
  stars?: number
  installs?: number
  stats?: {
    downloads?: number
    stars?: number
    installs?: number
  }
  version?: string
  iconUrl?: string | null
  ownerName?: string
  publisher?: {
    name?: string
    verified?: boolean
  }
  namespace?: {
    canonicalName?: string
    handle?: string
    publicSlug?: string
  }
  securityReports?: {
    keen?: { status?: string; statusText?: string; reportUrl?: string }
    sanbu?: { status?: string; statusText?: string; reportUrl?: string }
  }
}

export interface SkillHubDetailRaw {
  slug?: string
  skill?: SkillHubSkillRaw
  namespace?: SkillHubSkillRaw['namespace']
  owner?: { handle?: string; displayName?: string }
  publisher?: SkillHubSkillRaw['publisher']
  latestVersion?: { version?: string }
  securityReports?: SkillHubSkillRaw['securityReports']
}

/** Host-owned authorization binding. Never deserialize this object from an API payload. */
export interface WorkshopReadScope {
  scopeKey: string
  label: string
  roots: readonly { id: string; path: string }[]
  /** True only when the Host has accounted for every effective filesystem/provider layer. */
  complete: boolean
  reasons: readonly string[]
}

export interface InstallRecord {
  installId: string
  skillKey: string
  token: string
  origin: InstallOrigin
  sourceRef?: SourceRef
  relativePath: string
  version: string | null
  contentHash: string
  enabled: boolean
  installedAt: string | null
  updatedAt: string | null
  verification: 'verified' | 'invalid' | 'unreadable' | 'recovering'
  revision: number
}

export interface PolicyTombstone {
  scopeKey: string
  skillKey: string
  token: string
  reason: 'uninstalled'
  operationId: string
  revision: number
}

export interface WorkshopPreferences {
  autoUpdate: boolean
  revision: number
  lastCheckAt: string | null
  nextEligibleAt: string | null
}

export interface WorkshopState {
  schemaVersion: 1
  scopeKey: string
  revision: number
  records: InstallRecord[]
  preferences: WorkshopPreferences
  policyTombstones: PolicyTombstone[]
}

/** Read projection, not a new installation or a claim of Registry verification. */
export interface WorkshopInventoryRecord {
  installId: string
  skill: WorkshopSkill
  origin: InstallOrigin
  verification: 'readable' | 'invalid' | 'unreadable' | 'unverified'
  installedAt: string | null
  reasons: string[]
}

export interface WorkshopInventoryResult extends WorkshopInventoryInput {
  records: WorkshopInventoryRecord[]
  sourceOptions: Array<InstallOrigin | 'all'>
  reasons: string[]
  scopeVerified: boolean
  preferences: WorkshopPreferences | null
}

export interface CapabilityResult {
  scopeKey: string | null
  scopeVerified: boolean
  scopeLabel: string
  connectionAuth: boolean
  operationAuth: boolean
  exactOrigin: boolean
  registryVerify: boolean
  unifiedPolicy: boolean
  commitBarrier: boolean
  writable: boolean
  reasons: string[]
}

export interface SkillHubListResponse {
  code: number
  message?: string
  data?: {
    skills?: SkillHubSkillRaw[]
    total?: number
  }
}
