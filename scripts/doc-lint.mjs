#!/usr/bin/env node
/**
 * scripts/doc-lint.mjs
 * OmniMux 开发文档工程实践合规性检测与门禁脚本
 *
 * 遵循规范：《开发文档工程实践管理规范》(docs/contracts/docs-governance-standard.md)
 * 
 * 校验维度：
 * 1. 简化 Frontmatter 解析、必填字段与 type/status/authority 枚举检查，非完整 Schema 校验
 * 2. Markdown 内部链接目标路径存在性检查，不验证锚点
 * 3. 配置目录的文件命名检查
 * 4. 核心索引/根文档存在性检查，不检测索引收录或孤岛文档
 * 5. 术语正则告警，不判断引用、历史上下文或内容语义
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const productRoot = path.resolve(__dirname, '..')
const docsRoot = path.join(productRoot, 'docs')

const VALID_TYPES = [
  'contract',
  'decision',
  'spec',
  'design',
  'evidence',
  'log',
  'reference',
  'index',
  'core',
  'archive',
  'stub'
]

const VALID_STATUS = [
  'draft',
  'proposed',
  'accepted',
  'living',
  'superseded',
  'deprecated',
  'archived'
]

const VALID_AUTHORITY = ['L0', 'L1', 'L2', 'L3', 'L4']

// 子目录命名规范
const SUBDIR_NAMING_RULES = {
  decisions: /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/,
  specs: /^(\d{4}-\d{2}-\d{2}-[a-z0-9-]+|README)\.(md|html)$/,
  evidence: /^(\d{4}-\d{2}-\d{2}-[a-z0-9-]+|README)\.md$/,
  logs: /^(\d{4}-\d{2}-\d{2}-[a-z0-9-]+|README)\.md$/,
  contracts: /^[a-z0-9-]+\.md$/,
  references: /^[a-z0-9-]+\.md$/,
  archive: /^(\d{4}-\d{2}-\d{2}-[a-z0-9-]+|README)\.md$/
}

// 违禁词规则 (术语红线)
const FORBIDDEN_TERMS = [
  {
    regex: /(?<![\w\d])(?:API\s*)?网关(?![\w\d])/g,
    desc: '违禁词："网关" (执行中枢规范要求使用"执行中枢 (Hub)"，见 docs/contracts/hub.md)',
    exemptFiles: ['docs/contracts/hub.md', 'docs/contracts/docs-governance-standard.md']
  }
]

let errorCount = 0
let warningCount = 0

function logError(file, msg) {
  const rel = path.relative(productRoot, file)
  console.error(`  ❌ [ERROR] ${rel}: ${msg}`)
  errorCount++
}

function logWarn(file, msg) {
  const rel = path.relative(productRoot, file)
  console.warn(`  ⚠️  [WARN]  ${rel}: ${msg}`)
  warningCount++
}

/**
 * 递归收集目录下所有文件
 */
function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.name === '.DS_Store') {
      logError(fullPath, '发现非法 macOS .DS_Store 缓存文件，请清理！')
      continue
    }
    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList)
    } else {
      fileList.push(fullPath)
    }
  }
  return fileList
}

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
  let isArray = false

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
        // 可能接下来是数组
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

  return { data, body: content.slice(endIdx + 4) }
}

/**
 * 校验单一文档
 */
