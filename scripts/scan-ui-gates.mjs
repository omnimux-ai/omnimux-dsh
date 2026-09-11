#!/usr/bin/env node
/**
 * scripts/scan-ui-gates.mjs
 * UI01~UI10 Static Scanner for OmniMux UI Design Guidelines
 * Contract: design.md (L1), docs/contracts/ui-design-guidelines.md, Issue #20
 *
 * UI01~UI10 全面纳入 FATAL 门禁，任何违规均导致 process.exit(1) 阻断 CI 与构建。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const PLUGINS_DIR = process.env.OMNIMUX_PLUGINS_DIR || join(REPO_ROOT, 'plugins')

const EXEMPT_PATHS = [
  'node_modules',
  'lib',
  'dist',
  'dist-harness',
  'build',
  '.dsh',
  '.workbuddy',
  'tests',
  'fixtures',
  '__tests__',
  '.test.',
  '.spec.',
  'test-mocks',
  // Vendored upstream OpenReel source tree
  'openreel',
  // React Flow / Canvas internals exemption (excluding canvas/ui)
  'src/canvas/nodes',
  'src/canvas/edges',
  'src/canvas/handles',
  // Workflow canvas engine: 画布节点/工具条属既有技术债，独立于页头收敛 (Issue #200) 处理
  'src/canvas/',
]

// UI10 合规字阶白名单 (design.md §4.2)。
// Hero 标题、KPI 大数字等特化场景请使用行级 `// exempt-ui10 <原因>` 豁免。
const FONT_SIZE_WHITELIST = [9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32]
const ALLOWED_FONT_SIZES = new Set(FONT_SIZE_WHITELIST)

// 关页保活写法：display: none / open ? undefined : 'none' / active ? undefined : 'none'
const DISPLAY_KEEPALIVE_RE =
  /^display\s*:\s*(?:['"]none['"]|(?:open|active|visible)\s*\?\s*undefined\s*:\s*['"]none['"]|!\s*open\s*\?\s*['"]none['"]\s*:\s*undefined)/

/**
 * 递归剥离 var(...) 及其嵌套回退值
 */
function stripCssVarFallbacks(str) {
  let result = str
  let prev
  do {
    prev = result
    result = result.replace(/var\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '')
  } while (result !== prev)
  return result
}

/**
 * 按顶层逗号切分 style 对象体。
 * var(--x, #fff) 这类回退值、以及 rgb()/rgba()/数组字面量内部的逗号不是分隔符，
 * 必须跳过，否则会把一个合法的 CSS 变量切成碎片而误报（Issue #200）。
 */
function splitStyleProps(body) {
  const out = []
  let depth = 0
  let quote = null
  let buf = ''
  for (const ch of body) {
    if (quote) {
      buf += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out.filter(Boolean)
}

function isExempt(filePath) {
  const rel = relative(REPO_ROOT, filePath).replace(/\\/g, '/')
  const relLower = rel.toLowerCase()
  for (const ex of EXEMPT_PATHS) {
    if (relLower.includes(ex.toLowerCase())) return true
  }
  if (/\.test[-.]|\.spec[-.]/i.test(rel) || rel.includes('test-mocks')) return true
  return false
}

function walkFiles(dir, exts = ['.jsx', '.tsx', '.js', '.ts']) {
  const results = []
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return results
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === '.git') continue
      results.push(...walkFiles(fullPath, exts))
    } else if (entry.isFile()) {
      if (exts.some((ext) => entry.name.endsWith(ext)) && !isExempt(fullPath)) {
        results.push(fullPath)
      }
    }
  }
  return results
}

const errors = []
const warnings = []

function reportError(code, file, line, msg) {
  const rel = relative(REPO_ROOT, file).replace(/\\/g, '/')
  errors.push(`[${code}] ${rel}:${line} ${msg}`)
}

function reportWarn(code, file, line, msg) {
  const rel = relative(REPO_ROOT, file).replace(/\\/g, '/')
  warnings.push(`[${code}] ${rel}:${line} ${msg}`)
}

// 1. Collect all client files across plugins
const clientFiles = []
try {
  const pluginDirs = readdirSync(PLUGINS_DIR, { withFileTypes: true })
  for (const p of pluginDirs) {
    if (!p.isDirectory()) continue
    const clientDir = join(PLUGINS_DIR, p.name, 'src', 'client')
    if (statSync(clientDir, { throwIfNoEntry: false })?.isDirectory()) {
      clientFiles.push(...walkFiles(clientDir))
    }
  }
} catch {}

