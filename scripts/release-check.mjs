#!/usr/bin/env node
/**
 * scripts/release-check.mjs
 *
 * 只读发布自检：把 Trusted Publishing 的发布前条件固化成一条命令，
 * 任何一项不成立就 exit 1，防止版本未 bump、repository 元数据缺失、
 * 脏工作区或重复版本被直接 dispatch 出去。
 *
 * 检查项（全部只读，不发布、不改文件）：
 *  1. git 跟踪文件干净（包目录内的未跟踪文件由 verify-publish-source 拦截）；
 *  2. package.json 的 name/version/repository（type / url / directory）；
 *  3. verify-publish-source（已提交版本 = 工作区版本、包内无未提交改动）；
 *  4. npm 上该 version 尚未发布（404 = 可发；已存在 = 失败，除非 --allow-published）；
 *  5. actionlint 可用时顺带校验 publish.yml，缺失时明确提示跳过。
 *
 * 用法：node scripts/release-check.mjs [omnimux|plugins/omnimux] [--allow-published]
 * 退出码：0 = 全部通过（--allow-published 下已发布仅为提示）；1 = 存在失败项；2 = 参数错误。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { verifyPublishSource } from './verify-publish-source.mjs'

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const DEFAULT_PACKAGE = 'omnimux'
const WORKFLOW_PATH = '.github/workflows/publish.yml'

/** 把 repository.url / origin remote 归一化成可比较的 https 地址。 */
export function normalizeRepositoryUrl(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .replace(/^github:([^/]+)\/(.+)$/, 'https://github.com/$1/$2')
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/** 把包目录 / repository.directory 归一化成 posix 相对路径。 */
function normalizeDirectory(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
}

/**
 * @param {string[]} argv
 * @returns {{ packageDir: string, allowPublished: boolean }}
 */
export function parseArguments(argv) {
  let packageArg = null
  let allowPublished = false
  for (const arg of argv) {
    if (arg === '--allow-published') {
      allowPublished = true
      continue
    }
    if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`)
    if (packageArg !== null) throw new Error(`只接受一个包参数：${packageArg} / ${arg}`)
    packageArg = arg
  }
  const target = packageArg ?? DEFAULT_PACKAGE
  const packageDir = normalizeDirectory(target.includes('/') ? target : `plugins/${target}`)
  if (!packageDir || packageDir.startsWith('..') || packageDir.startsWith('/')) {
    throw new Error(`包路径必须是仓库内相对路径：${target}`)
  }
  return { packageDir, allowPublished }
}

/**
 * 包清单检查：name/version 可发布、repository 与 origin 一致且指向包目录。
 * @returns {string[]} 问题列表，空数组表示通过。
 */
export function checkManifest({ manifest, packageDir, remoteUrl }) {
  const problems = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['package.json 不是对象']
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    problems.push('package.json 缺少 name')
  }
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
    problems.push(`package.json 的 version 不是合法 semver：${JSON.stringify(manifest.version)}`)
  }
  const repository = manifest.repository
  if (!repository || typeof repository !== 'object' || Array.isArray(repository)) {
    problems.push('package.json 缺少 repository（npm provenance 校验需要 repository.url）')
    return problems
  }
  if (repository.type !== 'git') {
    problems.push(`repository.type 必须是 git：${JSON.stringify(repository.type)}`)
  }
  const repositoryUrl = normalizeRepositoryUrl(repository.url)
  if (!repositoryUrl) {
    problems.push('repository.url 为空')
  } else {
    const expected = normalizeRepositoryUrl(remoteUrl)
    if (!expected) problems.push(`无法从 origin remote 推导期望仓库地址：${JSON.stringify(remoteUrl)}`)
    else if (repositoryUrl !== expected) problems.push(`repository.url 与 origin 不一致：${repository.url} ≠ ${remoteUrl}`)
  }
  if (typeof repository.directory !== 'string' || !repository.directory.trim()) {
    problems.push('repository.directory 为空（monorepo 包必须指向包目录）')
  } else if (normalizeDirectory(repository.directory) !== normalizeDirectory(packageDir)) {
    problems.push(`repository.directory 与包目录不一致：${repository.directory} ≠ ${packageDir}`)
  }
  return problems
}

/**
 * 解释 `npm view <name>@<version> version` 的结果。
 * @param {{ name: string, version: string, view?: { status?: number|null, stdout?: string, stderr?: string, errorCode?: string } }} input
 * @returns {{ state: 'published'|'missing'|'unknown', detail: string }}
 */
export function classifyPublishState({ name, version, view = {} }) {
  if (view.status === 0) return { state: 'published', detail: `${name}@${version} 已在 npm 上发布` }
  if (view.errorCode === 'ENOENT') return { state: 'unknown', detail: '找不到 npm CLI，无法确认发布状态' }
  const output = `${view.stdout ?? ''}\n${view.stderr ?? ''}`
  if (/E404|\b404\b|not found/i.test(output)) return { state: 'missing', detail: `${name}@${version} 尚未发布` }
  const firstLine = output.split('\n').map(line => line.trim()).find(Boolean) ?? view.errorCode ?? 'unknown error'
  return { state: 'unknown', detail: `无法确认 npm 发布状态：${firstLine}` }
}

/**
 * 执行全部检查。所有外部副作用（git / npm / 文件系统 / actionlint）都从 deps 注入，
 * 因此单测不需要网络、真实 git 仓库或安装 actionlint。
 * @returns {{ ok: boolean, results: Array<{ id: string, status: 'pass'|'fail'|'skip'|'info', message: string }> }}
 */
export function runReleaseCheck({ packageDir, repoRoot, allowPublished = false, deps }) {
  const results = []
  const add = (id, status, message) => results.push({ id, status, message })
  const packagePath = resolve(repoRoot, packageDir)

  const branch = deps.gitBranch?.()
  if (branch) add('branch', 'info', `当前分支：${branch}`)

  const trackedStatus = deps.gitStatus()
  if (trackedStatus.trim() === '') add('tree', 'pass', 'git 跟踪文件干净')
  else add('tree', 'fail', `git 跟踪文件有未提交改动：\n${indent(trackedStatus.trim())}`)

  let manifest = null
  try {
    manifest = JSON.parse(deps.readFile(join(packagePath, 'package.json')))
  } catch (error) {
    add('manifest', 'fail', `无法读取 ${packageDir}/package.json：${error.message}`)
  }
  if (manifest) {
    const problems = checkManifest({ manifest, packageDir, remoteUrl: deps.gitRemoteUrl() })
    if (problems.length === 0) {
      add('manifest', 'pass', `${manifest.name}@${manifest.version}（name/version/repository 完整）`)
    } else {
      for (const problem of problems) add('manifest', 'fail', problem)
    }
  }

  const source = deps.verifySource(packageDir)
  if (source.ok) {
    add('source', 'pass', 'verify-publish-source 通过（发布字节可由提交复现）')
  } else {
    for (const problem of source.problems ?? ['verify-publish-source 未通过']) add('source', 'fail', problem)
  }

  const name = typeof manifest?.name === 'string' ? manifest.name : null
  const version = typeof manifest?.version === 'string' ? manifest.version : null
  if (name && version) {
    const state = classifyPublishState({ name, version, view: deps.npmView({ name, version }) })
    if (state.state === 'missing') add('npm', 'pass', state.detail)
    else if (state.state === 'published') {
      if (allowPublished) add('npm', 'skip', `${state.detail}（--allow-published，仅提示）`)
      else add('npm', 'fail', `${state.detail}：不能重复发布，请先 bump 版本`)
    } else {
      add('npm', 'fail', state.detail)
    }
  } else {
    add('npm', 'fail', '缺少可用的 name/version，无法确认 npm 发布状态')
  }

  const lint = deps.actionlint ? deps.actionlint() : { status: 'skip', output: '' }
  if (lint.status === 'pass') add('actionlint', 'pass', `${WORKFLOW_PATH} actionlint 通过`)
  else if (lint.status === 'skip') add('actionlint', 'skip', '跳过 actionlint（未安装）')
  else add('actionlint', 'fail', `${WORKFLOW_PATH} actionlint 失败：\n${indent(String(lint.output ?? '').trim())}`)

  return { ok: results.every(result => result.status !== 'fail'), results }
}

const SYMBOLS = { pass: '✓', fail: '✗', skip: '-', info: 'ℹ' }

/** @param {Array<{ status: string, message: string }>} results */
export function formatResults(results) {
  return results.map(result => `${SYMBOLS[result.status] ?? '?'} ${result.message}`).join('\n')
}

function indent(text) {
  return text.split('\n').map(line => `    ${line}`).join('\n')
}

/** 跑一条只读命令；非零退出与缺失可执行文件都作为结果返回，不抛异常、不伪造成功。 */
function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return {
    status: typeof result.status === 'number' ? result.status : null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    errorCode: result.error?.code,
  }
}

function defaultDeps() {
  return {
    readFile: path => readFileSync(path, 'utf8'),
    gitBranch: () => runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim() || null,
    gitStatus: () => runCommand('git', ['status', '--porcelain', '--untracked-files=no']).stdout,
    gitRemoteUrl: () => {
      const result = runCommand('git', ['remote', 'get-url', 'origin'])
      return result.status === 0 ? result.stdout.trim() : ''
    },
    verifySource: packageDir => verifyPublishSource(packageDir),
    npmView: ({ name, version }) => runCommand('npm', ['view', `${name}@${version}`, 'version']),
    actionlint: () => {
      const result = runCommand('actionlint', ['-no-color', WORKFLOW_PATH])
      if (result.errorCode === 'ENOENT') return { status: 'skip' }
      return { status: result.status === 0 ? 'pass' : 'fail', output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
    },
  }
}

/**
 * @param {string[]} argv
 * @param {{ repoRoot?: string, deps?: object }} [options]
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2), options = {}) {
  let parsed
  try {
    parsed = parseArguments(argv)
  } catch (error) {
    console.error(`release-check: ${error.message}`)
    return 2
  }
  let repoRoot = options.repoRoot
  if (!repoRoot) {
    const result = runCommand('git', ['rev-parse', '--show-toplevel'])
    if (result.status !== 0) {
      console.error('release-check: 不在 git 仓库内，无法执行发布自检')
      return 2
    }
    repoRoot = result.stdout.trim()
  }
  const { ok, results } = runReleaseCheck({
    packageDir: parsed.packageDir,
    repoRoot,
    allowPublished: parsed.allowPublished,
    deps: options.deps ?? defaultDeps(),
  })
  console.log(`release-check: ${parsed.packageDir}`)
  console.log(formatResults(results))
  const failures = results.filter(result => result.status === 'fail').length
  console.log(ok ? 'release-check passed' : `release-check failed（${failures} 项失败）`)
  return ok ? 0 : 1
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.exitCode = main()
}
