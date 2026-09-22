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

test('filterPresetSkills 按恢复后的分类归档：创作视频 7 款、创作图片 6 款', () => {
  const binding = getPresetSkillBinding('tiktok-agent')
  const videoSkills = filterPresetSkills(binding.skills, '创作视频')
  const imageSkills = filterPresetSkills(binding.skills, '创作图片')

  assert.equal(videoSkills.length, 7)
  assert.equal(imageSkills.length, 6)
  // 反推视频提示词按产品口径并入创作视频（它在预设真源里的原始分类未被恢复）
  assert.ok(videoSkills.some((s) => s.slug === 'reverse-video-prompt'))
  // 分类已取消，按它过滤必须返回空集，而不是回落到「全部」
  assert.deepEqual(filterPresetSkills(binding.skills, '搜索爆款视频'), [])
})
