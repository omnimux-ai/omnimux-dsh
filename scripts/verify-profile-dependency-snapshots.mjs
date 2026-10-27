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
 *  1. **硬失败**：`dependencies` 里声明了受管快照却缺目录 / 缺 `package.json`；提供 owned 清单时，
 *     owned 依赖未指向存在的受管快照（这两类正是宿主启动断言与 pnpm pack 会炸的）；
 *     profile 装了支持包（`dsh-better-sidebar`）时，其受管快照与 `node_modules` 的实际版本
 *     必须等于 `scripts/sidebar-support-identity.json` 的声明（Issue #3835：快照被打回旧版本会
 *     让运行时静默降级，必须指名失败）。
 *  2. **警告（不失败）**：非 owned 依赖仍是版本号（宿主从 `node_modules` 解析即可，拦下比宿主更严）；
 *     `dsh.profile.bundles` 里非 `@deepseek-ai/*`（App 自带宿主包）且无来源的条目——命名插件同步会
 *     保留未被点名的 bundle，硬失败会破坏该受支持行为，真实缺失会在加载期响亮失败。两者都逐条列出。
 *  3. **显式跳过**：拿不到 owned 清单（目标 App 未安装或没有 preset）时打印原因，
 *     只做第 1 级的快照完整性与 owned 断言之外的可解析性校验，不静默当作通过。
 *
 * 只读：不写 profile、不创建快照、不回填依赖。首次建立缺失快照归官方完整 profile rebuild。
 *
 * 用法：
 *   node scripts/verify-profile-dependency-snapshots.mjs <profile-dir> [...] [--app <应用路径>] [--owned <owned-packages.json>] [--support-only]
 *   `--support-only` 只校验支持包身份/版本（物化写入前的预检，零写入）。
 * 退出码：0 通过 / 1 硬失败 / 2 用法错误。
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

/** 受管快照的 spec 前缀与相对目录。 */
export const MANAGED_SPEC_PREFIX = 'file:.materialize-snapshots/plugins/'
export const MANAGED_SNAPSHOT_DIRECTORY = '.materialize-snapshots/plugins'

/**
 * 支持包身份的单一真源：`scripts/sidebar-support-identity.json`（与
 * `scripts/task-runtime-install.mjs` 的 `readSidebarSupportIdentity` 同一份文件）。
 * 本脚本刻意不 import 那个模块——它连带 semver 与物化缓存依赖，而本校验器必须在
 * 只有 node 内置模块时也能跑；两份读取都指向同一文件，因此不存在第二处字面量。
 */
const SUPPORT_IDENTITY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'sidebar-support-identity.json')

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

/**
 * 读取支持包身份声明（`scripts/sidebar-support-identity.json`）。
 * 读不到时返回 null 而不是抛错：校验器不该因为身份文件缺失而伪造一个「通过」，
 * 但也不该把非支持包场景变成硬失败——调用方按 null 走显式失败分支。
 */
export function readSupportIdentity(identityPath = SUPPORT_IDENTITY_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(identityPath, 'utf8'))
    return typeof parsed?.name === 'string' && typeof parsed?.version === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** 读取某个目录下已安装包的 `{ name, version }`；不存在或不可解析返回 null。 */
function readInstalledPackageVersion(directory) {
  try {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    return { name: manifest.name, version: manifest.version }
  } catch {
    return null
  }
}

/**
 * 支持包版本漂移校验（Issue #3835）。
 *
 * 背景：profile 用 `file:.materialize-snapshots/plugins/dsh-better-sidebar` 声明依赖，
 * 所以 `pnpm install` 只会按**快照里的版本**安装 `node_modules`。快照一旦被旧构建覆盖
 * （实测 Dev 快照 0.19.1 / node_modules 0.28.0），下一次安装就把运行时静默降级到
 * 0.19.1 的读法——左侧栏一级入口全部静默失效（#3800），而原校验只查目录存在与否，
 * 整条物化链没有任何一处报错。这里把「快照版本 / 已装版本 / 身份声明」三者对齐，
 * 任一不等即指名失败（包名 + 期望版本 + 实际版本 + 路径），绝不静默降级。
 *
 * @param {string} profileDir profile 目录
 * @param {{ identity?: { name: string, version: string } | null }} [options]
 * @returns {{ failures: string[], checked: number }}
 */
export function inspectSupportPackageVersion(profileDir, options = {}) {
  const failures = []
  const identity = options.identity === undefined ? readSupportIdentity() : options.identity
  if (!identity) {
    failures.push('支持包身份声明不可读：scripts/sidebar-support-identity.json（缺少声明即无法证明实装代际，不静默放行）')
    return { failures, checked: 0 }
  }

  const name = identity.name
  const expected = identity.version
  let checked = 0

  const snapshotDir = join(profileDir, MANAGED_SNAPSHOT_DIRECTORY, name)
  if (existsSync(join(snapshotDir, 'package.json'))) {
    checked += 1
    const snapshot = readInstalledPackageVersion(snapshotDir)
    if (!snapshot || snapshot.name !== name) {
      failures.push(`受管快照 ${name} 身份不符：${snapshotDir} 的 package.json 声明 name=${JSON.stringify(snapshot?.name)}，期望 ${name}`)
    } else if (snapshot.version !== expected) {
      failures.push(`受管快照 ${name} 版本漂移：期望 ${expected}（身份声明 scripts/sidebar-support-identity.json），实际 ${snapshot.version}（${snapshotDir}）；按此快照安装会把运行时打回旧读法`)
    }
  }

  const installedDir = join(profileDir, 'node_modules', name)
  if (existsSync(join(installedDir, 'package.json'))) {
    checked += 1
    const installed = readInstalledPackageVersion(installedDir)
    if (!installed || installed.name !== name) {
      failures.push(`已安装 ${name} 身份不符：${installedDir} 的 package.json 声明 name=${JSON.stringify(installed?.name)}，期望 ${name}`)
    } else if (installed.version !== expected) {
      failures.push(`已安装 ${name} 版本漂移：期望 ${expected}（身份声明 scripts/sidebar-support-identity.json），实际 ${installed.version}（${installedDir}）`)
    }
  }

  return { failures, checked }
}

