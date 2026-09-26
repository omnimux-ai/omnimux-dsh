/**
 * tests/e2e/market-featured-replicate-carousel.e2e.test.mjs
 * 技能插件市场将《图文复刻》作为官方核心主打技能上架端到端验证 (Issue #2719)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E 契约：图文复刻技能在市场目录中已上架为官方精选与核心主打技能', () => {
  const catalogPath = path.join(root, 'plugins/omnimux-market/catalog/index.json')
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  const item = catalog.items.find((it) => it.id === 'sk-omx-replicate-carousel')

  assert.ok(item, 'sk-omx-replicate-carousel 必须存在于市场目录中')
  assert.equal(item.kind, 'skill')
  assert.equal(item.tab, 'skills')
  assert.equal(item.recommended, true, '必须标记为官方推荐 recommended: true')
  assert.equal(item.isHot, true, '必须标记为热门 isHot: true')
  assert.equal(item.installType, 'marketplace', '必须标记为市场可选安装 marketplace')
  assert.equal(item.titleZh, '图文复刻')
  assert.equal(item.titleEn, 'Carousel Replication')
  assert.ok(item.summaryZh && item.summaryZh.length > 0, '必须具备完整的中文摘要')
  assert.ok(item.summaryEn && item.summaryEn.length > 0, '必须具备完整的英文摘要')
})

test('E2E 契约：图文复刻技能进入官方精选置顶序列并包含在精选快照中', () => {
  const generatorPath = path.join(root, 'scripts/generate-featured-skills.mjs')
  const generatorCode = fs.readFileSync(generatorPath, 'utf8')
  assert.ok(
    generatorCode.includes("'sk-omx-replicate-carousel'"),
    'PINNED_TOP_SKILL_IDS 必须包含 sk-omx-replicate-carousel 置顶 ID',
  )

  const snapshotPath = path.join(root, 'plugins/omnimux/src/client/session-guide/skills/featured-skills.json')
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  assert.equal(snapshot.skills.length, 113, '精选技能总数对齐 113 条')

  const snapshotItem = snapshot.skills.find((s) => s.id === 'sk-omx-replicate-carousel')
  assert.ok(snapshotItem, '精选快照中必须包含 sk-omx-replicate-carousel')
  assert.equal(snapshotItem.titleZh, '图文复刻')
  assert.equal(snapshotItem.isHot, true)
  assert.equal(snapshotItem.category, 'image-static')
})
