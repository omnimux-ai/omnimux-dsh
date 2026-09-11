import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  formatTime,
  formatTimeRange,
  formatShotsCopyText,
  formatScriptCopyText,
  canonicalizeCameraTags,
  mapToCanonicalStage,
  localizeStage,
  METADATA_HEADING_REGEX,
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

  it('guards against pure camera scale title and single-word motion description', () => {
    const rawTable = `
| 时间跨度 | 画面 | 运镜 |
| :--- | :--- | :--- |
| 0:00 - 0:02 | 全景 | 固定 |
| 0:02 - 0:05 | 特写 | 手持微动 |
    `
    const shots = parseShotsFromAnalyzeMarkdown(rawTable)
    assert.equal(shots.length, 2)
    assert.notEqual(shots[0].title, '全景')
    assert.ok(shots[0].tags.includes('全景'))
    assert.notEqual(shots[0].description, '固定')
    assert.match(shots[0].description, /细节与核心动作/)
  })

  it('accurately parses Chinese multi-stage lists and Cut numbered shot tables without falling back to raw scales', () => {
    const md = `
一、叙事结构拆解
 第一阶段：身份引入与场景确立（00:00 - 00:05）
  主角在停车场搬动座椅并坐下，自我介绍并宣布入选“雄鹿县先生”提名，通过快速跳切的多角度画面建立轻松幽默的基调。
 第二阶段：公益宣传与行动号召（00:05 - 00:15）
  背景皮卡反复驶过制造荒诞感，主角说明支持乳腺癌公益高尔夫活动，最后直视镜头呼吁观众点击链接支持。

二、逐镜头分镜脚本表
| 时间 | 镜头 | 景别 | 运镜方式 |
| 00:00 - 00:01 | **Cut 1** | 全景 | 手持微动 |
| 00:01 - 00:03 | **Cut 2** | 中景 | 手持微动 |
| 00:03 - 00:05 | **Cut 3** | 远景 | 手持微动 |
| 00:05 - 00:06 | **Cut 4** | 大远景 | 手持微动 |
| 00:06 - 00:08 | **Cut 5** | 中景 | 手持微动 |
| 00:08 - 00:09 | **Cut 6** | 中景 | 手持微动 |
| 00:09 - 00:11 | **Cut 7** | 中远景 | 手持微动 |
| 00:11 - 00:13 | **Cut 8** | 远景 | 手持微动 |
| 00:13 - 00:15 | **Cut 9** | 中景 | 手持微动 |
    `

    const { pipeline, structure, shots } = parsePipelineAndStructureFromMarkdown(md)
    assert.equal(structure.length, 2)
    assert.equal(structure[0].stage, '身份引入与场景确立')
    assert.match(structure[0].description, /搬动座椅并坐下/)
    assert.equal(structure[1].stage, '公益宣传与行动号召')
    assert.match(structure[1].description, /乳腺癌公益高尔夫活动/)
    assert.deepEqual(pipeline, ['身份引入与场景确立', '公益宣传与行动号召'])

    assert.equal(shots.length, 9)
    // Must NOT keep raw "**Cut 4**" or "大远景" as description
    assert.notEqual(shots[3].title, '**Cut 4**')
    assert.notEqual(shots[3].description, '大远景')
    assert.ok(shots[3].tags.includes('大远景'))
    assert.ok(shots[3].tags.includes('手持微动'))
    assert.ok(shots[3].description.length >= 20)
  })

  it('parses 6-column markdown table with speech and formats script copy text', () => {
    const md = `
## 3. 逐镜头分镜脚本表 (Shot Breakdown Table)
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 0:00 - 0:01 | 敲门准备 | Hook | 中景, 智能手机手持, 平视, 手持微动 | 室内玄关，灰色大门紧闭，地面有门垫。一名男子身穿深蓝色长袖T恤和卡其色裤子，正走向房门准备开门。 | Hold on, I'm coming! |
| 0:01 - 0:02 | 开门瞬间 | Hook | 中景, 智能手机手持, 平视, 手持微动 | 男子猛地拉开大门，门后密密麻麻堆满了标有'CELLULAR DASH CAM'的蓝色快递纸箱。 | (无) |
| 0:04 - 0:05 | 朋友出现 | Demo Scene | 中景, 智能手机手持, 平视, 手持微动 | 门外出现四位朋友（两男两女），微笑着看着满地的纸箱，其中一名女子张开双臂。 | Surprise! |
    `
    const { shots } = parsePipelineAndStructureFromMarkdown(md)
    assert.equal(shots.length, 3)
    assert.equal(shots[0].title, '敲门准备')
    assert.equal(shots[0].speech, "Hold on, I'm coming!")
    assert.equal(shots[1].speech, '')
    assert.equal(shots[2].speech, 'Surprise!')

    const scriptText = formatScriptCopyText(shots)
    assert.match(scriptText, /Hold on, I'm coming!/)
    assert.match(scriptText, /Surprise!/)

    const shotsText = formatShotsCopyText(shots)
    assert.match(shotsText, /台词：Hold on, I'm coming!/)
  })

  it('canonicalizes slash-separated or compound tags into 4 orthogonal dimensions', () => {
    // 1. Slash compound tags
    const tags1 = canonicalizeCameraTags(['全景 / 固定镜头'])
    assert.deepEqual(tags1, ['全景', '固定机位', '平视', '固定镜头'])

    const tags2 = canonicalizeCameraTags(['中景 / 车内仰拍'])
    assert.deepEqual(tags2, ['中景', '车载机位', '仰视', '手持微动'])

    const tags3 = canonicalizeCameraTags(['特写 / 快速俯拍'])
    assert.deepEqual(tags3, ['特写', '智能手机手持', '俯视', '手持微动'])

    const tags4 = canonicalizeCameraTags(['全景 / 平视跟随 / 室内玄关'])
    assert.deepEqual(tags4, ['全景', '智能手机手持', '平视', '跟随镜头'])

    // 2. Standard 4 comma-separated tags
    const tags5 = canonicalizeCameraTags('特写, 智能手机手持, 俯视, 手持微动')
    assert.deepEqual(tags5, ['特写', '智能手机手持', '俯视', '手持微动'])
  })

  it('accurately normalizes Chinese verbose stages into canonical 4-stage structure with 1:1 pipeline alignment', () => {
    const md = `
## 1. 叙事结构链路 (Narrative Pipeline)
吸睛引发惊喜（多盒产品堆叠倒塌 → 产品开箱与实车安装 → 手机端实时画面体验与惊叹 → 核心卖点演示与产品特写定格

## 2. 结构阶段解构 (Stage Breakdown)

第一阶段：趣味吸睛与场景引入
通过敲门和开门后整堵行车记录仪包装盒墙倒塌的夸张惊喜场景，迅速抓住观众注意力，引出核心产品。

第二阶段：开箱与实车安装
男主角拆箱并与好友一同查看安装在汽车后视镜旁的行车记录仪，好友引导其打开手机 App 体验。

第三阶段：功能演示与实时监控
男主角在车内通过手机 App 查看实时多路车况监控画面，直观展现多角度远程查看功能。

第四阶段：产品定格与品牌展示
手机端界面特写与行车记录仪硬件特写呈现，配合旁白传达产品型号（DC22）与核心价值。

## 3. 逐镜头分镜脚本表
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 |
| 0:00 - 0:05 | 惊喜整蛊入场 | 第一阶段：趣味吸睛与场景引入 | 全景 / 固定镜头 | 男主听到敲门开门，门后堆叠成墙的行车记录仪包装盒倾倒，门外好友齐呼惊喜。 |
| 0:05 - 0:06 | 拆箱查看硬件 | 第二阶段：开箱与实车安装 | 中景 / 快速俯拍 | 男主坐在地上的包装堆中，快速拆开行车记录仪包装盒检查产品。 |
| 0:06 - 0:08 | 实车安装与提示 | 第二阶段：开箱与实车安装 | 中景 / 车内仰拍 | 安装在挡风玻璃上的记录仪与车外三人，好友伸手示意并提醒男主查看手机App。 |
    `

    const { pipeline, structure, shots } = parsePipelineAndStructureFromMarkdown(md)

    // Pipeline must be exactly 4 clean items, no duplicates, matching Image 1
    assert.deepEqual(pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.equal(structure.length, 4)
    assert.equal(structure[0].stage, 'Hook')
    assert.equal(structure[0].title, 'Hook')
    assert.match(structure[0].description, /包装盒墙倒塌/)
    assert.equal(structure[1].stage, 'Product Intro')
    assert.equal(structure[2].stage, 'Usage Detail')
    assert.equal(structure[3].stage, 'Demo Scene')

    // Shots must have 4 orthogonal tags each
    assert.equal(shots.length, 3)
    assert.equal(shots[0].stage, 'Hook')
    assert.deepEqual(shots[0].tags, ['全景', '固定机位', '平视', '固定镜头'])
    assert.deepEqual(shots[1].tags, ['中景', '智能手机手持', '俯视', '手持微动'])
    assert.deepEqual(shots[2].tags, ['中景', '车载机位', '仰视', '手持微动'])
  })

  it('localizes stage names cleanly according to DSH locale (zh vs en)', () => {
    // 1. Chinese locale
    assert.equal(localizeStage('Hook', true), '黄金钩子')
    assert.equal(localizeStage('Product Intro', true), '产品引入')
    assert.equal(localizeStage('Usage Detail', true), '使用细节')
    assert.equal(localizeStage('Demo Scene', true), '场景演示')
    assert.equal(localizeStage('Call to Action', true), '行动号召')
    assert.equal(localizeStage('Climax', true), '剧情高潮')

    // 2. English locale
    assert.equal(localizeStage('Hook', false), 'Hook')
    assert.equal(localizeStage('Product Intro', false), 'Product Intro')
    assert.equal(localizeStage('黄金钩子', false), 'Hook')
    assert.equal(localizeStage('产品引入', false), 'Product Intro')
    assert.equal(localizeStage('使用细节', false), 'Usage Detail')
    assert.equal(localizeStage('场景演示', false), 'Demo Scene')
  })

  it('filters out metadata section headings from structure and pipeline', () => {
    const mdWithMeta = `
## 1. 叙事结构链路
Hook → Product Intro → Usage Detail → Demo Scene

## 2. 结构阶段解构
### 叙事结构链路
Hook → Product Intro → Usage Detail → Demo Scene

### 结构阶段解构
### Hook
展示爱犬在车座上酣睡，背上配有自动安抚拍打器，配合趣味文案吸引宠物主人的注意。

### Product Intro
切换至户外场景，展示产品固定在宠物肚皮上持续轻柔拍打的形态，引出产品核心功能。

### Usage Detail
展示产品在不同日常场景（室内沙发、阳台垫子）中的佩戴与自动拍打安抚细节。

### Demo Scene
综合展示多场景下爱犬在拍打器安抚中舒适熟睡的画面，并引导观众互动评论。

## 3. 逐镜头分镜脚本表
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 |
| 0:00 - 0:01 | 车载熟睡安抚 | Hook | 中近景 / 车载机位 / 俯视 / 手持微动 | 小狗蜷缩在汽车副驾座椅上安睡。 |
    `

    const { pipeline, structure, shots } = parsePipelineAndStructureFromMarkdown(mdWithMeta)

    // Must NOT contain metadata titles like "叙事结构链路" or "结构阶段解构"
    assert.ok(!pipeline.includes('叙事结构链路'))
    assert.ok(!pipeline.includes('结构阶段解构'))
    assert.ok(!structure.some((s) => s.stage === '叙事结构链路' || s.title === '叙事结构链路'))
    assert.ok(!structure.some((s) => s.stage === '结构阶段解构' || s.title === '结构阶段解构'))

    // Must cleanly have the 4 stages
    assert.deepEqual(pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.equal(structure.length, 4)
    assert.equal(structure[0].stage, 'Hook')
    assert.equal(structure[1].stage, 'Product Intro')
    assert.equal(structure[2].stage, 'Usage Detail')
    assert.equal(structure[3].stage, 'Demo Scene')

    assert.equal(shots.length, 1)
    assert.deepEqual(shots[0].tags, ['中近景', '车载机位', '俯视', '手持微动'])
  })

  it('parses and standardizes 3-stage dynamic pipeline matching benchmark Image 1', () => {
    const md = `
## 1. 叙事结构链路 (Narrative Pipeline)
Hook → Demo Scene → Cta

## 2. 结构阶段解构 (Stage Breakdown)

### Hook
视频开场通过对比文字抛出一个引人共鸣的话题，结合可爱的小腊肠犬背着绿色小背包睡觉的画面，迅速抓取观众的注意力，激发宠物爱好者的情感共鸣。

### Demo Scene
展示小狗在不同场景下（车内、沙发上、地毯上）使用绿色小背包的各种可爱睡姿，直观展现产品的可爱外观与伴侣属性，加深用户的情感连接。

### Cta
通过屏幕上显眼的互动提示，引导观众在评论区输入特定关键词，从而提高视频的互动率和评论量，促进转化。

## 3. 逐镜头分镜脚本表 (Shot Breakdown Table)
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |
| 0:00 - 0:01 | 车载熟睡安抚 | Hook | 中近景, 车载机位, 俯视, 手持微动 | 画面描述 | 🗣️: Es solamente un perro... |
| 0:01 - 0:05 | 户外仰卧拍抚 | Demo Scene | 特写, 固定机位, 平视, 固定镜头 | 画面描述 | 🗣️: Es solamente un perro... |
| 0:05 - 0:06 | 沙发安抚引导 | Cta | 中景, 固定机位, 平视, 固定镜头 | 画面描述 | ¡Comenta "perro" si a tu mascota le gustaría esto! 🥹❤️ |
    `

    const { pipeline, structure, shots } = parsePipelineAndStructureFromMarkdown(md)

    assert.deepEqual(pipeline, ['Hook', 'Demo Scene', 'Cta'])
    assert.equal(structure.length, 3)
    assert.equal(structure[0].stage, 'Hook')
    assert.equal(structure[0].title, 'Hook')
    assert.match(structure[0].description, /视频开场通过对比文字抛出/)
    assert.equal(structure[1].stage, 'Demo Scene')
    assert.equal(structure[1].title, 'Demo Scene')
    assert.match(structure[1].description, /展示小狗在不同场景下/)
    assert.equal(structure[2].stage, 'Cta')
    assert.equal(structure[2].title, 'Cta')
    assert.match(structure[2].description, /通过屏幕上显眼的互动提示/)

    assert.equal(shots.length, 3)
    assert.equal(shots[0].stage, 'Hook')
    assert.equal(shots[1].stage, 'Demo Scene')
    assert.equal(shots[2].stage, 'Cta')
  })

  it('accurately recovers from degenerate single-header and filters repeated phantom table headers', () => {
    const md = `
## 1. 叙事结构链路
Hook

## 2. 结构阶段解构
### Hook
---
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |
| 0:00 - 0:03 | 揭布倒计时悬念 | Hook | 中景, 固定机位, 平视, 固定镜头 | 倒计时数字跳动，双手迅速掀开托盘上的粉色绸布，露出“Book Guardian”产品盒。 | Every book lover needs this to protect their libraries 😂📚<br>3, 2, 1 |
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |
| 0:03 - 0:05 | 开盒取出骑士雕像 | Product Intro | 特写, 智能手机手持, 俯视, 手持微动 | 伸手从黑色礼盒与衬纸中取出看书姿态的金属质感骑士雕塑。 | Every book lover needs this to protect their libraries 😂📚 |
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |
| 0:05 - 0:07 | 靠书摆放调试位置 | Usage Detail | 特写, 智能手机手持, 平视, 手持微动 | 手持骑士雕塑将其置于白色书架，倚靠在整齐排列的书籍侧面。 | Every book lover needs this to protect their libraries 😂📚 |
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 | 台词/字幕 |
| 0:07 - 0:10 | 多风格书架场景陈列 | Demo Scene | 中景, 智能手机手持, 平视, 手持微动 | 连续展示骑士雕塑在浅色系与复古暗调暖光书架上的静物装饰氛围。 | Every book lover needs this to protect their libraries 😂📚 |
    `

    const { pipeline, structure, shots } = parsePipelineAndStructureFromMarkdown(md)

    // Must filter phantom header rows and have exactly 4 shots
    assert.equal(shots.length, 4)
    assert.ok(!shots.some(s => s.title === '分镜标题' || s.stage === '所属阶段'))
    assert.equal(shots[0].title, '揭布倒计时悬念')
    assert.equal(shots[0].stage, 'Hook')
    assert.equal(shots[1].title, '开盒取出骑士雕像')
    assert.equal(shots[1].stage, 'Product Intro')
    assert.equal(shots[2].title, '靠书摆放调试位置')
    assert.equal(shots[2].stage, 'Usage Detail')
    assert.equal(shots[3].title, '多风格书架场景陈列')
    assert.equal(shots[3].stage, 'Demo Scene')

    // Must reconstruct all 4 stages in pipeline and structure, with rich non-empty descriptions
    assert.deepEqual(pipeline, ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene'])
    assert.equal(structure.length, 4)
    for (const item of structure) {
      assert.ok(item.description && item.description.length > 5)
      assert.notEqual(item.description, '---')
    }
  })
})
