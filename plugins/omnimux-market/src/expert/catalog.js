import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { packageRoot, mcpRowId, mcpRowPattern, skillDir } from './paths.js'

const TABS = new Set(['experts', 'skills', 'connectors'])
const KINDS = new Set(['expert', 'team', 'skill', 'connector'])
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** @type {Map<string, { mtimeMs: number, size: number, doc: ReturnType<typeof parseCatalog> }>} */
const catalogMemo = new Map()
/** skillDir(home, skill) → boolean */
const skillInstalledMemo = new Map()
/** `${profileDir}\0${itemId}` → boolean */
const mcpInstalledMemo = new Map()
/** profileDir → { mtimeMs: number, size: number, text: string } | { missing: true } */
const mcpPatchMemo = new Map()

/**
 * @param {string} [catalogPath]
 */
export function catalogRoot(catalogPath) {
  if (catalogPath) return catalogPath
  return join(packageRoot(), 'catalog')
}

/**
 * @param {string} [catalogPath]
 */
export function loadCatalog(catalogPath) {
  const path = catalogPath || join(catalogRoot(), 'index.json')
  let st
  try {
    st = statSync(path)
  } catch {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return parseCatalog(raw)
  }
  const hit = catalogMemo.get(path)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.doc
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const doc = parseCatalog(raw)
  catalogMemo.set(path, { mtimeMs: st.mtimeMs, size: st.size, doc })
  return doc
}

/** Drop catalog parse + installed memos (call after install/uninstall writes). */
export function invalidateCatalogMemos() {
  catalogMemo.clear()
  skillInstalledMemo.clear()
  mcpInstalledMemo.clear()
  mcpPatchMemo.clear()
}

/** Test helper. */
export function catalogMemoSize() {
  return catalogMemo.size
}

/**
 * @param {unknown} raw
 */
export function parseCatalog(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('catalog: expected object')
  const doc = /** @type {Record<string, unknown>} */ (raw)
  if (doc.schema !== 1) throw new Error('catalog: unsupported schema')
  if (typeof doc.generated_at !== 'string' || !doc.generated_at) throw new Error('catalog: generated_at required')
  const tabs = Array.isArray(doc.tabs) ? doc.tabs.map(String) : ['experts', 'skills', 'connectors']
  for (const tab of tabs) {
    if (!TABS.has(tab)) throw new Error(`catalog: bad tab ${tab}`)
  }
  const categories = Array.isArray(doc.categories) ? doc.categories.map(parseCategory) : []
  const items = Array.isArray(doc.items) ? doc.items.map(parseItem) : []
  const ids = new Set()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`catalog: duplicate id ${item.id}`)
    ids.add(item.id)
  }
  const featured = Array.isArray(doc.featured)
    ? doc.featured.map(String).filter((id) => ids.has(id))
    : []
  return {
    schema: 1,
    generated_at: doc.generated_at,
    tabs,
    categories,
    featured,
    items,
  }
}

/**
 * @param {unknown} raw
 */
function parseAvatar(raw) {
  if (typeof raw !== 'string' || !raw) return ''
  if (/^\/esc\/avatars\/[a-z0-9-]+\.png$/.test(raw)) return raw
  if (/^https:\/\/raw\.githubusercontent\.com\/infometa\/workbuddyskills\/(?:main|master)\/experts\/[A-Za-z0-9._-]+\/avatars\/[A-Za-z0-9._-]+\.png$/.test(raw)) {
    return raw
  }
  return ''
}

function parseCategory(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('catalog: bad category')
  const row = /** @type {Record<string, unknown>} */ (raw)
  const id = String(row.id || '')
  const title = String(row.title || '')
  const tab = String(row.tab || '')
  if (!ID.test(id)) throw new Error(`catalog: bad category id ${id}`)
  if (!title) throw new Error(`catalog: category ${id} missing title`)
  if (!TABS.has(tab)) throw new Error(`catalog: category ${id} bad tab`)
  return { id, title, tab }
}

/**
 * @param {unknown} raw
 */
function parseItem(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('catalog: bad item')
  const row = /** @type {Record<string, unknown>} */ (raw)
  const id = String(row.id || '')
  const tab = String(row.tab || '')
  const kind = String(row.kind || '')
  const title = String(row.title || '')
  const summary = String(row.summary || '')
  const category = String(row.category || '')
  if (!ID.test(id)) throw new Error(`catalog: bad item id ${id}`)
  if (!TABS.has(tab)) throw new Error(`catalog: item ${id} bad tab`)
  if (!KINDS.has(kind)) throw new Error(`catalog: item ${id} bad kind`)
  if (!title || title.length > 40) throw new Error(`catalog: item ${id} bad title`)
  if (!summary || summary.length > 200) throw new Error(`catalog: item ${id} bad summary`)
  if (!ID.test(category)) throw new Error(`catalog: item ${id} bad category`)
  const subtitle = typeof row.subtitle === 'string' ? row.subtitle.trim().slice(0, 24) : ''
  const avatar = parseAvatar(row.avatar)
  const tags = Array.isArray(row.tags) ? row.tags.map(String).slice(0, 6) : []
  const skill = typeof row.skill === 'string' && ID.test(row.skill) ? row.skill : undefined
  const serverName = typeof row.serverName === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(row.serverName)
    ? row.serverName
    : undefined
  const source = parseSource(row.source, id)
  if ((kind === 'expert' || kind === 'team' || kind === 'skill') && !skill) {
    throw new Error(`catalog: item ${id} missing skill`)
  }
  if (kind === 'connector' && !serverName) {
    throw new Error(`catalog: item ${id} missing serverName`)
  }
  const hub = parseHub(row.hub)
  const item = { id, tab, kind, title, subtitle, summary, category, tags, avatar, skill, serverName, source, hub }
  // Skill-only metadata; expert/team fields and top-level featured retain their contract.
  if (kind === 'skill' && tab === 'skills') {
    return {
      ...item,
      recommended: Object.hasOwn(row, 'recommended') && row.recommended === true,
      cover: parseSkillCover(row.cover),
      downloads: typeof row.downloads === 'number' && Number.isSafeInteger(row.downloads) && row.downloads >= 0
        ? row.downloads : null,
      version: typeof row.version === 'string' && row.version.trim() ? row.version.trim() : null,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
      publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : null,
    }
  }
  return item
}

