#!/usr/bin/env node
/**
 * scripts/guard-ui-design.mjs
 * dsh-hooks-plugin PreToolUse Hard Gate for OmniMux UI Design Guidelines
 * Contract: design.md (L1), docs/contracts/ui-design-guidelines.md, docs/system_design.md
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, resolve, relative, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isTargetUIFile, inspectUICode } from './guard-ui-rules.mjs'
import { formatDenyReason } from './guard-ui-formatter.mjs'

/**
 * 寻找仓库根目录（含 package.json 的目录）
 */
function findRepoRoot(startDir) {
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

export function handle(rawInput) {
  const input = JSON.parse(rawInput || '{}')
  const hookEventName = input.hook_event_name || 'PreToolUse'
  const rawTool = String(input.tool_name || '').toLowerCase()
  const toolName = rawTool.replace(/^.*:/, '')
  const toolInput = input.tool_input || {}
  const cwd = String(input.cwd || process.cwd())

  // 1. 仅拦截 write 和 edit 工具
  if (toolName !== 'write' && toolName !== 'edit') {
    return {
      hookSpecificOutput: {
        hookEventName,
        permissionDecision: 'allow',
      },
    }
  }

  // 2. 提取并解析目标路径
  const rawFilePath = String(toolInput.file_path || toolInput.path || toolInput.filePath || '').trim()
  if (!rawFilePath) {
    return {
      hookSpecificOutput: {
        hookEventName,
        permissionDecision: 'allow',
      },
    }
  }

  const repoRoot = findRepoRoot(cwd)
  const fullPath = isAbsolute(rawFilePath) ? rawFilePath : resolve(cwd, rawFilePath)

  // 3. 范围判定与白黑名单过滤（1ms 内短路）
  if (!isTargetUIFile(fullPath, repoRoot)) {
    return {
      hookSpecificOutput: {
        hookEventName,
        permissionDecision: 'allow',
      },
    }
  }

  // 4. 提取审查代码与行号偏移
  let codeToCheck = ''
  let lineOffset = 0

  if (toolName === 'write') {
    codeToCheck = String(toolInput.content || '')
  } else if (toolName === 'edit') {
    codeToCheck = String(toolInput.new_string || '')
    // 尝试在原文件中定位 old_string 获取真实绝对行号
    try {
      const oldStr = String(toolInput.old_string || '')
      if (oldStr) {
        const fileContent = readFileSync(fullPath, 'utf8')
        const idx = fileContent.indexOf(oldStr)
        if (idx !== -1) {
          lineOffset = fileContent.slice(0, idx).split('\n').length - 1
        }
      }
    } catch {}
  }

  // 5. 规则审查
  const violations = inspectUICode(codeToCheck, fullPath, lineOffset)

  // 6. 裁决输出
  if (violations.length === 0) {
    return {
      hookSpecificOutput: {
        hookEventName,
        permissionDecision: 'allow',
      },
    }
  }

  const displayPath = relative(repoRoot, fullPath).replace(/\\/g, '/')
  const reason = formatDenyReason(violations, displayPath)

  return {
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'deny',
      permissionReason: reason,
      permissionDecisionReason: reason,
    },
  }
}

export function main() {
  let rawInput = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    rawInput += chunk
  })
  process.stdin.on('end', () => {
    try {
      const result = handle(rawInput)
      process.stdout.write(JSON.stringify(result) + '\n')
    } catch (err) {
      process.stderr.write(`[guard-ui-design error] ${err.message}\n`)
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

if (isMain) {
  main()
}
