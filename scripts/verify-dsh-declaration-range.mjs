#!/usr/bin/env node
/**
 * DSH 宿主兼容声明校验（#3688 宿主兼容半边）。
 *
 * 校验对象是**宿主装配面**，不是本地开发 pin。四条断言：
 *  1. 每个 `@deepseek-ai/dsh-*` peer 容纳新宿主 `0.2.1-rc.3`；cordis 容纳 `4.0.5`、
 *     schemastery 容纳 `3.18.5`。
 *  2. **不得收窄**：每个 dsh-* peer 仍须容纳至少一个旧世代代表版本（见 OLD_GENERATION_PROBES），
 *     否则就是把旧宿主踢出范围——「加分支」变成了「换范围」。
 *  3. `dsh.client.inject` 与各插件 `scripts/build-client.mjs` 的 esbuild external 都不得再出现
 *     rc.3 已整体删除的 `@deepseek-ai/dsh-client-runtime`。
 *  4. 预发布陷阱本身：单分支 `>=0.1.5-rc.3 <0.3.0-0` 必须判为不满足 `0.2.1-rc.3`
 *     （npm/pnpm 解析范围不开 `includePrerelease`，预发布只在范围内存在同
 *     `major.minor.patch` 且自身带预发布标签的比较符时才被满足）。
 *
 * 退出码非零即失败；由 `pnpm test:gates` 与 CI quality-gate 调用。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const NEW_HOST = '0.2.1-rc.3'
const NEW_CORDIS = '4.0.5'
const NEW_SCHEMASTERY = '3.18.5'
const REMOVED_PACKAGE = '@deepseek-ai/dsh-client-runtime'

/** 旧世代代表版本：任一被容纳即说明旧宿主没被踢出范围。 */
const OLD_GENERATION_PROBES = [
  '0.1.0', '0.1.1', '0.1.5', '0.2.0',
  '0.1.0-rc.8', '0.1.1-rc.2', '0.1.2-rc.1', '0.1.5-rc.3',
]

function packageFiles() {
  const files = []
  for (const dir of ['plugins', 'packages']) {
    for (const name of readdirSync(join(repoRoot, dir))) {
      const file = join(repoRoot, dir, name, 'package.json')
      if (existsSync(file)) files.push(file)
    }
  }
  return files
}

const failures = []
let peersChecked = 0
let injectChecked = 0

for (const file of packageFiles()) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  const rel = file.replace(`${repoRoot}/`, '')

  for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
    let target = null
    if (name.startsWith('@deepseek-ai/dsh-')) target = NEW_HOST
    else if (name === '@deepseek-ai/cordis') target = NEW_CORDIS
    else if (name === '@deepseek-ai/schemastery') target = NEW_SCHEMASTERY
    if (!target) continue
    peersChecked += 1
    if (!semver.satisfies(target, range)) {
      failures.push(`${rel} peerDependencies ${name} ${range} 不满足新宿主 ${target}`)
    }
    if (name.startsWith('@deepseek-ai/dsh-') && !OLD_GENERATION_PROBES.some(v => semver.satisfies(v, range))) {
      failures.push(`${rel} peerDependencies ${name} ${range} 收窄了旧世代：不容纳任何代表版本 ${OLD_GENERATION_PROBES.join(' / ')}`)
    }
  }

  const inject = pkg.dsh?.client?.inject
  if (Array.isArray(inject)) {
    injectChecked += 1
    if (inject.includes(REMOVED_PACKAGE)) {
      failures.push(`${rel} dsh.client.inject 仍指向 rc.3 已删除的 ${REMOVED_PACKAGE}`)
    }
  }
}

for (const name of readdirSync(join(repoRoot, 'plugins'))) {
  const file = join(repoRoot, 'plugins', name, 'scripts', 'build-client.mjs')
  if (!existsSync(file)) continue
  const text = readFileSync(file, 'utf8')
  if (text.includes(`'${REMOVED_PACKAGE}'`) || text.includes(`"${REMOVED_PACKAGE}"`)) {
    failures.push(`${file.replace(`${repoRoot}/`, '')} esbuild external 仍包含 ${REMOVED_PACKAGE}`)
  }
}

// 预发布陷阱本身也要钉住：单分支范围必须判为不满足 0.2.1-rc.3。
if (semver.satisfies(NEW_HOST, '>=0.1.5-rc.3 <0.3.0-0')) {
  failures.push('semver 语义异常：单分支范围意外容纳了 0.2.1-rc.3，本校验的前提不再成立')
}

if (peersChecked === 0 || injectChecked === 0) {
  failures.push(`校验范围可疑：peer=${peersChecked}、inject=${injectChecked}`)
}

if (failures.length > 0) {
  console.error(`❌ DSH 宿主兼容声明校验失败（peer ${peersChecked} 条 / inject ${injectChecked} 个）：`)
  for (const line of failures) console.error(`  - ${line}`)
  process.exit(1)
}

console.log(`✅ DSH 宿主兼容声明校验通过（peer ${peersChecked} 条容纳新宿主且未收窄旧世代；inject ${injectChecked} 个与 build external 均无已删包）`)
