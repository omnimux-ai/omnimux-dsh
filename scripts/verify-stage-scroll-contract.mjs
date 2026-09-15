#!/usr/bin/env node
/**
 * scripts/verify-stage-scroll-contract.mjs
 * 一级页滚动归属契约门禁 —— Issue #1977
 * 契约真源：docs/contracts/first-level-page-layout.md §二·补
 *
 * 断言三件事：
 *  1. 每个登记的一级页插件，其样式表都定义了 .omx-stage-pinned / .omx-stage-scroll，
 *     且两条声明在**所有插件中逐字一致**（防各页漂移出各自的滚动实现）。
 *  2. 每个一级页的页面源码同时引用这两个契约类。
 *  3. 页面源码里固定栈（omx-stage-pinned）必须先于唯一滚动区（omx-stage-scroll）出现
 *     —— 把导航栈挪进/挪到滚动区之后即回归变红。
 *
 * 退出码：0 = 全部通过；1 = 有违规。
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

export const PINNED_CLASS = 'omx-stage-pinned'
export const SCROLL_CLASS = 'omx-stage-scroll'

/** 契约声明的唯一真源（比较时归一化空白）。 */
export const CANONICAL_PINNED = 'flex:none;'
export const CANONICAL_SCROLL = 'flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;'

/**
 * 登记的一级页（工作台 Tab 页）。
 * 新增一级页时必须在此登记，并遵守契约 —— 未登记的页面不会被豁免，只是无法被本门禁验证。
 */
export const STAGE_PAGES = [
  {
    plugin: 'omnimux-assets',
    label: '资产库',
    styles: 'plugins/omnimux-assets/src/client/styles.js',
    pages: [
      { file: 'plugins/omnimux-assets/src/client/AssetsStage.jsx', rootMarker: 'className="omnimux-assets-stage"' },
      { file: 'plugins/omnimux-assets/src/client/CloudAssetsView.jsx', rootMarker: 'className="omnimux-assets-cloud"' },
    ],
  },
  {
    plugin: 'omnimux-market',
    label: '技能/专家',
    styles: 'plugins/omnimux-market/src/client/css.js',
    pages: [
      { file: 'plugins/omnimux-market/src/client/skill-plaza.js', rootMarker: 'className: "sh-mkt"' },
    ],
  },
  {
    plugin: 'omnimux-inspiration',
    label: '创作灵感',
    styles: 'plugins/omnimux-inspiration/src/client/styles.js',
    pages: [
      { file: 'plugins/omnimux-inspiration/src/client/InspirationSection.jsx', rootMarker: 'className="omnimux-inspiration-root"' },
    ],
  },
  {
    plugin: 'omnimux-accounts',
    label: '账号中心',
    styles: 'plugins/omnimux-accounts/src/client/styles.js',
    pages: [
      { file: 'plugins/omnimux-accounts/src/client/AccountsSection.jsx', rootMarker: 'className="omnimux-accounts-root"' },
    ],
  },
  {
    plugin: 'omnimux-publish',
    label: '内容发布',
    styles: 'plugins/omnimux-publish/src/client/styles.js',
    pages: [
      { file: 'plugins/omnimux-publish/src/client/PublishStage.jsx', rootMarker: 'className="omnimux-publish-stage"' },
      { file: 'plugins/omnimux-publish/src/client/views/PublishViewport.jsx', rootMarker: 'className="omnimux-publish-viewport' },
    ],
  },
]

/**
 * 归一化 CSS 声明文本，便于跨文件逐字比较。
 * 只抹平**排版差异**（空白折叠、冒号/分号两侧空格、尾分号），保留值内空格，
 * 否则 `flex: 1 1 auto` 与 `flex: 11 auto` 会被当成同一个值而漏检。
 */
export function normalizeDecls(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*;\s*/g, ';')
    .replace(/;+$/, '')
    .trim()
    .toLowerCase()
}

/**
 * 从样式源码里抽取某个 class 的声明体。
 * 兼容两种写法：带换行的模板字符串 CSS，以及压缩成单行的 CSS 字符串。
 * @returns {string[]} 命中的声明体列表（可能多个，例如伪类/后代选择器）
 */
export function extractDeclarations(source, className) {
  const text = String(source || '')
  const out = []
  // 精确类选择器：.cls { ... }，允许前后有其它选择器组合（如 .a .cls）
  const re = new RegExp(`(?:^|[^\\w-])\\.${className}(?![\\w-])[^{}]*\\{([^{}]*)\\}`, 'g')
  let match
  while ((match = re.exec(text)) !== null) out.push(match[1])
  return out
}

