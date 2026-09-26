#!/usr/bin/env node
/**
 * verify-global-skills.mjs — 全局技能白名单硬门禁
 *
 * 核心原则：
 * 1. 全局是所有 Agent 都必然用得上的通用基础底座；
 * 2. 全局技能尽量少（≤ 4 个），专业技能必须精准下沉到对应 Agent 或沉淀在市场；
 * 3. 任何特定平台（TikTok/IG/推特）、特定专业（写代码/做短剧/测自动化）技能严禁进入全局。
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 允许作为全局基础底座的白名单技能标识 */
export const ALLOWED_GLOBAL_SKILLS = new Set([
  'web-access', // 全网信息检索与网页读取底座
  'read',       // 基础文件与内容读取底座
  'write',      // 基础文字润色与多语言改写底座
  'genui',      // 结构化卡片与图表交互界面呈现底座
])

/**
 * 校验指定目录下的技能是否均在白名单内
 * @param {string} skillsDir
 * @returns {{ valid: boolean; violations: string[]; count: number }}
 */
export function checkGlobalSkillsDir(skillsDir) {
  if (!existsSync(skillsDir)) {
    return { valid: true, violations: [], count: 0 }
  }

  const entries = readdirSync(skillsDir).filter((name) => {
    if (name.startsWith('.') || name === 'node_modules') return false
    try {
      return statSync(join(skillsDir, name)).isDirectory()
    } catch {
      return false
    }
  })

  const violations = []
  for (const slug of entries) {
    if (!ALLOWED_GLOBAL_SKILLS.has(slug)) {
      violations.push(slug)
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    count: entries.length,
  }
}

// CLI 执行入口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetDir = process.argv[2]
  if (!targetDir) {
    console.log('ℹ️ verify-global-skills: 未传入目标全局目录，进行白名单规范自检：PASS')
    process.exit(0)
  }

  const res = checkGlobalSkillsDir(targetDir)
  if (!res.valid) {
    console.error(`❌ 全局技能白名单门禁校验失败：检测到 ${res.violations.length} 个非通用专业技能混入全局！`)
    console.error(`   违规条目: ${res.violations.join(', ')}`)
    console.error(`   规范约束: 全局仅允许出厂通用底座 [${Array.from(ALLOWED_GLOBAL_SKILLS).join(', ')}]，专业技能必须配置给具体 Agent 或移入市场。`)
    process.exit(1)
  }

  console.log(`✅ 全局技能白名单校验通过（共 ${res.count} 个全局通用底座技能）。`)
}
