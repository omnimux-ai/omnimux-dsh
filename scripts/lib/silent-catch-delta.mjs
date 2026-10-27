#!/usr/bin/env node
/**
 * scripts/lib/silent-catch-delta.mjs
 * 静默兜底的「增量」比对：只回答「本任务相对基线新增了哪些 SC1/SC2」。
 *
 * 合同：docs/contracts/anti-agent-fake-completion-guard.md §3.2.1
 * 依赖：scripts/verify-silent-catch.mjs 的 scanContent()（同一口径，不复制规则）
 *
 * 为什么不做写时全量扫描：
 *   写时无法区分「新增」与「存量」，会误伤存量代码，还会拖慢每一次编辑。
 *   交付命令（commit/push/PR）是天然边界：此刻改动集已知，基线可解析。
 *
 * 性能（Issue #3510）：
 *   逐文件 `git show` 的代价是 O(文件数) 个进程（10 文件 ≈ 613ms，200 文件 ≈ 1767ms），
 *   逼近交付钩子的 8s 预算。现在改为：
 *     1) 用当前文件内容预筛——不含 catch 子句的文件不可能新增 SC1/SC2，直接跳过；
 *     2) 剩下的文件用一次 `git cat-file --batch` 批量取基线 blob；
 *   典型提交 1 个 git 进程。
 *
 * 键 = path | rule | bodyKey（catch 体归一化摘要），按出现次数做差集：
 *   - 行号漂移不影响判定；
 *   - 同一文件里多处相同形态的空 catch 也能按次数识别新增。
 *
 * 故障策略：git/IO 异常返回 error，由调用方 fail-open（扫描器缺陷不得阻断全部交付）。
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { DEFINITE_RULES, isScannableSource, loadAllowlist, scanContent } from '../verify-silent-catch.mjs'

const MAX_FILE_BYTES = 1024 * 1024
/** 交付钩子有 8s 预算；超过上限改为 fail-open，避免拖垮每次提交。 */
const MAX_FILES = 300
const MAX_BATCH_BYTES = 64 * 1024 * 1024
/** 预筛：当前内容不含 catch 子句 → 不可能新增 SC1/SC2，无需读基线。 */
const CATCH_HINT = /catch\s*[({]/

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 8000, maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0) return null
  return String(result.stdout || '')
}

/**
 * 一次 `git cat-file --batch` 读取多个 `<ref>:<path>` 的基线内容。
 * 不存在的路径（新文件）映射为 null；整体失败返回 null 由调用方 fail-open。
 * @returns {Map<string, string|null>|null}
 */
export function readBlobsAtRef(root, ref, paths) {
  if (paths.length === 0) return new Map()
  const questions = `${paths.map((rel) => `${ref}:${rel}`).join('\n')}\n`
  const result = spawnSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: questions,
    timeout: 8000,
    maxBuffer: MAX_BATCH_BYTES,
  })
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null

  const buffer = result.stdout
  const blobs = new Map()
  let offset = 0
  for (const rel of paths) {
    const lineEnd = buffer.indexOf(10, offset)
    if (lineEnd < 0) return null
    const header = buffer.toString('utf8', offset, lineEnd)
    offset = lineEnd + 1
    // 缺失/歧义：`<ref>:<path> missing` 或 `... ambiguous`
    if (/\s(?:missing|ambiguous)$/.test(header)) {
      blobs.set(rel, null)
      continue
    }
    const size = Number(header.slice(header.lastIndexOf(' ') + 1))
    if (!Number.isInteger(size) || size < 0 || offset + size > buffer.length) return null
    blobs.set(rel, buffer.toString('utf8', offset, offset + size))
    offset += size + 1 // 跳过内容后的换行
  }
  return blobs
}

/** 基线提交：优先 merge-base(HEAD, origin/main)，退化为 HEAD。 */
export function resolveBaseRef(root) {
  const mergeBase = git(root, ['merge-base', 'HEAD', 'origin/main'])
  if (mergeBase && mergeBase.trim()) return mergeBase.trim()
  const head = git(root, ['rev-parse', 'HEAD'])
  return head && head.trim() ? head.trim() : null
}

