import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { invalidateCatalogMemos, isInstalled } from './catalog.js'
import { MCP_BEGIN, MCP_END, mcpRowPattern, mcpRowId, skillDir } from './paths.js'

let connectorChain = Promise.resolve()
let connectorBusy = 0

export function isConnectorPatchBusy() {
  return connectorBusy > 0
}

/** Serializes Agent connector_* and HTTP catalogInstall/catalogUninstall MCP patch writes. Callers queue. */
export function withConnectorPatchLock(fn) {
  const guarded = async () => {
    connectorBusy += 1
    try {
      return await fn()
    } finally {
      connectorBusy -= 1
    }
  }
  const run = connectorChain.then(guarded, guarded)
  connectorChain = run.then(() => undefined, () => undefined)
  return run
}

/**
 * @param {ReturnType<typeof decorateCatalog> extends infer T ? any : never} catalog
 * @param {string} id
 */
export function findItem(catalog, id) {
  return catalog.items.find((item) => item.id === id)
}

/**
 * @param {{
 *   catalog: ReturnType<import('./catalog.js').parseCatalog>,
 *   id: string,
 *   home: string,
 *   profileDir: string,
 *   packageRoot: string,
 * }} opts
 */
export function installItem(opts) {
  const item = findItem(opts.catalog, opts.id)
  if (!item) throw new Error(`unknown item ${opts.id}`)
  const roots = { home: opts.home, profileDir: opts.profileDir, packageRoot: opts.packageRoot }
  if (isInstalled(item, roots)) return { id: item.id, installed: true, already: true }
  try {
    if (item.kind === 'connector') {
      writeMcpRow(opts.profileDir, item)
      return { id: item.id, installed: true, kind: 'connector' }
    }
    if (!item.skill) throw new Error(`item ${item.id} missing skill`)
    if (item.source.type === 'bundled') {
      installBundledPack(opts.home, item, opts.packageRoot)
      return { id: item.id, installed: true, kind: item.kind, skill: item.skill, source: 'bundled' }
    }
    if (item.source.type === 'git') {
      installGitBundle(opts.home, item)
      return { id: item.id, installed: true, kind: item.kind, skill: item.skill, source: 'git' }
    }
    throw new Error(`item ${item.id} has no installable skill source`)
  } finally {
    invalidateCatalogMemos()
  }
}

/**
 * 本地仓库缓存根：仅在显式设置 WORKBUDDYSKILLS_ROOT 时启用（离线/开发便利）。
 * 未设置时不解析本地仓库，直接走 fetchGitTree —— 产品路径不依赖开发机目录。
 */
const LOCAL_REPO_ROOT = (process.env.WORKBUDDYSKILLS_ROOT || '').trim().replace(/\/+$/, '')

