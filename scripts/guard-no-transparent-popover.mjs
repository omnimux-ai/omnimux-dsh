#!/usr/bin/env node
/**
 * scripts/guard-no-transparent-popover.mjs
 * 浮层防透视穿透与 Token 兜底硬门禁（Hard Gate）
 *
 * 核心治理原则：
 * 1. 杜绝软规则依赖：任何浮层、下拉菜单、弹出框必须通过硬门禁自动化静态检测拦截。
 * 2. 严禁浮层伪毛玻璃透底：.omnimux-*-menu 浮层容器严禁使用 backdrop-filter。
 * 3. 严禁裸用未定义 Token：宿主未定义 --dsw-alias-bg-elevated，严禁裸写 var(--dsw-alias-bg-elevated) 导致计算值退化为 transparent。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const DEFAULT_PLUGINS_DIR = join(REPO_ROOT, 'plugins')

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'lib',
  'dist',
  'dist-harness',
  'build',
  'coverage',
  '.git',
  '.dsh',
  '.workbuddy',
  'test-mocks',
  'fixtures',
])

/**
 * 递归收集指定目录下的源码文件
 */
export function collectSourceFiles(dir, exts = ['.js', '.jsx', '.ts', '.tsx', '.css']) {
  const files = []
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return files

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue
      files.push(...collectSourceFiles(fullPath, exts))
    } else if (entry.isFile()) {
      if (exts.some((ext) => entry.name.endsWith(ext))) {
        if (/\.(test|spec)\.[a-z0-9]+$/i.test(entry.name)) continue
        files.push(fullPath)
      }
    }
  }
  return files
}

/**
 * 解析代码中的 CSS 规则块：提取 selector { body }
 */
export function extractCssRuleBlocks(content) {
  const blocks = []
  const blockRegex = /([^{};]+)\{([^}]+)\}/g
  let match
  while ((match = blockRegex.exec(content)) !== null) {
    const selector = match[1].trim()
    const body = match[2].trim()
    blocks.push({
      selector,
      body,
      index: match.index,
    })
  }
  return blocks
}




/**
 * 既有债务登记（不是豁免机制）。
 * 这 2 处是**同一类真实缺陷**：浮层底色裸用宿主未定义的 --dsw-alias-bg-elevated，
 * 计算值退化为 transparent。它们未被本次修复，是因为所属插件的断言把「裸写该令牌」
 * 本身钉成了契约（见每条 reason 中的测试文件），改源码会让它们的测试变红；
 * 修它需要连同那些断言一起改，属对方写域。登记在此以保证：①债务可见、可追溯；
 * ②任何**新增**的同类写法一律致命拦截。清除条件：对应测试断言改为接受带回退的写法。
 */
export const LEGACY_FLOATING_SURFACE_DEBT = [
  {
    file: 'plugins/omnimux-assets/src/client/styles.js',
    selector: '.omnimux-assets-cloud-dimension-menu',
    rules: ['NO_BARE_BG_ELEVATED'],
    reason:
      'CloudCategoryRow.test.js 断言 ASSETS_CSS 必须匹配裸写 /var\(--dsw-alias-bg-elevated\)/，改源码即变红',
  },
  {
    file: 'plugins/omnimux-products/src/client/styles.js',
    selector: '.omnimux-products-thumb-popover',
    rules: ['NO_BARE_BG_ELEVATED', 'POPOVER_NO_BACKDROP_BLUR'],
    reason:
      'products 测试断言 PRODUCTS_CSS 必须匹配裸写 /var\(--dsw-alias-bg-elevated\)/（“must use bg-elevated token”）；底色既已失效，单独摘掉毛玻璃会让该浮层退化为完全透明，故一并保留待随断言一起修',
  },
]

/** 该违规是否属于已登记的既有债务。 */
function isRegisteredDebt(rule, filePath, selector) {
  const rel = filePath.replace(/\\/g, '/')
  return LEGACY_FLOATING_SURFACE_DEBT.some(
    (d) =>
      rel.endsWith(d.file) &&
      String(selector).includes(d.selector) &&
      (d.rules ?? []).includes(rule)
  )
}

const FLOATING_WORDS = [
  'popover', 'menu', 'dropdown', 'dialog', 'modal', 'sheet', 'tooltip', 'flyout',
]

/**
 * 判断选择器是否指向「浮层容器本身」。
 * 只认容器，不认容器内部的零件 —— 否则 -item / -header / -btn / svg 这些
 * 本就没有底色的子规则会全部变成误报，门禁会因为噪音而被绕过。
 * 判据（全部满足）：
 *   1. 选择器首段是类选择器（`.` 开头），排除 JS 里被误当成规则体的字符串；
 *   2. 去掉 BEM 修饰符（--x）后，类名以某个浮层词结尾（.omx-avatar-popover ✓，-menu-item ✗）；
 *   3. 选择器只由这一个类 + 伪类/属性组成，不含后代/元素/组合（`.popover input` ✗）。
 * @param {string} selector
 * @returns {boolean}
 */
