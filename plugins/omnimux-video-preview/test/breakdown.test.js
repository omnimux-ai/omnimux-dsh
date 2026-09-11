import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  formatTime,
  formatTimeRange,
  formatShotsCopyText,
  parseShotsFromAnalyzeMarkdown,
  parseStructureFromAnalyzeMarkdown,
  parsePipelineAndStructureFromMarkdown,
  executeDedicatedStructureAnalyze,
  BUNDLED_STRUCTURE_PROMPT,
  normalizeSocialMetadata,
  resolveWorkspaceDirectory,
  extractVideoBreakdown,
  saveVideoBreakdownArtifacts,
  generateAdaptiveShotsAndStructure,
} from '../src/breakdown.js'
import { apply } from '../src/index.js'
import { createTestToolContext } from '../../omnimux/src/test-support/tool-harness.js'

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
    let sidebarOpenedWith = null
    const toolHarness = createTestToolContext()

    const mockCtx = {
      tools: {
        register: (tool) => toolHarness.ctx.tools.register(tool),
        get: (name) => {
          if (name === 'sidebar_open') {
            return {
              execute: async ({ target, title }) => {
                sidebarOpenedWith = { target, title }
                return { delivered: true }
              },
            }
          }
          return toolHarness.ctx.tools.get(name)
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

    assert.ok(toolHarness.tools.has('video_preview_info'))
    const previewInfoTool = toolHarness.tools.get('video_preview_info')
    assert.ok(previewInfoTool.output)
    assert.equal(typeof previewInfoTool.output.render, 'function')

    assert.ok(toolHarness.tools.has('video_breakdown_analyze'))
    const tool = toolHarness.tools.get('video_breakdown_analyze')
    assert.ok(tool.output)
    assert.equal(typeof tool.output.render, 'function')

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

  it('normalizes TikTok aweme_detail structure into unified metadata', () => {
    const rawAweme = {
      aweme_detail: {
        desc: '#SentAsASacrificeSheBecameTheQueen 🌟 Continue the story here',
        author: {
          nickname: 'Chelsea',
          unique_id: 'jamiezdac1v',
          avatar_thumb: {
            url_list: ['https://p19.tiktokcdn-us.com/avatar.jpeg'],
          },
        },
        video: {
          duration: 22000,
          cover: {
            url_list: ['https://p19.tiktokcdn-us.com/cover.jpeg'],
          },
          play_addr: {
            url_list: ['https://v16m.tiktokcdn-us.com/video.mp4'],
          },
        },
        statistics: {
          digg_count: 12364,
          comment_count: 92,
          share_count: 2234,
          play_count: 948734,
        },
      },
    }

    const normalized = normalizeSocialMetadata(rawAweme)
    assert.ok(normalized)
    assert.equal(normalized.title, '#SentAsASacrificeSheBecameTheQueen 🌟 Continue the story here')
    assert.equal(normalized.author.name, 'Chelsea')
    assert.equal(normalized.author.handle, '@jamiezdac1v')
    assert.equal(normalized.author.avatar, 'https://p19.tiktokcdn-us.com/avatar.jpeg')
    assert.equal(normalized.cover_url, 'https://p19.tiktokcdn-us.com/cover.jpeg')
    assert.equal(normalized.video_url, 'https://v16m.tiktokcdn-us.com/video.mp4')
    assert.equal(normalized.duration, 22)
    assert.equal(normalized.stats.likes, 12364)
    assert.equal(normalized.stats.comments, 92)
    assert.equal(normalized.stats.shares, 2234)
    assert.equal(normalized.stats.views, 948734)
  })

  it('extracts breakdown accurately when omnimux_social_data provides aweme_detail', async () => {
    const rawAwemeData = {
      aweme_detail: {
        desc: 'Viral Product Showcase',
        author: {
          nickname: 'TechReviewer',
          unique_id: 'tech_reviewer',
          avatar_thumb: { url_list: ['https://example.com/avatar.jpg'] },
        },
        video: {
          duration: 20000,
          cover: { url_list: ['https://example.com/cover.jpg'] },
          play_addr: { url_list: ['https://example.com/video.mp4'] },
        },
        statistics: {
          digg_count: 8888,
          comment_count: 66,
          share_count: 120,
          play_count: 500000,
        },
      },
    }

    const mockCtx = {
      tools: {
        get: (name) => {
          if (name === 'omnimux_social_data') {
            return {
              execute: async () => ({
                platform: 'tiktok',
                capability: 'video',
                data: rawAwemeData,
              }),
            }
          }
          return null
        },
      },
    }

    const result = await extractVideoBreakdown('https://www.tiktok.com/@tech_reviewer/video/789', {
      ctx: mockCtx,
    })

    assert.equal(result.is_video_breakdown, true)
    assert.equal(result.video.title, 'Viral Product Showcase')
    assert.equal(result.video.author_name, 'TechReviewer')
    assert.equal(result.video.author_handle, '@tech_reviewer')
    assert.equal(result.video.views, '500000')
    assert.equal(result.video.likes, '8888')
    assert.equal(result.video.duration_seconds, 20)
    assert.equal(result.video.duration_text, '0:20')
    assert.ok(result.shots.length >= 4)
    assert.match(result.shots[0].description, /Viral Product Showcase/)
  })

  it('saves breakdown artifact to workspace directory when workspace context exists', () => {
    const fakeWorkspaceDir = join(tmpdir(), `test-ws-${Date.now()}`)
    mkdirSync(fakeWorkspaceDir, { recursive: true })

    const sampleData = {
      is_video_breakdown: true,
      video: { title: 'Workspace Test Video' },
      shots: [],
    }

    const resolved = resolveWorkspaceDirectory({ execCtx: { workdir: fakeWorkspaceDir } })
    assert.equal(resolved, fakeWorkspaceDir)

    const { dataPath } = saveVideoBreakdownArtifacts(sampleData, null, {
      execCtx: { workdir: fakeWorkspaceDir },
    })

    assert.ok(dataPath.startsWith(fakeWorkspaceDir))
    assert.ok(dataPath.includes('.omnimux/breakdowns'))
    assert.ok(existsSync(dataPath))

    rmSync(fakeWorkspaceDir, { recursive: true, force: true })
  })

  it('mounts webServer video stream route using standard DSH webServer.register contract', async () => {
    let registeredRoute = null
    const toolHarness = createTestToolContext()

    const mockCtx = {
      tools: {
        register: (tool) => toolHarness.ctx.tools.register(tool),
        get: () => null,
      },
      inject: (deps, callback) => {
        if (deps.includes('webServer')) {
          callback({
            webServer: {
              register: (routeSpec) => {
                registeredRoute = routeSpec
                return () => {}
              },
            },
          })
        }
      },
    }

    apply(mockCtx)

    assert.ok(registeredRoute)
    assert.equal(registeredRoute.kind, 'prefix')
    assert.equal(registeredRoute.path, '/omnimux/video-preview/stream')
    assert.equal(typeof registeredRoute.handler, 'function')

    // Verify handler responds to mock stream request
    const dummyVideoPath = join(tmpdir(), `test-stream-${Date.now()}.mp4`)
    writeFileSync(dummyVideoPath, Buffer.alloc(1024, 0x42))

    let responseStatusCode = 0
    const responseHeaders = {}
    let finishPromiseResolve
    const finishPromise = new Promise((res) => { finishPromiseResolve = res })

    const mockRes = {
      writeHead: (code, headers) => {
        responseStatusCode = code
        Object.assign(responseHeaders, headers)
      },
      write: () => {},
      end: () => finishPromiseResolve?.(),
      on: (event, cb) => {
        if (event === 'finish' || event === 'close') finishPromiseResolve?.()
      },
      once: () => {},
      emit: () => {},
    }

    const mockReq = {
      url: `/omnimux/video-preview/stream?path=${encodeURIComponent(dummyVideoPath)}`,
      headers: { range: 'bytes=0-100' },
      on: () => {},
    }

    await registeredRoute.handler(mockReq, mockRes)
    await Promise.race([finishPromise, new Promise((r) => setTimeout(r, 200))])

    assert.equal(responseStatusCode, 206)
    assert.equal(responseHeaders['Content-Range'], 'bytes 0-100/1024')
    assert.equal(responseHeaders['Content-Type'], 'video/mp4')

    rmSync(dummyVideoPath, { force: true })
  })

  it('does not throw "cannot get property sessions without inject" when called with un-injected context', async () => {
    const toolHarness = createTestToolContext()

    // Create a strict Cordis-like proxy that throws when accessing un-injected properties
    const strictCtx = new Proxy(
      {
        tools: toolHarness.ctx.tools,
        get: (name) => {
          if (name === 'tools') return toolHarness.ctx.tools
          return null
        },
      },
      {
        get(target, prop) {
          if (prop === 'sessions') {
            throw new Error('cannot get property "sessions" without inject')
          }
          if (prop === 'webServer') {
            throw new Error('cannot get property "webServer" without inject')
          }
          return target[prop]
        },
      },
    )

    apply(strictCtx)

    const tool = toolHarness.tools.get('video_breakdown_analyze')
    assert.ok(tool)

    const outPrefix = join(tmpdir(), `test-inject-guard-${Date.now()}`)
    const execCtx = {
      agent: {
        session: {
          id: 'test-session',
          header: { cwd: tmpdir() },
        },
      },
    }

    // Must execute successfully without throwing cannot get property "sessions" without inject
    const result = await tool.execute(
      {
        url: 'https://www.tiktok.com/@test/video/1',
        dest: outPrefix,
        auto_open: false,
      },
      execCtx,
    )

    assert.equal(result.success, true)
    assert.ok(existsSync(result.data_path))
    rmSync(result.data_path, { force: true })
  })

  it('generates 4 shots for short videos (<= 60s)', () => {
    const { shots, structure, pipeline } = generateAdaptiveShotsAndStructure(15, 'Short promo')
    assert.equal(shots.length, 4)
    assert.equal(structure.length, 4)
    assert.deepEqual(pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.equal(shots[0].stage, 'Hook')
    assert.equal(shots[shots.length - 1].end_seconds, 15)
  })

  it('generates 6 shots for mid-length videos (60s - 180s)', () => {
    const { shots, structure, pipeline } = generateAdaptiveShotsAndStructure(120, 'Tutorial video')
    assert.equal(shots.length, 6)
    assert.equal(structure.length, 4)
    assert.deepEqual(pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.equal(shots[0].stage, 'Hook')
    assert.equal(shots[shots.length - 1].end_seconds, 120)
  })

  it('generates 12-16 rich dramatic beat shots for long videos (> 180s, e.g. 20-min short drama)', () => {
    const dur20Min = 1241 // ~20.6 minutes
    const caption = '#SentAsASacrificeSheBecameTheQueen #MoboReels search for 254GLZ'
    const { shots, structure, pipeline } = generateAdaptiveShotsAndStructure(dur20Min, caption, 'tiktok')

    // Must have 10-16 shots rather than 4 static shots
    assert.ok(shots.length >= 10 && shots.length <= 16, `expected 10-16 shots, got ${shots.length}`)
    assert.ok(structure.length >= 6)
    assert.ok(pipeline.includes('Inciting Incident'))
    assert.ok(pipeline.includes('Plot Twist'))
    assert.ok(pipeline.includes('Cliffhanger'))

    // Pacing must be dramatic beats (around 60s-100s per shot), never 4-6 minutes per shot
    const maxShotDuration = Math.max(...shots.map((s) => s.end_seconds - s.start_seconds))
    assert.ok(maxShotDuration <= 120, `max shot duration should be <= 120s for dramatic beats, got ${maxShotDuration}s`)
    assert.equal(shots[0].start_seconds, 0)
    assert.equal(shots[shots.length - 1].end_seconds, dur20Min)
    assert.match(shots[0].title, /黄金开局/)
  })

  it('loads dedicated structure breakdown prompt and verifies system rules', () => {
    assert.ok(existsSync(BUNDLED_STRUCTURE_PROMPT), 'dedicated prompt file must exist')
    const promptContent = readFileSync(BUNDLED_STRUCTURE_PROMPT, 'utf8')
    assert.match(promptContent, /Video Narrative Structure Architect/)
    assert.match(promptContent, /动态结构提炼/)
    assert.match(promptContent, /针对每个结构阶段深度描述/)
    assert.match(promptContent, /逐镜头分镜脚本表/)
  })

  it('parses two-step narrative pipeline and stage breakdown from dedicated prompt output', () => {
    const md = `
## 1. 叙事结构链路 (Narrative Pipeline)
Hook → Product Intro → Usage Detail → Demo Scene

## 2. 结构阶段解构 (Stage Breakdown)

### Hook
视频开场直接展示充满心形木质雕刻礼物的礼盒，配上走心的文案，迅速抓住观众眼球，传达治愈与放松的焦虑缓解主题。

### Product Intro
全景展示藤编篮子里满满的礼盒与心形木片，呈现丰富的产品种类和精致的包装细节，突出送礼与收藏的价值感。

### Usage Detail
特写展示礼盒内部的文字、卡片以及精致的心形小物件，体现产品的细节工艺和情感传递功能。

### Demo Scene
展示将心形木质饰品摆放在桌面上、搭配笔记本与绿植的实际使用场景，激发观众的购买欲和生活美学共鸣。

## 3. 逐镜头分镜脚本表 (Shot Breakdown Table)
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 |
| :--- | :--- | :--- | :--- | :--- |
| 0:00 - 0:01 | 开场礼盒展示 | Hook | 特写, 智能手机手持, 俯视, 手持微动 | 温暖色调的背景中，一只双手正缓缓打开纸质礼盒... |
| 0:01 - 0:03 | 礼盒全景与藤篮 | Product Intro | 中景, 智能手机手持, 俯视, 手持平移 | 镜头切换到一个摆放着大量精致包装礼盒的白色藤编篮子... |
| 0:03 - 0:04 | 心形木片特写 | Product Intro | 特写, 智能手机手持, 俯视, 手持微动 | 木盘内装满了各种颜色和字体的心形木质雕刻饰品... |
| 0:04 - 0:07 | 展示礼盒内部说明 | Usage Detail | 特写, 智能手机手持, 俯视, 手持微动 | 双手打开一个带有拉菲草垫的小礼盒，盒盖内侧印有鼓励话语... |
| 0:07 - 0:10 | 翻转礼盒展示文字 | Demo Scene | 特写, 智能手机手持, 俯视, 手持微动 | 双手翻转礼盒底部，展示印有诗篇与正能量词汇的设计... |
    `

    const { pipeline, structure, shots } = parsePipelineAndStructureFromMarkdown(md)
    assert.deepEqual(pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.equal(structure.length, 4)
    assert.equal(structure[0].stage, 'Hook')
    assert.match(structure[0].description, /视频开场直接展示/)
    assert.equal(structure[1].stage, 'Product Intro')
    assert.match(structure[1].description, /全景展示藤编篮子/)
    assert.equal(structure[2].stage, 'Usage Detail')
    assert.match(structure[2].description, /特写展示礼盒内部/)
    assert.equal(structure[3].stage, 'Demo Scene')
    assert.match(structure[3].description, /展示将心形木质饰品摆放/)

    assert.equal(shots.length, 5)
    assert.equal(shots[0].start_seconds, 0)
    assert.equal(shots[0].end_seconds, 1)
    assert.equal(shots[0].time_range, '0:00 - 0:01')
    assert.equal(shots[0].title, '开场礼盒展示')
    assert.equal(shots[0].stage, 'Hook')
    assert.ok(shots[0].tags.includes('特写'))
    assert.ok(shots[0].tags.includes('智能手机手持'))
  })
})
