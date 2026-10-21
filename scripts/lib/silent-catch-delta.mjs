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
 * 键 = path | rule | bodyKey（catch 体归一化摘要），按出现次数做差集：
 *   - 行号漂移不影响判定；
 *   - 同一文件里多处相同形态的空 catch 也能按次数识别新增。
 *
 * 故障策略：git/IO 异常返回 error，由调用方 fail-open（扫描器缺陷不得阻断全部交付）。
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { DEFINITE_RULES, isScannableSource, scanContent } from '../verify-silent-catch.mjs'

const MAX_FILE_BYTES = 1024 * 1024
/** 交付钩子有 8s 预算：单文件一次 `git show`，超过上限改为 fail-open，避免拖垮每次提交。 */
const MAX_FILES = 300

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 8000, maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0) return null
  return String(result.stdout || '')
}

/** 基线提交：优先 merge-base(HEAD, origin/main)，退化为 HEAD。 */
export function resolveBaseRef(root) {
  const mergeBase = git(root, ['merge-base', 'HEAD', 'origin/main'])
  if (mergeBase && mergeBase.trim()) return mergeBase.trim()
  const head = git(root, ['rev-parse', 'HEAD'])
  return head && head.trim() ? head.trim() : null
}

/** 读取某个 ref 下的文件内容；不存在返回 null（新文件即「基线为空」）。 */
export function readAtRef(root, ref, rel) {
  const content = git(root, ['show', `${ref}:${rel}`])
  return content === null ? null : content
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

    const hits = []
    const suspected = []
    for (const rel of files) {
      let current
      try {
        current = readFileSync(resolve(root, rel), 'utf8')
      } catch {
        continue // 文件已删除：不可能新增吞错点
      }
      if (current.length > MAX_FILE_BYTES) continue
      const before = readAtRef(root, ref, rel) ?? ''
      const added = compareHits(scanContent(rel, before), scanContent(rel, current))
      for (const hit of added) {
        const row = { path: rel, rule: hit.rule, line: hit.line, detail: hit.detail }
        if (DEFINITE_RULES.has(hit.rule)) hits.push(row)
        else suspected.push(row)
      }
    }
    return { hits, suspected, scanned: files.length, baseRef: ref, error: null }
  } catch (error) {
    return { hits: [], suspected: [], scanned: 0, baseRef: ref || null, error: error?.message || 'unknown' }
  }
}
