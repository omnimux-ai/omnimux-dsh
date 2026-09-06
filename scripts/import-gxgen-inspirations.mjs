import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PLAN_SCHEMA = 'omnimux.gxgen-inspiration-import-plan/v1'
export const RECEIPTS_SCHEMA = 'omnimux.gxgen-inspiration-import-receipts/v1'
const SOURCE_SELECT = 'id,title,assets,cover_r2_key,is_active,deleted_at'
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_TIMEOUT_MS = 15_000
const INSPECTOR_BATCH_SIZE = 200
const RECEIPT_STATUSES = new Set([
  'created',
  'existing',
  'source_duplicate',
  'invalid_source',
  'write_failed',
  'verification_failed',
  'unknown',
])

class SystemError extends Error {}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
  }
  return value
}

export function canonicalJson(value) {
  return JSON.stringify(sorted(value))
}

export function digest(value) {
  const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? value
    : typeof value === 'string' ? value : canonicalJson(value)
  return createHash('sha256').update(bytes).digest('hex')
}

function now(deps) {
  return (deps.now || (() => new Date().toISOString()))()
}

function normalizeBaseURL(raw, flag) {
  let url
  try {
    url = new URL(String(raw || ''))
  } catch {
    throw new Error(`${flag} must be an absolute HTTP(S) URL`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${flag} must be an absolute HTTP(S) URL without credentials, query, or fragment`)
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

function positiveInteger(value, flag, fallback) {
  if (value == null) return fallback
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return Number(value)
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function dataOf(body, label) {
  if (!body || body.success !== true || body.data == null) throw new SystemError(`${label} returned an invalid envelope`)
  return body.data
}

async function fetchResponse(url, init, deps, label) {
  let response
  try {
    const signal = init.signal || AbortSignal.timeout(deps.timeoutMs || DEFAULT_TIMEOUT_MS)
    response = await (deps.fetch || globalThis.fetch)(url, { ...init, redirect: 'error', signal })
  } catch (error) {
    const wrapped = new SystemError(`${label} failed: ${safeMessage(error)}`)
    wrapped.cause = error
    throw wrapped
  }
  return response
}

async function fetchJson(url, init, deps, label) {
  const response = await fetchResponse(url, init, deps, label)
  let body
  try {
    body = await response.json()
  } catch {
    throw new SystemError(`${label} returned non-JSON HTTP ${response.status}`)
  }
  if (!response.ok) {
    const code = typeof body?.code === 'string' ? ` ${body.code}` : ''
    const error = new SystemError(`${label} returned HTTP ${response.status}${code}`)
    error.status = response.status
    error.body = body
    throw error
  }
  return { body, status: response.status }
}

function apiURL(base, path) {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export async function fetchAllSourceRows(config, deps = {}) {
  const rows = []
  let afterID = null
  for (;;) {
    const url = new URL('/rest/v1/published_tasks', `${config.sourceURL}/`)
    url.searchParams.set('select', SOURCE_SELECT)
    url.searchParams.set('is_active', 'eq.true')
    url.searchParams.set('deleted_at', 'is.null')
    url.searchParams.set('order', 'id.asc')
    url.searchParams.set('limit', String(config.pageSize))
    if (afterID != null) url.searchParams.set('id', `gt.${afterID}`)
    const { body } = await fetchJson(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        apikey: config.sourceKey,
        authorization: `Bearer ${config.sourceKey}`,
      },
    }, deps, `source page after ${afterID || 'start'}`)
    if (!Array.isArray(body)) throw new SystemError(`source page after ${afterID || 'start'} is not an array`)
    for (const row of body) {
      if (row?.is_active !== true || row?.deleted_at != null) throw new SystemError('source returned an out-of-scope row')
      if (!nonempty(String(row.id || '')) || (afterID != null && String(row.id) <= afterID)) {
        throw new SystemError('source cursor did not advance monotonically')
      }
      rows.push(row)
    }
    if (body.length < config.pageSize) break
    afterID = String(body.at(-1).id)
  }
  return rows
}

export async function fetchAllTargetRows(config, deps = {}) {
  const rows = []
  for (let page = 1; ; page++) {
    const url = new URL(apiURL(config.targetURL, '/inspirations'))
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(config.pageSize))
    url.searchParams.set('sort', 'new')
    const { body } = await fetchJson(url, {
      method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${config.targetToken}` },
    }, deps, `target page ${page}`)
    const data = dataOf(body, `target page ${page}`)
    if (!Array.isArray(data.items) || !Number.isSafeInteger(Number(data.total))) {
      throw new SystemError(`target page ${page} returned an invalid list`)
    }
    rows.push(...data.items)
    if (rows.length >= Number(data.total)) break
    if (data.items.length === 0) throw new SystemError(`target pagination stopped before total ${data.total}`)
  }
  return rows
}

function scalarTikTokID(value, field) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${field} is an unsafe numeric TikTok ID`)
    value = String(value)
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string TikTok ID`)
  const trimmed = value.trim()
  if (!/^\d{15,22}$/.test(trimmed)) throw new Error(`${field} is not a valid TikTok video ID`)
  return trimmed
}

export function tiktokIdentityFromURL(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let url
  try { url = new URL(raw.trim()) } catch { return null }
  if (!/(^|\.)tiktok\.com$/i.test(url.hostname)) return null
  const match = url.pathname.match(/\/video\/(\d{15,22})(?:\/|$)/)
  return match?.[1] || null
}

function rawIDIdentity(raw) {
  if (typeof raw !== 'string') return null
  const match = raw.trim().match(/^\d{15,22}$/) || raw.trim().match(/(?:^|[-_/])video-(\d{15,22})(?:$|[-_/])/i)
  return match ? (match[1] || match[0]) : null
}

