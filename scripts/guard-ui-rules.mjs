/**
 * scripts/guard-ui-rules.mjs
 * UI01~UI10 Detection & Target Scope Engine for PreToolUse Hook & Scanner
 * Contract: design.md (L1), docs/contracts/ui-design-guidelines.md
 */

import { relative, extname } from 'node:path'

export const FONT_SIZE_WHITELIST = [9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32]
export const ALLOWED_FONT_SIZES = new Set(FONT_SIZE_WHITELIST)

export const EXEMPT_PATHS = [
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
  'src/canvas/',
]

// 关页保活写法：display: none / open ? undefined : 'none' / active ? undefined : 'none'
export const DISPLAY_KEEPALIVE_RE =
  /^display\s*:\s*(?:['"]none['"]|(?:open|active|visible)\s*\?\s*undefined\s*:\s*['"]none['"]|!\s*open\s*\?\s*['"]none['"]\s*:\s*undefined)/

/**
 * 递归/多层括号剥离 var(...) 内容，以便检测 var(...) 外是否存在裸色
 */
export function stripCssVarFallbacks(str) {
  let result = str
  let prev
  do {
    prev = result
    result = result.replace(/var\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '')
  } while (result !== prev)
  return result
}

/**
 * 按顶层逗号切分 style 对象体，避开 var() / rgb() 内部逗号
 */
export function splitStyleProps(body) {
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

// 判定目标路径是否属于 UI 客户端需要管制的代码范围
// 范围要求：plugins/<name>/src/client/** 下的 .tsx, .jsx, .ts, .js
// 豁免排除：node_modules, dist, dist-harness, tests, fixtures, .test., .spec., openreel, src/canvas/ 等
export function isTargetUIFile(filePath, repoRoot = process.cwd()) {
  if (!filePath || typeof filePath !== 'string') return false
  const normalized = filePath.replace(/\\/g, '/')
  const rel = repoRoot ? relative(repoRoot, normalized).replace(/\\/g, '/') : normalized

  // 1. 扩展名必须属于集合 [.tsx, .jsx, .ts, .js]
  const ext = extname(rel).toLowerCase()
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return false
  }

  // 2. 必须包含 plugins/<name>/src/client/
  if (!/(?:^|\/)plugins\/[^/]+\/src\/client\//.test(rel)) {
    return false
  }

  // 3. 豁免路径排查
  const relLower = rel.toLowerCase()
  for (const ex of EXEMPT_PATHS) {
    if (relLower.includes(ex.toLowerCase())) return false
  }

  // 4. 测试与固件正则排除
  if (/\.test[-.]|\.spec[-.]/i.test(rel) || rel.includes('test-mocks')) {
    return false
  }

  return true
}

/**
 * 核心规则审查引擎：检查代码文本行，产出违规项列表
 * @param {string} codeContent 待检查的代码字符串（write 的 content 或 edit 的 new_string）
 * @param {string} filePath 目标文件路径
 * @param {number} [lineOffset=0] 起始物理行号偏移量
 * @returns {Array<Object>} violations
 */