function resolveLocalRepo(repo) {
  if (!LOCAL_REPO_ROOT) return ''
  const repoName = repo ? String(repo).split('/').pop() : ''
  const candidates = [
    repoName ? join(dirname(LOCAL_REPO_ROOT), repoName) : '',
    LOCAL_REPO_ROOT,
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

/**
 * Read SKILL.md from a catalog item without copying it into $DSH_HOME/skills.
 * Bundled packs are read from the plugin package; git packs use the existing
 * sparse cache under esc-gallery (not the install directory).
 * @param {{ skill?: string, source?: { type?: string, path?: string, repo?: string, ref?: string } } | null | undefined} item
 * @param {{ home: string, packageRoot: string }} roots
 */
export function readCatalogSkillMarkdown(item, roots) {
  if (!item || !item.source) return ''
  try {
    if (item.source.type === 'bundled') {
      const from = join(roots.packageRoot, item.source.path || '')
      if (!existsSync(from)) return ''
      if (statSync(from).isDirectory()) {
        const md = join(from, 'SKILL.md')
        return existsSync(md) ? readFileSync(md, 'utf8') : ''
      }
      return readFileSync(from, 'utf8')
    }
    if (item.source.type === 'git') {
      const from = fetchGitTree(roots.home, item)
      if (!from || !existsSync(from)) return ''
      if (statSync(from).isDirectory()) {
        const md = join(from, 'SKILL.md')
        return existsSync(md) ? readFileSync(md, 'utf8') : ''
      }
      return readFileSync(from, 'utf8')
    }
  } catch {
    return ''
  }
  return ''
}

/**
 * Copy one archive directory. Prefer local clone when present, otherwise fetch sparse git tree.
 * @param {string} home
 * @param {{ skill?: string, title?: string, summary?: string, source: { type: string, repo?: string, path?: string, ref?: string } }} item
 */
export function installGitBundle(home, item) {
  if (!item.skill) throw new Error('git install missing skill')
  const destDir = skillDir(home, item.skill)
  if (existsSync(join(destDir, 'SKILL.md'))) return
  const sub = item.source.path
  const localBase = resolveLocalRepo(item.source.repo)
  const local = localBase ? join(localBase, sub) : ''
  const from = local && existsSync(local) ? local : fetchGitTree(home, item)
  if (!existsSync(from)) throw new Error(`git bundle missing: ${sub}`)
  mkdirSync(dirname(destDir), { recursive: true })
  if (statSync(from).isDirectory()) cpRecursive(from, destDir)
  else {
    mkdirSync(destDir, { recursive: true })
    copyFileSync(from, join(destDir, 'SKILL.md'))
  }
  ensureSkillMd(destDir, item)
  installNestedSkills(home, destDir)
}

/**
 * Copy a bundled catalog entry. A file is a single SKILL.md; a directory is a
 * full expert/team pack (agents/*.md + nested skills), not a flattened prompt.
 * @param {string} home
 * @param {{ skill?: string, title?: string, summary?: string, source: { type: string, path?: string } }} item
 * @param {string} packageRoot
 */
export function installBundledPack(home, item, packageRoot) {
  if (!item.skill) throw new Error('bundled install missing skill')
  const from = join(packageRoot, item.source.path || '')
  if (!existsSync(from)) throw new Error(`bundled skill missing: ${item.source.path}`)
  const destDir = skillDir(home, item.skill)
  mkdirSync(dirname(destDir), { recursive: true })
  if (statSync(from).isDirectory()) {
    cpRecursive(from, destDir)
    ensureSkillMd(destDir, item)
    installNestedSkills(home, destDir)
    return
  }
  mkdirSync(destDir, { recursive: true })
  copyFileSync(from, join(destDir, 'SKILL.md'))
}

/**
 * Expert packs keep tools under skills/<name>/. DSH only discovers one level
 * at $DSH_HOME/skills/<name>/SKILL.md, so flatten nested skills next to the pack.
 * @param {string} home
 * @param {string} packDir
 */
export function installNestedSkills(home, packDir) {
  const nestedRoot = join(packDir, 'skills')
  if (!existsSync(nestedRoot) || !statSync(nestedRoot).isDirectory()) return
  for (const name of readdirSync(nestedRoot)) {
    const src = join(nestedRoot, name)
    if (!statSync(src).isDirectory()) continue
    if (!existsSync(join(src, 'SKILL.md'))) continue
    const dest = skillDir(home, name)
    if (existsSync(join(dest, 'SKILL.md'))) continue
    cpRecursive(src, dest)
  }
}

/**
 * Flatten one skill that lives at a caller-named pack-relative location, for packs
 * that are already flat (each skill directly under the pack root) and therefore
 * carry no `skills/` middle layer for `installNestedSkills` to scan.
 * Returns false when the source has no SKILL.md or the destination already exists.
 * @param {string} home
 * @param {string} packDir
 * @param {string} name destination slug under $DSH_HOME/skills/
 * @param {string} relPath pack-relative source directory
 */
export function installSkillAt(home, packDir, name, relPath) {
  const src = join(packDir, relPath)
  if (!existsSync(join(src, 'SKILL.md'))) return false
  const dest = skillDir(home, name)
  if (existsSync(join(dest, 'SKILL.md'))) return false
  cpRecursive(src, dest)
  return true
}

/**
 * @param {string} home
 * @param {{ source: { repo?: string, path?: string, ref?: string } }} item
 */
function fetchGitTree(home, item) {
  const cache = join(home, 'esc-gallery', 'cache', String(item.source.repo || 'repo').replace('/', '__'))
  mkdirSync(dirname(cache), { recursive: true })
  const ref = item.source.ref || 'main'
  const sub = item.source.path
  if (!existsSync(join(cache, '.git'))) {
    runGit(['clone', '--filter=blob:none', '--sparse', `https://github.com/${item.source.repo}.git`, cache])
  }
  runGit(['-C', cache, 'sparse-checkout', 'set', '--cone', sub])
  runGit(['-C', cache, 'fetch', '--depth', '1', 'origin', ref])
  runGit(['-C', cache, 'checkout', `origin/${ref}`])
  return join(cache, sub)
}

/**
 * Expert packs ship agents/*.md, not a root SKILL.md. Write a thin entry so dsh can discover them.
 * @param {string} destDir
 * @param {{ skill?: string, title?: string, summary?: string }} item
 */
export function ensureSkillMd(destDir, item) {
  const dest = join(destDir, 'SKILL.md')
  if (existsSync(dest)) return
  const pluginPath = join(destDir, '.codebuddy-plugin', 'plugin.json')
  let name = item.skill || 'expert'
  let title = item.title || name
  let summary = item.summary || title
  let lead = ''
  if (existsSync(pluginPath)) {
    try {
      const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'))
      name = plugin.agentName || plugin.name || name
      title = plugin.displayName?.zh || plugin.displayName?.en || plugin.name || title
      summary = plugin.displayDescription?.zh || plugin.description || summary
      lead = plugin.agentName || plugin.teamInfo?.leadAgent || ''
    } catch {
      // keep fallbacks from the catalog row
    }
  }
  const leadFile = lead ? join(destDir, 'agents', `${lead}.md`) : ''
  const body = leadFile && existsSync(leadFile)
    ? readFileSync(leadFile, 'utf8')
    : `# ${title}\n\n${summary}\n`
  const header = `---\nname: ${name}\ndescription: ${JSON.stringify(summary)}\n---\n\n`
  writeFileSync(dest, body.startsWith('---') ? body : header + body)
}

/**
 * @param {string[]} args
 */
function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout || result.status}`)
  }
}

/**
 * @param {string} from
 * @param {string} to
 */
function cpRecursive(from, to) {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    if (name === '.git') continue
    const src = join(from, name)
    const dest = join(to, name)
    if (statSync(src).isDirectory()) cpRecursive(src, dest)
    else copyFileSync(src, dest)
  }
}

/**
 * @param {string} profileDir
 * @param {{ id: string, serverName?: string, source: { type: string, transport?: string, command?: string, args?: string[], url?: string } }} item
 */
export function writeMcpRow(profileDir, item) {
  if (item.source.type !== 'mcp') throw new Error(`item ${item.id} is not an mcp source`)
  const patchPath = join(profileDir, 'cordis.patch.yml')
  mkdirSync(dirname(patchPath), { recursive: true })
  const existing = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '[]\n'
  const row = formatMcpRow(item)
  const next = spliceManaged(existing, row)
  writeFileSync(patchPath, next)
  invalidateCatalogMemos()
}

/**
 * @param {{ id: string, serverName?: string, source: { transport?: string, command?: string, args?: string[], url?: string } }} item
 */
export function formatMcpRow(item) {
  const id = mcpRowId(item.id)
  const serverName = item.serverName || item.id
  const transport = item.source.transport || 'stdio'
  const lines = [
    `    - id: ${id}`,
    `      name: '@deepseek-ai/dsh-mcp-client'`,
    `      config:`,
    `        serverName: ${yamlScalar(serverName)}`,
    `        transport: ${transport}`,
  ]
  if (transport === 'stdio') {
    lines.push(`        command: ${yamlScalar(item.source.command || '')}`)
    const args = item.source.args || []
    if (args.length > 0) {
      lines.push(`        args: [${args.map(yamlScalar).join(', ')}]`)
    }
  } else {
    lines.push(`        url: ${yamlScalar(item.source.url || '')}`)
  }
  return lines.join('\n')
}

/**
 * @param {string} text
 * @param {string} row
 */
export function spliceManaged(text, row) {
  const begin = MCP_BEGIN
  const end = MCP_END
  const start = text.indexOf(begin)
  const stop = text.indexOf(end)
  if (start >= 0 && stop > start) {
    const before = text.slice(0, start)
    const block = text.slice(start, stop + end.length)
    const after = text.slice(stop + end.length)
    // 幂等判断用整行精确匹配：行首 `    - id: esc-mcp-cn-tencent-docs` 是
    // `    - id: esc-mcp-cn-tencent-docs-oa` 的前缀，子串匹配会误判"已写入"
    const header = row.split('\n')[0]
    const rowId = header.trim().slice('- id: '.length)
    if (mcpRowPattern(rowId).test(block)) return text
    const inserted = block.replace(end, `${row}\n${end}`)
    return before + inserted + after
  }
  const trimmed = text.replace(/\s+$/, '')
  const prefix = trimmed === '[]' || trimmed === ''
    ? '- insert:\n'
    : `${trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`}\n- insert:\n`
  return `${prefix}${begin}\n${row}\n${end}\n`
}

/**
 * 从 cordis.patch.yml 的 omnimux-market 托管段中删除某个连接器的 MCP 行块。
 * 只动 MCP_BEGIN/MCP_END 标记对之间的内容；标记对之外一个字节都不改。
 * 文件或该 id 不存在时幂等返回（无操作）。
 * @param {string} profileDir
 * @param {{ id: string }} item
 */
export function removeMcpRow(profileDir, item) {
  const patchPath = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(patchPath)) return
  const text = readFileSync(patchPath, 'utf8')
  const next = dropManagedRow(text, mcpRowId(item.id))
  if (next === text) return
  writeFileSync(patchPath, next)
  invalidateCatalogMemos()
}

