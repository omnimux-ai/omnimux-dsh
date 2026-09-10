import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  formatTime,
  formatTimeRange,
  formatShotsCopyText,
  extractVideoBreakdown,
  saveVideoBreakdownArtifacts,
} from '../src/breakdown.js'
import { generateBreakdownHtml } from '../src/html-template.js'
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
        tags: ['↗ 特写', '📷 智能手机手持'],
        description: '木盘内装满圆形木质饰品',
      },
    ]
    const text = formatShotsCopyText(shots)
    assert.match(text, /0:03 - 0:04 心形木片特写 \[Product Intro\]/)
    assert.match(text, /属性：↗ 特写 \| 📷 智能手机手持/)
    assert.match(text, /描述：木盘内装满圆形木质饰品/)
  })

  it('extracts structured video breakdown from URL', async () => {
    const data = await extractVideoBreakdown('https://www.tiktok.com/@lilyrosesharing/video/123456789')
    assert.equal(data.is_video_breakdown, true)
    assert.equal(data.schema_version, '1.0.0')
    assert.ok(data.video)
    assert.equal(data.video.author_name, 'LilyRose-sharing')
    assert.equal(data.video.author_handle, '@lilyrosesharing')
    assert.deepEqual(data.pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.ok(Array.isArray(data.shots) && data.shots.length >= 5)
    assert.ok(Array.isArray(data.structure) && data.structure.length >= 4)

    // Verify first shot matches user specification
    const firstShot = data.shots[0]
    assert.equal(firstShot.time_range, '0:03 - 0:04')
    assert.equal(firstShot.title, '心形木片特写')
    assert.equal(firstShot.stage, 'Product Intro')
    assert.ok(firstShot.tags.includes('特写'))
    assert.ok(firstShot.tags.includes('智能手机手持'))
    assert.ok(firstShot.description.includes('木盘内装满了各种颜色和字体'))

    // Verify structural stage content
    const hook = data.structure.find(s => s.stage === 'Hook')
    assert.ok(hook)
    assert.ok(hook.description.includes('充满心形木质雕刻礼物的礼盒'))
  })

  it('generates pixel-perfect standalone HTML preview', () => {
    const mockData = {
      video: {
        title: 'Test Video',
        author_name: 'Creator',
        author_handle: '@creator',
        stream_url: 'http://localhost/stream.mp4',
        duration_text: '0:17',
      },
      pipeline: ['Hook', 'Product Intro'],
      shots: [
        {
          id: 's1',
          time_range: '0:00 - 0:03',
          title: '开场镜头',
          stage: 'Hook',
          tags: ['↗ 全景'],
          description: '开场全景画面',
        },
      ],
      structure: [
        {
          stage: 'Hook',
          title: 'Hook',
          description: '抓取注意力',
        },
      ],
    }
    const html = generateBreakdownHtml(mockData)
    assert.ok(html.includes('<!DOCTYPE html>'))
    assert.ok(html.includes('视频分析'))
    assert.ok(html.includes('开场镜头'))
    assert.ok(html.includes('Hook'))
    assert.ok(html.includes('复制分镜'))
    assert.ok(html.includes('switchTab'))
  })

  it('saves dual artifacts (.vbreakdown.json & .vbreakdown.html)', async () => {
    const data = await extractVideoBreakdown('https://example.com/test.mp4')
    const destPrefix = join(tmpdir(), `test-breakdown-${Date.now()}`)

    const { jsonPath, htmlPath } = saveVideoBreakdownArtifacts(data, destPrefix)
    assert.ok(existsSync(jsonPath))
    assert.ok(existsSync(htmlPath))

    const parsedJson = JSON.parse(readFileSync(jsonPath, 'utf8'))
    assert.equal(parsedJson.is_video_breakdown, true)

    const htmlContent = readFileSync(htmlPath, 'utf8')
    assert.ok(htmlContent.includes('<!DOCTYPE html>'))

    // Cleanup
    rmSync(jsonPath, { force: true })
    rmSync(htmlPath, { force: true })
  })

  it('registers and executes video_breakdown_analyze tool', async () => {
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
    assert.ok(result.json_path.endsWith('.vbreakdown.json'))
    assert.ok(result.html_path.endsWith('.vbreakdown.html'))
    assert.ok(Array.isArray(result.shots))
    assert.ok(result.formatted_shots.length > 0)
    assert.ok(sidebarOpenedWith)
    assert.equal(sidebarOpenedWith.target, result.html_path)

    // Cleanup
    rmSync(result.json_path, { force: true })
    rmSync(result.html_path, { force: true })
  })
})