export function inspectUICode(codeContent, filePath = '', lineOffset = 0) {
  const violations = []
  if (!codeContent || typeof codeContent !== 'string') return violations

  const lines = codeContent.split('\n')
  const isSvgFile = filePath.endsWith('.svg')

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1 + lineOffset
    const trimmed = lineText.trim()

    // 跳过整行注释
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    // ─────────────────────────────────────────────────────────────
    // UI01: 原生控件禁止 (<button, <select)
    // ─────────────────────────────────────────────────────────────
    if (/<button\b/.test(lineText)) {
      if (!lineText.includes('exempt-ui01') && !lineText.includes('/* exempt-ui01 */')) {
        violations.push({
          ruleCode: 'UI01',
          ruleName: '严禁裸用原生控件',
          lineNum,
          lineText,
          message: '使用了原生 <button> 控件，必须使用 dsh-ui-kit (Button/IconButton) 替代',
          fix: "改用 `dsh-ui-kit` 的 `<Button>` 或 `<IconButton>`，或行尾添加 `// exempt-ui01 <业务原因>` 豁免",
          designSection: '[design.md](design.md) §2.1 (32px 控件高基准) & §2.4 (严禁裸用原生控件)',
        })
      }
    }
    if (/<select\b/.test(lineText)) {
      if (!lineText.includes('exempt-ui01') && !lineText.includes('/* exempt-ui01 */')) {
        violations.push({
          ruleCode: 'UI01',
          ruleName: '严禁裸用原生控件',
          lineNum,
          lineText,
          message: '使用了原生 <select> 控件，必须使用 dsh-ui-kit (DropdownSelect) 替代',
          fix: "改用 `dsh-ui-kit` 的 `<DropdownSelect>`，或行尾添加 `// exempt-ui01 <业务原因>` 豁免",
          designSection: '[design.md](design.md) §2.4 (严禁裸用原生控件) & §5.1 (下拉选择菜单规范)',
        })
      }
    }

    // ─────────────────────────────────────────────────────────────
    // UI02: 内联业务样式禁止 (style={{ ... }})
    // ─────────────────────────────────────────────────────────────
    const styleMatch = lineText.match(/style=\{\{([^}]+)\}\}/)
    if (styleMatch) {
      if (!lineText.includes('exempt-ui02')) {
        const styleBody = styleMatch[1]
        for (const p of splitStyleProps(styleBody)) {
          if (!p) continue
          if (/^['"]?--[A-Za-z0-9-]+['"]?\s*:/.test(p)) continue
          if (DISPLAY_KEEPALIVE_RE.test(p)) continue
          if (p.includes('exempt-ui02')) continue

          violations.push({
            ruleCode: 'UI02',
            ruleName: '禁止内联业务样式',
            lineNum,
            lineText,
            message: `禁止在 JSX 中使用内联业务样式属性 [${p}]，仅允许 CSS 变量 (--stage-*) 与关页保活 display:none`,
            fix: "将业务样式移至样式表/CSS Modules，或仅通过 CSS 变量传参；特化场景添加 `// exempt-ui02 <业务原因>`",
            designSection: '[design.md](design.md) §1.1 (彻底弃用私有样式) & §2 (核心交互与几何铁律)',
          })
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // UI03: 裸色硬编码禁止 (#hex, rgb(), rgba())
    // ─────────────────────────────────────────────────────────────
    if (!isSvgFile) {
      const isSvgElementLine = /<svg|<path|<circle|<rect|<line|<polygon|xmlns=/i.test(lineText)
      const isThemeTokenLine = filePath.includes('styles.js') && /--[A-Za-z0-9-]+\s*:/.test(lineText)
      const isConstantsFile = filePath.includes('constants')

      if (!isSvgElementLine && !isThemeTokenLine && !isConstantsFile && !lineText.includes('exempt-ui03')) {
        // 先剥离所有 var(...) 回退值内部的内容
        const stripped = stripCssVarFallbacks(lineText)
        const bareHexMatches = stripped.match(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)
        const bareRgbMatches = stripped.match(/\brgba?\s*\([^)]*\)/gi)

        const detected = []
        if (bareHexMatches) detected.push(...bareHexMatches)
        if (bareRgbMatches) detected.push(...bareRgbMatches)

        if (detected.length > 0) {
          violations.push({
            ruleCode: 'UI03',
            ruleName: '禁止硬编码裸色',
            lineNum,
            lineText,
            message: `存在未经 CSS 变量封装的裸色硬编码 [${detected.join(', ')}]，必须使用官方 --dsw-alias-* Token`,
            fix: "使用官方语义 Token 包装，例如 `var(--dsw-alias-bg-base)`、`var(--dsw-alias-label-primary)`，或特化场景添加 `// exempt-ui03 <业务原因>`",
            designSection: '[design.md](design.md) §1.1 (Token 规范) & §3 (色彩映射表与 Token 矩阵)',
          })
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // UI04: 严禁使用 Emoji / 字符充当图标 (design.md §2.5, ui-design-guidelines.md §2)
    // ─────────────────────────────────────────────────────────────
    const isExcludedDataFile = filePath.includes('presets/catalog') || filePath.includes('locales.')
    if (!isExcludedDataFile && !lineText.includes('exempt-ui04')) {
      const emojiMatch = lineText.match(/\p{Extended_Pictographic}/u)
      const symbolIconMatch = lineText.match(/(?:>[ \t]*[×✕↑↓↗↘▶⏸⏹✓✔][ \t]*<|['"][×✕↑↓↗↘▶⏸⏹✓✔]['"]|^[ \t]*[×✕↑↓↗↘▶⏸⏹✓✔][ \t]*$)/)

      if (emojiMatch || symbolIconMatch) {
        const detected = emojiMatch ? emojiMatch[0] : symbolIconMatch[0].trim()
        violations.push({
          ruleCode: 'UI04',
          ruleName: '严禁使用 Emoji / 字符充当图标',
          lineNum,
          lineText,
          message: `检测到使用 Emoji 表情或 Unicode 字符 [${detected}] 充当图标/状态，必须统一使用矢量 SVG 图标`,
          fix: "改用 `@deepseek-ai/dsh-client-ui-primitives` 原生图标（如 `IconCloseOutline16`）或 `lucide-react` 矢量 SVG 组件；特化场景添加 `// exempt-ui04 <业务原因>`",
          designSection: '[design.md](design.md) §2.5 (严禁使用字符与 Emoji 充当图标) & [docs/contracts/icon-design-standards.md](docs/contracts/icon-design-standards.md)',
        })
      }
    }

    // ─────────────────────────────────────────────────────────────
    // UI10: 合规字阶白名单校验
    // ─────────────────────────────────────────────────────────────
    if (!lineText.includes('exempt-ui10')) {
      const cssFontMatch = lineText.match(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/i)
      const jsFontMatch = lineText.match(/\bfontSize\s*:\s*['"]?([0-9]+(?:\.[0-9]+)?)(?:px)?['"]?/i)
      const matchedSize = cssFontMatch ? Number(cssFontMatch[1]) : jsFontMatch ? Number(jsFontMatch[1]) : null

      if (matchedSize !== null && !ALLOWED_FONT_SIZES.has(matchedSize)) {
        violations.push({
          ruleCode: 'UI10',
          ruleName: '遵循合规字阶白名单',
          lineNum,
          lineText,
          message: `非标字号 [${matchedSize}px]，合规字阶白名单为 [${FONT_SIZE_WHITELIST.join(', ')}]px；特化场景请加 // exempt-ui10 <原因>`,
          fix: `调整为标准字阶（如 Display 20px, Title 16px, Body 13px, Caption 12px）；特化展示请加 \`// exempt-ui10 <特化大字/微调原因>\``,
          designSection: '[design.md](design.md) §4.2 (字阶与层级阶梯)',
        })
      }
    }
  })

  return violations
}