export function floatingContainerKey(selector) {
  const trimmed = String(selector).trim()
  if (!trimmed.startsWith('.')) return null
  if (/[\s>+~]/.test(trimmed)) return null
  const classTokens = trimmed.match(/\.[A-Za-z0-9_-]+/g) || []
  if (classTokens.length === 0) return null
  const base = classTokens[0].slice(1).replace(/--[A-Za-z0-9_-]+$/, '')
  const hit = FLOATING_WORDS.some(
    (word) => base === word || base.endsWith(`-${word}`) || base.endsWith(`_${word}`)
  )
  return hit ? classTokens[0] : null
}

export function isFloatingContainerSelector(selector) {
  const trimmed = String(selector).trim()
  if (!trimmed.startsWith('.')) return false
  const firstCompound = trimmed.split(/[\s>+~]/)[0]
  if (firstCompound !== trimmed && /[\s>+~]/.test(trimmed)) {
    // 含后代/组合选择器：命中的是容器内部或容器之外的元素，不是容器本身
    return false
  }
  const classTokens = firstCompound.match(/\.[A-Za-z0-9_-]+/g) || []
  if (classTokens.length === 0) return false
  const base = classTokens[0].slice(1).replace(/--[A-Za-z0-9_-]+$/, '')
  return FLOATING_WORDS.some(
    (word) => base === word || base.endsWith(`-${word}`) || base.endsWith(`_${word}`)
  )
}

/**
 * 宿主（DSH 应用）里**不存在**的令牌：裸写即整条声明失效、背景退化为 transparent。
 * 这份清单是本门禁的真源；新增成员必须有实证（在应用资源里搜不到定义）。
 */
export const KNOWN_UNDEFINED_TOKENS = new Set(['--dsw-alias-bg-elevated'])

/**
 * 判断一条 CSS 规则体是否声明了「不透明」背景。
 * 判定规则（确定性、只读文本）：
 *   - background / background-color 必须存在；
 *   - transparent / none / unset / inherit 视为不透明缺失；
 *   - 裸 var(--token)（无回退）视为不透明缺失 —— 令牌缺失时整条声明失效、退化为 transparent；
 *   - var(--token, 回退值) 递归判定回退值；
 *   - rgba()/hsla()/color-mix(... transparent ...)/8 位 hex 且 alpha != ff 视为半透明。
 * @param {string} body CSS 规则体
 * @returns {boolean}
 */
export function hasOpaqueBackdrop(body) {
  const decls = [...body.matchAll(/background(?:-color)?\s*:\s*([^;]+)/gi)].map((m) => m[1].trim())
  if (decls.length === 0) return false
  return decls.some((value) => isOpaqueColorValue(value))
}

