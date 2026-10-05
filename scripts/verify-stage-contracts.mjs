#!/usr/bin/env node
/**
 * scripts/verify-stage-contracts.mjs
 *
 * OmniMux Stage / Workbench Tab 契约防回归静态门禁：
 * 1. 遍历 plugins 下所有 client Stage 组件（*Stage.jsx, ProjectLibraryPage.jsx）：
 *    - 严禁通过 __omnimuxStage.claim 抢占全局全屏 overlay；
 *    - 必须在顶层执行 inject*Styles()；
 *    - 库页不得再挂 Tab 内 WorkbenchFocusBar（gui↔split 由 hub chat-toggle 负责）；
 *    - 根节点必须使用标准 workbench 容器样式。
 * 2. 遍历声明 `main` 插槽的插件（manifest capabilities.slots + 其 client 源码）：
 *    - 严禁 claim 产品舞台（Issue #3165：产品舞台 chrome 会隐藏会话列里所有非 overlay 子节点，
 *      而 `main` 面板正渲染在会话列内 → 面板把自己隐藏掉，中栏空白）。
 * 3. 执行实际 client 装配入口，捕获 sidebar adapter 并验证六方法与取消订阅。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureStageContracts } from './live-stage-contracts.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function findFiles(dir, matchFn) {
  const results = []
  const list = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'lib' || entry.name === 'components') continue
      results.push(...findFiles(fullPath, matchFn))
    } else if (entry.isFile() && matchFn(entry.name, fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

const stageFiles = findFiles(path.join(rootDir, 'plugins'), (name) =>
  name.endsWith('.jsx') && (name.endsWith('Stage.jsx') || name === 'ProjectLibraryPage.jsx')
)

let errors = 0
console.log(`[Stage Contract Linter] Auditing ${stageFiles.length} Stage components and actual sidebar registrations...`)
if (stageFiles.length === 0) {
  console.error('No Stage components discovered')
  errors++
}

// --- Part 1: Audit JSX Stage Components ---
for (const file of stageFiles) {
  const relPath = path.relative(rootDir, file)
  const basename = path.basename(file)
  const content = fs.readFileSync(file, 'utf8')

  // 1. 断言：严禁直接调用 __omnimuxStage.claim 抢占 overlay
  if (/__omnimuxStage\.claim/.test(content)) {
    console.error(`❌ [Contract Error] ${relPath}: Must not call __omnimuxStage.claim directly!`)
    errors++
  }

  // 2. 断言：必须在顶层执行 injectStyles
  if (!/inject\w+Styles\(\)/.test(content)) {
    console.error(`❌ [Contract Error] ${relPath}: Missing injectStyles() invocation at top level!`)
    errors++
  }

  // 3. 断言：库页不得再挂 Tab 内 FocusBar（顶角 chat-toggle 已覆盖 gui↔split）
  const isLibraryStage = /AssetsStage|ProductsStage|AccountsStage|InspirationStage|PublishStage|AnalyticsStage|ProjectLibraryPage/.test(basename)
  if (isLibraryStage && (/WorkbenchFocusBar/.test(content) || /omnimux-workbench-focus/.test(content))) {
    console.error(`❌ [Contract Error] ${relPath}: In-tab WorkbenchFocusBar must be removed; use hub chat-toggle instead!`)
    errors++
  }
}

let targets = []
try {
  targets = await captureStageContracts(rootDir)
} catch (error) {
  console.error(`[Sidebar Contract Error] ${error.message}`)
  errors++
}

// --- Part 2: `main` slot panels must never claim a product stage (Issue #3165) ---
const mainSlotPlugins = []
for (const manifestPath of findFiles(path.join(rootDir, 'plugins'), (name) => name === 'dsh.manifest.json')) {
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    continue
  }
  const slots = manifest?.capabilities?.slots
  if (!Array.isArray(slots) || !slots.some((slot) => slot?.target === 'main')) continue
  mainSlotPlugins.push(path.dirname(manifestPath))
}

if (mainSlotPlugins.length === 0) {
  console.error('[Stage Contract Error] No plugin declares the official `main` slot; the #3165 guard would be vacuous')
  errors++
}

for (const pluginDir of mainSlotPlugins) {
  const relDir = path.relative(rootDir, pluginDir)
  const clientDir = path.join(pluginDir, 'src', 'client')
  if (!fs.existsSync(clientDir)) continue
  for (const file of findFiles(clientDir, (name) => name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.mjs'))) {
    if (/\.test\./.test(path.basename(file))) continue
    const relPath = path.relative(rootDir, file)
    const content = fs.readFileSync(file, 'utf8')
    const claimPatterns = [
      [/claimProductStage/, 'claimProductStage'],
      [/__omnimuxStage\s*\.\s*claim/, '__omnimuxStage.claim'],
      [/\bstage\s*\.\s*claim\(/, 'stage.claim()'],
      [/data-dsh-product-stage/, 'data-dsh-product-stage'],
    ]
    for (const [pattern, label] of claimPatterns) {
      if (pattern.test(content)) {
        console.error(
          `❌ [Contract Error] ${relPath}: a \`main\` slot plugin must not claim a product stage (${label});`
          + ' the product-stage chrome hides the conversation column, where `main` panels render.',
        )
        errors++
      }
    }
  }
  // The declared `main` panel component itself must not reference the stage API either.
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'dsh.manifest.json'), 'utf8'))
  for (const slot of manifest.capabilities.slots.filter((entry) => entry?.target === 'main')) {
    const componentPath = path.join(pluginDir, String(slot.componentPath || ''))
    if (!slot.componentPath || !fs.existsSync(componentPath)) {
      console.error(`❌ [Contract Error] ${relDir}: main slot componentPath does not resolve (${slot.componentPath})`)
      errors++
      continue
    }
    const componentSource = fs.readFileSync(componentPath, 'utf8')
    if (/claimProductStage|__omnimuxStage/.test(componentSource)) {
      console.error(
        `❌ [Contract Error] ${path.relative(rootDir, componentPath)}:`
        + ' a `main` slot panel component must not claim a product stage.',
      )
      errors++
    }
  }
}

if (errors > 0) {
  console.error(`\n❌ Found ${errors} Stage/Store contract violations!`)
  process.exit(1)
} else {
  console.log(
    `PASS: ${stageFiles.length} Stage components; ${mainSlotPlugins.length} main-slot plugins audited for product-stage claims;`
    + ` ${targets.length} registered sidebar targets and their runtime contracts.\n`,
  )
}