function collectSourceIdentities(row) {
  const assets = row?.assets && typeof row.assets === 'object' && !Array.isArray(row.assets) ? row.assets : {}
  const raw = assets.raw_source && typeof assets.raw_source === 'object' && !Array.isArray(assets.raw_source) ? assets.raw_source : {}
  const found = []
  const errors = []
  const add = (field, producer) => {
    try {
      const value = producer()
      if (value) found.push({ field, value })
    } catch (error) { errors.push(`${field}: ${safeMessage(error)}`) }
  }
  add('source_url', () => tiktokIdentityFromURL(row?.source_url))
  add('assets.source_url', () => tiktokIdentityFromURL(assets.source_url))
  add('assets.tiktok_video_id', () => scalarTikTokID(assets.tiktok_video_id, 'assets.tiktok_video_id'))
  add('assets.raw_source.tiktok_video_id', () => scalarTikTokID(raw.tiktok_video_id, 'assets.raw_source.tiktok_video_id'))
  add('assets.raw_source.id', () => rawIDIdentity(raw.id))
  add('assets.raw_source.videoUrl', () => tiktokIdentityFromURL(raw.videoUrl))
  return { found, errors }
}

function collectTargetIdentities(row) {
  const analysis = row?.analysis && typeof row.analysis === 'object' && !Array.isArray(row.analysis) ? row.analysis : {}
  const embeddedAssets = analysis.assets && typeof analysis.assets === 'object' && !Array.isArray(analysis.assets) ? analysis.assets : {}
  const embeddedRaw = embeddedAssets.raw_source && typeof embeddedAssets.raw_source === 'object' && !Array.isArray(embeddedAssets.raw_source) ? embeddedAssets.raw_source : {}
  const found = []
  const errors = []
  const add = (field, producer) => {
    try {
      const value = producer()
      if (value) found.push({ field, value })
    } catch (error) { errors.push(`${field}: ${safeMessage(error)}`) }
  }
  add('source_url', () => tiktokIdentityFromURL(row?.source_url))
  add('analysis.tiktok_video_id', () => scalarTikTokID(analysis.tiktok_video_id, 'analysis.tiktok_video_id'))
  add('analysis.raw_source.tiktok_video_id', () => scalarTikTokID(analysis.raw_source?.tiktok_video_id, 'analysis.raw_source.tiktok_video_id'))
  add('analysis.raw_source.id', () => rawIDIdentity(analysis.raw_source?.id))
  add('analysis.raw_source.videoUrl', () => tiktokIdentityFromURL(analysis.raw_source?.videoUrl))
  add('analysis.assets.tiktok_video_id', () => scalarTikTokID(embeddedAssets.tiktok_video_id, 'analysis.assets.tiktok_video_id'))
  add('analysis.assets.raw_source.tiktok_video_id', () => scalarTikTokID(embeddedRaw.tiktok_video_id, 'analysis.assets.raw_source.tiktok_video_id'))
  add('analysis.assets.raw_source.id', () => rawIDIdentity(embeddedRaw.id))
  add('analysis.assets.raw_source.videoUrl', () => tiktokIdentityFromURL(embeddedRaw.videoUrl))
  return { found, errors }
}

function resolveIdentity(found, label) {
  const ids = [...new Set(found.map((entry) => entry.value))]
  if (ids.length === 0) throw new Error(`${label} has no TikTok video ID`)
  if (ids.length > 1) throw new Error(`${label} has inconsistent TikTok video IDs: ${ids.join(',')}`)
  return ids[0]
}

