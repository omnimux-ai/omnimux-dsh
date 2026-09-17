import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fetchOpts, parseSlug } from './api.js'
import { dshHome } from './config-store.js'
import { loadCatalog } from './expert/catalog.js'
import { installItem } from './expert/install.js'
import { packageRoot, profileDir } from './expert/paths.js'
import { fetchBytes } from './http.js'
import { catalogSkillSlug, findCatalogSkill } from './skill-aggregate.js'
import { unzipToFiles } from './unzip.js'
import type { InstalledSkill, InstallResult, PluginConfig } from './types.js'

export interface InstallDeps {
  fetchBytes: typeof fetchBytes
}

const defaultDeps: InstallDeps = { fetchBytes }

export function safeRelPath(raw: string): string {
  const path = String(raw || '').replace(/\\/g, '/')
  if (!path) throw new Error('空路径')
  if (path.startsWith('/') || /(?:^|\/)\.\.(?:\/|$)/.test(path) || path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`不安全路径 ${raw}`)
  }
  return path
}

export function skillDir(skillsDir: string, slug: string): string {
  const root = resolve(skillsDir)
  const target = resolve(root, parseSlug(slug))
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || rel.split(sep).includes('..')) throw new Error('拒绝路径穿越')
  return target
}

export function parseVersion(raw: unknown): string {
  const v = String(raw || '').trim().replace(/^v/i, '')
  if (!v) return ''
  if (!/^[0-9a-z][0-9a-z._+-]{0,31}$/i.test(v)) throw new Error('无效版本')
  return v
}

export async function installSkill(slug: string, cfg: PluginConfig, deps: InstallDeps = defaultDeps, signal?: AbortSignal, version?: string, catalogId?: string): Promise<InstallResult> {
  const raw = String(slug || '')
  let lookup = raw
  try {
    lookup = parseSlug(raw)
  }
  catch {
    lookup = raw.trim().toLowerCase()
  }
  const catalogItem = findCatalogSkill(lookup, catalogId)
  if (catalogItem) return installFromCatalog(catalogItem, cfg)
  const id = parseSlug(slug)
  const requested = parseVersion(version)
  const files = await downloadSkillFiles(id, cfg, deps, signal, requested)
  if (!files['SKILL.md']) throw new Error(`技能 ${id} 缺少 SKILL.md`)
  const target = skillDir(cfg.skillsDir, id)
  await mkdir(cfg.skillsDir, { recursive: true })
  const staging = await mkdtemp(join(cfg.skillsDir, `.tmp-${id}-`))
  try {
    for (const [path, body] of Object.entries(files)) {
      const rel = safeRelPath(path)
      const dest = join(staging, rel)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, body)
    }
    await rm(target, { recursive: true, force: true })
    await rename(staging, target)
  } catch (err) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw err
  }
  const meta = parseFrontmatter(files['SKILL.md'].toString('utf8'))
  return {
    slug: id,
    name: meta.name || id,
    version: meta.version || requested,
    path: target,
    files: Object.keys(files).length,
  }
}

async function installFromCatalog(item: { id: string; title?: string; skill?: string }, cfg: PluginConfig): Promise<InstallResult> {
  const home = dshHome()
  const slug = catalogSkillSlug(item)
  installItem({
    catalog: loadCatalog(),
    id: item.id,
    home,
    profileDir: profileDir(home),
    packageRoot: packageRoot(),
  })
  const catalogDest = join(home, 'skills', slug)
  const target = skillDir(cfg.skillsDir, slug)
  if (resolve(catalogDest) !== resolve(target)) {
    await mkdir(cfg.skillsDir, { recursive: true })
    await rm(target, { recursive: true, force: true })
    await cp(catalogDest, target, { recursive: true })
  }
  let skillMd = ''
  try {
    skillMd = await readFile(join(target, 'SKILL.md'), 'utf8')
  }
  catch {
    throw new Error(`技能 ${slug} 缺少 SKILL.md`)
  }
  const meta = parseFrontmatter(skillMd)
  return {
    slug,
    name: meta.name || item.title || slug,
    version: meta.version || '',
    path: target,
    files: await countFiles(target),
  }
}

