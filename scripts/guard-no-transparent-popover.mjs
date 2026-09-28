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

      // 1.3 必须声明实体不透明背景
      if (
        !/background:\s*var\(--dsw-alias-bg-overlay,\s*var\(--dsw-alias-bg-layer-2,\s*#1c1c1f\)\)/.test(
          exploreMenuBlock.body
        )
      ) {
        violations.push({
          rule: 'EXPLORE_MENU_MUST_BE_SOLID_OVERLAY',
          file: filePath,
          line: lineNum,
          message: '.omnimux-explore-menu 必须使用官方规范实体浮层底色：var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c1c1f))。',
          fatal: true,
        })
      }
    }
  }

  // 2. 通用浮层容器伪毛玻璃检测（仅对真正的浮层容器 .omnimux-*-menu 等）
  const ruleBlocks = extractCssRuleBlocks(content)
  for (const block of ruleBlocks) {
    const { selector, body, index } = block
    // 匹配如 .omnimux-explore-menu, .omnimux-sidebar-new-menu 等纯浮层容器选择器，排除子元素
    const isPureMenuContainer = /^\.omnimux-[A-Za-z0-9_-]*(?:menu|popover-card)(?:\s*\[[^\]]+\])?$/.test(
      selector.trim()
    )

    if (isPureMenuContainer && !body.includes('exempt-popover-blur')) {
      if (/backdrop-filter/i.test(body)) {
        const lineNum = content.slice(0, index).split('\n').length
        violations.push({
          rule: 'POPOVER_NO_BACKDROP_BLUR',
          file: filePath,
          line: lineNum,
          message: `浮层菜单容器 [${selector}] 严禁使用 backdrop-filter 伪毛玻璃滤镜造成透底！必须使用实体深色背景。`,
          fatal: true,
        })
      }
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
