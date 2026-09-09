#!/usr/bin/env node
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Shared by CI and the delivery pipeline, including styles and non-React clients.
export const UI_FILE_RE = /(?:^|[\\/])(?:client|apps|web)(?:[\\/]|$)|Stage\.(?:js|jsx|ts|tsx)$|\.(?:jsx|tsx|vue|svelte|html|css|scss)$/i

const NON_RUNTIME_RE = /(?:^|\/)(?:docs?|tests?|__tests__|test-fixtures|fixtures)(?:\/|$)|\.(?:test|spec)\.[^/]+$|\.(?:md|mdx)$/i

const runtimeFiles = files => files.map(file => file.replaceAll('\\', '/')).filter(file => !NON_RUNTIME_RE.test(file))

export function requiresBrowser(changedFiles = []) {
  return runtimeFiles(changedFiles).some(file => UI_FILE_RE.test(file))
}

export function requiresDev(changedFiles = []) {
  return requiresBrowser(changedFiles) || runtimeFiles(changedFiles).some(file =>
    /^(?:plugins|packages|apps)\//.test(file) || /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/.test(file))
}

/** Pending delivery requirements, never evidence of browser/runtime success. */
export function postMergeAcceptance(matrix) {
  return Object.fromEntries(['dev', 'browser'].map(name => [name, {
    ...matrix.dimensions[name], pass: null,
    status: matrix.dimensions[name].required ? 'pending' : 'not-applicable',
  }]))
}

/** Derive required evidence from repository-relative paths without I/O. */
export function deriveImpactMatrix(changedFiles = []) {
  if (!Array.isArray(changedFiles) || changedFiles.some(file => typeof file !== 'string' || !file.trim())) {
    throw new TypeError('changedFiles 必须是非空文件路径组成的数组')
  }
  const isUiChange = requiresBrowser(changedFiles)
  const devRequired = requiresDev(changedFiles)
  const reason = isUiChange
    ? '包含客户端/UI文件变更，合并后必须提供 Dev 45120 的 ego-browser 验收证据'
    : '无客户端/UI文件变更，ego-browser 浏览器验收不适用'
  return {
    dimensions: {
      l0: { required: true, phase: 'pre-merge', reason: '所有代码变更均需通过 L0 离线单测与语法检查' },
      dev: { required: devRequired, phase: 'post-merge', target: 'dev', reason: devRequired
        ? '路径涉及产品运行时或依赖，合并后 Dev required；协调 Agent 按实际 diff 复核，纯 scripts/元数据需记录不适用理由'
        : '无产品运行时或依赖变更，Dev 物化与验收不适用' },
      browser: { required: isUiChange, phase: 'post-merge', target: 'dev', reason },
    },
    isUiChange,
    summary: `L0: pre-merge required；Dev: post-merge ${devRequired ? 'required' : 'not-applicable'}；ego-browser: post-merge ${isUiChange ? 'required' : 'not-applicable'}（${reason}）`,
  }
}

/** Reuse the strict diff reader; dynamic import keeps pure consumers dependency-free. */
export async function impactFilesFromGit(root = process.cwd(), base = 'origin/main') {
  const { changedFilesFromGit } = await import('./auto-qa-gate.mjs')
  return changedFilesFromGit(root, base, { strict: true })
    .map(file => relative(root, file).replaceAll('\\', '/'))
}

export async function main(argv = process.argv.slice(2)) {
  let files = []
  let fromGit = false
  let explicitFiles = false
  let base = 'origin/main'
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--git-diff') fromGit = true
    else if (arg === '--files' && argv[i + 1] !== undefined) {
      files = argv[++i].split(',').map(file => file.trim()).filter(Boolean)
      explicitFiles = true
    } else if (arg === '--base' && argv[i + 1]) base = argv[++i]
    else throw new Error(`未知或缺值参数: ${arg}`)
  }
  if (fromGit && explicitFiles) throw new Error('--files 与 --git-diff 不能同时使用')
  if (fromGit) files = await impactFilesFromGit(process.cwd(), base)
  process.stdout.write(`${JSON.stringify(deriveImpactMatrix(files), null, 2)}\n`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { process.exitCode = await main() } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
