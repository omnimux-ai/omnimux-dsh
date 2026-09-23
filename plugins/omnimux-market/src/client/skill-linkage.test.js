import assert from 'node:assert/strict'
import test from 'node:test'
import { getPresetSkillBinding, filterPresetSkills } from './skill-picker-logic.js'

/**
 * 货架分类的产品口径（specs/composer-quick-shortcuts.spec.md「数据分叉的收敛」）：
 * `tiktok-agent` / `omni-agent` 只恢复「创作视频」「创作图片」两个分类，
 * `reverse-video-prompt` 并入创作视频，**不额外立第三个分类**（`搜索爆款视频` 不恢复）。
 * 本文件钉住这条口径在货架绑定上的真实形状。
 */
const RESTORED_CATEGORIES = Object.freeze(['创作视频', '创作图片'])

test('tiktok-agent preset binding exposes 创作视频 category', () => {
  const binding = getPresetSkillBinding('tiktok-agent')
  assert.ok(binding)
  assert.ok(binding.categories.some((c) => c.id === '创作视频'))
})

test('filterPresetSkills returns video-hook-analysis under 创作视频', () => {
  const binding = getPresetSkillBinding('tiktok-agent')
  const videoSkills = filterPresetSkills(binding.skills, '创作视频')
  assert.ok(videoSkills.length > 0)
  assert.ok(videoSkills.some((s) => s.slug === 'video-hook-analysis' || s.name === '视频拆解'))
})

test('tiktok-agent preset binding 只恢复两个创作分类，不额外立第三个分类', () => {
  const binding = getPresetSkillBinding('tiktok-agent')
  assert.ok(binding)
  const ids = binding.categories.map((c) => c.id)
  // 恢复的两个分类排在最前，且顺序固定（展示顺序即分类顺序）
  assert.deepEqual(ids.slice(0, RESTORED_CATEGORIES.length), RESTORED_CATEGORIES)
  // 「搜索爆款视频」是被本次口径刻意取消的分类，恢复它等于多立一个分类
  assert.ok(!ids.includes('搜索爆款视频'), '搜索爆款视频 分类不得出现在货架绑定里')
})

test('filterPresetSkills 按恢复后的分类归档：创作视频 7 款、创作图片 8 款', () => {
  const binding = getPresetSkillBinding('tiktok-agent')
  const videoSkills = filterPresetSkills(binding.skills, '创作视频')
  const imageSkills = filterPresetSkills(binding.skills, '创作图片')

  assert.equal(videoSkills.length, 7)
  // 6 款恢复技能 + Issue #2609 预装的商品轮播图 / 图文复刻
  assert.equal(imageSkills.length, 8)
  // 反推视频提示词按产品口径并入创作视频（它在预设真源里的原始分类未被恢复）
  assert.ok(videoSkills.some((s) => s.slug === 'reverse-video-prompt'))
  // 分类已取消，按它过滤必须返回空集，而不是回落到「全部」
  assert.deepEqual(filterPresetSkills(binding.skills, '搜索爆款视频'), [])
})

test('Issue #2609：两款电商图文技能预装进创作图片分类，且为已内置态', () => {
  const PREINSTALLED = ['shoppable-carousel', 'replicate-carousel']
  for (const presetId of ['tiktok-agent', 'omni-agent']) {
    const binding = getPresetSkillBinding(presetId)
    assert.ok(binding, `${presetId} 必须有货架绑定`)
    const imageSkills = filterPresetSkills(binding.skills, '创作图片')
    for (const slug of PREINSTALLED) {
      const hit = imageSkills.find((s) => String(s.slug || s.skill) === slug)
      assert.ok(hit, `${presetId} 的创作图片分类必须含 ${slug}`)
      // 预装态：菜单不显示「未安装」角标，点选也不触发安装动作
      assert.equal(hit.installed, true, `${slug} 必须是预装（已内置）态`)
      assert.equal(hit.category, '创作图片')
    }
  }
})

test('Issue #2609：两款技能同时上架技能货架（catalog/index.json），属于 image-static 分类', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const here = dirname(fileURLToPath(import.meta.url))
  const catalog = JSON.parse(readFileSync(join(here, '../../catalog/index.json'), 'utf8'))

  const targets = [
    { id: 'sk-omx-shoppable-carousel', skill: 'shoppable-carousel', titleZh: '商品轮播图' },
    { id: 'sk-omx-replicate-carousel', skill: 'replicate-carousel', titleZh: '图文复刻' },
  ]
  for (const { id, skill, titleZh } of targets) {
    const item = catalog.items.find((it) => it.id === id)
    assert.ok(item, `${id} 必须存在于 catalog/index.json`)
    assert.equal(item.kind, 'skill')
    assert.equal(item.tab, 'skills')
    assert.equal(item.skill, skill)
    assert.equal(item.titleZh, titleZh)
    assert.equal(item.category, 'image-static')
    assert.ok(Array.isArray(item.tags) && item.tags.includes('图片和静态广告'))
    assert.equal(item.source?.type, 'bundled')
    const skillPath = join(here, '../../', item.source.path, 'SKILL.md')
    assert.ok(existsSync(skillPath), `${skill} 物理实体必须存在`)
  }
})
