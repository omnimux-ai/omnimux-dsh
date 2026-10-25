#!/usr/bin/env node
/**
 * @file verify-profile-dependency-snapshots.mjs
 * @description 物化后依赖快照校验（Issue #3761）
 *
 * 新版宿主（0.2.1-rc.3 起）启动时断言「**preset 拥有的**（owned）每个依赖都必须指向
 * `file:.materialize-snapshots/plugins/<name>`」，否则拒绝启动（见壳仓
 * `dsh-plugin-desktop/src/managed-profile.ts` 的 `assertExistingManagedProfile`：
 * 它只遍历 preset 的 owned-packages 列表，不检查非 owned 依赖）。本检查把同一断言提前到
 * 物化阶段，只读列出违规项，避免只能在 App 启动时才发现。
 *
 * 三级判定：
 *  1. **硬失败**：`dependencies` 里声明了受管快照却缺目录 / 缺 `package.json`；
 *     `dsh.profile.bundles` 里非 `@deepseek-ai/*`（App 自带宿主包）的条目既不在 dependencies
 *     的受管快照也不在 `node_modules`；提供 owned 清单时，owned 依赖未指向存在的受管快照。
 *  2. **警告（不失败）**：非 owned 依赖仍是版本号——宿主从 `node_modules` 解析即可，拦下会
 *     比宿主本身更严；但仍列出，便于人工判断要不要补快照。
 *  3. **显式跳过**：拿不到 owned 清单（目标 App 未安装或没有 preset）时打印原因，
 *     只做第 1 级的快照完整性与插件清单可解析性校验，不静默当作通过。
 *
 * 只读：不写 profile、不创建快照、不回填依赖。首次建立缺失快照归官方完整 profile rebuild。
 *
 * 用法：
 *   node scripts/verify-profile-dependency-snapshots.mjs <profile-dir> [...] [--app <应用路径>] [--owned <owned-packages.json>]
 * 退出码：0 通过 / 1 硬失败 / 2 用法错误。
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

/** 受管快照的 spec 前缀与相对目录。 */
export const MANAGED_SPEC_PREFIX = 'file:.materialize-snapshots/plugins/'
export const MANAGED_SNAPSHOT_DIRECTORY = '.materialize-snapshots/plugins'

/** App 自带宿主包：不在 profile 内落地，允许出现在插件清单里。 */
const APP_PROVIDED = /^@deepseek-ai\//

/**
 * 目标应用推导表：与 `scripts/verify-profile-preflight.mjs` 保持同一份事实
 * （那份是权威，本表只做同一推导；不一致时以前者为准）。
 */
const TARGET_APP_BY_HOME_NAME = new Map([
  ['.omnimux-dev', '/Applications/OmniMux Dev.app'],
  ['.omnimux', '/Applications/OmniMux.app'],
  ['.dsh', '/Applications/DSH Desktop.app'],
])
const TARGET_APP_ENV = 'OMNIMUX_PREFLIGHT_TARGET_APP'

/** preset 里 owned 清单的相对位置。 */
const OWNED_PACKAGES_RELATIVE = join('Contents', 'Resources', 'app.asar.unpacked', 'preset', 'owned-packages.json')

/** 从 profile 目录推导目标应用；推导不出返回 null。 */
export function resolveTargetApp(profileDir, explicitApp) {
  if (explicitApp) return resolve(explicitApp)
  const fromEnv = process.env[TARGET_APP_ENV]
  if (fromEnv) return resolve(fromEnv)
  const profileRoot = dirname(resolve(profileDir))
  const inferred = TARGET_APP_BY_HOME_NAME.get(basename(profileRoot))
  if (inferred) return inferred
  for (const [name, app] of TARGET_APP_BY_HOME_NAME) {
    const root = join(homedir(), name)
    if (profileRoot === root || profileRoot.startsWith(root + sep)) return app
  }
  return null
}

/** 读取一个 owned 清单文件；不存在或形态不符返回 null。 */
export function readOwnedPackagesFile(path) {
  if (!path || !existsSync(path)) return null
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  const names = Array.isArray(parsed) ? parsed : (parsed.packages ?? parsed.owned ?? [])
  return Array.isArray(names) ? names.filter((name) => typeof name === 'string') : null
}

/** 读取目标应用 preset 里的 owned 清单；读不到返回 null。 */
export function readOwnedPackages(appPath) {
  return appPath ? readOwnedPackagesFile(join(appPath, OWNED_PACKAGES_RELATIVE)) : null
}

/**
 * 校验一个 profile。
 * @param {string} profileDir profile 目录（形如 <home>/profiles/<name>）。
 * @param {{ ownedPackages?: string[] | null }} [options]
 * @returns {{ failures: string[], warnings: string[], dependenciesChecked: number, bundlesChecked: number, ownedChecked: number, ownedStatus: 'checked' | 'skipped' }}
 */