/** 单个颜色值是否不透明（递归处理 var() 回退）。 */
function isOpaqueColorValue(value) {
  const v = String(value).trim().toLowerCase()
  if (!v) return false
  if (/^(transparent|none|unset|inherit|initial|revert)$/.test(v)) return false
  const varMatch = v.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/)
  if (varMatch) {
    const token = varMatch[1]
    // 裸 var()：只有「已知宿主未定义」的令牌才算透明（令牌不存在时整条声明失效）。
    // 其余裸 var() 沿用既有规范，不误伤已定义的层级令牌。
    if (!varMatch[2]) return !KNOWN_UNDEFINED_TOKENS.has(token)
    return isOpaqueColorValue(varMatch[2])
  }
  if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(-2) === 'ff'
  if (/^#[0-9a-f]{4}$/.test(v)) return v.slice(-1) === 'f'
  if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/.test(v)) return true
  if (/^rgba\(|^hsla\(/.test(v)) return false
  if (/^rgb\(|^hsl\(/.test(v)) return true
  if (/color-mix\(/.test(v)) {
    if (/transparent/.test(v)) {
      // color-mix 只有在不含 transparent 时才可能不透明
      return false
    }
    return true
  }
  if (/gradient\(/.test(v)) return !/transparent|rgba\(/.test(v)
  return true
}

/**
 * 核心检查函数：扫描文件内容中的透明穿透违规项
 * @param {string} content 代码内容
 * @param {string} filePath 文件路径（用于定位与报告）
 * @returns {Array<{ rule: string, file: string, line: number, message: string, fatal: boolean }>}
 */
export function checkContentForTransparencyViolations(content, filePath = 'snippet.css') {
  const violations = []
  const isSidebarCoordinator = filePath.includes('sidebar-coordinator.js')

  // 1. 检查侧边栏协调器中的探索菜单与新建菜单（用户现场核心防御区）
  if (isSidebarCoordinator) {
    const ruleBlocks = extractCssRuleBlocks(content)
    const exploreMenuBlock = ruleBlocks.find((b) =>
      /^\.omnimux-explore-menu(?:\s*\[[^\]]+\])?$/.test(b.selector.trim())
    )

    if (!exploreMenuBlock) {
      violations.push({
        rule: 'EXPLORE_MENU_MUST_EXIST',
        file: filePath,
        line: 1,
        message: 'sidebar-coordinator.js 必须定义 .omnimux-explore-menu 浮层菜单样式规则。',
        fatal: true,
      })
    } else {
      const lineNum = content.slice(0, exploreMenuBlock.index).split('\n').length

      // 1.1 严禁 backdrop-filter 伪毛玻璃
      if (/backdrop-filter/i.test(exploreMenuBlock.body)) {
        violations.push({
          rule: 'POPOVER_NO_BACKDROP_BLUR',
          file: filePath,
          line: lineNum,
          message: '.omnimux-explore-menu 严禁使用 backdrop-filter 伪毛玻璃滤镜，避免透出中栏及底层内容！',
          fatal: true,
        })
      }

      // 1.2 严禁裸写 var(--dsw-alias-bg-elevated)
      if (/var\(\s*--dsw-alias-bg-elevated\s*\)/.test(exploreMenuBlock.body)) {
        violations.push({
          rule: 'NO_BARE_BG_ELEVATED',
          file: filePath,
          line: lineNum,
          message: '.omnimux-explore-menu 严禁裸写未定义变量 var(--dsw-alias-bg-elevated)，防止计算值退化为 transparent 造成全透明穿透！',
          fatal: true,
        })
      }

      // 1.3 严禁滥用 --dsw-alias-bg-overlay（中浅灰 #61666b）导致严重偏色
      if (/--dsw-alias-bg-overlay\b/.test(exploreMenuBlock.body)) {
        violations.push({
          rule: 'POPOVER_NO_BG_OVERLAY_DISCOLORATION',
          file: filePath,
          line: lineNum,
          message: '.omnimux-explore-menu 严禁使用 --dsw-alias-bg-overlay！该变量在宿主深色主题中被解析为中浅灰 (#61666b) 导致严重白灰偏色，必须使用标准深色层级变量 var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base))。',
          fatal: true,
        })
      }

      // 1.4 必须声明官方标准深色层级背景
      if (
        !/background:\s*var\(--dsw-alias-bg-layer-2,\s*var\(--dsw-alias-bg-base\)\)/.test(
          exploreMenuBlock.body
        )
      ) {
        violations.push({
          rule: 'EXPLORE_MENU_MUST_BE_DARK_SOLID_LAYER',
          file: filePath,
          line: lineNum,
          message: '.omnimux-explore-menu 必须使用官方深色规范层级底色：var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base))。',
          fatal: true,
        })
      }
    }
  }

  // 2. 通用浮层容器判定（按“类别”而不是按某一个选择器）
  // 旧实现只认 `.omnimux-*-menu` 前缀，导致任何别的命名空间（例如 .omx-avatar-popover）
  // 与任何别的浮层词（dropdown / dialog / sheet …）都落在规则之外：新增浮层时门禁恒绿。
  // 这里改为：选择器里出现浮层关键词即视为浮层，再统一施加四条硬规则。
  const ruleBlocks = extractCssRuleBlocks(content)

  // 先按「基础容器类」聚合：.omnimux-explore-menu[hidden] / .x-menu--wide 等变体
  // 与基础类同组 —— 底色只要在组内声明过一次即可，避免变体规则被逐条误判。
  const groups = new Map()
  for (const block of ruleBlocks) {
    const key = floatingContainerKey(block.selector)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(block)
  }

  for (const [key, blocks] of groups) {
    const hasOpaque = blocks.some((b) => hasOpaqueBackdrop(b.body))
    const first = blocks[0]
    for (const block of blocks) {
      const { selector, body, index } = block
      const trimmed = selector.trim()
      if (/exempt-popover-blur|exempt-bg-overlay|exempt-opaque-bg/.test(body)) continue
      const lineNum = content.slice(0, index).split('\n').length

      // 2.1 严禁 backdrop-filter 伪毛玻璃透底
      if (/backdrop-filter/i.test(body)) {
        violations.push({
          rule: 'POPOVER_NO_BACKDROP_BLUR',
          file: filePath,
          line: lineNum,
          fatal: !isRegisteredDebt('POPOVER_NO_BACKDROP_BLUR', filePath, trimmed),
          message: `浮层容器 [${trimmed}] 严禁使用 backdrop-filter 伪毛玻璃滤镜造成透底！必须使用实体不透明背景。`,
        })
      }

      // 2.2 严禁裸写未定义令牌 var(--dsw-alias-bg-elevated)（无回退时计算值退化为 transparent）
      if (/var\(\s*--dsw-alias-bg-elevated\s*\)/.test(body)) {
        const debt = isRegisteredDebt('NO_BARE_BG_ELEVATED', filePath, trimmed)
        violations.push({
          rule: 'NO_BARE_BG_ELEVATED',
          file: filePath,
          line: lineNum,
          fatal: !debt,
          message: `浮层容器 [${trimmed}] 严禁裸写 var(--dsw-alias-bg-elevated)：该令牌宿主未定义，无回退时整条声明失效、背景退化为 transparent。`,
        })
      }

      // 2.3b 严禁浮层显式声明 transparent / none 底色（把自己的表面打掉）
      if (/background(?:-color)?\s*:\s*(?:transparent|none)\b/i.test(body)) {
        violations.push({
          rule: 'POPOVER_EXPLICIT_TRANSPARENT_BG',
          file: filePath,
          line: lineNum,
          message: `浮层容器 [${trimmed}] 严禁显式声明 transparent / none 底色 —— 浮层必须有实体不透明表面。`,
          fatal: true,
        })
      }

      // 2.3 严禁滥用 --dsw-alias-bg-overlay（深色下为 #61666b 中浅灰）
      if (/--dsw-alias-bg-overlay\b/.test(body)) {
        violations.push({
          rule: 'POPOVER_NO_BG_OVERLAY_DISCOLORATION',
          file: filePath,
          line: lineNum,
          message: `浮层容器 [${trimmed}] 严禁使用 --dsw-alias-bg-overlay（深色下计算值为 #61666b 中浅灰）造成灰度倒挂。`,
          fatal: true,
        })
      }
    }

    // 2.4 整组（基础类 + 全部变体）必须至少声明一次不透明底色 —— 这条是本类缺陷的兜底规则：
    //     只要底色是裸 var(...)（不写回退），令牌一旦改名/不存在就会静默变透明。
    if (!hasOpaque) {
      violations.push({
        rule: 'POPOVER_MUST_HAVE_OPAQUE_BG',
        file: filePath,
        line: content.slice(0, first.index).split('\n').length,
        // 非致命：本仓真实组合里，宿主组件持有表面、遮罩与面板分离、只写修饰符
        // 都是合法写法；逐个要求自带底色会逼出无意义重构。这里只作可见性提示。
        fatal: false,
        message: `浮层容器 [${key}] 未声明不透明背景（提示项，非阻断）。`,
      })
    }
  }

  return violations
}

/**
 * 扫描整个工程或指定插件目录
 */
export function scanPopoverOpacity(options = {}) {
  const rootDir = options.dir || DEFAULT_PLUGINS_DIR
  const files = collectSourceFiles(rootDir)
  const allViolations = []

  for (const file of files) {
    if (!file.includes('/src/client/')) continue
    const content = readFileSync(file, 'utf8')
    const fileViolations = checkContentForTransparencyViolations(content, file)
    allViolations.push(...fileViolations)
  }

  return {
    scannedFiles: files.length,
    violations: allViolations,
  }
}

// CLI 执行入口
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('== OmniMux 浮层防透光与 Token 兜底硬门禁扫描 (Guard Popover Opacity) ==')
  const { scannedFiles, violations } = scanPopoverOpacity()
  console.log(`扫描完成：共分析 ${scannedFiles} 个源文件。`)

  const fatalViolations = violations.filter((v) => v.fatal)

  if (fatalViolations.length > 0) {
    console.error(`\n✗ 发现 ${fatalViolations.length} 处透明透底严重违规 (FATAL):`)
    for (const v of fatalViolations) {
      const relPath = relative(REPO_ROOT, v.file).replace(/\\/g, '/')
      console.error(`  [${v.rule}] ${relPath}:${v.line} -> ${v.message}`)
    }
    console.error('\n🚫 硬门禁阻断：浮层菜单必须为实体深色背景，严禁伪毛玻璃透底滤镜与未定义变量！')
    process.exit(1)
  } else {
    console.log('✓ 浮层防透底硬门禁检查通过：侧栏与核心菜单均为不透明实体规范背景（0 违规）。')
    process.exit(0)
  }
}
