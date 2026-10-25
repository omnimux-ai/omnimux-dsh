#!/usr/bin/env node
/**
 * DSH 宿主兼容声明校验（#3688 宿主兼容半边 / #3737 扫描面加固）。
 *
 * 校验对象是**宿主装配面**，不是本地开发 pin。五条断言：
 *  1. 每个 `@deepseek-ai/dsh-*` peer 容纳新宿主 `0.2.1-rc.3`；cordis 容纳 `4.0.5`、
 *     schemastery 容纳 `3.18.5`。
 *  2. **不得收窄**：每个 dsh-* peer 仍须容纳至少一个旧世代代表版本（见 OLD_GENERATION_PROBES），
 *     否则就是把旧宿主踢出范围——「加分支」变成了「换范围」。
 *  3. `REMOVED_PACKAGES`（底座已整体删除的包）不得再出现在四处：`dsh.client.inject`、
 *     各插件 `scripts/build-client.mjs` 的 esbuild external、包的依赖声明
 *     （dependencies / devDependencies / peerDependencies）、以及 `src/` 里的源码与类型导入。
 *     #3737 之前只扫前两处，`plugins/omnimux-viewer` 的 devDependency 与类型导入正是从这里漏过去的。
 *  4. 预发布陷阱本身：单分支 `>=0.1.5-rc.3 <0.3.0-0` 必须判为不满足 `0.2.1-rc.3`
 *     （npm/pnpm 解析范围不开 `includePrerelease`，预发布只在范围内存在同
 *     `major.minor.patch` 且自身带预发布标签的比较符时才被满足）。
 *  5. **可选**：设置 `OMNIMUX_VENDOR_MANIFEST` 指向某底座 pin 的 `manifest.json` 时，
 *     上面所有 `@deepseek-ai/*` 引用名都必须在底座清单里存在——这条不写死包名，随底座升级自动生效；
 *     未设置时显式跳过并打印原因（不静默通过）。
 *
 * 退出码非零即失败；由 `pnpm test:gates` 与 CI quality-gate 调用。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import semver from 'semver'

const NEW_HOST = '0.2.1-rc.3'
const NEW_CORDIS = '4.0.5'
const NEW_SCHEMASTERY = '3.18.5'

/** 底座已整体删除的包。新增删除项时在此登记（`since` 记录出处）。 */
export const REMOVED_PACKAGES = [
  { name: '@deepseek-ai/dsh-client-runtime', since: '0.2.1-rc.3' },
]

/** 旧世代代表版本：任一被容纳即说明旧宿主没被踢出范围。 */
const OLD_GENERATION_PROBES = [
  '0.1.0', '0.1.1', '0.1.5', '0.2.0',
  '0.1.0-rc.8', '0.1.1-rc.2', '0.1.2-rc.1', '0.1.5-rc.3',
]

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies']

function packageFiles(root) {
  const files = []
  for (const dir of ['plugins', 'packages']) {
    const base = join(root, dir)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base)) {
      const file = join(base, name, 'package.json')
      if (existsSync(file)) files.push(file)
    }
  }
  return files
}

function sourceFiles(root) {
  const files = []
  for (const dir of ['plugins', 'packages']) {
    const base = join(root, dir)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base)) {
      for (const sub of ['src', 'tests', 'scripts']) {
        const target = join(base, name, sub)
        if (!existsSync(target)) continue
        for (const entry of readdirSync(target, { recursive: true })) {
          const file = join(target, entry)
          if (!SOURCE_EXTENSIONS.has(extname(file))) continue
          if (!statSync(file).isFile()) continue
          files.push(file)
        }
      }
    }
  }
  return files
}

/** 去掉行注释与块注释；只用于「名字是否被引用」的判定，不改写文件。 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/** 客户端构建脚本：`plugins/*` 与 `packages/*` 都要覆盖，缺目录不抛错。 */
function buildClientFiles(root) {
  const files = []
  for (const dir of ['plugins', 'packages']) {
    const base = join(root, dir)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base)) {
      const file = join(base, name, 'scripts', 'build-client.mjs')
      if (existsSync(file)) files.push(file)
    }
  }
  return files
}

function readManifestPackages(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const names = new Set()
  const visit = (value) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/@deepseek-ai\/[a-z0-9.-]+/g)) names.add(match[0])
      return
    }
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value && typeof value === 'object') { for (const item of Object.values(value)) visit(item) }
  }
  visit(manifest)
  return names
}

/**
 * 收集校验失败项。
 * @param {string} root 仓库根目录。
 * @param {{ manifestPath?: string | null }} [options] 可选的底座清单路径。
 * @returns {{ failures: string[], peersChecked: number, injectChecked: number, referencedNames: Set<string>, manifestStatus: string, manifestMissing: string[] }}
 */
