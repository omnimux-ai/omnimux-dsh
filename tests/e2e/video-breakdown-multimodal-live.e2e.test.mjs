import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { apply as applyVideoPreview } from '../../plugins/omnimux-video-preview/src/index.js'
import { mountTextComplete } from '../../plugins/omnimux/src/text/mount.js'
import { DEFAULT_TEXT } from '../../plugins/omnimux/src/text/catalog.js'

describe('video_breakdown_analyze live multimodal E2E test', () => {
  it('analyzes sample video producing rich shots, speeches and ai_labeled flag', async () => {
    const videoPath = '/Users/x/Desktop/Project/OmniMux/.reports/tiktok-shop-related-videos/1733226176534972037/1-7683877248956583189-mike_dune.mp4'
    if (!existsSync(videoPath)) {
      console.log('Sample video not found, skipping live probe')
      return
    }

    let apiKey = ''
    try {
      const credsContent = readFileSync('/Users/x/.omnimux/.credentials.yaml', 'utf8')
      const match = credsContent.match(/OMNIMUX_API_KEY:\s*(\S+)/)
      if (match) apiKey = match[1]
    } catch {}

    if (!apiKey) {
      console.log('No OMNIMUX_API_KEY available, skipping live probe')
      return
    }

    const tools = new Map()
    const services = new Map()
    let sidebarTarget = null

    const ctx = {
      tools: {
        register: (t) => tools.set(t.name, t),
        get: (n) => tools.get(n),
      },
      provide: (name, val) => {
        services.set(name, val)
        ctx[name] = val
      },
      get: (n) => {
        if (n === 'credentials') {
          return { resolve: async (ref) => (ref === 'OMNIMUX_API_KEY' ? { value: apiKey } : undefined) }
        }
        return services.get(n) ?? ctx[n]
      },
      inject: (deps, cb) => {
        cb({
          betterSidebar: { openTab: (t) => { sidebarTarget = t } },
          textComplete: ctx.textComplete ?? services.get('textComplete'),
        })
      },
    }

    const hub = { text: DEFAULT_TEXT, gate: { tools: { omnimux_text_complete: true } } }
    mountTextComplete(ctx, hub, {}, () => {})
    applyVideoPreview(ctx)

    const tool = tools.get('video_breakdown_analyze')
    assert.ok(tool, 'video_breakdown_analyze must be registered')

    const outPrefix = join(tmpdir(), `test-live-run-${Date.now()}`)
    const result = await tool.execute({
      url: videoPath,
      dest: outPrefix,
      auto_open: false,
    })

    assert.equal(result.success, true)
    assert.equal(result.video.ai_labeled, true, 'Must be marked as AI labeled')
    assert.notEqual(result.video.title, '短视频分析', 'Title must be intelligently extracted from video')
    assert.ok(result.shots.length >= 4, 'Must have granular shots')
    assert.ok(result.structure.length >= 3, 'Must have narrative structure stages')

    // Verify speech extracted
    const speeches = result.shots.map((s) => s.speech).filter(Boolean)
    assert.ok(speeches.length >= 2, 'Must extract real spoken dialogue lines')

    console.log('[E2E Verified] Video Breakdown Live Success:')
    console.log(`- Title: ${result.video.title}`)
    console.log(`- AI Labeled: ${result.video.ai_labeled}`)
    console.log(`- Shots Count: ${result.shots.length}`)
    console.log(`- Speeches Extracted (${speeches.length}):`, speeches)

    // Cleanup
    if (result.data_path && existsSync(result.data_path)) {
      rmSync(result.data_path, { force: true })
    }
  })
})