/**
 * @param {string} text
 * @param {string} rowId 形如 `esc-mcp-<itemId>`
 */
export function dropManagedRow(text, rowId) {
  const begin = MCP_BEGIN
  const end = MCP_END
  const start = text.indexOf(begin)
  const stop = text.indexOf(end)
  if (start < 0 || stop < start) return text
  const before = text.slice(0, start)
  const managed = text.slice(start, stop + end.length)
  const after = text.slice(stop + end.length)
  const lines = managed.split('\n')
  const beginIdx = lines.indexOf(begin)
  const endIdx = lines.indexOf(end)
  if (beginIdx < 0 || endIdx < beginIdx) return text
  const rowLine = `- id: ${rowId}`
  let rowStart = -1
  for (let i = beginIdx + 1; i < endIdx; i++) {
    if (lines[i].trim() === rowLine) { rowStart = i; break }
  }
  if (rowStart < 0) return text
  // 行块：从该 `- id:` 行到下一个 `    - id:` 行或 MCP_END 行之前
  let rowEnd = endIdx
  for (let i = rowStart + 1; i < endIdx; i++) {
    if (/^\s*- id:\s/.test(lines[i])) { rowEnd = i; break }
  }
  lines.splice(rowStart, rowEnd - rowStart)
  const newEndIdx = endIdx - (rowEnd - rowStart)
  // 托管段内再无 `- id:` 行时，连标记对一起删除
  const hasRows = lines.slice(beginIdx + 1, newEndIdx).some((l) => /^\s*- id:\s/.test(l))
  if (!hasRows) {
    lines.splice(beginIdx, newEndIdx - beginIdx + 1)
    // 托管段整体清空时，若 MCP_BEGIN 紧邻的上一行整行恰为孤立的 `- insert:` 行头
    // （只有 writeMcpRow/spliceManaged 会写出这个形状），连同它一起删除，避免残留
    // `insert: null` 空条目并在反复装卸时累积行头。spliceManaged 写入的空行分隔符
    // （`- insert:` 上一行的单个空行）一并还原；其他形状一律不动。
    if (lines.length === 0) {
      const beforeLines = before.split('\n')
      // before 以 '\n' 结尾，split 后最后一个元素是 ''，倒数第二个才是标记对的上一行
      const headerIdx = beforeLines.length - 2
      if (headerIdx >= 0 && beforeLines[headerIdx].trim() === '- insert:') {
        beforeLines.splice(headerIdx, 1)
        if (headerIdx > 0 && beforeLines[headerIdx - 1] === '') beforeLines.splice(headerIdx - 1, 1)
        const tail = after.startsWith('\n') ? after.slice(1) : after
        let restored = beforeLines.join('\n') + tail
        // 原文件为空/`[]` 时还原为规范的 `[]`（spliceManaged 的空文件默认形态）
        if (restored.trim() === '') restored = '[]\n'
        return restored
      }
    }
  }
  return before + lines.join('\n') + after
}

/**
 * @param {string} value
 */
function yamlScalar(value) {
  if (/^[A-Za-z0-9_./@+-]+$/.test(value)) return value
  return JSON.stringify(value)
}