function readIfExists(abs) {
  return existsSync(abs) ? readFileSync(abs, 'utf8') : ''
}

function checkStyles(entry, root, problems) {
  const abs = join(root, entry.styles)
  const css = readIfExists(abs)
  const rel = relative(root, abs)
  if (css === '') {
    problems.push(`${entry.plugin}: 样式表缺失 → ${rel}`)
    return
  }

  const pinned = extractDeclarations(css, PINNED_CLASS)
  const scroll = extractDeclarations(css, SCROLL_CLASS)

  if (pinned.length === 0) problems.push(`${entry.plugin}: ${rel} 缺少 .${PINNED_CLASS} 定义`)
  if (scroll.length === 0) problems.push(`${entry.plugin}: ${rel} 缺少 .${SCROLL_CLASS} 定义`)

  for (const decl of pinned) {
    if (normalizeDecls(decl) !== normalizeDecls(CANONICAL_PINNED)) {
      problems.push(
        `${entry.plugin}: .${PINNED_CLASS} 声明与契约不一致（应恒为 "flex: none"）→ ${rel}\n      实际: ${normalizeDecls(decl)}`,
      )
    }
  }
  for (const decl of scroll) {
    if (normalizeDecls(decl) !== normalizeDecls(CANONICAL_SCROLL)) {
      problems.push(
        `${entry.plugin}: .${SCROLL_CLASS} 声明与契约不一致 → ${rel}\n      应 为: ${normalizeDecls(CANONICAL_SCROLL)}\n      实际: ${normalizeDecls(decl)}`,
      )
    }
  }
}

function checkPage(entry, page, root, problems) {
  const abs = join(root, page.file)
  const src = readIfExists(abs)
  if (src === '') {
    problems.push(`${entry.plugin}: 页面源码缺失 → ${page.file}`)
    return { pinned: false, scroll: false }
  }

  const pinnedAt = src.indexOf(PINNED_CLASS)
  const scrollAt = src.indexOf(SCROLL_CLASS)
  if (pinnedAt === -1 || scrollAt === -1) return { pinned: pinnedAt !== -1, scroll: scrollAt !== -1 }

  // 只在页面根节点之后做顺序判定：多组件文件里，先定义的子组件会天然排在前面。
  const rootAt = src.indexOf(page.rootMarker)
  if (rootAt === -1) {
    problems.push(`${entry.plugin}: ${page.file} 找不到页面根标记 ${page.rootMarker}（登记是否过期？）`)
    return { pinned: true, scroll: true }
  }
  const body = src.slice(rootAt)
  const pinnedInBody = body.indexOf(PINNED_CLASS)
  const scrollInBody = body.indexOf(SCROLL_CLASS)
  if (pinnedInBody !== -1 && scrollInBody !== -1 && pinnedInBody > scrollInBody) {
    problems.push(
      `${entry.plugin}: ${page.file} 固定栈渲染在滚动区之后（根节点内偏移 ${pinnedInBody} vs ${scrollInBody}）—— 导航会随内容滚走`,
    )
  }
  return { pinned: true, scroll: true }
}

export function verifyStageScrollContract(root = REPO_ROOT, registry = STAGE_PAGES) {
  const problems = []
  for (const entry of registry) {
    checkStyles(entry, root, problems)
    // 固定栈与滚动区允许落在同一插件的不同文件（例如 stage 与它的 viewport 子组件）。
    let sawPinned = false
    let sawScroll = false
    for (const page of entry.pages) {
      const seen = checkPage(entry, page, root, problems)
      if (seen.pinned) sawPinned = true
      if (seen.scroll) sawScroll = true
    }
    if (!sawPinned) problems.push(`${entry.plugin}: 登记的页面均未使用 .${PINNED_CLASS}`)
    if (!sawScroll) problems.push(`${entry.plugin}: 登记的页面均未使用 .${SCROLL_CLASS}`)
  }
  return { ok: problems.length === 0, problems, checked: registry.length }
}

export function main() {
  const { ok, problems, checked } = verifyStageScrollContract()
  if (ok) {
    console.log(`✅ 一级页滚动归属契约：${checked} 个页面全部合规（固定栈 / 唯一滚动区 / 声明一致）`)
    return 0
  }
  console.error('❌ 一级页滚动归属契约违规：')
  for (const p of problems) console.error(`   - ${p}`)
  console.error('\n契约真源：docs/contracts/first-level-page-layout.md §二·补')
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main())
}