/** Only controlled relative raster asset references; no URL proxy or inline SVG. */
function parseSkillCover(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const { asset, alt } = raw
  if (typeof asset !== 'string' || !/^catalog\/covers\/[a-z0-9][a-z0-9-]*\.(png|jpg|jpeg|webp)$/.test(asset)) return undefined
  return { asset, alt: typeof alt === 'string' ? alt.slice(0, 200) : '' }
}

/**
 * SkillHub 重复标记（可选）：{ slug, name?, version?, downloads? }。
 * @param {unknown} raw
 */
function parseHub(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const row = /** @type {Record<string, unknown>} */ (raw)
  const slug = String(row.slug || '')
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(slug)) return undefined
  const out = { slug }
  if (typeof row.name === 'string' && row.name) out.name = row.name.slice(0, 80)
  if (typeof row.version === 'string' && row.version) out.version = row.version.slice(0, 40)
  if (typeof row.downloads === 'number' && row.downloads > 0) out.downloads = row.downloads
  return out
}

/**
 * @param {unknown} raw
 * @param {string} id
 */
function parseSource(raw, id) {
  if (!raw || typeof raw !== 'object') throw new Error(`catalog: item ${id} missing source`)
  const row = /** @type {Record<string, unknown>} */ (raw)
  const type = String(row.type || '')
  if (type === 'bundled') {
    const path = String(row.path || '')
    const bundled = path.startsWith('catalog/skills/') || path.startsWith('catalog/experts/')
    if (!bundled || path.includes('..')) {
      throw new Error(`catalog: item ${id} bad bundled path`)
    }
    return { type: 'bundled', path }
  }
  if (type === 'git') {
    const repo = String(row.repo || '')
    const path = String(row.path || '')
    const ref = String(row.ref || 'main')
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      throw new Error(`catalog: item ${id} bad git repo`)
    }
    if (!path || path.includes('..') || path.startsWith('/')) {
      throw new Error(`catalog: item ${id} bad git path`)
    }
    return { type: 'git', repo, path, ref }
  }
  if (type === 'mcp') {
    const transport = String(row.transport || 'stdio')
    if (transport !== 'stdio' && transport !== 'streamable-http') {
      throw new Error(`catalog: item ${id} bad mcp transport`)
    }
    if (transport === 'stdio') {
      const command = String(row.command || '')
      if (!command) throw new Error(`catalog: item ${id} missing mcp command`)
      const args = Array.isArray(row.args) ? row.args.map(String) : []
      return { type: 'mcp', transport, command, args }
    }
    const url = String(row.url || '')
    if (!/^https?:\/\//.test(url)) throw new Error(`catalog: item ${id} bad mcp url`)
    return { type: 'mcp', transport, url }
  }
  throw new Error(`catalog: item ${id} unsupported source`)
}

/**
 * @param {ReturnType<typeof parseCatalog>} catalog
 * @param {{ home: string, profileDir: string, packageRoot: string }} roots
 */
export function decorateCatalog(catalog, roots) {
  return {
    ...catalog,
    items: catalog.items.map((item) => ({
      ...item,
      installed: isInstalled(item, roots),
    })),
  }
}

/**
 * @param {ReturnType<typeof parseItem>} item
 * @param {{ home: string, profileDir: string, packageRoot: string }} roots
 */
export function isInstalled(item, roots) {
  if (item.kind === 'connector') {
    return mcpInstalled(roots.profileDir, item.id)
  }
  if (!item.skill) return false
  const path = join(skillDir(roots.home, item.skill), 'SKILL.md')
  if (skillInstalledMemo.has(path)) return skillInstalledMemo.get(path) === true
  const ok = existsSync(path)
  skillInstalledMemo.set(path, ok)
  return ok
}

/**
 * @param {string} profileDir
 * @param {string} itemId
 */
export function mcpInstalled(profileDir, itemId) {
  const key = `${profileDir}\0${itemId}`
  if (mcpInstalledMemo.has(key)) return mcpInstalledMemo.get(key) === true
  const text = readMcpPatchText(profileDir)
  if (text == null) {
    mcpInstalledMemo.set(key, false)
    return false
  }
  // 整行精确匹配：cn-tencent-docs 不能误中 cn-tencent-docs-oa（id 前缀碰撞）
  const ok = mcpRowPattern(mcpRowId(itemId)).test(text)
  mcpInstalledMemo.set(key, ok)
  return ok
}

/**
 * @param {string} profileDir
 * @returns {string | null}
 */
function readMcpPatchText(profileDir) {
  const patch = join(profileDir, 'cordis.patch.yml')
  let st
  try {
    st = statSync(patch)
  } catch {
    mcpPatchMemo.set(profileDir, { missing: true })
    return null
  }
  const hit = mcpPatchMemo.get(profileDir)
  if (hit && !('missing' in hit) && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit.text
  }
  const text = readFileSync(patch, 'utf8')
  mcpPatchMemo.set(profileDir, { mtimeMs: st.mtimeMs, size: st.size, text })
  return text
}
