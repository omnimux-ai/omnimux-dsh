#!/usr/bin/env node
/**
 * scripts/doc-index-gen.mjs
 * OmniMux 文档子目录索引写入工具（非只读验证）
 *
 * 职能：
 * 1. 扫描 docs/ 下七个配置子目录的直接子文件并简化解析 Frontmatter
 * 2. 生成并覆盖 contracts、decisions、specs、evidence、logs、references、archive 的 README.md
 * 3. 不生成或更新 docs/README.md 根门户
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const productRoot = path.resolve(__dirname, '..')
const docsRoot = path.join(productRoot, 'docs')

/**
 * 解析 YAML Frontmatter
 */
function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null
  const endIdx = content.indexOf('\n---', 3)
  if (endIdx === -1) return null

  const raw = content.slice(3, endIdx).trim()
  const lines = raw.split('\n')
  const data = {}
  let currentKey = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('- ') && currentKey) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = []
      }
      let val = trimmed.slice(2).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      data[currentKey].push(val)
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx !== -1) {
      currentKey = line.slice(0, colonIdx).trim()
      let val = line.slice(colonIdx + 1).trim()
      if (val === '') {
        data[currentKey] = []
      } else {
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        } else if (val.startsWith('[') && val.endsWith(']')) {
          val = val
            .slice(1, -1)
            .split(',')
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
        }
        data[currentKey] = val
      }
    }
  }

  // 提取正文首段摘要
  const body = content.slice(endIdx + 4).trim()
  let summary = ''
  for (const bline of body.split('\n')) {
    const sline = bline.trim()
    if (!sline || sline.startsWith('#') || sline.startsWith('>') || sline.startsWith('---') || sline.startsWith('```')) {
      continue
    }
    summary = sline.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 100)
    break
  }

  return { data, summary }
}

/**
 * 扫描目录下的文档信息
 */
function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return []
  const files = fs.readdirSync(dirPath)
  const items = []

  for (const file of files) {
    if (file === 'README.md' || file === '.DS_Store' || file === 'prototypes') continue
    const fullPath = path.join(dirPath, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) continue

    const content = fs.readFileSync(fullPath, 'utf8')
    const parsed = parseFrontmatter(content)

    items.push({
      filename: file,
      title: parsed?.data?.title || file,
      id: parsed?.data?.id || '-',
      type: parsed?.data?.type || 'unknown',
      status: parsed?.data?.status || 'unknown',
      authority: parsed?.data?.authority || '-',
      date: parsed?.data?.date || '-',
      updated: parsed?.data?.updated || '-',
      subsystem: parsed?.data?.subsystem || 'global',
      summary: parsed?.summary || parsed?.data?.title || file
    })
  }

  // 按日期降序或文件名升序排列
  items.sort((a, b) => {
    if (a.date !== '-' && b.date !== '-') {
      return b.date.localeCompare(a.date)
    }
    return a.filename.localeCompare(b.filename)
  })

  return items
}

export function generateAllIndexes() {
  console.log('开始扫描并覆盖七个配置子目录的 README.md 索引；不更新 docs/README.md（非只读检查）。\n')

  const sections = [
    {
      dir: 'contracts',
      title: '系统契约与工程规范 (Contracts)',
      authority: 'L1',
      lifecycle: '持续演进 (Living)',
      desc: '系统接口定义、架构边界、开发流程与运维规范。具有高权威效力，随系统迭代持续演化。'
    },
    {
      dir: 'decisions',
      title: '架构决策记录 (ADR / Decisions)',
      authority: 'L2',
      lifecycle: '不可变只读 (Immutable Records)',
      desc: '重大架构决议与技术选型裁定。历史决议不可篡改，若有升级仅通过新增补丁决议替代。'
    },
    {
      dir: 'specs',
      title: '产品规格与技术设计 (Specs & PRDs)',
      authority: 'L2',
      lifecycle: '阶段规格 -> 实现沉淀',
      desc: '各垂直插件与中枢功能的产品需求 PRD、技术设计规格 RFC 与高保真交互原型。'
    },
    {
      dir: 'evidence',
      title: '实测与验证证据 (Evidence)',
      authority: 'L3',
      lifecycle: '不可变只读 (Immutable Evidence)',
      desc: '自动化测试、真机实测、基线度量与能力验证的客观证据记录。'
    },
    {
      dir: 'logs',
      title: '里程碑与交付日志 (Logs)',
      authority: 'L3',
      lifecycle: '不可变只读 (Immutable Logs)',
      desc: '版本迭代、阶段功能交付、踩坑排查与关键操作追溯日志。'
    },
    {
      dir: 'references',
      title: '业务资料与外部参考 (References)',
      authority: 'L4',
      lifecycle: '查阅参考 (Reference Only)',
      desc: '外部平台接入文档、行业 SOP、调研报告等背景知识参考。'
    },
    {
      dir: 'archive',
      title: '历史废弃与归档文档 (Archive)',
      authority: 'L4',
      lifecycle: '封存历史 (Archived)',
      desc: '已被新架构完全替代的历史文档，保留供溯源与上下文审计。'
    }
  ]

  for (const sec of sections) {
    const dirPath = path.join(docsRoot, sec.dir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    const items = scanDirectory(dirPath)
    let md = `---
title: "${sec.title} 索引"
id: "index-${sec.dir}"
type: "index"
status: "living"
authority: "${sec.authority}"
date: "2026-08-26"
updated: "${new Date().toISOString().slice(0, 10)}"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# ${sec.title}

> **权威等级**：${sec.authority} | **生命周期**：${sec.lifecycle}

## 1. 目录职能
${sec.desc}

## 2. 索引矩阵 (Index Matrix)

| 状态 | 文件名 | 标题 | 模块 | 维护/生效日期 | 核心摘要 |
|---|---|---|---|---|---|
`
    for (const it of items) {
      const statusBadge = `\`${it.status}\``
      md += `| ${statusBadge} | [${it.filename}](${it.filename}) | ${it.title} | \`${it.subsystem}\` | ${it.date} | ${it.summary.replace(/\|/g, '\\|')} |\n`
    }

    const readmePath = path.join(dirPath, 'README.md')
    fs.writeFileSync(readmePath, md, 'utf8')
    console.log(`✓ 已生成索引: docs/${sec.dir}/README.md (${items.length} 篇文档)`)
  }

  console.log('\n七个配置子目录的 README.md 索引写入完成；docs/README.md 未更新。')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAllIndexes()
}
