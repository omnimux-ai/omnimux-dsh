import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanShots,
  cleanStructure,
  cleanPipeline,
  formatCurrentTime,
  formatViews,
  cleanTagText,
  computeShotsCopyText,
  computeScriptCopyText,
  computeStructureCopyText,
  STAGE_STRATEGY_TEMPLATES,
} from '../src/client/viewer/breakdownDataUtils.js'
import {
  extractTikTokEmbedUrl,
  findCurrentPlayingShotIndex,
} from '../src/client/viewer/useVideoPlayback.js'
import { useIsZh } from '../src/client/viewer/useIsZh.js'
import { useTranslation } from '../src/client/viewer/useTranslation.js'

test('video breakdown viewer domain integrity & pure data utilities', async (t) => {
  await t.test('verifies viewer hooks exist and are callable functions', () => {
    assert.equal(typeof useIsZh, 'function')
    assert.equal(typeof useTranslation, 'function')
  })

  await t.test('cleanShots filters phantom headers and zero-time placeholders', () => {
    const rawShots = [
      { id: 'phantom-title', title: '分镜标题', stage: 'Hook', time_range: '0:00 - 0:02', start_seconds: 0, end_seconds: 2 },
      { id: 'phantom-stage', title: '特写', stage: '所属阶段', time_range: '0:00 - 0:02', start_seconds: 0, end_seconds: 2 },
      { id: 'phantom-zero', title: '分镜', stage: 'Hook', time_range: '0:00 - 0:00', start_seconds: 0, end_seconds: 0 },
      { id: 'shot-1', title: '邻居窥视', stage: 'Hook', time_range: '0:00 - 0:03', start_seconds: 0, end_seconds: 3, speech: '谁在看我？' },
      { id: 'shot-2', title: '展示贴膜', stage: 'Product Intro', time_range: '0:03 - 0:08', start_seconds: 3, end_seconds: 8, speech: '用这款防窥膜' },
    ]

    const cleaned = cleanShots(rawShots)
    assert.equal(cleaned.length, 2)
    assert.equal(cleaned[0].id, 'shot-1')
    assert.equal(cleaned[1].id, 'shot-2')
  })

  await t.test('cleanStructure repairs degenerate structure from shots and maps stages', () => {
    const shots = [
      { id: 's1', stage: '黄金钩子', title: '隐私暴露', speech: '天哪被看到了！', start_seconds: 0, end_seconds: 3 },
      { id: 's2', stage: '产品引入', title: '拿出窗膜', speech: '邻居推荐了这个', start_seconds: 3, end_seconds: 6 },
      { id: 's3', stage: '使用细节', title: '贴膜过程', description: '喷水贴上刮平', start_seconds: 6, end_seconds: 12 },
    ]

    const degenerateRaw = [
      { stage: '总览', description: '---' },
    ]

    const cleaned = cleanStructure(degenerateRaw, shots)
    assert.ok(cleaned.length >= 2, 'should recover stages from shots')
    assert.equal(cleaned[0].stage, 'Hook')
    assert.equal(cleaned[0].quote, '天哪被看到了！')
    assert.ok(cleaned[0].description.length > 5)
  })

  await t.test('cleanPipeline generates canonical stages list', () => {
    const cleanStruct = [
      { stage: 'Hook' },
      { stage: 'Product Intro' },
      { stage: 'Usage Detail' },
    ]
    const pipeline = cleanPipeline(cleanStruct, [])
    assert.deepEqual(pipeline, ['Hook', 'Product Intro', 'Usage Detail'])

    const fallbackPipeline = cleanPipeline([], ['黄金钩子', '产品展示', 'CTA'])
    assert.deepEqual(fallbackPipeline, ['Hook', 'Product Intro', 'Cta'])
  })

  await t.test('formatCurrentTime and formatViews format values correctly', () => {
    assert.equal(formatCurrentTime(0), '0:00')
    assert.equal(formatCurrentTime(75), '1:15')
    assert.equal(formatCurrentTime(3605), '60:05')

    assert.equal(formatViews(0), '0')
    assert.equal(formatViews(850), '850')
    assert.equal(formatViews(1500), '1.5K')
    assert.equal(formatViews(2000000), '2M')
    assert.equal(formatViews('3.5M'), '3.5M')
  })

  await t.test('cleanTagText strips leading punctuation or non-alphanumeric chars', () => {
    assert.equal(cleanTagText('• 特写'), '特写')
    assert.equal(cleanTagText(' - 俯视视角'), '俯视视角')
    assert.equal(cleanTagText('中景'), '中景')
  })

  await t.test('computeShotsCopyText, computeScriptCopyText and computeStructureCopyText format texts accurately', () => {
    const shots = [
      {
        id: 's1',
        time_range: '0:00 - 0:03',
        title: '开门瞬间',
        stage: 'Hook',
        tags: ['特写', '平视'],
        speech: '看这里！',
        description: '镜头拉近',
      },
    ]
    const translations = {
      en: { s1: 'Look here!' },
    }

    const zhCopy = computeShotsCopyText(shots, true, 'en', translations)
    assert.ok(zhCopy.includes('0:00 - 0:03 开门瞬间 [Hook]'))
    assert.ok(zhCopy.includes('属性：特写 | 平视'))
    assert.ok(zhCopy.includes('台词：看这里！'))
    assert.ok(zhCopy.includes('翻译：Look here!'))
    assert.ok(zhCopy.includes('描述：镜头拉近'))

    const scriptCopy = computeScriptCopyText(shots, true, 'en', translations)
    assert.ok(scriptCopy.includes('0:00 - 0:03 看这里！'))
    assert.ok(scriptCopy.includes('[en] Look here!'))

    const structureCopy = computeStructureCopyText([{ stage: 'Hook', description: '吸引用户痛点' }])
    assert.equal(structureCopy, '【Hook】\n吸引用户痛点')
  })

  await t.test('extractTikTokEmbedUrl and findCurrentPlayingShotIndex compute video playback metrics', () => {
    const url1 = 'https://www.tiktok.com/@creator/video/7391827364512891234?is_from_webapp=1'
    assert.equal(extractTikTokEmbedUrl(url1), 'https://www.tiktok.com/player/v1/7391827364512891234')

    const url2 = 'https://example.com/video.mp4'
    assert.equal(extractTikTokEmbedUrl(url2), null)

    const shots = [
      { id: '1', start_seconds: 0, end_seconds: 3 },
      { id: '2', start_seconds: 3, end_seconds: 8 },
      { id: '3', start_seconds: 8, end_seconds: 15 },
    ]

    assert.equal(findCurrentPlayingShotIndex(shots, 1.5), 0)
    assert.equal(findCurrentPlayingShotIndex(shots, 5.0), 1)
    assert.equal(findCurrentPlayingShotIndex(shots, 10.2), 2)
    assert.equal(findCurrentPlayingShotIndex(shots, 20.0), -1)
  })
})