function hitKey(hit) {
  return `${hit.rule}|${hit.bodyKey}`
}

/**
 * 纯函数：按 key 计数做差集，返回当前多出来的命中。
 * @returns {object[]} 新增命中（保持当前顺序）
 */
export function compareHits(beforeHits, currentHits) {
  const budget = new Map()
  for (const hit of beforeHits) {
    const key = hitKey(hit)
    budget.set(key, (budget.get(key) || 0) + 1)
  }
  const added = []
  for (const hit of currentHits) {
    const key = hitKey(hit)
    const left = budget.get(key) || 0
    if (left > 0) budget.set(key, left - 1)
    else added.push(hit)
  }
  return added
}

/**
 * 比对改动文件的静默 catch 增量。
 * @param {string} root 仓库根
 * @param {{baseRef?: string, changedFiles: string[]}} input
 * @returns {{hits: object[], suspected: object[], scanned: number, baseRef: string|null, error: string|null}}
 */
export function newSilentCatchHits(root, { baseRef, changedFiles } = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles.filter((rel) => isScannableSource(rel)) : []
  let ref = baseRef
  try {
    if (!ref) ref = resolveBaseRef(root)
    if (!ref) return { hits: [], suspected: [], scanned: 0, baseRef: null, error: 'no-base-ref' }
    if (files.length > MAX_FILES) {
      return { hits: [], suspected: [], scanned: 0, baseRef: ref, error: 'too-many-files' }
    }
    // 基线必须是可解析的提交：否则「基线为空」会把全部存量误判为新增。
    if (!git(root, ['rev-parse', '--verify', `${ref}^{commit}`])) {
      return { hits: [], suspected: [], scanned: 0, baseRef: ref, error: 'invalid-base-ref' }
    }

    // 预筛：读当前内容，只保留可能出现 catch 增量的候选文件。
    const current = new Map()
    const candidates = []
    for (const rel of files) {
      let text
      try {
        text = readFileSync(resolve(root, rel), 'utf8')
      } catch {
        continue // 文件已删除：不可能新增吞错点
      }
      if (text.length > MAX_FILE_BYTES) continue
      current.set(rel, text)
      if (CATCH_HINT.test(text)) candidates.push(rel)
    }
    if (candidates.length === 0) {
      return { hits: [], suspected: [], scanned: files.length, baseRef: ref, error: null }
    }

    const baseline = readBlobsAtRef(root, ref, candidates)
    if (baseline === null) return { hits: [], suspected: [], scanned: files.length, baseRef: ref, error: 'batch-read-failed' }

    const hits = []
    const suspected = []
    for (const rel of candidates) {
      const before = baseline.get(rel) ?? ''
      const added = compareHits(scanContent(rel, before), scanContent(rel, current.get(rel)))
      for (const hit of added) {
        const row = { path: rel, rule: hit.rule, line: hit.line, detail: hit.detail }
        if (DEFINITE_RULES.has(hit.rule)) hits.push(row)
        else suspected.push(row)
      }
    }
    // 豁免：与全量扫描共用同一份 allowlist（path + rule + line 绑定）。
    // 少了这一步，门禁提示里「写进 allowlist 可豁免」在增量路径上就是空话（#3838）。
    // allowlist 非法时沿用 loadAllowlist 的 errors，不放行全部。
    const allow = loadAllowlist(root)
    if (allow.errors.length > 0) {
      return { hits, suspected, scanned: files.length, baseRef: ref, error: `allowlist-invalid: ${allow.errors.join('; ')}` }
    }
    const isAllowed = (row) => allow.entries.some((entry) => (
      String(entry.path).replace(/\\/g, '/') === String(row.path).replace(/\\/g, '/')
      && entry.rule === row.rule
      && entry.line === row.line
    ))
    const keptHits = hits.filter((row) => !isAllowed(row))
    const keptSuspected = suspected.filter((row) => !isAllowed(row))
    return { hits: keptHits, suspected: keptSuspected, scanned: files.length, baseRef: ref, error: null }
  } catch (error) {
    return { hits: [], suspected: [], scanned: 0, baseRef: ref || null, error: error?.message || 'unknown' }
  }
}
