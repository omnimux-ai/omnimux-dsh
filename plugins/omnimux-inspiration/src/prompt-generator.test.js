import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildDirectGenerationPrompt,
  cleanMarkdownForPrompt,
  defaultCategoryForMediaType,
  defaultModelForMediaType,
  SEEDANCE_CATEGORY,
  SEEDANCE_MODEL,
  GPT_IMAGE_CATEGORY,
  GPT_IMAGE_MODEL,
} from './prompt-generator.js'

describe('prompt-generator (Issue #2047)', () => {
  it('cleanMarkdownForPrompt cleans list markers, bold tags, and excessive punctuation', () => {
    const raw = `* **场景设置**: 明亮简约的个人梳妆台
* **镜头语言**: 0-3s 紧凑特写 → 演示段多角度近景切换，突出产品细节质感。
## 核心提示
- 自然光影`
    const cleaned = cleanMarkdownForPrompt(raw)
    assert.equal(cleaned.includes('*'), false)
    assert.equal(cleaned.includes('#'), false)
    assert.match(cleaned, /场景设置：明亮简约的个人梳妆台/)
    assert.match(cleaned, /镜头语言：0-3s 紧凑特写/)
  })

  it('buildDirectGenerationPrompt synthesizes video prompt tailored for Seedance 2.5', () => {
    const item = {
      title: '科技Vlogger护肤演示',
      content: '展示精华液上脸推开后的水润质感',
      deconstruction: {
        summary: '年轻女性特写展示护肤品',
        hook: '开场0-3秒强反差特写吸引停留',
        visual_breakdown: '* **运镜**: 希区柯克变焦推近\n* **光影**: 晨光柔焦自然光',
      },
      type: 'video',
    }

    const prompt = buildDirectGenerationPrompt(item, 'video')
    assert.match(prompt, /年轻女性特写展示护肤品/)
    assert.match(prompt, /运镜：希区柯克变焦推近/)
    assert.match(prompt, /电影级运镜与流畅主体动作演进/)
    assert.match(prompt, /4K超清质感/)
  })

  it('buildDirectGenerationPrompt synthesizes image prompt for GPT Image 2.5', () => {
    const item = {
      title: '夏日沙滩泳装',
      content: '自然抓拍光影',
      deconstruction: {
        summary: '年轻女性站在海浪退去的金色沙滩上',
        visual_breakdown: '特写自然微笑，阳光洒在发梢',
      },
      type: 'image',
    }

    const prompt = buildDirectGenerationPrompt(item, 'image')
    assert.match(prompt, /年轻女性站在海浪退去的金色沙滩上/)
    assert.match(prompt, /特写自然微笑/)
    assert.match(prompt, /大师级摄影构图/)
    assert.match(prompt, /细腻材质纹理与真实细节呈现/)
  })

  it('buildDirectGenerationPrompt provides reliable fallback from plain copy when no breakdown exists', () => {
    const item = {
      title: '极简咖啡拉花过程',
      content: '浓缩咖啡油脂与热奶沫交融，奶缸缓慢注入拉出心形',
    }
    const videoPrompt = buildDirectGenerationPrompt(item, 'video')
    assert.match(videoPrompt, /浓缩咖啡油脂与热奶沫交融/)
    assert.match(videoPrompt, /电影级运镜与流畅主体动作演进/)

    const imagePrompt = buildDirectGenerationPrompt(item, 'image')
    assert.match(imagePrompt, /浓缩咖啡油脂与热奶沫交融/)
    assert.match(imagePrompt, /大师级摄影构图/)
  })

  it('buildDirectGenerationPrompt refuses a bare title, because there is nothing to publish', () => {
    assert.equal(buildDirectGenerationPrompt({ title: '只有标题' }, 'video'), '')
    assert.equal(buildDirectGenerationPrompt({ title: '只有标题', content: '   ' }, 'image'), '')
    assert.equal(buildDirectGenerationPrompt(null, 'video'), '')
    assert.equal(buildDirectGenerationPrompt({}, 'video'), '')
  })

  /*
   * Issue #2088. A cloud catalogue entry keeps its whole scene account under
   * `visual_breakdown` and has no `summary` of its own. Falling through to the
   * entry's post copy produced a share whose prompt was that copy plus filler —
   * the post, described by itself, rather than the footage.
   */
  it('takes the visual breakdown as the scene when the entry has no summary', () => {
    const prompt = buildDirectGenerationPrompt({
      caption: 'カメラロールの画像生成して、Minimax H3に… https://t.co/VSNSvH1IiM',
      deconstruction: {
        visual_breakdown: '低饱和高感光夜景，深夜建筑剪影与窗内暖黄灯光的远景构图',
        hook: '手持啤酒罐的银发老人与年轻女孩侧脸献吻的强反差特写',
      },
    }, 'video')

    assert.match(prompt, /低饱和高感光夜景/)
    assert.match(prompt, /电影级运镜与流畅主体动作演进/)
    assert.equal(prompt.includes('t.co/VSNSvH1IiM'), false, '原文案不得再充当画面描述')
  })

  it('never repeats the same text when it served as the scene', () => {
    const breakdown = '深夜建筑剪影与窗内暖黄灯光的远景构图'
    const prompt = buildDirectGenerationPrompt({ deconstruction: { visual_breakdown: breakdown } }, 'image')
    assert.equal(prompt.split(breakdown).length - 1, 1, '同一段画面描述只出现一次')
  })

  it('keeps the entry summary ahead of the visual breakdown when both exist', () => {
    const prompt = buildDirectGenerationPrompt({
      deconstruction: {
        summary: '潮酷银发老爷爷在夜店与家中反差叙事的幽默短片',
        visual_breakdown: '手持啤酒罐、墨镜金链的特写定格',
      },
    }, 'video')
    assert.match(prompt, /潮酷银发老爷爷在夜店与家中反差叙事的幽默短片/)
    assert.match(prompt, /手持啤酒罐、墨镜金链的特写定格/)
    assert.ok(
      prompt.indexOf('潮酷银发老爷爷') < prompt.indexOf('手持啤酒罐'),
      '拆解摘要必须排在画面描述之前',
    )
  })

  it('falls back to the opening hook when there is no scene at all', () => {
    const prompt = buildDirectGenerationPrompt({ deconstruction: { hook: '0-3 秒强反差特写抓停留' } }, 'video')
    assert.match(prompt, /开场动态：0-3 秒强反差特写抓停留/)
  })

  it('defaultCategoryForMediaType and defaultModelForMediaType align with requirements', () => {
    assert.equal(defaultCategoryForMediaType('video'), SEEDANCE_CATEGORY)
    assert.equal(defaultCategoryForMediaType('video'), 'seedance 2.5')
    assert.equal(defaultModelForMediaType('video'), SEEDANCE_MODEL)
    assert.equal(defaultModelForMediaType('video'), 'seedance-2-5')

    assert.equal(defaultCategoryForMediaType('image'), GPT_IMAGE_CATEGORY)
    assert.equal(defaultCategoryForMediaType('image'), 'GPT image2.5')
    assert.equal(defaultModelForMediaType('image'), GPT_IMAGE_MODEL)
    assert.equal(defaultModelForMediaType('image'), 'gpt-image-2.5')
  })
})
