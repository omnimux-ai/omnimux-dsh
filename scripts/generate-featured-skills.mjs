#!/usr/bin/env node
/**
 * 「创作灵感 / Skill」板块 Skill Tab 的精选快照生成器。
 *
 * 精选 skill 的**定义**在市场插件里：`workshop-query.ts` 的
 * `featured = filtered.filter(skill => skill.recommended)`，而 `recommended`
 * 来自目录条目本身（`skill-aggregate.ts` 读 `item.recommended`）。
 * 工坊的运行时 HTTP（`/omnimux-market/workshop/workshopQuery`）带来源守卫，
 * hero 里的同源 fetch 拿到的是 503 ORIGIN_UNVERIFIED，因此这里改为把
 * **目录里同一份 recommended 数据**生成成 hub 侧快照：同源同义、离线可测。
 *
 * 用法：
 *   node scripts/generate-featured-skills.mjs          # 写入快照
 *   node scripts/generate-featured-skills.mjs --check  # 只校验快照是否仍与目录一致
 *
 * 目录更新后必须重新生成，否则 `--check` 会失败（门禁用）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CATALOG_PATH = join(ROOT, 'plugins/omnimux-market/catalog/index.json')
export const SNAPSHOT_PATH = join(ROOT, 'plugins/omnimux/src/client/session-guide/skills/featured-skills.json')
export const SNAPSHOT_SCHEMA = 'omnimux.session-guide.featured-skills/v1'

/**
 * 官方重磅精选置顶序列（严格对标首屏 4 列视觉网格与高品质出片流）
 */
export const PINNED_TOP_SKILL_IDS = [
  'sk-omx-3d-animation-short-generator',
  'sk-omx-brand-promo-video-generator',
  'sk-omx-minimalist-product-ad-generator',
  'sk-omx-music-video-subtitle-generator',
  'sk-omx-paper-collage-explainer-generator',
  'sk-omx-fpv-tour-video-generator',
  'sk-omx-pov-short-film-generator',
  'sk-omx-suspense-title-sequence-generator',
]

/** 快照只留界面真正用到的字段，避免把整个目录搬进客户端 bundle。 */
export function buildSnapshot(catalog) {
  const items = Array.isArray(catalog?.items) ? catalog.items : []
  const pinnedOrder = new Map(PINNED_TOP_SKILL_IDS.map((id, index) => [id, index]))

  const skills = items
    .filter((item) => item && item.kind === 'skill' && item.recommended === true)
    .map((item) => {
      const coverAsset = typeof item.cover === 'string'
        ? item.cover
        : (item.cover && typeof item.cover.asset === 'string' ? item.cover.asset : '')
      const avatarAsset = typeof item.avatar === 'string'
        ? item.avatar
        : (item.avatar && typeof item.avatar.asset === 'string' ? item.avatar.asset : '')

      return {
        id: String(item.id || ''),
        title: String(item.title || ''),
        titleZh: String(item.titleZh || item.nameZh || item.title || ''),
        titleEn: String(item.titleEn || item.nameEn || item.title || ''),
        summary: String(item.summary || ''),
        summaryZh: String(item.summaryZh || item.descriptionZh || item.summary || ''),
        summaryEn: String(item.summaryEn || item.descriptionEn || item.summary || ''),
        category: String(item.category || ''),
        tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string' && tag !== '') : [],
        cover: coverAsset,
        avatar: avatarAsset,
        badge: typeof item.badge === 'string' && item.badge ? item.badge : 'H3',
        attribution: typeof item.attribution === 'string' && item.attribution ? item.attribution : '@MiniMax Design官方',
        skill: String(item.skill || ''),
        sourceRef: item.source && typeof item.source === 'object'
          ? { repo: String(item.source.repo || ''), path: String(item.source.path || '') }
          : null,
      }
    })
    .filter((skill) => skill.id && skill.title)
    .sort((a, b) => {
      const aRank = pinnedOrder.has(a.id) ? pinnedOrder.get(a.id) : 9999
      const bRank = pinnedOrder.has(b.id) ? pinnedOrder.get(b.id) : 9999
      if (aRank !== bRank) return aRank - bRank
      return a.id.localeCompare(b.id)
    })

  const categories = (Array.isArray(catalog?.categories) ? catalog.categories : [])
    .filter((category) => category && category.tab === 'skills' && category.id && category.title)
    .map((category) => ({ id: String(category.id), title: String(category.title) }))

  // 只保留真的出现在精选里的分类，避免出现点了必然空的 chip
  const used = new Set(skills.map((skill) => skill.category).filter(Boolean))
  const usedCategories = categories.filter((category) => used.has(category.id))

  return {
    schema: SNAPSHOT_SCHEMA,
    catalogGeneratedAt: typeof catalog?.generated_at === 'string' ? catalog.generated_at : '',
    source: 'plugins/omnimux-market/catalog/index.json',
    skills,
    categories: usedCategories,
  }
}

/** 稳定序列化：键顺序由构造函数决定，便于比对。 */
export function serializeSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function readCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
}

export function readSnapshot() {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function main() {
  const check = process.argv.includes('--check')
  const snapshot = buildSnapshot(readCatalog())
  const text = serializeSnapshot(snapshot)

  if (check) {
    const current = readFileSync(SNAPSHOT_PATH, 'utf-8')
    if (current !== text) {
      console.error('❌ featured-skills 快照与市场目录不一致，请重新运行: node scripts/generate-featured-skills.mjs')
      process.exit(1)
    }
    console.log(`✅ featured-skills 快照与目录一致（${snapshot.skills.length} 条精选 skill / ${snapshot.categories.length} 个分类）`)
    return
  }

  writeFileSync(SNAPSHOT_PATH, text)
  console.log(`✅ 已生成 ${SNAPSHOT_PATH.replace(`${ROOT}/`, '')}（${snapshot.skills.length} 条精选 skill / ${snapshot.categories.length} 个分类）`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
