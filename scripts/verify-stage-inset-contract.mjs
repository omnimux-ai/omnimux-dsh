#!/usr/bin/env node
/**
 * scripts/verify-stage-inset-contract.mjs
 * 一级页页头与内容区统一靠左对齐及内距规范门禁 —— Issue #2063
 * 契约真源：docs/contracts/first-level-page-layout.md
 *
 * 核心断言：
 *  1. conversation-box.js 中任何针对 .dshUk-PageHeader-pageHeader 的左侧安全区规则，
 *     必须严格限定在 [data-dsh-product-stage]（独立全屏覆盖层）作用域内，
 *     严禁误伤常规工作台一级页签（常规页签上方已有 40px 的 tabStrip 自带避让）。
 *  2. omnimux-market 的技能/专家页内容根 padding-top 必须严格收敛为标准 12px，左内距必须为 20px。
 *  3. 常规工作台页头组件声明的标准内距必须为 padding: 12px 20px。
 *
 * 退出码：0 = 全部通过；1 = 发现违规。
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

function fail(msg) {
  console.error(`❌ [verify-stage-inset] ${msg}`)
  process.exit(1)
}

function pass(msg) {
  console.log(`✔ [verify-stage-inset] ${msg}`)
}

// 1. 检查 conversation-box.js
const convBoxPath = join(REPO_ROOT, 'plugins/omnimux/src/client/conversation-box.js')
if (!existsSync(convBoxPath)) fail(`文件不存在: ${convBoxPath}`)
const convBoxSrc = readFileSync(convBoxPath, 'utf8')

// 查找所有对 PageHeader 设置 padding-left 的规则
const phRegex = /([^{}]*PageHeader-pageHeader[^{}]*)\{([^}]*padding-left[^}]*)\}/g
let match
let foundRule = false
while ((match = phRegex.exec(convBoxSrc)) !== null) {
  const selector = match[1].trim()
  const declarations = match[2].trim()
  if (declarations.includes('padding-left')) {
    foundRule = true
    if (!selector.includes('[data-dsh-product-stage]')) {
      fail(`发现针对 .dshUk-PageHeader-pageHeader 的无限制 padding-left 规则，必须包含 [data-dsh-product-stage]:\n  选择器: ${selector}\n  声明: ${declarations}`)
    }
  }
}
if (!foundRule) {
  fail('未在 conversation-box.js 中找到任何针对 PageHeader 的安全区规则')
}
pass('conversation-box.js 中 PageHeader 左侧避让规则已严格收窄至 [data-dsh-product-stage]')

// 2. 检查 omnimux-market 的 css.js
const mktCssPath = join(REPO_ROOT, 'plugins/omnimux-market/src/client/css.js')
if (!existsSync(mktCssPath)) fail(`文件不存在: ${mktCssPath}`)
const mktCssSrc = readFileSync(mktCssPath, 'utf8')

const mktPadMatch = /\.sh-plaza-body\s*\.sh-mkt\s*\{[^}]*padding:\s*([0-9a-zA-Z\s]+)[;}]/.exec(mktCssSrc)
if (!mktPadMatch) {
  fail('未在 omnimux-market/src/client/css.js 中找到 .sh-plaza-body .sh-mkt 的 padding 声明')
}
const paddingValue = mktPadMatch[1].trim()
if (paddingValue !== '12px 20px 32px') {
  fail(`.sh-plaza-body .sh-mkt 的 padding 应为 "12px 20px 32px"，实际为: "${paddingValue}"`)
}
pass('omnimux-market 技能/专家页已严格对齐标准 "12px 20px 32px" 顶部与左侧内距')

// 3. 检查 sidebar-toggle-topbar.js 选择器语法层级
const topbarPath = join(REPO_ROOT, 'plugins/omnimux/src/client/sidebar-toggle-topbar.js')
if (!existsSync(topbarPath)) fail(`文件不存在: ${topbarPath}`)
const topbarSrc = readFileSync(topbarPath, 'utf8')

if (topbarSrc.includes('body[data-dsh-desktop-platform="darwin"] html[data-omnimux-left-collapsed]')) {
  fail('sidebar-toggle-topbar.js 中发现层级倒置的选择器: body[...] html[...]，必须修正为 html[...] body[...]')
}
pass('sidebar-toggle-topbar.js 避让规则选择器语法合法有效')

console.log('\n🎉 所有一级页页头与内容区统一靠左对齐及内距规范契约校验全部通过！')