async function countFiles(dir: string): Promise<number> {
  let n = 0
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) n += await countFiles(path)
    else n += 1
  }
  return n
}

async function downloadSkillFiles(slug: string, cfg: PluginConfig, deps: InstallDeps = defaultDeps, signal?: AbortSignal, version?: string): Promise<Record<string, Buffer>> {
  const id = parseSlug(slug)
  const ver = parseVersion(version)
  const zipUrl = `${cfg.apiBase.replace(/\/$/, '')}/api/v1/download?slug=${encodeURIComponent(id)}${ver ? `&version=${encodeURIComponent(ver)}` : ''}&source=dsh`
  const { body, contentType } = await deps.fetchBytes(zipUrl, fetchOpts(cfg), signal)
  if (!/zip|octet-stream/i.test(contentType) && body.subarray(0, 2).toString() !== 'PK') {
    throw new Error(`SkillHub download 不是 zip: ${id}`)
  }
  return normalizeZipFiles(unzipToFiles(body))
}

export function normalizeZipFiles(files: Record<string, Buffer>): Record<string, Buffer> {
  const keys = Object.keys(files)
  const prefix = commonTopDir(keys)
  const out: Record<string, Buffer> = {}
  for (const [path, body] of Object.entries(files)) {
    const rel = prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path
    if (!rel || rel.endsWith('/')) continue
    out[safeRelPath(rel)] = body
  }
  return out
}

export async function listInstalled(skillsDir: string): Promise<InstalledSkill[]> {
  const root = resolve(skillsDir)
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  const out: InstalledSkill[] = []
  for (const name of entries.sort()) {
    if (name.startsWith('.')) continue
    const dir = join(root, name)
    try {
      const st = await stat(dir)
      if (!st.isDirectory()) continue
      const skillMd = join(dir, 'SKILL.md')
      const text = await readFile(skillMd, 'utf8')
      const meta = parseFrontmatter(text)
      out.push({
        slug: name,
        name: meta.name || name,
        description: meta.description || '',
        version: meta.version,
        path: dir,
      })
    } catch {
      continue
    }
  }
  return out
}

export async function installedSlugs(skillsDir: string): Promise<Set<string>> {
  return new Set((await listInstalled(skillsDir)).map((it) => it.slug))
}

/**
 * Download a remote SkillHub zip in memory and return SKILL.md text.
 * Never writes into the install directory.
 */
export async function peekSkillMarkdown(slug: string, cfg: PluginConfig, deps: InstallDeps = defaultDeps, signal?: AbortSignal): Promise<string> {
  const files = await downloadSkillFiles(slug, cfg, deps, signal)
  const buf = files['SKILL.md']
  return buf ? buf.toString('utf8') : ''
}

export async function uninstallSkill(slug: string, skillsDir: string): Promise<{ slug: string; path: string }> {
  const id = parseSlug(slug)
  const target = skillDir(skillsDir, id)
  let hasSkill = false
  try {
    await readFile(join(target, 'SKILL.md'))
    hasSkill = true
  } catch {
    hasSkill = false
  }
  if (!hasSkill) throw new Error(`未安装或不含 SKILL.md: ${id}`)
  await rm(target, { recursive: true, force: true })
  return { slug: id, path: target }
}

export function parseFrontmatter(text: string): { name?: string; description?: string; version?: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const out: { name?: string; description?: string; version?: string } = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(name|description|version)\s*:\s*(.*)$/)
    if (!m) continue
    const value = m[2].trim().replace(/^['"]|['"]$/g, '')
    if (m[1] === 'name') out.name = value
    if (m[1] === 'description') out.description = value
    if (m[1] === 'version') out.version = value
  }
  return out
}

function commonTopDir(paths: string[]): string {
  if (!paths.length) return ''
  const first = paths[0].replace(/\\/g, '/').split('/')[0]
  if (!first || first.includes('.')) return ''
  return paths.every((p) => p.replace(/\\/g, '/').startsWith(`${first}/`)) ? `${first}/` : ''
}