for (const file of clientFiles) {
  const content = readFileSync(file, 'utf8')
  const lines = content.split('\n')

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1

    // Skip comments
    const trimmed = lineText.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    // UI01: Raw Controls Check (<button, <select)
    // Exclude button inside SVG defs or exempt patterns. Note: <button is lowercase (HTML), <Button is dsh-ui-kit (React).
    if (/<button\b/.test(lineText)) {
      if (!lineText.includes('// exempt-ui01') && !lineText.includes('/* exempt-ui01') && !lineText.includes('exempt-ui01')) {
        reportError('UI01', file, lineNum, `使用了原生 <button> 控件，必须使用 dsh-ui-kit (Button/IconButton) 替代 (参见 [design.md](design.md) §2.1 & §2.4)`)
      }
    }
    if (/<select\b/.test(lineText)) {
      if (!lineText.includes('// exempt-ui01') && !lineText.includes('/* exempt-ui01') && !lineText.includes('exempt-ui01')) {
        reportError('UI01', file, lineNum, `使用了原生 <select> 控件，必须使用 dsh-ui-kit (DropdownSelect) 替代 (参见 [design.md](design.md) §2.4 & §5.1)`)
      }
    }

    // UI02: Non-CSS-variable Inline Styles (style={{ ... }})
    // Only allow display: open ? undefined : 'none', display: 'none', and CSS variables (--*)
    const styleMatch = lineText.match(/style=\{\{([^}]+)\}\}/)
    if (styleMatch) {
      if (!lineText.includes('exempt-ui02')) {
        const styleBody = styleMatch[1]
        // 按顶层逗号切分。注意：var(--x, #fff) 这类回退值内部含逗号，
        // 旧的 split(',') 会把一个合法 CSS 变量切成碎片而误报（Issue #200 修复）。
        for (const p of splitStyleProps(styleBody)) {
          if (!p) continue
          if (/^['"]?--[A-Za-z0-9-]+['"]?\s*:/.test(p)) continue
          if (DISPLAY_KEEPALIVE_RE.test(p)) continue
          if (p.includes('exempt-ui02')) continue
          reportError('UI02', file, lineNum, `禁止在 JSX 中使用内联业务样式属性 [${p}]，仅允许 CSS 变量 (--stage-*) 与关页保活 display:none (参见 [design.md](design.md) §1.1)`)
        }
      }
    }

    // UI03: Bare Colors (hardcoded #fff / #123456 / rgb(...) not wrapped in CSS var or in SVG defs)
    if (!file.endsWith('.svg')) {
      const isSvgElementLine = /<svg|<path|<circle|<rect|<line|<polygon|xmlns=/i.test(lineText)
      const isThemeTokenLine = file.includes('styles.js') && /--[A-Za-z0-9-]+\s*:/.test(lineText)
      const isConstantsFile = file.includes('constants')

      if (!isSvgElementLine && !isThemeTokenLine && !isConstantsFile && !lineText.includes('exempt-ui03')) {
        const stripped = stripCssVarFallbacks(lineText)
        const bareHexMatches = stripped.match(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)
        const bareRgbMatches = stripped.match(/\brgba?\s*\([^)]*\)/gi)

        const detected = []
        if (bareHexMatches) detected.push(...bareHexMatches)
        if (bareRgbMatches) detected.push(...bareRgbMatches)

        if (detected.length > 0) {
          reportError('UI03', file, lineNum, `存在未经 CSS变量封装的裸色硬编码 [${detected.join(', ')}]，必须使用官方 --dsw-alias-* Token (参见 [design.md](design.md) §1.1 & §3)`)
        }
      }
    }

    // UI04: Prohibit Emoji and character icons (design.md §2.5, ui-design-guidelines.md §2)
    const isExcludedDataFile = file.includes('presets/catalog') || file.includes('locales.')
    if (!isExcludedDataFile && !lineText.includes('exempt-ui04')) {
      const emojiMatch = lineText.match(/\p{Extended_Pictographic}/u)
      const symbolIconMatch = lineText.match(/(?:>[ \t]*[×✕↑↓↗↘▶⏸⏹✓✔][ \t]*<|['"][×✕↑↓↗↘▶⏸⏹✓✔]['"]|^[ \t]*[×✕↑↓↗↘▶⏸⏹✓✔][ \t]*$)/)

      if (emojiMatch || symbolIconMatch) {
        const detected = emojiMatch ? emojiMatch[0] : symbolIconMatch[0].trim()
        reportError(
          'UI04',
          file,
          lineNum,
          `检测到使用 Emoji 表情或 Unicode 字符 [${detected}] 充当图标/状态，必须统一使用矢量 SVG 图标 (参见 [design.md](design.md) §2.5 & [docs/contracts/icon-design-standards.md](docs/contracts/icon-design-standards.md))；特化场景请加 // exempt-ui04 <原因>`,
        )
      }
    }

    // UI07: Idempotent Sidebar Navigation Gate (Prohibit stage.toggle() in sidebar entries)
    if (file.includes('sidebar-entry') && /stage\.toggle\s*\(/i.test(lineText)) {
      reportError('UI07', file, lineNum, `侧边栏条目严禁使用 stage.toggle() 非幂等反选，必须使用 stageStore.open() 保证幂等激活`)
    }

    // UI08: Private Stage Header Class Ban
    // 各插件私建 .omnimux-*-stage-title / -stage-header / -stage-heading 是页头字号四档并存
    // (16/18/20/22px) 的直接成因。唯一真源为 dsh-ui-kit 的 PageHeader。
    const stageHeaderClassMatch = lineText.match(
      /\.[A-Za-z][A-Za-z0-9_-]*-(?:stage|page)-(?:title|header|heading|subtitle)\b/,
    )
    if (stageHeaderClassMatch && !lineText.includes('exempt-ui08')) {
      reportWarn(
        'UI08',
        file,
        lineNum,
        `禁止私建 Stage 页头样式类 [${stageHeaderClassMatch[0]}]，必须消费 dsh-ui-kit 的 PageHeader/StageHeader 统一排版`,
      )
    }

    // UI09: First-level Stage must consume the shared page header
    // 一级 Stage 直接手写 <h1> 即绕过共享页头。
    if (/Stage\.jsx$|Stage\.tsx$|Page\.jsx$|Page\.tsx$/.test(file)) {
      const consumesKitHeader = /import\s+[^;]*\b(?:PageHeader|StageHeader)\b[^;]*from\s+['"]dsh-ui-kit['"]/.test(content)
      if (/<h1\b/.test(lineText) && !consumesKitHeader && !lineText.includes('exempt-ui09')) {
        reportWarn(
          'UI09',
          file,
          lineNum,
          `一级 Stage 页面禁止直接手写 <h1> 页头，必须从 'dsh-ui-kit' 导入 PageHeader/StageHeader`,
        )
      }
    }

    // UI10: Type Scale Whitelist (design.md §4.2)
    const fontSizeMatch = lineText.match(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/i)
    const jsFontSizeMatch = lineText.match(/\bfontSize\s*:\s*['"]?([0-9]+(?:\.[0-9]+)?)(?:px)?['"]?/i)
    const matchedSize = fontSizeMatch ? Number(fontSizeMatch[1]) : jsFontSizeMatch ? Number(jsFontSizeMatch[1]) : null

    if (matchedSize !== null && !lineText.includes('exempt-ui10')) {
      if (!ALLOWED_FONT_SIZES.has(matchedSize)) {
        reportError(
          'UI10',
          file,
          lineNum,
          `非标字号 [${matchedSize}px]，合规字阶白名单为 [${FONT_SIZE_WHITELIST.join(', ')}]px (参见 [design.md](design.md) §4.2)；特化场景请加 // exempt-ui10 <原因>`,
        )
      }
    }
  })
}

// Summary Output
console.log('== OmniMux UI01~UI10 规范静态门禁扫描 ==')
console.log(`扫描完成：共分析 ${clientFiles.length} 个客户端视图源文件。`)

// 按规则码汇总，避免 WARN 截断掩盖真实违规量
function summarize(list) {
  const byCode = new Map()
  for (const item of list) {
    const code = item.match(/^\[(UI\d+)\]/)?.[1] ?? 'OTHER'
    byCode.set(code, (byCode.get(code) ?? 0) + 1)
  }
  return [...byCode.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

if (warnings.length > 0) {
  console.log(`\n⚠ 发现 ${warnings.length} 处 UI 建议项 (WARN):`)
  for (const [code, n] of summarize(warnings)) console.log(`  ${code}: ${n} 处`)
  const WARN_PREVIEW = Number(process.env.OMNIMUX_UI_WARN_PREVIEW ?? 10)
  console.log(`  --- 明细预览 (前 ${WARN_PREVIEW} 条，全量设置 OMNIMUX_UI_WARN_PREVIEW=0 关闭预览) ---`)
  warnings.slice(0, WARN_PREVIEW).forEach((w) => console.log(`    ${w}`))
}

if (errors.length > 0) {
  console.log(`\n✗ 发现 ${errors.length} 处严重违规 (FAIL):`)
  for (const [code, n] of summarize(errors)) console.log(`  ${code}: ${n} 处`)
  errors.forEach((e) => console.log(`    ${e}`))
  console.log('\n📖 必读文档：请阅读项目根目录 [design.md](design.md)（§1.1 官方 Token 体系、§2.1 32px 控件基准高、§2.2 8px 圆角体系、§3 色彩映射表、§4.2 字阶白名单）')
  console.log('👉 修复指引：原生控件改用 dsh-ui-kit，硬编码色值改用 var(--dsw-alias-*)，特化场景使用 // exempt-ui0* 显式豁免。')
  process.exit(1)
} else {
  console.log('✓ UI01~UI10 静态扫描全部合规（0 违规拦截）。')
  process.exit(0)
}