function lintDocument(file, allDocPaths) {
  const relPath = path.relative(productRoot, file)
  const basename = path.basename(file)
  const ext = path.extname(file).toLowerCase()
  const parentDir = path.basename(path.dirname(file))

  // 1. 命名检查 (README.md 作为各目录合法索引文件予以豁免)
  if (basename !== 'README.md' && SUBDIR_NAMING_RULES[parentDir]) {
    const rule = SUBDIR_NAMING_RULES[parentDir]
    if (!rule.test(basename)) {
      logError(file, `文件名 "${basename}" 不符合目录 "${parentDir}" 命名规范 (${rule})`)
    }
  }

  // 若不是 Markdown，跳过后续 Markdown 专有检测
  if (ext !== '.md') return

  const content = fs.readFileSync(file, 'utf8')

  // 2. 检查 Forwarding Stub (转发桩文档允许简化 Frontmatter)
  const isStub = content.includes('# Document Moved') || content.includes('本文档已按照《开发文档工程实践管理规范》迁移')

  // 3. Frontmatter 校验
  const fm = parseFrontmatter(content)
  if (!fm) {
    if (isStub) {
      // 转发桩文档允许简单说明，但也建议加 Frontmatter
    } else {
      logError(file, '缺少标准 YAML Frontmatter (文件必须以 --- 开头并包含必需元数据)')
    }
  } else {
    const { data } = fm
    // 必需字段校验
    if (!data.title) logError(file, 'Frontmatter 缺失必填字段: title')
    if (!data.id) logError(file, 'Frontmatter 缺失必填字段: id')
    if (!data.type || !VALID_TYPES.includes(data.type)) {
      logError(file, `Frontmatter type 非法: "${data.type}" (有效值: ${VALID_TYPES.join(', ')})`)
    }
    if (!data.status || !VALID_STATUS.includes(data.status)) {
      logError(file, `Frontmatter status 非法: "${data.status}" (有效值: ${VALID_STATUS.join(', ')})`)
    }
    if (!data.authority || !VALID_AUTHORITY.includes(data.authority)) {
      logError(file, `Frontmatter authority 非法: "${data.authority}" (有效值: ${VALID_AUTHORITY.join(', ')})`)
    }
    if (!data.date) {
      logError(file, 'Frontmatter 缺失必填字段: date (YYYY-MM-DD)')
    }
  }

  // 4. 内部链接与死链扫描
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  let match
  while ((match = markdownLinkRegex.exec(content)) !== null) {
    const linkText = match[1]
    const href = match[2].trim()

    // 忽略网络链接与协议
    if (/^(https?:|mailto:|ftp:|#)/.test(href)) continue

    const [cleanPath, anchor] = href.split('#')
    if (!cleanPath) continue // 纯本页锚点

    // 解析目标文件物理路径
    let targetAbsPath
    if (cleanPath.startsWith('/')) {
      targetAbsPath = path.join(productRoot, cleanPath.slice(1))
    } else {
      targetAbsPath = path.resolve(path.dirname(file), cleanPath)
    }

    if (!fs.existsSync(targetAbsPath)) {
      logError(file, `检测到失效链接: [${linkText}](${href}) -> 目标文件不存在: ${path.relative(productRoot, targetAbsPath)}`)
    }
  }

  // 5. 违禁词与用语合规检测
  for (const item of FORBIDDEN_TERMS) {
    if (item.exemptFiles && item.exemptFiles.some((ef) => relPath.endsWith(ef))) {
      continue
    }
    // 扫描全文，不识别引用块或历史上下文的语义豁免
    if (item.regex.test(content)) {
      // 简单告警
      logWarn(file, item.desc)
    }
  }
}

/**
 * 主执行函数
 */
export async function run() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║       OmniMux 文档工程实践管理规范 (DocLint) 自动化门禁       ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  const allFiles = getAllFiles(docsRoot)
  const allDocPaths = new Set(allFiles)

  console.log(`📁 扫描目录: docs/ (共计发现 ${allFiles.length} 个文档/资源文件)\n`)

  for (const file of allFiles) {
    lintDocument(file, allDocPaths)
  }

  // 检查关键根索引文件是否存在
  const criticalFiles = [
    'docs/README.md',
    'docs/capabilities.md',
    'docs/briefing.md',
    'docs/harness-pin.md',
    'docs/contracts/README.md',
    'docs/decisions/README.md',
    'docs/specs/README.md'
  ]

  for (const cf of criticalFiles) {
    const p = path.join(productRoot, cf)
    if (!fs.existsSync(p)) {
      logError(p, `核心索引/根文档缺失: ${cf}`)
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log(`📊 扫描结果汇总: ❌ 错误: ${errorCount} 项 | ⚠️  警告: ${warningCount} 项`)
  console.log('─────────────────────────────────────────────────────────────────\n')
  console.log('覆盖范围有限：未校验完整 Frontmatter Schema、锚点、索引收录/孤岛或内容语义；警告需单独审阅，不阻断退出码。')

  if (errorCount > 0) {
    console.error('DocLint 检查未通过；请处理上述错误，警告仍需单独审阅。')
    process.exit(1)
  } else {
    console.log('DocLint 已实现的检查项未发现错误；不代表全部文档符合治理规范，警告仍需单独审阅。')
    process.exit(0)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('DocLint 执行异常:', err)
    process.exit(1)
  })
}
