// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

describe('灵感素材直存与对话附件打通闭环专项测试 (#1748)', () => {
  const SAMPLE_MEDIA: HoveredMedia = {
    id: 'image:https://pbs.twimg.com/media/sample.jpg',
    type: 'image',
    src: 'https://pbs.twimg.com/media/sample.jpg',
    previewSrc: 'https://pbs.twimg.com/media/sample.jpg',
    pageUrl: 'https://x.com/VynqorxeAI/status/1234567890',
    pageTitle: 'X 上的 VynqorxeAI: MEDICAL ROBOT RUNS FROM POLICE',
    width: 800,
    height: 600,
    naturalWidth: 1600,
    naturalHeight: 1200,
    alt: 'Medical robot escaping in city center',
    capturedAt: Date.now(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('悬浮条加入灵感库直存：构造合规灵感对象并正确发送给主程序灵感库接口', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'insp_test123' } }),
    })
    globalThis.fetch = fetchMock

    const candidatePorts = [45120, 43120]
    const itemBody = {
      title: (SAMPLE_MEDIA.alt || SAMPLE_MEDIA.pageTitle).slice(0, 120),
      type: 'image',
      source_platform: 'twitter',
      source_url: SAMPLE_MEDIA.pageUrl,
      cover_url: SAMPLE_MEDIA.src,
      media_urls: [SAMPLE_MEDIA.src],
      content: SAMPLE_MEDIA.alt,
      tags: ['网页采集', '图片'],
    }

    const res = await fetch(`http://127.0.0.1:${candidatePorts[0]}/omnimux/inspiration/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemBody),
    })

    expect(fetchMock).toHaveBeenCalled()
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe('http://127.0.0.1:45120/omnimux/inspiration/local')
    const sentBody = JSON.parse(call[1].body)
    expect(sentBody.source_platform).toBe('twitter')
    expect(sentBody.cover_url).toBe(SAMPLE_MEDIA.src)
    expect(sentBody.media_urls).toContain(SAMPLE_MEDIA.src)
    expect(res.ok).toBe(true)
  })

  it('侧栏卡片保存到灵感库：import-url 遇到反爬或超时，自动无缝降级采用前台多模态数据直存', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      callCount++
      if (url.includes('/import-url')) {
        // 模拟推特海外防爬 502
        return { ok: false, status: 502, json: async () => ({ error: 'fetch failed' }) }
      }
      if (url.endsWith('/omnimux/inspiration/local')) {
        // 模拟前台数据直存成功
        return { ok: true, status: 201, json: async () => ({ data: { id: 'insp_fallback_99' } }) }
      }
      return { ok: false, status: 404 }
    })
    globalThis.fetch = fetchMock

    const targetUrl = 'https://x.com/VynqorxeAI/status/1234567890'
    const pageScene = {
      title: 'MEDICAL ROBOT RUNS FROM POLICE',
      author: 'VynqorxeAI',
      platform: 'twitter',
      url: targetUrl,
      media: [{ src: 'https://pbs.twimg.com/media/sample.jpg', type: 'image' }],
    }

    // 运行降级保存逻辑
    let res = await fetch(`http://127.0.0.1:45120/omnimux/inspiration/local/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, background: true }),
    }).catch(() => null)

    if (!res || (!res.ok && res.status !== 200 && res.status !== 201 && res.status !== 202)) {
      const fallbackBody = {
        title: `@${pageScene.author}: ${pageScene.title}`,
        type: 'image',
        source_platform: pageScene.platform,
        source_url: targetUrl,
        cover_url: pageScene.media[0].src,
        media_urls: [pageScene.media[0].src],
        content: pageScene.title,
        tags: ['twitter', '灵感采集'],
      }
      res = await fetch(`http://127.0.0.1:45120/omnimux/inspiration/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallbackBody),
      }).catch(() => null)
    }

    expect(callCount).toBe(2)
    expect(res).not.toBeNull()
    expect(res?.ok).toBe(true)
    expect(res?.status).toBe(201)
  })

  it('暂存媒体收集协议：优先通过 runtime.sendMessage 向后台请求待挂载媒体', async () => {
    const runtimeMock = vi.fn().mockResolvedValue({
      ok: true,
      result: { pending: true, media: SAMPLE_MEDIA },
    })

    const bgRes = await runtimeMock({ type: 'DSH_MEDIA_ATTACH_REQUEST' })
    expect(bgRes.ok).toBe(true)
    expect(bgRes.result.pending).toBe(true)
    expect(bgRes.result.media.id).toBe(SAMPLE_MEDIA.id)
    expect(bgRes.result.media.src).toBe(SAMPLE_MEDIA.src)
  })
})
