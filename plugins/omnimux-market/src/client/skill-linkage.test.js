import assert from 'node:assert/strict'
import test from 'node:test'
import { getPresetSkillBinding, filterPresetSkills } from './skill-picker-logic.js'

test('tiktok-agent preset binding exposes 创作视频 category', () => {
  const binding = getPresetSkillBinding('tiktok-agent')
  assert.ok(binding)
  assert.ok(binding.categories.some((c) => c.id === '创作视频'))
})

test('filterPresetSkills returns video-hook-analysis under 创作视频', () => {
  const binding = getPresetSkillBinding('tiktok-agent')
  const videoSkills = filterPresetSkills(binding.skills, '创作视频')
  assert.ok(videoSkills.length > 0)
  assert.ok(videoSkills.some((s) => s.slug === 'video-hook-analysis' || s.name === '视频分析'))
})
