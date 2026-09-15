#!/usr/bin/env node
/**
 * scripts/verify-stage-scroll-contract.mjs
 * 一级页滚动归属契约门禁 —— Issue 1977
 * 契约真源：docs/contracts/first-level-page-layout.md §二·补
 *
 * 契约形状：一级页**整体滚动**（根节点即唯一滚动容器），页头与动作行随页面滚走，
 * 一级/二级 Tab 行用 `position: sticky` 吸附到顶部。
 *
 * 断言三件事：
 *  1. 每个登记的一级页插件，其样式表都定义了 .omx-stage-sticky / .omx-stage-scroll，
 *     且两条声明在**所有插件中逐字一致**（防各页漂移出各自的滚动实现）。
 *  2. 每个一级页的页面源码同时引用这两个契约类。
 *  3. 两个类不得写在同一个 className 上（一个是吸附角色，一个是滚动容器角色）。
 *
 * 退出码：0 = 全部通过；1 = 有违规。
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

export const STICKY_CLASS = 'omx-stage-sticky'
export const SCROLL_CLASS = 'omx-stage-scroll'

/** 契约声明的唯一真源（比较时归一化空白/分号）。 */
export const CANONICAL_STICKY = 'position:sticky;top:0;z-index:3;background:var(--dsw-alias-bg-base, var(--dsw-bg));'
export const CANONICAL_SCROLL = 'flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;'

/** 登记的一级页（工作台 Tab 页）。新增一级页时必须在此登记。 */
export const STAGE_PAGES = [
  {
    plugin: 'omnimux-assets',
    label: '资产库',
    styles: 'plugins/omnimux-assets/src/client/styles.js',
    pages: [
      'plugins/omnimux-assets/src/client/AssetsStage.jsx',
      'plugins/omnimux-assets/src/client/CloudAssetsView.jsx',
    ],
  },
  {
    plugin: 'omnimux-market',
    label: '技能/专家',
    styles: 'plugins/omnimux-market/src/client/css.js',
    pages: [
      'plugins/omnimux-market/src/client/skill-plaza.js',
      'plugins/omnimux-market/src/client/plaza-shell.js',
    ],
  },
  {
    plugin: 'omnimux-inspiration',
    label: '创作灵感',
    styles: 'plugins/omnimux-inspiration/src/client/styles.js',
    pages: [
      'plugins/omnimux-inspiration/src/client/InspirationSection.jsx',
    ],
  },
  {
    plugin: 'omnimux-accounts',
    label: '账号中心',
    styles: 'plugins/omnimux-accounts/src/client/styles.js',
    pages: [
      'plugins/omnimux-accounts/src/client/AccountsStage.jsx',
      'plugins/omnimux-accounts/src/client/AccountsSection.jsx',
    ],
  },
  {
    plugin: 'omnimux-publish',
    label: '内容发布',
    styles: 'plugins/omnimux-publish/src/client/styles.js',
    pages: [
      'plugins/omnimux-publish/src/client/PublishStage.jsx',
    ],
  },
  {
    plugin: 'omnimux-analytics',
    label: '数据分析',
    styles: 'plugins/omnimux-analytics/src/client/styles.js',
    pages: [
      'plugins/omnimux-analytics/src/client/AnalyticsStage.jsx',
    ],
  },
  {
    plugin: 'omnimux-products',
    label: '商品库',
    styles: 'plugins/omnimux-products/src/client/styles.js',
    pages: [
      'plugins/omnimux-products/src/client/ProductsStage.jsx',
    ],
  },
]

/**
 * 归一化 CSS 声明文本，便于跨文件逐字比较。
 * 只抹平**排版差异**（空白折叠、冒号/分号两侧空格、尾分号），保留值内空格。
 */
export function normalizeDecls(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*;\s*/g, ';')
    .replace(/;+$/, '')
    .trim()
    .toLowerCase()
}

/** 从样式源码里抽取某个 class 的声明体。兼容多行与压缩单行两种写法。 */
export function extractDeclarations(source, className) {
  const text = String(source || '')
  const out = []
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

  const pairs = [
    { cls: STICKY_CLASS, canonical: CANONICAL_STICKY, label: 'position: sticky 到顶吸附' },
    { cls: SCROLL_CLASS, canonical: CANONICAL_SCROLL, label: '整页唯一滚动容器' },
  ]
  for (const { cls, canonical, label } of pairs) {
    const decls = extractDeclarations(css, cls)
    if (decls.length === 0) {
      problems.push(`${entry.plugin}: ${rel} 缺少 .${cls} 定义（${label}）`)
      continue
    }
    for (const decl of decls) {
      if (normalizeDecls(decl) !== normalizeDecls(canonical)) {
        problems.push(
          `${entry.plugin}: .${cls} 声明与契约不一致 → ${rel}\n      应为: ${normalizeDecls(canonical)}\n      实际: ${normalizeDecls(decl)}`,
        )
      }
    }
  }
}

function checkPage(entry, pageRel, root, problems) {
  const abs = join(root, pageRel)
  const src = readIfExists(abs)
  if (src === '') {
    problems.push(`${entry.plugin}: 页面源码缺失 → ${pageRel}`)
    return { sticky: false, scroll: false }
  }

  const hasSticky = src.includes(STICKY_CLASS)
  const hasScroll = src.includes(SCROLL_CLASS)

  // 同一 className 上不得同时出现两个角色类（两种顺序都要拦）。
  const both =
    /className\s*[:=]\s*["'][^"']*omx-stage-sticky[^"']*omx-stage-scroll[^"']*["']/.test(src) ||
    /className\s*[:=]\s*["'][^"']*omx-stage-scroll[^"']*omx-stage-sticky[^"']*["']/.test(src)
  if (both) {
    problems.push(`${entry.plugin}: ${pageRel} 把吸附类与滚动类写在了同一个 className 上（角色冲突）`)
  }

  return { sticky: hasSticky, scroll: hasScroll }
}

export function verifyStageScrollContract(root = REPO_ROOT, registry = STAGE_PAGES) {
  const problems = []
  for (const entry of registry) {
    checkStyles(entry, root, problems)
    // 吸附栈与滚动容器允许落在同一插件的不同文件（例如 stage 与它的子视图）。
    let sawSticky = false
    let sawScroll = false
    for (const page of entry.pages) {
      const seen = checkPage(entry, page, root, problems)
      if (seen.sticky) sawSticky = true
      if (seen.scroll) sawScroll = true
    }
    if (!sawSticky) problems.push(`${entry.plugin}: 登记的页面均未使用 .${STICKY_CLASS}`)
    if (!sawScroll) problems.push(`${entry.plugin}: 登记的页面均未使用 .${SCROLL_CLASS}`)
  }
  return { ok: problems.length === 0, problems, checked: registry.length }
}

export function main() {
  const { ok, problems, checked } = verifyStageScrollContract()
  if (ok) {
    console.log(`✅ 一级页滚动归属契约：${checked} 个页面全部合规（整页滚动 / Tab 到顶吸附 / 声明一致）`)
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