export function inspectProfile(profileDir, options = {}) {
  const failures = []
  const warnings = []
  const manifestPath = join(profileDir, 'package.json')
  const empty = { failures, warnings, dependenciesChecked: 0, bundlesChecked: 0, ownedChecked: 0, ownedStatus: 'skipped' }
  if (!existsSync(manifestPath)) {
    failures.push(`${profileDir} 不是受管 profile：缺少 package.json`)
    return empty
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    failures.push(`${manifestPath} 不是合法 JSON：${error.message}`)
    return empty
  }

  const owned = Array.isArray(options.ownedPackages) ? new Set(options.ownedPackages) : null
  const dependencies = manifest.dependencies ?? {}
  let dependenciesChecked = 0
  let ownedChecked = 0

  for (const [name, spec] of Object.entries(dependencies)) {
    dependenciesChecked += 1
    const managed = typeof spec === 'string' && spec.startsWith(MANAGED_SPEC_PREFIX)
    if (!managed) {
      if (owned?.has(name)) {
        ownedChecked += 1
        failures.push(`owned 依赖 ${name} 未指向受管快照：期望 ${MANAGED_SPEC_PREFIX}${name}，实际 ${JSON.stringify(spec)}（宿主启动会拒绝该 profile）`)
      } else {
        warnings.push(`依赖 ${name} 仍是 ${JSON.stringify(spec)}，不是受管快照（非 owned，宿主可从 node_modules 解析；如需快照请走官方完整 profile rebuild）`)
      }
      continue
    }
    if (owned?.has(name)) ownedChecked += 1
    const relative = spec.slice('file:'.length)
    const snapshotDir = join(profileDir, relative)
    if (!existsSync(snapshotDir)) {
      failures.push(`依赖 ${name} 的受管快照目录不存在：${relative}（首次建立走官方完整 profile rebuild）`)
      continue
    }
    if (!existsSync(join(snapshotDir, 'package.json'))) {
      failures.push(`依赖 ${name} 的受管快照缺少 package.json：${relative}（pnpm pack 会报 NO_IMPORTER_MANIFEST）`)
    }
  }

  const bundles = manifest.dsh?.profile?.bundles ?? []
  let bundlesChecked = 0
  for (const name of bundles) {
    if (typeof name !== 'string' || name === '') continue
    bundlesChecked += 1
    if (APP_PROVIDED.test(name)) continue
    const declared = typeof dependencies[name] === 'string' && dependencies[name].startsWith(MANAGED_SPEC_PREFIX)
    const installed = existsSync(join(profileDir, 'node_modules', name))
    if (!declared && !installed) {
      failures.push(`插件清单条目 ${name} 没有任何来源：既不在 dependencies 的受管快照，也不在 node_modules`)
    }
  }

  return {
    failures,
    warnings,
    dependenciesChecked,
    bundlesChecked,
    ownedChecked,
    ownedStatus: owned ? 'checked' : 'skipped',
  }
}

function parseArguments(argv) {
  const profiles = []
  let app = null
  let ownedPath = null
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--app') { app = argv[++index]; continue }
    if (flag === '--owned') { ownedPath = argv[++index]; continue }
    if (flag.startsWith('--')) throw new Error(`未知参数：${flag}`)
    profiles.push(flag)
  }
  return { profiles, app, ownedPath }
}

function main() {
  let args
  try {
    args = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(`❌ ${error.message}`)
    console.error('用法：node scripts/verify-profile-dependency-snapshots.mjs <profile-dir> [...] [--app <应用路径>] [--owned <owned-packages.json>]')
    process.exit(2)
  }
  if (args.profiles.length === 0) {
    console.error('❌ 用法：node scripts/verify-profile-dependency-snapshots.mjs <profile-dir> [...] [--app <应用路径>] [--owned <owned-packages.json>]')
    process.exit(2)
  }

  let failed = false
  for (const target of args.profiles) {
    let ownedPackages = null
    let skipReason = null
    if (args.ownedPath) {
      ownedPackages = readOwnedPackagesFile(args.ownedPath)
      if (ownedPackages === null) skipReason = `--owned 指向的清单不存在或形态不符（${args.ownedPath}）`
    } else {
      const app = resolveTargetApp(target, args.app)
      ownedPackages = readOwnedPackages(app)
      if (ownedPackages === null) {
        skipReason = app ? `${app} 没有 preset owned-packages.json` : '无法推导目标应用（可用 --app 显式指定）'
      }
    }
    if (skipReason) {
      console.log(`⚠ 未读取 owned 清单：${skipReason}；只做快照完整性与插件清单可解析性校验，owned 依赖断言未核验`)
    }

    const result = inspectProfile(target, { ownedPackages })
    for (const line of result.warnings) console.log(`⚠ ${line}`)
    const scope = `依赖 ${result.dependenciesChecked} 条 / owned ${result.ownedChecked} 条 / 插件清单 ${result.bundlesChecked} 条`
    if (result.failures.length > 0) {
      failed = true
      console.error(`❌ Profile 依赖快照校验失败：${target}（${scope}）`)
      for (const line of result.failures) console.error(`  - ${line}`)
    } else {
      console.log(`✅ Profile 依赖快照校验通过：${target}（${scope}）`)
    }
  }
  if (failed) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