function nonempty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function realTags(assets) {
  const candidates = [assets.tags, assets.categories, assets.meta?.source_tags, assets.meta?.tags]
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    const tags = [...new Set(candidate.map(nonempty).filter(Boolean))]
    if (tags.length) return tags
  }
  const hashtags = nonempty(assets.hashtags || assets.raw_source?.hashtags)
  if (hashtags) return [...new Set((hashtags.match(/#[\p{L}\p{N}_-]+/gu) || []).map((tag) => tag.slice(1)).filter(Boolean))]
  return []
}

function metric(value) {
  if (typeof value === 'number') {
    const result = Math.round(value)
    return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(result) && result <= 2_147_483_647 ? result : null
  }
  if (typeof value !== 'string') return null
  const match = value.trim().replaceAll(',', '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i)
  if (!match) return null
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1
  const result = Math.round(Number(match[1]) * multiplier)
  return Number.isSafeInteger(result) && result <= 2_147_483_647 ? result : null
}

function coverReference(row) {
  const key = row?.cover_r2_key
  const invalid = typeof key !== 'string' || !key.startsWith('publications/') ||
    Buffer.byteLength(`r2/${key}`, 'utf8') > 255 || /[\\%?#:\p{Cc}]/u.test(key) ||
    key.split('/').some((part) => !part || part === '.' || part === '..' || part.trim() !== part)
  if (invalid) throw new Error('missing or invalid top-level cover_r2_key')
  return `r2/${key}`
}

function isVideo(assets) {
  const values = [assets.platform, assets.template_type, assets.meta?.type, assets.raw_source?.type]
  return values.some((value) => String(value || '').toLowerCase() === 'tiktok') ||
    values.some((value) => String(value || '').toLowerCase() === 'video')
}

function normalizedTikTokURL(row, assets, tiktokID, authorHandle) {
  const sourceCandidates = [row?.source_url, assets.source_url, assets.raw_source?.videoUrl]
  for (const raw of sourceCandidates) {
    if (tiktokIdentityFromURL(raw) !== tiktokID) continue
    const url = new URL(raw.trim())
    url.protocol = 'https:'
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  }
  return `https://www.tiktok.com/@${encodeURIComponent(authorHandle)}/video/${tiktokID}`
}

function mappedCandidate(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || !nonempty(String(row.id || ''))) throw new Error('source row has no ID')
  if (row.is_active !== true || row.deleted_at != null) throw new Error('source row is inactive or deleted')
  const assets = row.assets && typeof row.assets === 'object' && !Array.isArray(row.assets) ? row.assets : null
  if (!assets) throw new Error('source row has no assets object')
  if (!isVideo(assets)) throw new Error('source row is not a TikTok video')
  const analysis = assets.analysis && typeof assets.analysis === 'object' && !Array.isArray(assets.analysis) ? assets.analysis : null
  if (!analysis) throw new Error('source row has no analysis object')
  const dimensions = ['attraction_analysis', 'global_goal', 'narrative_structure', 'visual_analysis', 'replication_strategy']
  if (dimensions.some((field) => !nonempty(analysis[field]))) throw new Error('source row does not contain all five analysis dimensions')
  const identity = collectSourceIdentities(row)
  if (identity.errors.length) throw new Error(`source row ${row.id} has malformed identity: ${identity.errors.join('; ')}`)
  const tiktokID = resolveIdentity(identity.found, `source row ${row.id}`)
  const title = nonempty(row.title) || nonempty(analysis.video_name) || nonempty(analysis.suggested_title)
  if (!title) throw new Error('source row has no real title')
  const authorHandle = nonempty(assets.creator?.handle) || nonempty(assets.raw_source?.account) || nonempty(assets.meta?.nickname)
  const authorName = nonempty(assets.creator?.name) || authorHandle
  if (!authorHandle || !authorName) throw new Error('source row has no real author')
  const tags = realTags(assets)
  if (!tags.length) throw new Error('source row has no real tags')
  const hotScore = [assets.hot_score, assets.views_numeric, assets.views, assets.likes_numeric, assets.likes].map(metric).find((value) => value != null)
  if (hotScore == null) throw new Error('source row has no real hot score')
  const content = nonempty(assets.caption) || nonempty(assets.hook) || nonempty(analysis.video_description) || title
  const coverRef = coverReference(row)
  const sourceURL = normalizedTikTokURL(row, assets, tiktokID, authorHandle.replace(/^@/, ''))
  const payload = {
    type: 'video',
    title,
    content,
    source_url: sourceURL,
    cover_key: coverRef,
    media_keys: [],
    hot_score: hotScore,
    is_favorite: false,
    tags,
    analysis: {
      hook_highlight: analysis.attraction_analysis,
      target_goal: analysis.global_goal,
      narrative_strategy: analysis.narrative_structure,
      visual_breakdown: analysis.visual_analysis,
      replication_action: analysis.replication_strategy,
      creator: { name: authorName, handle: authorHandle.replace(/^@/, '') },
      tiktok_video_id: tiktokID,
      embed_player_url: `https://www.tiktok.com/player/v1/${tiktokID}`,
      gxgen_source_id: String(row.id),
    },
  }
  const businessPayload = structuredClone(payload)
  delete businessPayload.analysis.gxgen_source_id
  return {
    gxgenID: String(row.id), tiktokID, coverRef, payload,
    sourceRow: row,
    sourceDigest: digest(row), payloadDigest: digest(payload), businessDigest: digest(businessPayload),
  }
}

function classifySources(rows) {
  const skips = []
  const candidates = []
  const blockedIdentityGroups = new Map()
  for (const row of rows) {
    try {
      const { found } = collectSourceIdentities(row)
      const ids = [...new Set(found.map((claim) => claim.value))]
      if (ids.length > 1) for (const id of ids) blockedIdentityGroups.set(id, String(row?.id || '(unknown)'))
    } catch {}
    try {
      candidates.push(mappedCandidate(row))
    } catch (error) {
      skips.push({ gxgenId: String(row?.id || '(unknown)'), status: 'invalid_source', reason: safeMessage(error) })
    }
  }
  const groups = Map.groupBy(candidates, (candidate) => candidate.tiktokID)
  const unique = []
  for (const [tiktokID, group] of groups) {
    group.sort((a, b) => a.gxgenID.localeCompare(b.gxgenID))
    if (blockedIdentityGroups.has(tiktokID)) {
      for (const entry of group) skips.push({ gxgenId: entry.gxgenID, tiktokId: tiktokID, status: 'source_duplicate', reason: `identity conflicts with source row ${blockedIdentityGroups.get(tiktokID)}` })
      continue
    }
    if (new Set(group.map((entry) => entry.businessDigest)).size > 1) {
      for (const entry of group) skips.push({ gxgenId: entry.gxgenID, tiktokId: tiktokID, status: 'source_duplicate', reason: 'conflicting source content for the same TikTok ID' })
      continue
    }
    unique.push(group[0])
    for (const entry of group.slice(1)) skips.push({ gxgenId: entry.gxgenID, tiktokId: tiktokID, status: 'source_duplicate', reason: `identical to source row ${group[0].gxgenID}` })
  }
  return { unique, skips }
}

function targetIndex(rows) {
  const byTikTokID = new Map()
  const conflicts = new Map()
  for (const row of rows) {
    const { found, errors } = collectTargetIdentities(row)
    const ids = [...new Set(found.map((entry) => entry.value))]
    if (errors.length || ids.length > 1) {
      const reason = errors.length ? `target ${row.id} has malformed TikTok identity: ${errors.join('; ')}` : `target ${row.id} has inconsistent TikTok IDs: ${ids.join(',')}`
      conflicts.set(String(row.id), { row, ids, reason })
      continue
    }
    if (ids.length === 1) {
      if (!byTikTokID.has(ids[0])) byTikTokID.set(ids[0], [])
      byTikTokID.get(ids[0]).push(row)
    }
  }
  return { byTikTokID, conflicts }
}

async function spawnInspector(config, manifest, deps) {
  if (deps.inspectCovers) return deps.inspectCovers(manifest, config)
  const root = mkdtempSync(join(tmpdir(), 'omnimux-inspiration-inspect-'))
  chmodSync(root, 0o700)
  const input = join(root, 'manifest.json')
  const output = join(root, 'result.json')
  writeFileSync(input, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  const args = ['covers', 'inspect', '--manifest', input, '--out', output]
  if (config.inspectorEnvFile) args.push('--env-file', config.inspectorEnvFile)
  try {
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(config.inspector, args, { env: process.env, stdio: 'ignore' })
      const timeoutMs = deps.inspectorTimeoutMs || (manifest.items.length * DEFAULT_TIMEOUT_MS + 5_000)
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new SystemError('cover inspector timed out')) }, timeoutMs)
      child.once('error', (error) => { clearTimeout(timer); reject(new SystemError(`cover inspector failed to start: ${safeMessage(error)}`)) })
      child.once('close', (code, signal) => { clearTimeout(timer); resolveResult({ code, signal }) })
    })
    let document = null
    if (existsSync(output)) {
      try { document = JSON.parse(readFileSync(output, 'utf8')) } catch { throw new SystemError('cover inspector wrote invalid JSON') }
    }
    if (result.code !== 0) throw new SystemError(`cover inspector exited unsuccessfully (${result.signal || result.code})`)
    if (!document) throw new SystemError('cover inspector did not write its output')
    return document
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function inspectCandidateBatch(candidates, config, deps) {
  if (candidates.length > INSPECTOR_BATCH_SIZE) throw new Error(`cover inspector batch exceeds ${INSPECTOR_BATCH_SIZE}`)
  const manifest = { items: candidates.map((candidate) => ({ id: candidate.gxgenID, ref: candidate.coverRef })) }
  const output = await spawnInspector(config, manifest, deps)
  if (output?.schemaVersion !== 1 || !Array.isArray(output.items)) throw new SystemError('cover inspector returned an invalid document')
  const byID = new Map()
  for (const item of output.items) {
    if (!manifest.items.some((expected) => expected.id === String(item.id) && expected.ref === item.ref)) {
      throw new SystemError(`cover inspector returned an unexpected item ${String(item?.id)}`)
    }
    if (byID.has(String(item.id))) throw new SystemError(`cover inspector returned duplicate item ${String(item.id)}`)
    if (!['ok', 'invalid', 'unavailable'].includes(item.status)) throw new SystemError(`cover inspector returned invalid status for ${String(item.id)}`)
    byID.set(String(item.id), item)
  }
  if (byID.size !== manifest.items.length) throw new SystemError('cover inspector omitted items')
  if ([...byID.values()].some((item) => item.status === 'unavailable')) throw new SystemError('cover storage is unavailable')
  return byID
}

function snapshotTarget(rows) {
  const normalized = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return { count: normalized.length, digest: digest(normalized), items: normalized }
}

function planCore(document) {
  const { digest: _digest, ...core } = document
  return core
}

function validatePlan(document) {
  if (!document || document.schema !== PLAN_SCHEMA || !Array.isArray(document.items) || !Array.isArray(document.skips)) {
    throw new Error('invalid import plan file')
  }
  if (!/^[a-f0-9]{64}$/.test(document.digest || '') || digest(planCore(document)) !== document.digest) {
    throw new Error('import plan digest mismatch')
  }
  const ids = new Set()
  const tiktokIDs = new Set()
  for (const item of document.items) {
    if (ids.has(item.gxgenId)) throw new Error(`plan contains duplicate source row ${item.gxgenId}`)
    ids.add(item.gxgenId)
    if (digest(item.sourceRow) !== item.sourceDigest || digest(item.payload) !== item.payloadDigest) throw new Error(`plan item ${item.gxgenId} digest mismatch`)
    const mapped = mappedCandidate(item.sourceRow)
    if (mapped.gxgenID !== item.gxgenId || mapped.tiktokID !== item.tiktokId || !sameJSON(mapped.payload, item.payload)) {
      throw new Error(`plan item ${item.gxgenId} no longer satisfies source mapping`)
    }
    if (item.tiktokId !== item.payload?.analysis?.tiktok_video_id) throw new Error(`plan item ${item.gxgenId} identity mismatch`)
    if (tiktokIDs.has(item.tiktokId)) throw new Error(`plan contains duplicate TikTok ID ${item.tiktokId}`)
    tiktokIDs.add(item.tiktokId)
    if (item.cover?.ref !== item.payload?.cover_key || !/^[a-f0-9]{64}$/.test(item.cover?.sha256 || '')) throw new Error(`plan item ${item.gxgenId} cover is invalid`)
  }
  return document
}

function readJSONRoundTrip(file) {
  const text = readFileSync(file, 'utf8')
  const document = JSON.parse(text)
  if (canonicalJson(JSON.parse(JSON.stringify(document))) !== canonicalJson(document)) throw new Error(`${file} failed JSON round-trip validation`)
  return document
}

export function readPlan(file) {
  return validatePlan(readJSONRoundTrip(file))
}

function atomicWriteJSON(file, document, create) {
  if (!isAbsolute(file)) throw new Error('JSON output path must be absolute')
  if (create && existsSync(file)) throw new Error(`refusing to overwrite existing file: ${file}`)
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.${digest(String(Math.random())).slice(0, 8)}.tmp`)
  let fd
  try {
    fd = openSync(temp, 'wx', 0o600)
    writeFileSync(fd, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    chmodSync(temp, 0o600)
    const roundTrip = readJSONRoundTrip(temp)
    if (canonicalJson(roundTrip) !== canonicalJson(document)) throw new Error('JSON output changed during disk round-trip')
    renameSync(temp, file)
    chmodSync(file, 0o600)
  } finally {
    if (fd != null) closeSync(fd)
    if (existsSync(temp)) unlinkSync(temp)
  }
}

function receiptsPath(planFile) {
  return `${planFile}.receipts.json`
}

function emptyReceipts(plan, deps) {
  const document = { schema: RECEIPTS_SCHEMA, planDigest: plan.digest, runs: [], rows: {}, updatedAt: now(deps) }
  for (const skipped of plan.skips) {
    if (!RECEIPT_STATUSES.has(skipped.status)) continue
    document.rows[skipped.gxgenId] = {
      gxgenId: skipped.gxgenId,
      attempts: [{ at: now(deps), mode: 'plan', ...skipped }],
    }
  }
  return document
}

function readReceipts(planFile, plan, deps) {
  const file = receiptsPath(planFile)
  if (!existsSync(file)) return { file, document: emptyReceipts(plan, deps) }
  const document = readJSONRoundTrip(file)
  if (document?.schema !== RECEIPTS_SCHEMA || document.planDigest !== plan.digest || !Array.isArray(document.runs) || !document.rows || typeof document.rows !== 'object') {
    throw new Error('invalid receipts file')
  }
  return { file, document }
}

function writeReceipts(file, document) {
  atomicWriteJSON(file, document, false)
}

function recordReceipt(journal, gxgenID, attempt, deps) {
  if (!RECEIPT_STATUSES.has(attempt.status)) throw new Error(`invalid receipt status ${attempt.status}`)
  const row = journal.rows[gxgenID] || { gxgenId: gxgenID, attempts: [] }
  row.attempts.push({ at: now(deps), ...attempt })
  journal.rows[gxgenID] = row
  journal.updatedAt = now(deps)
}

function durableBinding(journal, gxgenID) {
  return [...(journal.rows[gxgenID]?.attempts || [])].reverse().find((attempt) =>
    attempt.targetId && ['plan', 'external'].includes(attempt.ownership),
  )
}

export async function planImport(options, deps = {}) {
  const config = normalizeConfig(options, 'plan')
  if (existsSync(config.file)) throw new Error(`refusing to overwrite existing plan: ${config.file}`)
  const [sourceRows, targetRows] = await Promise.all([
    fetchAllSourceRows(config, deps),
    fetchAllTargetRows(config, deps),
  ])
  const { unique, skips } = classifySources(sourceRows)
  const target = targetIndex(targetRows)
  const pending = []
  for (const candidate of unique) {
    const conflicting = [...target.conflicts.values()].find((entry) => entry.ids.includes(candidate.tiktokID))
    if (conflicting) {
      skips.push({ gxgenId: candidate.gxgenID, tiktokId: candidate.tiktokID, status: 'invalid_source', reason: conflicting.reason })
      continue
    }
    const existing = target.byTikTokID.get(candidate.tiktokID) || []
    if (existing.length) {
      skips.push({ gxgenId: candidate.gxgenID, tiktokId: candidate.tiktokID, targetId: String(existing[0].id), status: 'existing', reason: 'TikTok video already exists in target' })
      continue
    }
    pending.push(candidate)
  }
  const selected = []
  for (let offset = 0; offset < pending.length && selected.length < config.limit;) {
    const batchSize = Math.min(INSPECTOR_BATCH_SIZE, config.limit - selected.length)
    const batch = pending.slice(offset, offset + batchSize)
    offset += batch.length
    const inspected = await inspectCandidateBatch(batch, config, deps)
    for (const candidate of batch) {
      const cover = inspected.get(candidate.gxgenID)
      if (cover.status === 'invalid') {
        skips.push({ gxgenId: candidate.gxgenID, tiktokId: candidate.tiktokID, status: 'invalid_source', reason: `invalid cover: ${cover.errorCode || 'INVALID'}` })
        continue
      }
      if (!/^[a-f0-9]{64}$/.test(cover.sha256 || '') || !(Number(cover.bytes) > 0) || !String(cover.contentType || '').toLowerCase().startsWith('image/')) {
        throw new SystemError(`cover inspector returned incomplete metadata for ${candidate.gxgenID}`)
      }
      if (selected.length < config.limit) selected.push({
        gxgenId: candidate.gxgenID,
        tiktokId: candidate.tiktokID,
        sourceRow: candidate.sourceRow,
        sourceDigest: candidate.sourceDigest,
        payload: candidate.payload,
        payloadDigest: candidate.payloadDigest,
        cover: { ref: cover.ref, sha256: cover.sha256, bytes: Number(cover.bytes), contentType: cover.contentType },
      })
    }
  }
  const document = {
    schema: PLAN_SCHEMA,
    createdAt: now(deps),
    source: { url: config.sourceURL, select: SOURCE_SELECT, count: sourceRows.length, digest: digest(sourceRows) },
    target: { url: config.targetURL, snapshot: snapshotTarget(targetRows) },
    inspector: { path: config.inspector, envFile: config.inspectorEnvFile || null },
    limit: config.limit,
    pageSize: config.pageSize,
    items: selected,
    skips: skips.sort((a, b) => a.gxgenId.localeCompare(b.gxgenId)),
    stats: { scanned: sourceRows.length, newCandidates: pending.length, planned: selected.length, shortfall: config.limit - selected.length },
  }
  document.digest = digest(planCore(document))
  validatePlan(document)
  atomicWriteJSON(config.file, document, true)
  readPlan(config.file)
  return document
}

function sameJSON(left, right) {
  return canonicalJson(left) === canonicalJson(right)
}

function comparableTags(value) {
  return Array.isArray(value) ? [...new Set(value.map(String))].sort() : []
}

function recordSnapshot(record) {
  return { ...record, tags: comparableTags(record?.tags) }
}

function recordSnapshotDigest(record) {
  return digest(recordSnapshot(record))
}

function assertRecord(record, item) {
  const payload = item.payload
  const fields = ['type', 'title', 'content', 'source_url', 'hot_score', 'is_favorite']
  for (const field of fields) {
    if (!sameJSON(record?.[field], payload[field])) throw new Error(`field ${field} differs from plan`)
  }
  if (!sameJSON(record?.media_keys || [], payload.media_keys) || !sameJSON(record?.analysis, payload.analysis)) throw new Error('analysis or media_keys differ from plan')
  if (!sameJSON(comparableTags(record?.tags), comparableTags(payload.tags))) throw new Error('tags differ from plan')
}

async function getTargetRecord(config, id, deps) {
  const { body } = await fetchJson(apiURL(config.targetURL, `/inspirations/${encodeURIComponent(id)}`), {
    method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${config.targetToken}` },
  }, deps, `GET target inspiration ${id}`)
  const record = dataOf(body, `GET target inspiration ${id}`)
  if (String(record.id) !== String(id)) throw new SystemError(`GET target inspiration ${id} returned ID ${String(record.id)}`)
  return record
}

