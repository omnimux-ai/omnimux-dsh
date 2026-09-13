#!/usr/bin/env node
/**
 * scripts/guard-quality-loop.mjs
 * dsh-hooks-plugin PreToolUse Hard Gate for Quality Loop (Spec → Code → Verify → Test → Green)
 * Contract: specs/quality-loop-hard-gate.spec.md
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve, relative, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 寻找仓库根目录或 Worktree 根目录
 */
export function findWorktreeRoot(startDir) {
  let cur = resolve(startDir)
  for (let i = 0; i < 6; i++) {
    try {
      const pkgPath = resolve(cur, 'package.json')
      const data = readFileSync(pkgPath, 'utf8')
      if (data.includes('"name": "omnimux-dsh"')) {
        return cur
      }
    } catch {}
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return startDir
}

/**
 * 判定目标文件是否为受保护的核心业务源码
 */
export function isBusinessSourceFile(fullPath, rootDir) {
  const rel = relative(rootDir, fullPath).replace(/\\/g, '/')

  // 1. 明确豁免的路径或文件类型
  if (
    rel.startsWith('specs/') ||
    rel.endsWith('.spec.md') ||
    rel.endsWith('.md') ||
    rel.startsWith('scripts/') ||
    rel.startsWith('.dsh/') ||
    rel.startsWith('.workbuddy/') ||
    rel.startsWith('.github/') ||
    rel.startsWith('docs/') ||
    rel.startsWith('tmp/') ||
    rel.startsWith('dist/') ||
    rel.startsWith('node_modules/') ||
    rel.includes('/test-fixtures/') ||
    rel.includes('/tests/') ||
    rel.includes('.test.') ||
    rel.includes('.spec.') ||
    rel === 'package.json' ||
    rel === 'pnpm-workspace.yaml' ||
    rel === 'pnpm-lock.yaml' ||
    rel.startsWith('tsconfig') ||
    rel === 'design.md'
  ) {
    return false
  }

  // 2. 检查是否位于业务插件或核心包的 src 源码目录中
  if (
    rel.startsWith('plugins/') && (rel.includes('/src/') || rel.includes('/extension/src/'))
  ) {
    return true
  }
  if (
    rel.startsWith('packages/') && rel.includes('/src/')
  ) {
    return true
  }

  return false
}

/**
 * 判定目标文件是否为端到端/UI自动化测试脚本
 */
export function isE2ETestFile(fullPath, rootDir) {
  const rel = relative(rootDir, fullPath).replace(/\\/g, '/')
  return (
    rel.includes('/tests/e2e/') ||
    rel.includes('.e2e.test.') ||
    (rel.endsWith('.spec.ts') && !rel.startsWith('specs/')) ||
    (rel.endsWith('.spec.js') && !rel.startsWith('specs/'))
  )
}

/**
 * 检查当前工作区是否存在合法有效的 Spec 规格文档
 */
export function hasValidSpec(rootDir) {
  const candidateDirs = [
    resolve(rootDir, 'specs'),
    resolve(rootDir, 'tests/specs'),
    resolve(rootDir, '.workbuddy/specs'),
  ]

  for (const dir of candidateDirs) {
    try {
      const files = readdirSync(dir)
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = resolve(dir, file)
          const stat = statSync(filePath)
          if (stat.isFile() && stat.size > 50) {
            return true
          }
        }
      }
    } catch {}
  }

  return false
}

/**
 * 检查当前工作区是否存在实机预演留存的证据（截图或运行日志）
 */
export function hasVerifyEvidence(rootDir) {
  const candidateDirs = [
    resolve(rootDir, '.workbuddy/evidence'),
    resolve(rootDir, '.workbuddy/evidence/worktree-qa'),
    resolve(rootDir, 'tmp/qa-evidence'),
  ]

  for (const dir of candidateDirs) {
    try {
      const files = readdirSync(dir)
      if (files.length > 0) {
        return true
      }
    } catch {}
  }

  return false
}

/**
 * 核心判定逻辑
 */
export function decideQualityGate({ toolName, toolInput, cwd }) {
  const rawTool = String(toolName || '').toLowerCase()
  const name = rawTool.replace(/^.*:/, '')

  if (name !== 'edit' && name !== 'write') {
    return { decision: 'allow' }
  }

  const rawPath = String(toolInput.file_path || '').trim()
  if (!rawPath) return { decision: 'allow' }

  const fullPath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath)
  const rootDir = findWorktreeRoot(cwd)

  // 门禁一：修改业务源码前，必须先有 Spec
  if (isBusinessSourceFile(fullPath, rootDir)) {
    if (!hasValidSpec(rootDir)) {
      return {
        decision: 'deny',
        reason: 'missing-spec-for-source-code',
        message: [
          '🚫【质量五步闭环硬门禁：Spec 前置拦截】修改业务源码前必须先交付规格说明（Spec）！',
          '📌 核心守则：AI 编码必须以“用户真实操作旅程与断言用例”为第一真源，禁止无规格盲目改写代码。',
          '👉 强制流程：',
          '  1. 先调用规格技能: skill { "name": "spec-driven-development" } 梳理业务旅程与验收标准；',
          '  2. 在 specs/ 目录下创建具体的规格文件（如 specs/<feature>.spec.md），明确点哪里、输入什么、预期出现什么；',
          '  3. 规格文件落盘后，方可开启源码编写！',
          'ℹ️  豁免范围：编写 specs/ 本身、纯文档（*.md）、测试脚本、配置文件（package.json/tsconfig）与临时草稿。',
        ].join('\n'),
      }
    }
  }

  // 门禁二：编写 E2E 测试脚本前，必须先有实机预演证据
  if (isE2ETestFile(fullPath, rootDir)) {
    if (!hasVerifyEvidence(rootDir)) {
      return {
        decision: 'deny',
        reason: 'missing-verify-evidence-for-e2e',
        message: [
          '🚫【质量五步闭环硬门禁：Verify 前置拦截】编写自动化测试前必须先在独立环境中实机演练并留存证据！',
          '📌 核心守则：直接盲猜选择器编写测试极易脆变崩溃。必须先通过自主浏览器或隔离 Web QA 在真实页面中跑通，摸清真实按钮特征后再固化用例。',
          '👉 强制流程：',
          '  1. 在当前独立工作树下运行: node scripts/worktree-web-qa.mjs <subsystem> 或使用 ego-browser 演练；',
          '  2. 确认界面正常渲染、按钮可点击并捕获真实截图证据后，再固化端到端测试！',
        ].join('\n'),
      }
    }
  }

  return { decision: 'allow' }
}

export function handle(rawInput) {
  const input = JSON.parse(rawInput || '{}')
  const hookEventName = input.hook_event_name || 'PreToolUse'
  const rawTool = String(input.tool_name || '').toLowerCase()
  const toolInput = input.tool_input || {}
  const cwd = String(input.cwd || process.cwd())

  const result = decideQualityGate({ toolName: rawTool, toolInput, cwd })

  const output = {
    hookEventName,
    permissionDecision: result.decision,
  }

  if (result.decision === 'deny') {
    output.permissionDecisionReason = result.message
  }

  return { hookSpecificOutput: output }
}

function main() {
  let rawInput = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    rawInput += chunk
  })
  process.stdin.on('end', () => {
    try {
      process.stdout.write(JSON.stringify(handle(rawInput)) + '\n')
    } catch (err) {
      process.stderr.write(`[guard-quality-loop error] ${err.message}\n`)
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
          },
        }) + '\n',
      )
    }
  })
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) main()