export function collectFailures(root, options = {}) {
  const failures = []
  let peersChecked = 0
  let injectChecked = 0
  const referencedNames = new Set()
  const removedNames = REMOVED_PACKAGES.map((entry) => entry.name)

  for (const file of packageFiles(root)) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    const rel = file.replace(`${root}/`, '')

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
      for (const name of inject) {
        if (name.startsWith('@deepseek-ai/')) referencedNames.add(name)
        if (removedNames.includes(name)) {
          const entry = REMOVED_PACKAGES.find((candidate) => candidate.name === name)
          failures.push(`${rel} dsh.client.inject 仍指向 ${entry.since} 已删除的 ${name}`)
        }
      }
    }

    // #3737：依赖声明面（dependencies / devDependencies / peerDependencies）同样不得引用已删包。
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        // 依赖声明面只对「已删包登记表」负责；底座清单差集看的是客户端装配面
        // （inject / external / 源码导入），peer 里的宿主包不属清单范围。
        if (removedNames.includes(name)) {
          const entry = REMOVED_PACKAGES.find((candidate) => candidate.name === name)
          failures.push(`${rel} ${field} 仍指向 ${entry.since} 已删除的 ${name}`)
        }
      }
    }
  }

  const externalFiles = new Set(buildClientFiles(root).map((file) => resolve(file)))
  for (const file of buildClientFiles(root)) {
    const text = readFileSync(file, 'utf8')
    const rel = file.replace(`${root}/`, '')
    for (const entry of REMOVED_PACKAGES) {
      if (text.includes(`'${entry.name}'`) || text.includes(`"${entry.name}"`)) {
        failures.push(`${rel} esbuild external 仍包含 ${entry.since} 已删除的 ${entry.name}`)
      }
    }
    // 外部名同样进底座清单差集（客户端装配面之一）。
    for (const entry of REMOVED_PACKAGES) {
      if (text.includes(`'${entry.name}'`) || text.includes(`"${entry.name}"`)) {
        referencedNames.add(entry.name)
      }
    }
  }

  // #3737：源码与类型导入面（viewer 的 `import type { ToolCallBlock } from '…/client'` 属此类）。
  for (const file of sourceFiles(root)) {
    // build-client.mjs 的外部名由上面那条专用检查负责，别把同一处引用报两遍。
    if (externalFiles.has(resolve(file))) continue
    // 注释里提到旧包名（例如「官方 X 发现服务」这类说明）不算引用，
    // 否则真问题会被说明性文字淹掉。
    const text = stripComments(readFileSync(file, 'utf8'))
    const rel = file.replace(`${root}/`, '')
    for (const entry of REMOVED_PACKAGES) {
      if (text.includes(entry.name)) {
        failures.push(`${rel} 源码仍引用 ${entry.since} 已删除的 ${entry.name}`)
        referencedNames.add(entry.name)
      }
    }
    for (const match of text.matchAll(/['"](@deepseek-ai\/dsh-[a-z0-9-]+)(?:\/[a-z0-9-]+)*['"]/g)) {
      referencedNames.add(match[1])
    }
  }

  let manifestStatus = 'skipped'
  let manifestMissing = []
  let manifestChecked = 0
  const manifestPath = options.manifestPath ?? process.env.OMNIMUX_VENDOR_MANIFEST ?? null
  if (manifestPath && existsSync(manifestPath)) {
    const provided = readManifestPackages(manifestPath)
    // 底座清单（vendor/dsh-runtime）只覆盖 dsh-* 客户端包；@deepseek-ai/cordis、
    // @deepseek-ai/schemastery 这类随底座一起安装的依赖不在清单里，属正常。
    const inScope = [...referencedNames].filter((name) => name.startsWith('@deepseek-ai/dsh-'))
    manifestMissing = inScope.filter((name) => !provided.has(name)).sort()
    for (const name of manifestMissing) {
      failures.push(`引用名 ${name} 不在底座清单 ${manifestPath} 中（该底座未提供此包）`)
    }
    manifestChecked = inScope.length
    manifestStatus = 'checked'
  } else if (manifestPath) {
    manifestStatus = 'missing'
  }

  // 预发布陷阱本身也要钉住：单分支范围必须判为不满足 0.2.1-rc.3，
  // 否则本校验赖以成立的前提（npm 不开 includePrerelease）已经不成立。
  if (semver.satisfies(NEW_HOST, '>=0.1.5-rc.3 <0.3.0-0')) {
    failures.push('semver 语义异常：单分支范围意外容纳了 0.2.1-rc.3，本校验的前提不再成立')
  }

  if (peersChecked === 0 || injectChecked === 0) {
    failures.push(`校验范围可疑：peer=${peersChecked}、inject=${injectChecked}`)
  }

  return { failures, peersChecked, injectChecked, referencedNames, manifestStatus, manifestMissing, manifestChecked }
}

function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const result = collectFailures(repoRoot)

  if (result.manifestStatus === 'skipped') {
    console.log('⏭ 底座清单差集未运行：未设置 OMNIMUX_VENDOR_MANIFEST（只跑已删包登记表与静态扫描面）')
  } else if (result.manifestStatus === 'missing') {
    console.log(`⏭ 底座清单差集未运行：OMNIMUX_VENDOR_MANIFEST 指向的文件不存在（${process.env.OMNIMUX_VENDOR_MANIFEST}）`)
  } else if (result.manifestMissing.length > 0) {
    console.log(`⚠️ 底座清单差集已运行：${result.manifestChecked} 个 dsh-* 引用名中 ${result.manifestMissing.length} 个不在清单内（见下方失败项）`)
  } else if (result.manifestChecked === 0) {
    console.log('⚠️ 底座清单差集已运行，但一个 dsh-* 引用名都没收集到——检查收集面是否失效')
  } else {
    console.log(`✅ 底座清单差集已运行：${result.manifestChecked} 个 dsh-* 引用名全部在清单内`)
  }

  if (result.failures.length > 0) {
    console.error(`❌ DSH 宿主兼容声明校验失败（peer ${result.peersChecked} 条 / inject ${result.injectChecked} 个）：`)
    for (const line of result.failures) console.error(`  - ${line}`)
    process.exit(1)
  }

  console.log(`✅ DSH 宿主兼容声明校验通过（peer ${result.peersChecked} 条容纳新宿主且未收窄旧世代；已删包登记 ${REMOVED_PACKAGES.length} 项在 inject / external / 依赖声明 / 源码四处均无残留；底座清单差集 ${result.manifestStatus}）`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
