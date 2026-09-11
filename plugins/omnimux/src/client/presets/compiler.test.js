import test from 'node:test'
import assert from 'node:assert/strict'
import { compileCreativePrompt } from './compiler.js'

test('compileCreativePrompt: compiles all presets with user query', () => {
  const result = compileCreativePrompt({
    format: {
      title: 'Before & After',
      titleZh: '前后对比',
      categoryName: 'Trending Ads',
      categoryNameZh: '热门广告',
      description: 'Show contrast',
      prompt: 'Scene 1 -> Scene 2'
    },
    hook: {
      title: 'Giant Product Crash',
      titleZh: '巨型产品碰撞',
      categoryName: 'Eye-Catching Visuals',
      categoryNameZh: '视觉冲击',
      description: 'Massive impact',
      prompt: 'Product falls from sky'
    },
    style: {
      title: 'Quiet Luxury',
      titleZh: '静奢极简',
      categoryName: 'Premium Aesthetics',
      categoryNameZh: '高级美学',
      description: 'Warm neutral',
      prompt: 'Soft morning light, 35mm'
    },
    userQuery: '便携降噪耳机，主打差旅人群'
  })

  assert.ok(result.includes('前后对比'))
  assert.ok(result.includes('巨型产品碰撞'))
  assert.ok(result.includes('静奢极简'))
  assert.ok(result.includes('便携降噪耳机'))
  assert.ok(!result.includes('undefined'))
  assert.ok(!result.includes('null'))
})

test('compileCreativePrompt: works with only hook selected', () => {
  const result = compileCreativePrompt({
    hook: {
      title: 'ASMR Crunch',
      titleZh: '清脆嚼音',
      categoryName: 'Catchy Sounds',
      categoryNameZh: '抓耳声音',
      prompt: 'Bite down with audio amplification'
    },
    userQuery: '酥脆坚果饼干'
  })

  assert.ok(result.includes('清脆嚼音'))
  assert.ok(result.includes('酥脆坚果饼干'))
  assert.ok(!result.includes('Video Format'))
  assert.ok(!result.includes('Visual Style'))
})

test('compileCreativePrompt: works with only style selected', () => {
  const result = compileCreativePrompt({
    style: {
      title: 'Cyberpunk Neon',
      titleZh: '赛博朋克霓虹',
      categoryName: 'Future Tech',
      categoryNameZh: '未来科技',
      prompt: 'Blue and purple neon reflections'
    }
  })

  assert.ok(result.includes('赛博朋克霓虹'))
  assert.ok(!result.includes('Attention Hook'))
  assert.ok(!result.includes('Video Format'))
})

test('compileCreativePrompt: supports english output', () => {
  const result = compileCreativePrompt({
    hook: {
      title: 'Sudden Glass Drop',
      categoryName: 'Eye-Catching Visuals',
      prompt: 'Glass slips from hand'
    },
    language: 'en-US'
  })

  assert.ok(result.includes('[CREATIVE DIRECTIVE · CINEMATIC COMMERCIAL PRODUCTION]'))
  assert.ok(result.includes('FIRST 3-SECOND HOOK (Attention Retention: Sudden Glass Drop)'))
  assert.ok(!result.includes('黄金前 3 秒'))
})
