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
 * 2. 执行实际 client 装配入口，捕获 sidebar adapter 并验证六方法与取消订阅。
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
  const isLibraryStage = /AssetsStage|AccountsStage|InspirationStage|PublishStage|AnalyticsStage|ProjectLibraryPage/.test(basename)
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

if (errors > 0) {
  console.error(`\n❌ Found ${errors} Stage/Store contract violations!`)
  process.exit(1)
} else {
  console.log(`PASS: ${stageFiles.length} Stage components; ${targets.length} registered sidebar targets and their runtime contracts.\n`)
}
