#!/usr/bin/env node
/**
 * scripts/verify-dsh-lockfile-uniform.mjs
 *
 * 确定性硬门禁：防止 @deepseek-ai/dsh-* 同一 minor 预发布线在锁文件中被
 * 拆成多个 rc 版本（如 dsh-llm 同时落 0.1.5-rc.2 与 0.1.5-rc.3）。
 *
 * 背景（Issue #2905）：dsh-* 的 MessageId/UserMessage 等品牌类型以
 * unique symbol 实现，同包两版本即构成名义类型冲突；pnpm 对
 * `^0.1.5-rc.2` 允许解到 rc.3，一旦上游再发预发布而锁文件部分条目
 * 滞留旧 rc，就会在 prepare（tsc -b）阶段以 TS2345 炸掉 pnpm install。
 *
 * 规则：对任一 @deepseek-ai/dsh-* 包，同一 minor 线（如 0.1.5-rc.*）
 * 在 packages:/snapshots: 中出现的 rc 版本数必须 ≤ 1。
 * 不同 minor（0.1.1 与 0.1.5）互不约束——viewer 合法钉 0.1.1 线。
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const KEY_RE = /^'(@deepseek-ai\/dsh-[a-z0-9-]+)@(\d+\.\d+\.\d+-rc\.\d+)/

/** 从锁文件文本提取 包名→minor线→rc版本集合 的映射。 */
export function collectRcVersions(lockfileText) {
  /** @type {Map<string, Map<string, Set<string>>>} pkg -> minor -> rc set */
  const table = new Map()
  for (const line of lockfileText.split('\n')) {
    const m = KEY_RE.exec(line.trim())
    if (!m) continue
    const [, pkg, version] = m
    const minor = version.replace(/-rc\.\d+$/, '')
    const rc = version.match(/-rc\.(\d+)$/)[1]
    if (!table.has(pkg)) table.set(pkg, new Map())
    const byMinor = table.get(pkg)
    if (!byMinor.has(minor)) byMinor.set(minor, new Set())
    byMinor.get(minor).add(rc)
  }
  return table
}

/** 返回违规清单：[{pkg, minor, rcs}]，空数组即通过。 */
export function findViolations(lockfileText) {
  const violations = []
  for (const [pkg, byMinor] of collectRcVersions(lockfileText)) {
    for (const [minor, rcs] of byMinor) {
      if (rcs.size > 1) {
        violations.push({ pkg, minor, rcs: [...rcs].sort() })
      }
    }
  }
  return violations.sort((a, b) => a.pkg.localeCompare(b.pkg))
}

export function main(lockfilePath = resolve(repoRoot, 'pnpm-lock.yaml')) {
  const text = readFileSync(lockfilePath, 'utf-8')
  const violations = findViolations(text)
  if (violations.length === 0) {
    console.log('verify-dsh-lockfile-uniform: OK — 同 minor 线内 dsh-* 均为单一 rc 版本')
    return 0
  }
  console.error('verify-dsh-lockfile-uniform: FAIL — dsh-* 同 minor 线出现多个 rc 版本（品牌类型将名义冲突）:')
  for (const v of violations) {
    console.error(`  ${v.pkg} @ ${v.minor}-rc.{${v.rcs.join(',')}}`)
  }
  console.error('修复：统一提升相关插件 package.json 的 dsh-* 版本声明后重建锁文件（pnpm install --lockfile-only）。参见 Issue #2905。')
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