/** 读取目标应用 preset 里的 owned 清单；读不到返回 null。 */
export function readOwnedPackages(appPath) {
  return appPath ? readOwnedPackagesFile(join(appPath, OWNED_PACKAGES_RELATIVE)) : null
}

/**
 * 校验一个 profile。
 * @param {string} profileDir profile 目录（形如 <home>/profiles/<name>）。
 * @param {{ ownedPackages?: string[] | null, supportIdentity?: { name: string, version: string } | null }} [options]
 * @returns {{ failures: string[], warnings: string[], dependenciesChecked: number, bundlesChecked: number, ownedChecked: number, ownedStatus: 'checked' | 'skipped', supportChecked: number }}
 */
export function inspectProfile(profileDir, options = {}) {
  const failures = []
  const warnings = []
  const manifestPath = join(profileDir, 'package.json')
  const empty = { failures, warnings, dependenciesChecked: 0, bundlesChecked: 0, ownedChecked: 0, ownedStatus: 'skipped', supportChecked: 0 }
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
      // 命名插件同步只物化被点名的插件，会保留其它 bundle 条目；宿主也不断言这一项，
      // 因此只警告（真实缺失会在加载期响亮失败），不阻断物化。
      warnings.push(`插件清单条目 ${name} 没有任何来源：既不在 dependencies 的受管快照，也不在 node_modules（命名同步保留的条目属正常；真实缺失会在加载期失败）`)
    }
  }

  // 支持包版本漂移（Issue #3835）：只在 profile 真的装了该支持包时才比对版本，
  // 免得没有侧栏的 profile 因为身份文件而凭空失败；身份声明本身不可读时一律指名失败，
  // 因为「无法证明实装代际」不能当成通过。
  const identity = options.supportIdentity === undefined ? readSupportIdentity() : options.supportIdentity
  let supportChecked = 0
  if (!identity) {
    failures.push('支持包身份声明不可读：scripts/sidebar-support-identity.json（缺少声明即无法证明实装代际，不静默放行）')
  } else {
    const supportName = identity.name
    const supportInPlay = Object.hasOwn(dependencies, supportName) || bundles.includes(supportName)
    if (supportInPlay) {
      const support = inspectSupportPackageVersion(profileDir, { identity })
      failures.push(...support.failures)
      supportChecked = support.checked
    }
  }

  return {
    failures,
    warnings,
    dependenciesChecked,
    bundlesChecked,
    ownedChecked,
    ownedStatus: owned ? 'checked' : 'skipped',
    supportChecked,
  }
}

function parseArguments(argv) {
  const profiles = []
  let app = null
  let ownedPath = null
  let supportOnly = false
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--app') { app = argv[++index]; continue }
    if (flag === '--owned') { ownedPath = argv[++index]; continue }
    if (flag === '--support-only') { supportOnly = true; continue }
    if (flag.startsWith('--')) throw new Error(`未知参数：${flag}`)
    profiles.push(flag)
  }
  return { profiles, app, ownedPath, supportOnly }
}

const USAGE = 'node scripts/verify-profile-dependency-snapshots.mjs <profile-dir> [...] [--app <应用路径>] [--owned <owned-packages.json>] [--support-only]'

/**
 * `--support-only`：只做支持包身份校验（Issue #3835）。
 *
 * 物化脚本要在**写入之前**就拦住「受管快照已被旧构建覆盖」的情况，否则一次
 * `pnpm install` 已经把运行时降级了，再回滚也只是回到旧快照。因此这里给出一条
 * 只读、零写入的预检通道；它与完整校验共用 `inspectSupportPackageVersion`，
 * 不存在第二套判定。
 */
function runSupportOnly(targets) {
  let failed = false
  for (const target of targets) {
    const result = inspectSupportPackageVersion(target)
    if (result.failures.length > 0) {
      failed = true
      console.error(`❌ 支持包身份校验失败：${target}`)
      for (const line of result.failures) console.error(`  - ${line}`)
    } else {
      console.log(`✅ 支持包身份校验通过：${target}（核对 ${result.checked} 处）`)
    }
  }
  if (failed) process.exit(1)
}

function main() {
  let args
  try {
    args = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(`❌ ${error.message}`)
    console.error(`用法：${USAGE}`)
    process.exit(2)
  }
  if (args.profiles.length === 0) {
    console.error(`❌ 用法：${USAGE}`)
    process.exit(2)
  }
  if (args.supportOnly) {
    runSupportOnly(args.profiles)
    return
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
    const supportScope = result.supportChecked > 0 ? ` / 支持包版本 ${result.supportChecked} 处` : ''
    const scope = `依赖 ${result.dependenciesChecked} 条 / owned ${result.ownedChecked} 条 / 插件清单 ${result.bundlesChecked} 条${supportScope}`
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