function targetCoverURL(config, record) {
  const raw = record?.cover_key
  if (typeof raw !== 'string' || !raw) throw new Error('target record has no cover URL')
  const base = new URL(`${config.targetURL}/`)
  const url = new URL(raw, base)
  const prefix = `${base.pathname.replace(/\/$/, '')}/media/`
  if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) throw new Error('target returned an unsafe cover URL')
  return url
}

async function verifyCover(config, record, item, deps) {
  const response = await fetchResponse(targetCoverURL(config, record), {
    method: 'GET', headers: { authorization: `Bearer ${config.targetToken}`, accept: 'image/*' },
  }, deps, `GET target cover for inspiration ${record.id}`)
  if (!response.ok) {
    const error = response.status >= 500 || [401, 403, 429].includes(response.status)
      ? new SystemError(`target cover returned HTTP ${response.status}`)
      : new Error(`target cover returned HTTP ${response.status}`)
    throw error
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (bytes.length !== item.cover.bytes || contentType !== String(item.cover.contentType).toLowerCase() || digest(bytes) !== item.cover.sha256) {
    throw new Error('target cover bytes, content type, or SHA-256 differ from plan')
  }
}

async function verifyRecord(config, id, item, deps) {
  const record = await getTargetRecord(config, id, deps)
  assertRecord(record, item)
  await verifyCover(config, record, item, deps)
  return record
}

function targetMatch(rows, tiktokID) {
  const index = targetIndex(rows)
  const conflicting = [...index.conflicts.values()].find((entry) => entry.ids.includes(tiktokID))
  if (conflicting) throw new Error(conflicting.reason)
  const matches = index.byTikTokID.get(tiktokID) || []
  if (matches.length > 1) throw new Error(`multiple target records contain TikTok ID ${tiktokID}`)
  return matches[0] || null
}

async function reconcile(config, item, deps) {
  const rows = await fetchAllTargetRows(config, deps)
  return targetMatch(rows, item.tiktokId)
}

async function recheckSourceAndCovers(plan, config, deps) {
  const rows = await fetchAllSourceRows(config, deps)
  const byID = new Map(rows.map((row) => [String(row.id), row]))
  const plannedIDs = new Set(plan.items.map((item) => item.tiktokId))
  const expectedBusinessDigests = new Map(plan.items.map((item) => {
    const mapped = mappedCandidate(item.sourceRow)
    return [item.tiktokId, mapped.businessDigest]
  }))
  for (const row of rows) {
    let claims = []
    try { claims = collectSourceIdentities(row).found } catch {}
    const relevant = [...new Set(claims.map((claim) => claim.value))].filter((id) => plannedIDs.has(id))
    if (!relevant.length) continue
    let mapped
    try { mapped = mappedCandidate(row) } catch (error) {
      throw new Error(`source row ${String(row.id)} now conflicts with a planned TikTok identity: ${safeMessage(error)}`)
    }
    if (relevant.length !== 1 || mapped.tiktokID !== relevant[0] || mapped.businessDigest !== expectedBusinessDigests.get(relevant[0])) {
      throw new Error(`source content conflict appeared for planned TikTok ID ${relevant.join(',')}`)
    }
  }
  const checked = new Map()
  for (let offset = 0; offset < plan.items.length; offset += INSPECTOR_BATCH_SIZE) {
    const batch = plan.items.slice(offset, offset + INSPECTOR_BATCH_SIZE)
    const candidates = batch.map((item) => ({ gxgenID: item.gxgenId, coverRef: item.cover.ref }))
    const inspected = await inspectCandidateBatch(candidates, config, deps)
    for (const item of batch) {
      const row = byID.get(item.gxgenId)
      if (!row || digest(row) !== item.sourceDigest) throw new Error(`source row ${item.gxgenId} changed since planning`)
      const cover = inspected.get(item.gxgenId)
      if (cover.status !== 'ok' || cover.sha256 !== item.cover.sha256 || Number(cover.bytes) !== item.cover.bytes || String(cover.contentType).toLowerCase() !== String(item.cover.contentType).toLowerCase()) {
        throw new Error(`source cover ${item.gxgenId} changed since planning`)
      }
      checked.set(item.gxgenId, true)
    }
  }
  return checked
}

function lockPath(targetURL) {
  return join(tmpdir(), `omnimux-gxgen-inspiration-${digest(targetURL).slice(0, 24)}.lock`)
}

async function withTargetLock(targetURL, action, deps) {
  const file = deps.lockPath || lockPath(targetURL)
  let fd
  try {
    fd = openSync(file, 'wx', 0o600)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`another import holds the local target lock: ${file}`)
    throw error
  }
  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, targetURL })}\n`, 'utf8')
    return await action()
  } finally {
    closeSync(fd)
    unlinkSync(file)
  }
}

async function createOne(config, item, deps) {
  const before = await reconcile(config, item, deps)
  if (before) {
    return { status: 'existing', ownership: 'external', targetId: String(before.id), targetSnapshotDigest: recordSnapshotDigest(before), reason: 'appeared before POST; preserved without mutation' }
  }
  let response
  try {
    response = await fetchJson(apiURL(config.targetURL, '/inspirations?return_existing=true'), {
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${config.targetToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(item.payload),
    }, deps, `POST target inspiration for ${item.gxgenId}`)
  } catch (error) {
    let found
    try { found = await reconcile(config, item, deps) } catch (reconcileError) {
      return { status: 'unknown', error: `${safeMessage(error)}; reconciliation failed: ${safeMessage(reconcileError)}` }
    }
    if (!found) {
      if (error?.status >= 400 && error.status < 500) return { status: 'write_failed', ownership: 'plan', fatal: [401, 403, 429].includes(error.status), error: safeMessage(error) }
      return { status: 'unknown', fatal: true, error: `${safeMessage(error)}; no target record found during reconciliation` }
    }
    try {
      await verifyRecord(config, found.id, item, deps)
      return { status: 'created', ownership: 'plan', targetId: String(found.id), reconciled: true, reason: 'POST failed after target committed the exact record' }
    } catch (verifyError) {
      return { status: verifyError instanceof SystemError ? 'unknown' : 'verification_failed', ownership: 'plan', fatal: verifyError instanceof SystemError, targetId: String(found.id), error: `POST failed and reconciled record is incomplete: ${safeMessage(verifyError)}` }
    }
  }
  let record
  try { record = dataOf(response.body, `POST target inspiration for ${item.gxgenId}`) } catch (error) {
    return { status: 'unknown', error: safeMessage(error) }
  }
  const targetID = record?.id
  if (targetID == null) return { status: 'unknown', error: 'POST target response has no record ID' }
  if (response.body.existed === true) {
    try {
      const existing = await getTargetRecord(config, targetID, deps)
      return { status: 'existing', ownership: 'external', targetId: String(targetID), targetSnapshotDigest: recordSnapshotDigest(existing), httpStatus: response.status }
    } catch (error) {
      const softDeleted = error instanceof SystemError && error.status === 404
      return { status: softDeleted ? 'write_failed' : error instanceof SystemError ? 'unknown' : 'write_failed', ownership: 'external', fatal: error instanceof SystemError && !softDeleted, targetId: String(targetID), error: `existing response cannot be read as an active record: ${safeMessage(error)}` }
    }
  }
  try {
    await verifyRecord(config, targetID, item, deps)
  } catch (error) {
    return { status: error instanceof SystemError ? 'unknown' : 'verification_failed', ownership: 'plan', fatal: error instanceof SystemError, targetId: String(targetID), error: safeMessage(error) }
  }
  return { status: 'created', ownership: 'plan', targetId: String(targetID), httpStatus: response.status }
}

function validateRuntimeAgainstPlan(config, plan) {
  if (config.sourceURL !== plan.source.url) throw new Error('--source-url does not match the plan')
  if (config.targetURL !== plan.target.url) throw new Error('--target-url does not match the plan')
  if (config.inspector !== plan.inspector.path || (config.inspectorEnvFile || null) !== plan.inspector.envFile) throw new Error('inspector configuration does not match the plan')
}

export async function applyImport(options, deps = {}) {
  const config = normalizeConfig(options, 'apply')
  const plan = readPlan(config.file)
  validateRuntimeAgainstPlan(config, plan)
  return withTargetLock(config.targetURL, async () => {
    const { file, document: journal } = readReceipts(config.file, plan, deps)
    const run = { mode: 'apply', startedAt: now(deps), finishedAt: null, counts: {}, failure: null }
    const runAttempts = []
    journal.runs.push(run)
    writeReceipts(file, journal)
    try {
      await recheckSourceAndCovers(plan, config, deps)
      await verifyExistingSnapshot(plan, config, deps)
      const currentRows = await fetchAllTargetRows(config, deps)
      for (const item of plan.items) {
        let result
        try {
          const current = targetMatch(currentRows, item.tiktokId)
          const previous = durableBinding(journal, item.gxgenId)
          if (current) {
            const planOwned = previous?.ownership === 'plan' || String(current.analysis?.gxgen_source_id || '') === item.gxgenId
            if (planOwned) {
              const expectedID = previous?.targetId || String(current.id)
              if (String(current.id) !== expectedID) throw new Error(`same plan resolved to target ID ${current.id}, expected ${expectedID}`)
              await verifyRecord(config, current.id, item, deps)
              result = { status: 'existing', ownership: 'plan', targetId: String(current.id), reason: 'same plan target record reverified' }
            } else if (previous?.ownership === 'external') {
              if (String(current.id) !== previous.targetId || recordSnapshotDigest(current) !== previous.targetSnapshotDigest) throw new Error('external target record changed since it was skipped')
              result = { status: 'existing', ownership: 'external', targetId: String(current.id), targetSnapshotDigest: previous.targetSnapshotDigest, reason: 'external target record remains unchanged' }
            } else {
              result = { status: 'existing', ownership: 'external', targetId: String(current.id), targetSnapshotDigest: recordSnapshotDigest(current), reason: 'target record appeared after planning; preserved without mutation' }
            }
          } else if (previous) {
            const bound = await getTargetRecord(config, previous.targetId, deps)
            if (previous.ownership === 'plan') {
              await verifyRecord(config, previous.targetId, item, deps)
              result = { status: 'existing', ownership: 'plan', targetId: previous.targetId, reason: 'bound plan record reverified by ID' }
            } else {
              if (recordSnapshotDigest(bound) !== previous.targetSnapshotDigest) throw new Error('external target record changed since it was skipped')
              result = { status: 'existing', ownership: 'external', targetId: previous.targetId, targetSnapshotDigest: previous.targetSnapshotDigest, reason: 'bound external record reverified by ID' }
            }
          } else {
            result = await createOne(config, item, deps)
            if (['created', 'existing'].includes(result.status)) currentRows.push(await getTargetRecord(config, result.targetId, deps))
          }
        } catch (error) {
          result = { status: error instanceof SystemError ? 'unknown' : 'verification_failed', fatal: error instanceof SystemError, error: safeMessage(error) }
        }
        recordReceipt(journal, item.gxgenId, { mode: 'apply', tiktokId: item.tiktokId, ...result }, deps)
        runAttempts.push(result)
        writeReceipts(file, journal)
        if (result.fatal || result.status === 'unknown') {
          run.failure = result.error || 'fatal target error'
          break
        }
      }
    } catch (error) {
      run.failure = safeMessage(error)
    }
    run.counts = Object.fromEntries([...RECEIPT_STATUSES].map((status) => [status, runAttempts.filter((attempt) => attempt.status === status).length]))
    run.finishedAt = now(deps)
    writeReceipts(file, journal)
    const failed = Boolean(run.failure) || runAttempts.length !== plan.items.length || runAttempts.some((attempt) => !['created', 'existing'].includes(attempt.status))
    return { planDigest: plan.digest, receipts: file, counts: run.counts, failure: run.failure, ok: !failed }
  }, deps)
}

async function verifyExistingSnapshot(plan, config, deps) {
  for (const expected of plan.target.snapshot.items) {
    const current = await getTargetRecord(config, expected.id, deps)
    if (!sameJSON(recordSnapshot(current), recordSnapshot(expected))) throw new Error(`pre-existing target record ${expected.id} changed since planning`)
  }
}

export async function verifyImport(options, deps = {}) {
  const config = normalizeConfig(options, 'verify')
  const plan = readPlan(config.file)
  validateRuntimeAgainstPlan(config, plan)
  return withTargetLock(config.targetURL, async () => {
    const { file, document: journal } = readReceipts(config.file, plan, deps)
    const run = { mode: 'verify', startedAt: now(deps), finishedAt: null, counts: {}, failure: null }
    const runAttempts = []
    journal.runs.push(run)
    writeReceipts(file, journal)
    try {
      await verifyExistingSnapshot(plan, config, deps)
      for (const item of plan.items) {
        const previous = durableBinding(journal, item.gxgenId)
        if (!previous) {
          const result = { mode: 'verify', tiktokId: item.tiktokId, status: 'verification_failed', error: 'no successful apply receipt exists' }
          recordReceipt(journal, item.gxgenId, result, deps)
          runAttempts.push(result)
        } else {
          try {
            if (previous.ownership === 'external') {
              const current = await getTargetRecord(config, previous.targetId, deps)
              if (recordSnapshotDigest(current) !== previous.targetSnapshotDigest) throw new Error('external target record changed since it was skipped')
            } else {
              await verifyRecord(config, previous.targetId, item, deps)
            }
            const result = { mode: 'verify', tiktokId: item.tiktokId, status: 'existing', ownership: previous.ownership || 'plan', targetId: previous.targetId, ...(previous.targetSnapshotDigest ? { targetSnapshotDigest: previous.targetSnapshotDigest } : {}) }
            recordReceipt(journal, item.gxgenId, result, deps)
            runAttempts.push(result)
          } catch (error) {
            const result = {
              mode: 'verify', tiktokId: item.tiktokId,
              status: error instanceof SystemError ? 'unknown' : 'verification_failed', fatal: error instanceof SystemError,
              ownership: previous.ownership, targetId: previous.targetId,
              ...(previous.targetSnapshotDigest ? { targetSnapshotDigest: previous.targetSnapshotDigest } : {}),
              error: safeMessage(error),
            }
            recordReceipt(journal, item.gxgenId, result, deps)
            runAttempts.push(result)
            if (result.fatal) throw error
          }
        }
        writeReceipts(file, journal)
      }
    } catch (error) {
      run.failure = safeMessage(error)
    }
    run.counts = Object.fromEntries([...RECEIPT_STATUSES].map((status) => [status, runAttempts.filter((attempt) => attempt.status === status).length]))
    run.finishedAt = now(deps)
    writeReceipts(file, journal)
    return { planDigest: plan.digest, receipts: file, counts: run.counts, failure: run.failure, ok: !run.failure && runAttempts.length === plan.items.length && runAttempts.every((attempt) => attempt.status === 'existing') }
  }, deps)
}

function parseArgs(argv, env) {
  const [mode, ...rest] = argv
  if (!['plan', 'apply', 'verify'].includes(mode)) throw new Error('usage: import-gxgen-inspirations.mjs <plan|apply|verify> --file ABS --source-url URL --target-url URL --inspector ABS [--limit N] [--page-size N]')
  const values = {}
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]
    if (!flag?.startsWith('--') || rest[index + 1] == null) throw new Error(`invalid argument: ${flag || '(missing)'}`)
    const name = flag.slice(2)
    if (values[name] != null) throw new Error(`duplicate argument: ${flag}`)
    values[name] = rest[index + 1]
  }
  const allowed = new Set(['file', 'source-url', 'source-key', 'target-url', 'target-token', 'inspector', 'inspector-env-file', 'limit', 'page-size'])
  for (const key of Object.keys(values)) if (!allowed.has(key)) throw new Error(`unknown argument: --${key}`)
  return {
    mode,
    file: values.file,
    sourceURL: values['source-url'], sourceKey: values['source-key'] || env.GXGEN_SUPABASE_KEY,
    targetURL: values['target-url'], targetToken: values['target-token'] || env.OMNIMUX_ACCESS_TOKEN,
    inspector: values.inspector, inspectorEnvFile: values['inspector-env-file'],
    limit: values.limit, pageSize: values['page-size'],
  }
}

function normalizeConfig(options, mode) {
  if (!options?.file || !isAbsolute(options.file)) throw new Error('--file must be an absolute path')
  if (!options.sourceKey) throw new Error('source key must be provided by --source-key or GXGEN_SUPABASE_KEY')
  if (!options.targetToken) throw new Error('target token must be provided by --target-token or OMNIMUX_ACCESS_TOKEN')
  if (!options.inspector || !isAbsolute(options.inspector)) throw new Error('--inspector must be an absolute executable path')
  if (options.inspectorEnvFile && !isAbsolute(options.inspectorEnvFile)) throw new Error('--inspector-env-file must be absolute')
  const pageSize = positiveInteger(options.pageSize, '--page-size', DEFAULT_PAGE_SIZE)
  if (pageSize > DEFAULT_PAGE_SIZE) throw new Error(`--page-size must be no greater than ${DEFAULT_PAGE_SIZE}`)
  return {
    ...options,
    mode,
    sourceURL: normalizeBaseURL(options.sourceURL, '--source-url'),
    targetURL: normalizeBaseURL(options.targetURL, '--target-url'),
    limit: positiveInteger(options.limit, '--limit', mode === 'plan' ? 20 : undefined),
    pageSize,
  }
}

export async function runCli(argv, deps = {}) {
  const parsed = parseArgs(argv, deps.env || process.env)
  const result = parsed.mode === 'plan' ? await planImport(parsed, deps) : parsed.mode === 'apply' ? await applyImport(parsed, deps) : await verifyImport(parsed, deps)
  if (parsed.mode === 'plan') {
    const summary = { mode: 'plan', planDigest: result.digest, planned: result.items.length, shortfall: result.stats.shortfall, file: parsed.file }
    if (result.stats.shortfall > 0) {
      const error = new Error(`only ${result.items.length} eligible new inspirations were planned; requested ${result.limit}`)
      error.summary = summary
      throw error
    }
    return summary
  }
  if (!result.ok) {
    const error = new Error(`${parsed.mode} did not complete successfully`)
    error.summary = { mode: parsed.mode, ...result }
    throw error
  }
  return { mode: parsed.mode, ...result }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(JSON.stringify(error.summary || { error: safeMessage(error) }))
    process.exitCode = 1
  })
}
