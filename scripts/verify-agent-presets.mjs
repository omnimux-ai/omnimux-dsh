#!/usr/bin/env node
/**
 * verify-agent-presets.mjs — 出厂 Agent 预设健康度与正交性硬门禁
 *
 * 核心原则：
 * 1. 保留创建 Agent (cordis) 供用户搭建自定义 Agent；
 * 2. 其余出厂预设必须 100% 为社媒运营 Agent，非社媒角色一律移入专家市场；
 * 3. 彻底废除 100% 粗暴复制技能，任意两个预设之间的技能重合度严禁超过 30%；
 * 4. 每个出厂预设必须具有合法清晰的 skills.json 及 categories。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 合法的出厂预设白名单（1个工具 + 7个社媒专属矩阵） */
export const ALLOWED_PRESET_IDS = new Set([
  'cordis',             // 创建Agent (保留)
  'omni-agent',         // 全域社媒操盘手
  'tiktok-agent',       // TikTok 运营操盘手
  'instagram-agent',    // Instagram 视觉增长专家
  'x-agent',            // X (推特) 流量运营专家
  'youtube-agent',      // YouTube 创作增长专家
  'viral-video-agent',  // 爆款视频复刻操盘手
  'ad-creative-agent',  // 出海广告创意投放操盘手
])

/**
 * 校验出厂预设目录
 * @param {string} presetsDir
 * @returns {{ valid: boolean; errors: string[]; presets: string[] }}
 */
export function checkPresetsHealth(presetsDir) {
  const errors = []
  if (!existsSync(presetsDir)) {
    return { valid: false, errors: [`预设目录不存在: ${presetsDir}`], presets: [] }
  }

  const entries = readdirSync(presetsDir).filter((name) => {
    if (name.startsWith('.') || name === 'fragments') return false
    try {
      return statSync(join(presetsDir, name)).isDirectory()
    } catch {
      return false
    }
  })

  // 1. 检查是否存在未授权的非社媒预设
  for (const pid of entries) {
    if (!ALLOWED_PRESET_IDS.has(pid)) {
      errors.push(`非法预设角色 [${pid}]：出厂预设仅允许 cordis 及社媒运营矩阵角色，非社媒角色必须移入专家市场！`)
    }
  }

  // 2. 读取各预设绑定的技能集，计算两两重合度
  const presetSkills = new Map()
  for (const pid of entries) {
    const skillsJsonPath = join(presetsDir, pid, 'skills.json')
    if (pid === 'cordis') {
      // cordis 是自定义搭建工具，无固定 skills.json 约束
      continue
    }

    if (!existsSync(skillsJsonPath)) {
      errors.push(`预设 [${pid}] 缺少 skills.json 技能配置文件！`)
      continue
    }

    try {
      const data = JSON.parse(readFileSync(skillsJsonPath, 'utf8'))
      const list = Array.isArray(data) ? data : (data.skills || [])
      const slugs = new Set(list.map((s) => s.slug || s.skill || s.id).filter(Boolean))
      if (slugs.size === 0) {
        errors.push(`预设 [${pid}] 的 skills.json 中没有配置任何有效技能！`)
      }
      presetSkills.set(pid, slugs)
    } catch (e) {
      errors.push(`解析预设 [${pid}] 的 skills.json 失败: ${e.message}`)
    }
  }

  // 3. 校验重合度：任意两个社媒 Agent 的技能重合比例不得超过 30%
  const checkedPairs = new Set()
  for (const [pidA, setA] of presetSkills.entries()) {
    for (const [pidB, setB] of presetSkills.entries()) {
      if (pidA === pidB) continue
      const pairKey = [pidA, pidB].sort().join('::')
      if (checkedPairs.has(pairKey)) continue
      checkedPairs.add(pairKey)

      let overlapCount = 0
      for (const s of setA) {
        if (setB.has(s)) overlapCount++
      }

      const minSize = Math.min(setA.size, setB.size)
      if (minSize > 0) {
        const overlapRatio = overlapCount / minSize
        if (overlapRatio > 0.3) {
          errors.push(
            `预设 [${pidA}] 与 [${pidB}] 的技能重合度过高 (${Math.round(overlapRatio * 100)}% > 30%)！检测到重复技能: ${Array.from(setA).filter((s) => setB.has(s)).join(', ')}。请正交拆解专业技能！`
          )
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    presets: entries,
  }
}

// CLI 执行入口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetDir = process.argv[2] || join(ROOT, 'presets')
  const res = checkPresetsHealth(targetDir)
  if (!res.valid) {
    console.error(`❌ 出厂 Agent 预设健康度门禁校验失败：发现 ${res.errors.length} 项违规！`)
    res.errors.forEach((err) => console.error(`   - ${err}`))
    process.exit(1)
  }

  console.log(`✅ 出厂 Agent 预设健康度与正交性校验通过（共 ${res.presets.length} 个角色预设）。`)
}
