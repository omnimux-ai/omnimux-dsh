import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import * as breakdownFacade from '../src/breakdown.js'
import * as breakdownParserFacade from '../src/breakdown-parser.js'
import * as domainModule from '../src/breakdown/index.js'

import {
  METADATA_HEADING_REGEX,
  STAGE_I18N,
  CANONICAL_STAGE_KEYS,
  STAGE_NAME_MAP,
  DEFAULT_CAMERA_TAGS,
  formatTime,
  formatTimeRange,
  extractTimeRange,
  localizeStage,
  mapToCanonicalStage,
  canonicalizeCameraTags,
  formatShotsCopyText,
  formatScriptCopyText,
  extractSpeechFromDesc,
  isTableHeaderRow,
  parseShotsFromAnalyzeMarkdown,
  extractQuoteAndDesc,
  parseStructureFromAnalyzeMarkdown,
  parsePipelineAndStructureFromMarkdown,
  detectSocialPlatform,
  normalizeSocialMetadata,
  generateAdaptiveShotsAndStructure,
  resolveWorkspaceDirectory,
  saveVideoBreakdownArtifacts,
} from '../src/breakdown/index.js'

describe('video breakdown submodules domain integrity & contract', () => {
  it('re-exports all expected symbols from facade files with 100% parity', () => {
    const expectedExports = [
      'formatTime',
      'formatTimeRange',
      'formatShotsCopyText',
      'formatScriptCopyText',
      'canonicalizeCameraTags',
      'mapToCanonicalStage',
      'localizeStage',
      'METADATA_HEADING_REGEX',
      'STAGE_I18N',
      'parseShotsFromAnalyzeMarkdown',
      'parseStructureFromAnalyzeMarkdown',
      'parsePipelineAndStructureFromMarkdown',
    ]

    for (const name of expectedExports) {
      assert.ok(typeof breakdownFacade[name] !== 'undefined', `breakdown facade missing ${name}`)
      assert.ok(typeof breakdownParserFacade[name] !== 'undefined', `breakdown-parser facade missing ${name}`)
      assert.ok(typeof domainModule[name] !== 'undefined', `domain index missing ${name}`)
      assert.equal(breakdownFacade[name], domainModule[name])
    }

    assert.ok(typeof breakdownFacade.extractVideoBreakdown === 'function')
    assert.ok(typeof breakdownFacade.saveVideoBreakdownArtifacts === 'function')
    assert.ok(typeof breakdownFacade.generateAdaptiveShotsAndStructure === 'function')
  })

  it('validates time formatting boundary cases', () => {
    assert.equal(formatTime(-1), '0:00')
    assert.equal(formatTime(NaN), '0:00')
    assert.equal(formatTime(Infinity), '0:00')
    assert.equal(formatTime(0), '0:00')
    assert.equal(formatTime(59), '0:59')
    assert.equal(formatTime(60), '1:00')
    assert.equal(formatTime(3665), '61:05')
    assert.equal(formatTimeRange(5, 12), '0:05 - 0:12')

    const { timeCol, startSec, endSec } = extractTimeRange(['shot_1', '01:15 - 02:30', 'content'])
    assert.equal(timeCol, '01:15 - 02:30')
    assert.equal(startSec, 75)
    assert.equal(endSec, 150)
  })

  it('correctly maps various stage names and localizes them', () => {
    assert.equal(mapToCanonicalStage('第一阶段：黄金钩子'), 'Hook')
    assert.equal(mapToCanonicalStage('产品展示与开箱细节'), 'Product Intro')
    assert.equal(mapToCanonicalStage('实操演示与功能'), 'Usage Detail')
    assert.equal(mapToCanonicalStage('核心效果对比与透光'), 'Proof Effect')
    assert.equal(mapToCanonicalStage('场景演示与生活共鸣'), 'Demo Scene')
    assert.equal(mapToCanonicalStage('引导互动与行动号召'), 'Cta')

    assert.equal(localizeStage('Hook', true), '黄金钩子')
    assert.equal(localizeStage('Hook', false), 'Hook')
    assert.equal(localizeStage('黄金钩子', false), 'Hook')
    assert.equal(localizeStage('黄金钩子', true), '黄金钩子')
  })

  it('canonicalizes complex camera tokens into 4 orthogonal dimensions', () => {
    const tags1 = canonicalizeCameraTags('特写/手机/俯拍/快摇')
    assert.deepEqual(tags1, ['特写', '智能手机手持', '俯视', '快速摇镜'])

    const tags2 = canonicalizeCameraTags(['大远景', '航拍机位', '仰角', '慢速推拉'])
    assert.deepEqual(tags2, ['大远景', '航拍机位', '仰视', '慢速推拉'])

    const tags3 = canonicalizeCameraTags('固定', '固定三脚架机位拍摄')
    assert.deepEqual(tags3, ['中景', '固定机位', '平视', '固定镜头'])
  })

  it('detects platforms accurately across social URLs', () => {
    assert.equal(detectSocialPlatform('https://www.douyin.com/video/123'), 'douyin')
    assert.equal(detectSocialPlatform('https://www.instagram.com/reel/123'), 'instagram')
    assert.equal(detectSocialPlatform('https://youtu.be/abc'), 'youtube')
    assert.equal(detectSocialPlatform('https://x.com/user/status/123'), 'x')
    assert.equal(detectSocialPlatform('https://www.bilibili.com/video/BV123'), 'bilibili')
    assert.equal(detectSocialPlatform('https://www.xiaohongshu.com/explore/123'), 'xiaohongshu')
    assert.equal(detectSocialPlatform('https://www.tiktok.com/@user/video/123'), 'tiktok')
  })

  it('normalizes flat social data structures and handles fallback options', () => {
    const raw = {
      title: 'Trending tech product review',
      author: {
        name: 'TechLab',
        handle: 'techlab_official',
        avatar: 'https://cdn.example.com/avatar.jpg',
      },
      video_url: 'https://cdn.example.com/video.mp4',
      duration: 45,
      stats: {
        likes: 12000,
        views: 340000,
      },
    }

    const meta = normalizeSocialMetadata(raw)
    assert.equal(meta.title, 'Trending tech product review')
    assert.equal(meta.author.name, 'TechLab')
    assert.equal(meta.author.handle, '@techlab_official')
    assert.equal(meta.video_url, 'https://cdn.example.com/video.mp4')
    assert.equal(meta.duration, 45)
    assert.equal(meta.stats.likes, 12000)
    assert.equal(meta.stats.views, 340000)
    assert.equal(meta.stats.comments, 0)
  })

  it('extracts quote and description with blockquote syntax', () => {
    const raw = `
> "Look at this amazing kitchen gadget!"
This is a game-changing gadget for home cooking that saves 50% prep time.
    `
    const { quote, desc } = extractQuoteAndDesc(raw)
    assert.equal(quote, 'Look at this amazing kitchen gadget!')
    assert.ok(desc.includes('game-changing gadget'))
  })
})
