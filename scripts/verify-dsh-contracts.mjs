#!/usr/bin/env node
/**
 * scripts/verify-dsh-contracts.mjs
 *
 * 确定性硬门禁：强制校验各插件符合 DSH 官方插件标准契约
 * 1. Cordis inject 闭环校验：源码中调用的内置服务（ctx.tools, ctx.llm 等）必须在 inject 中显式声明
 * 2. defineTool Schema 校验：parameters 必须为合法 JSON Schema 且带有 type: "object"
 * 3. 依赖规范校验：各插件 package.json 必须规范声明 peerDependencies 或 dependencies
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const STANDARD_SERVICES = [
  'tools',
  'llm',
  'session',
  'slots',
  'http',
  'router',
  'market',
  'storage',
  'server',
  'workspace',
  'client',
  'systemPrompt',
  'agents',
]

export function scanPluginCompliance(pluginsDir) {
  const violations = []

  if (!existsSync(pluginsDir)) return violations

  const pluginDirs = readdirSync(pluginsDir)
    .filter((f) => {
      const p = join(pluginsDir, f)
      return statSync(p).isDirectory() && existsSync(join(p, 'package.json'))
    })
    .sort()

  for (const name of pluginDirs) {
    const pDir = join(pluginsDir, name)
    const pkg = JSON.parse(readFileSync(join(pDir, 'package.json'), 'utf-8'))

    // 1. Manifest 依赖规范检查
    if (!pkg.peerDependencies && !pkg.dependencies) {
      violations.push({
        plugin: name,
        type: 'MANIFEST_MISSING_DEPENDENCY_DECLARATION',
        message: `package.json 缺少 peerDependencies 或 dependencies 规范声明`,
      })
    }

    // 2. 收集源码文件
    const srcDir = existsSync(join(pDir, 'src')) ? join(pDir, 'src') : pDir
    const files = []
    function walk(dir) {
      for (const item of readdirSync(dir)) {
        if (
          ['node_modules', 'dist', 'test', 'tests', 'docs', '.git'].includes(item) ||
          item.endsWith('.test.js') ||
          item.endsWith('.spec.ts')
        ) {
          continue
        }
        const full = join(dir, item)
        if (statSync(full).isDirectory()) {
          walk(full)
        } else if (/\.(js|ts|jsx|tsx|mjs)$/.test(item)) {
          files.push(full)
        }
      }
    }
    walk(srcDir)

    // 3. 提取 inject 声明
    const declaredInject = new Set()
    for (const f of files) {
      const content = readFileSync(f, 'utf-8')
      const m1 = content.match(/export\s+const\s+inject\s*=\s*\[([^\]]*)\]/)
      if (m1) {
        m1[1]
          .split(',')
          .map((s) => s.replace(/["'\s]/g, ''))
          .filter(Boolean)
          .forEach((s) => declaredInject.add(s))
      }
      const m2 = content.match(/inject\s*:\s*\[([^\]]*)\]/)
      if (m2) {
        m2[1]
          .split(',')
          .map((s) => s.replace(/["'\s]/g, ''))
          .filter(Boolean)
          .forEach((s) => declaredInject.add(s))
      }
    }

    // 4. 扫描源码中对宿主标准 Service 的调用
    const usedServices = new Set()
    for (const f of files) {
      const content = readFileSync(f, 'utf-8')
      for (const s of STANDARD_SERVICES) {
        const reg = new RegExp(`ctx\\.${s}\\b`)
        if (reg.test(content)) {
          usedServices.add(s)
        }
      }

      // 5. defineTool parameters 格式校验
      const toolMatches = content.matchAll(/defineTool\s*\(\s*\{([\s\S]*?)\n\s*\}\s*[,)]/g)
      for (const match of toolMatches) {
        const block = match[1]
        const nameMatch = block.match(/name\s*:\s*["'`]([^"'`]+)["'`]/)
        const toolName = nameMatch ? nameMatch[1] : 'unknown_tool'

        if (/parameters\s*:/.test(block)) {
          // 匹配 parameters: { ... }
          const paramBlock = block.match(/parameters\s*:\s*\{([\s\S]*?)\n\s*(?:(?:properties|required|execute)\b|\})/m)
          const searchRange = paramBlock ? paramBlock[0] : block
          if (!/type\s*:\s*["']object["']/.test(searchRange)) {
            violations.push({
              plugin: name,
              file: relative(repoRoot, f),
              type: 'TOOL_SCHEMA_MISSING_OBJECT_TYPE',
              message: `Tool [${toolName}] 的 parameters 缺少 'type: "object"' 标准声明`,
            })
          }
        }
      }
    }

    // 对比已使用的 Service 是否在 inject 中声明
    for (const s of usedServices) {
      if (!declaredInject.has(s)) {
        violations.push({
          plugin: name,
          type: 'CORDIS_INJECT_MISSING',
          service: s,
          message: `使用了 ctx.${s}，但插件入口 inject 未显式声明 '${s}'`,
        })
      }
    }
  }

  return violations
}

// CLI 执行入口
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const pluginsDir = resolve(repoRoot, 'plugins')
  console.log(`[DSH Contracts Gate] 开始静态扫描插件合规性...`)
  const violations = scanPluginCompliance(pluginsDir)

  if (violations.length > 0) {
    console.error(`\n❌ [DSH Contracts Gate] 发现 ${violations.length} 处违反 DSH 官方规范的缺陷：\n`)
    for (const v of violations) {
      console.error(`  - [${v.type}] 插件 [${v.plugin}] ${v.file ? `(${v.file})` : ''}: ${v.message}`)
    }
    console.error(`\n👉 修复要求：`)
    console.error(`  1. 插件调用任何宿主 ctx.<service> 必须在入口 export const inject = [...] 中闭环声明；`)
    console.error(`  2. 所有 defineTool 的 parameters 必须显式声明 type: "object" 并符合 JSON Schema 规范；`)
    console.error(`  3. 插件 package.json 必须规范声明 peerDependencies。`)
    process.exit(1)
  }

  console.log(`✅ [DSH Contracts Gate] 全部插件 100% 符合 DSH 官方规范。`)
  process.exit(0)
}
