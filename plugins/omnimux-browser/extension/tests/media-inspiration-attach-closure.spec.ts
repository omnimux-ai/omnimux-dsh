// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { MediaActionBridge, type ActionTransport } from '../src/content/media-hover/actions.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { InspirationSaveCoordinator } from '../src/background/inspiration-save.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

const sourceUrl = 'https://x.com/current/status/123'
const payload: HoveredMedia = { id: 'video:poster', type: 'video', src: 'https://pbs.twimg.com/poster.jpg', previewSrc: 'https://pbs.twimg.com/poster.jpg', pageUrl: 'https://x.com/home', inspirationUrl: sourceUrl, inspirationCapture: { url: sourceUrl, text: '完整正文', author: { name: 'Current', handle: 'current', avatar: '', verified: false }, stats: {}, posted_at: null, cover_url: '', shape: 'video', media_items: [{ type: 'video', url: '', poster_url: 'https://pbs.twimg.com/poster.jpg' }] }, pageTitle: 'Current post', width: 100, height: 100, naturalWidth: 100, naturalHeight: 100, alt: '', capturedAt: 1 }

describe('hover save delivery semantics', () => {
  it('a cache-only reply cannot paint a saved mark', async () => {
    const bridge = new MediaActionBridge({ postToBackground: async () => ({ ok: true, hostSaved: false, result: { ok: true, total: 1 } }), copy: () => hoverCopy('zh') } as unknown as ActionTransport)
    expect(await bridge.saveToInspiration(payload)).toMatchObject({ ok: false, status: 'failed' })
  })
  it('calls the actual coordinator; a non-receipt response only triggers exact lookup', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: 'resolve failed' }, { status: 502 })).mockResolvedValueOnce(Response.json({ data: { items: [] } }))
    const storage = { get: async () => ({}), set: async () => {} } as unknown as Pick<chrome.storage.StorageArea, 'get' | 'set'>
    const coordinator = new InspirationSaveCoordinator({ storage, resolveHost: async () => 'http://127.0.0.1:43120', fetchImpl })
    await coordinator.submit({ targetUrl: payload.inspirationUrl!, capture: payload.inspirationCapture })
    for (let i = 0; i < 40; i += 1) await Promise.resolve()
    expect((await coordinator.list())[0]?.state).toBe('pending')
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      'http://127.0.0.1:43120/omnimux/inspiration/local/import-url',
      `http://127.0.0.1:43120/omnimux/inspiration/local?source_url=${encodeURIComponent(sourceUrl)}`,
    ])
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1].body).capture.media_items).toEqual([{ type: 'video', url: '', poster_url: payload.src }])
  })
  it('a partial receipt stays retryable and carries the host reason', async () => {
    const bridge = new MediaActionBridge({ postToBackground: async () => ({ ok: true, task: { taskId: 'save-1', host: 'http://127.0.0.1:43120', sourceUrl, state: 'partial', detail: '视频未取得', updatedAt: 1 } }), copy: () => hoverCopy('zh') } as unknown as ActionTransport)
    expect(await bridge.saveToInspiration(payload)).toMatchObject({ ok: false, status: 'partial', message: '部分保存：视频未取得 · 点击重试补齐' })
  })
})
