import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  formatTime,
  formatTimeRange,
  formatShotsCopyText,
  parseShotsFromAnalyzeMarkdown,
  parseStructureFromAnalyzeMarkdown,
  extractVideoBreakdown,
  saveVideoBreakdownArtifacts,
} from '../src/breakdown.js'
import { apply } from '../src/index.js'

describe('video breakdown & shots analysis engine', () => {
  it('formats seconds into mm:ss accurately', () => {
    assert.equal(formatTime(0), '0:00')
    assert.equal(formatTime(3), '0:03')
    assert.equal(formatTime(65), '1:05')
    assert.equal(formatTime(120), '2:00')
    assert.equal(formatTimeRange(3, 4), '0:03 - 0:04')
  })

  it('formats plain text for copy-shots action', () => {
    const shots = [
      {
        time_range: '0:03 - 0:04',
        title: '心形木片特写',
        stage: 'Product Intro',
        tags: ['特写', '智能手机手持'],
        description: '木盘内装满圆形木质饰品',
      },
    ]
    const text = formatShotsCopyText(shots)
    assert.match(text, /0:03 - 0:04 心形木片特写 \[Product Intro\]/)
    assert.match(text, /属性：特写 \| 智能手机手持/)
    assert.match(text, /描述：木盘内装满圆形木质饰品/)
  })

  it('parses shots from video analyze markdown table accurately', () => {
    const md = `
| 镜头序号 | 时间戳 | 视觉画面 | 提示词参考 |
|---|---|---|---|
| 1 | 0-3秒 | 俯视特写，智能手机手持镜头，展示精致礼盒 | Close-up shot |
| 2 | 3-7秒 | 中景，手持平视移动，展示礼盒翻转细节 | Medium shot |
    `
    const shots = parseShotsFromAnalyzeMarkdown(md)
    assert.equal(shots.length, 2)
    assert.equal(shots[0].start_seconds, 0)
    assert.equal(shots[0].end_seconds, 3)
    assert.equal(shots[0].time_range, '0:00 - 0:03')
    assert.equal(shots[0].stage, 'Hook')
    assert.ok(shots[0].tags.includes('特写'))
    assert.ok(shots[0].tags.includes('俯视'))

    assert.equal(shots[1].start_seconds, 3)
    assert.equal(shots[1].end_seconds, 7)
    assert.equal(shots[1].stage, 'Product Intro')
    assert.ok(shots[1].tags.includes('中景'))
    assert.ok(shots[1].tags.includes('平视'))
  })

  it('parses structure stages from video analyze markdown', () => {
    const md = `
## I. 核心目标与概述
展示精美礼盒，吸引潜在消费人群。

## II. 关键节奏
**[0-3秒] 黄金钩子**: 以充满悬念的开场特写瞬间锁定用户注意力。

## III. 叙事分析
通过由外到内的层次推进使用演示。
    `
    const structure = parseStructureFromAnalyzeMarkdown(md)
    assert.ok(structure.length >= 2)
    const hook = structure.find((s) => s.stage === 'Hook')
    assert.ok(hook)
    assert.match(hook.description, /开场特写/)
  })

  it('extracts structured video breakdown from URL with real metadata support', async () => {
    const data = await extractVideoBreakdown('https://www.tiktok.com/@creator/video/123456789', {
      meta: {
        authorName: 'TestCreator',
        authorHandle: '@testcreator',
        title: 'Real TikTok Drama',
        caption: 'Full drama breakdown and analysis',
        likes: '10K',
        views: '500K',
      },
    })
    assert.equal(data.is_video_breakdown, true)
    assert.equal(data.schema_version, '1.0.0')
    assert.ok(data.video)
    assert.equal(data.video.author_name, 'TestCreator')
    assert.equal(data.video.author_handle, '@testcreator')
    assert.equal(data.video.caption, 'Full drama breakdown and analysis')
    assert.deepEqual(data.pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.ok(Array.isArray(data.shots) && data.shots.length >= 4)
    assert.ok(Array.isArray(data.structure) && data.structure.length >= 4)
  })

  it('saves native .vbreakdown artifact without HTML sandbox', async () => {
    const data = await extractVideoBreakdown('https://example.com/test.mp4')
    const destPrefix = join(tmpdir(), `test-breakdown-${Date.now()}`)

    const { dataPath } = saveVideoBreakdownArtifacts(data, destPrefix)
    assert.ok(existsSync(dataPath))
    assert.ok(dataPath.endsWith('.vbreakdown'))

    const parsedJson = JSON.parse(readFileSync(dataPath, 'utf8'))
    assert.equal(parsedJson.is_video_breakdown, true)
    assert.ok(Array.isArray(parsedJson.shots))

    // Cleanup
    rmSync(dataPath, { force: true })
  })

  it('registers and executes video_breakdown_analyze tool with native preview', async () => {
    const registeredTools = new Map()
    let sidebarOpenedWith = null

    const mockCtx = {
      tools: {
        register: (tool) => {
          registeredTools.set(tool.name, tool)
        },
        get: (name) => {
          if (name === 'sidebar_open') {
            return {
              execute: async ({ target, title }) => {
                sidebarOpenedWith = { target, title }
                return { delivered: true }
              },
            }
          }
          return registeredTools.get(name)
        },
      },
      inject: (deps, callback) => {
        callback({
          betterSidebar: {
            openTab: (tab) => {
              sidebarOpenedWith = tab
            },
          },
        })
      },
    }

    apply(mockCtx)

    assert.ok(registeredTools.has('video_breakdown_analyze'))
    const tool = registeredTools.get('video_breakdown_analyze')

    const outPrefix = join(tmpdir(), `test-tool-run-${Date.now()}`)
    const result = await tool.execute({
      url: 'https://www.tiktok.com/@test/video/1',
      dest: outPrefix,
      auto_open: true,
    })

    assert.equal(result.success, true)
    assert.equal(result.preview_opened, true)
    assert.ok(result.data_path.endsWith('.vbreakdown'))
    assert.ok(Array.isArray(result.shots))
    assert.ok(result.formatted_shots.length > 0)
    assert.ok(sidebarOpenedWith)
    assert.equal(sidebarOpenedWith.target, result.data_path)

    // Cleanup
    rmSync(result.data_path, { force: true })
  })
})
