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
