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
    ? '包含客户端/UI文件变更，必须在本任务独立工作树内完成真实浏览器 Web 验证并留存证据（截图/结构化报告）'
    : '无客户端/UI文件变更，浏览器 Web 验证不适用'
  return {
    dimensions: {
      l0: { required: true, phase: 'pre-merge', reason: '所有代码变更均需通过 L0 离线单测与语法检查' },
      dev: { required: false, phase: 'post-merge', target: 'human', reason: devRequired
        ? '开发版真机验收为人工职责：多工作树并发时共享开发版为单实例、无法并行验收，不作为 Agent 交付卡点；物化保留为可选（供人工实机查看）'
        : '无产品运行时或依赖变更，物化与真机验收均不适用' },
      browser: { required: isUiChange, phase: 'post-merge', target: 'worktree', reason },
    },
    isUiChange,
    summary: `L0: pre-merge required；工作树 Web 验证: ${isUiChange ? 'required' : 'not-applicable'}；开发版真机验收: 人工职责、非 Agent 卡点（${reason}）`,
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
