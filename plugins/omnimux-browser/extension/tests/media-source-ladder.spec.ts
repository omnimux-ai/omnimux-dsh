// @vitest-environment jsdom
/**
 * Media source ladder.
 *
 * A modern player hands out a `blob:` handle and often no poster. A single
 * `http(s)`-only rule dropped those videos entirely, so the capsule never
 * appeared over a Twitter/X video. The ladder must always yield an identity,
 * and must say out loud which rungs the workbench cannot re-fetch.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MediaActionBridge, outboundMedia } from '../src/content/media-hover/actions.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import {
  captureVideoFrame,
  classifyMediaSource,
  isAttachablePayload,
  normalizeMedia,
  resolveMediaSource,
} from '../src/content/media-hover/payload.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

const BASE = 'https://x.com/status/1'
const FRAME = 'data:image/jpeg;base64,AAAA'

const originalGetContext = HTMLCanvasElement.prototype.getContext
const originalToDataURL = HTMLCanvasElement.prototype.toDataURL

/** jsdom has no canvas backend, so the capture path is stubbed per case. */
function stubCanvas(options: { encode?: () => string } = {}): void {
  HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage: () => undefined } as unknown as CanvasRenderingContext2D
  } as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = (options.encode ?? (() => FRAME)) as typeof HTMLCanvasElement.prototype.toDataURL
}

/** Declares an element's box; jsdom has no layout engine. */
function box(element: Element, width = 600, height = 340): void {
  element.getBoundingClientRect = () => ({
    x: 100, y: 100, left: 100, top: 100, right: 100 + width, bottom: 100 + height,
    width, height, toJSON: () => ({}),
  }) as DOMRect
}

/** A `<video>` with decoded metadata, so the frame rung is reachable. */
function appendVideo(options: { src?: string; poster?: string; decoded?: boolean } = {}): HTMLVideoElement {
  const video = document.createElement('video')
  if (options.src !== undefined) video.setAttribute('src', options.src)
  if (options.poster !== undefined) video.setAttribute('poster', options.poster)
  document.body.appendChild(video)
  box(video)
  Object.defineProperty(video, 'readyState', { configurable: true, value: options.decoded === true ? 2 : 0 })
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: options.decoded === true ? 1280 : 0 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: options.decoded === true ? 720 : 0 })
  return video
}

beforeEach(() => {
  document.body.innerHTML = ''
  stubCanvas()
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
  HTMLCanvasElement.prototype.toDataURL = originalToDataURL
})

describe('source classification', () => {
  it('names each rung from the address alone', () => {
    expect(classifyMediaSource('https://cdn.example.com/a.png')).toBe('direct')
    expect(classifyMediaSource('data:image/jpeg;base64,AAAA')).toBe('frame')
    expect(classifyMediaSource('blob:https://x.com/1a2b')).toBe('blob')
    expect(classifyMediaSource('')).toBe('page')
  })
})

describe('video ladder', () => {
  it('prefers a fetchable poster and reports it as its own rung', () => {
    const video = appendVideo({ src: '/v/clip.mp4', poster: 'https://cdn.example.com/p/cover.jpg' })
    const resolved = resolveMediaSource(video, 'video', BASE)
    expect(resolved.kind).toBe('poster')
    expect(resolved.src).toBe('https://cdn.example.com/p/cover.jpg')
    expect(resolved.attachable).toBe(true)
  })

  it('uses the playable source when there is no poster', () => {
    const video = appendVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    const resolved = resolveMediaSource(video, 'video', BASE)
    expect(resolved.kind).toBe('direct')
    expect(resolved.src).toBe('https://cdn.example.com/v/clip.mp4')
    expect(resolved.attachable).toBe(true)
  })

  it('records a blob video instead of dropping it, and carries a frame', () => {
    const video = appendVideo({ src: 'blob:https://x.com/1a2b', decoded: true })
    const resolved = resolveMediaSource(video, 'video', BASE)
    expect(resolved.kind).toBe('blob')
    expect(resolved.src).toBe('blob:https://x.com/1a2b')
    // Page-scoped: the workbench can never re-fetch it.
    expect(resolved.attachable).toBe(false)
    // The captured frame is what makes it visible downstream.
    expect(resolved.previewSrc).toBe(FRAME)

    const payload = normalizeMedia(video, 'video', BASE)
    expect(payload).not.toBeNull()
    expect(payload?.sourceKind).toBe('blob')
    expect(payload?.previewSrc).toBe(FRAME)
    expect(isAttachablePayload(payload as HoveredMedia)).toBe(false)
  })

  it('falls back to a captured frame when there is no address at all', () => {
    const video = appendVideo({ decoded: true })
    const resolved = resolveMediaSource(video, 'video', BASE)
    expect(resolved.kind).toBe('frame')
    expect(resolved.src).toBe(FRAME)
    expect(resolved.attachable).toBe(true)
  })

  it('falls back to the page address as a last resort', () => {
    const video = appendVideo({})
    const resolved = resolveMediaSource(video, 'video', BASE)
    expect(resolved.kind).toBe('page')
    expect(resolved.src).toBe(BASE)
    expect(normalizeMedia(video, 'video', BASE)).not.toBeNull()
  })

  it('prefers an enclosing link over the raw page address', () => {
    const link = document.createElement('a')
    link.setAttribute('href', 'https://x.com/i/status/42')
    const video = document.createElement('video')
    link.appendChild(video)
    document.body.appendChild(link)
    box(video)
    expect(resolveMediaSource(video, 'video', BASE).src).toBe('https://x.com/i/status/42')
  })
})

describe('frame capture safety', () => {
  it('degrades to the next rung when the canvas refuses to encode', () => {
    stubCanvas({
      encode: () => { throw new DOMException('tainted canvas', 'SecurityError') },
    })
    const video = appendVideo({ decoded: true })
    // A cross-origin video without CORS makes `toDataURL` throw. The pointer
    // listener must never see that exception.
    expect(captureVideoFrame(video)).toBe('')
    const resolved = resolveMediaSource(video, 'video', BASE)
    expect(resolved.kind).toBe('page')
    expect(resolved.src).toBe(BASE)
  })

  it('refuses to capture before metadata has loaded', () => {
    const video = appendVideo({})
    expect(captureVideoFrame(video)).toBe('')
  })

  it('does not capture while the caller only wants a cheap identity', () => {
    const video = appendVideo({ src: 'blob:https://x.com/1a2b', decoded: true })
    const cheap = resolveMediaSource(video, 'video', BASE, false)
    expect(cheap.src).toBe('blob:https://x.com/1a2b')
    expect(cheap.previewSrc).toBe('')
  })
})

describe('image rung', () => {
  it('keeps the strict fetchable rule', () => {
    const inline = document.createElement('img')
    inline.setAttribute('src', 'data:image/png;base64,AAAA')
    const blob = document.createElement('img')
    blob.setAttribute('src', 'blob:https://page.example.com/x')
    document.body.append(inline, blob)
    // An image has no frame worth carrying instead, so it stays rejected.
    expect(normalizeMedia(inline, 'image', BASE)).toBeNull()
    expect(normalizeMedia(blob, 'image', BASE)).toBeNull()
  })

  it('resolves an ordinary image as direct', () => {
    const image = document.createElement('img')
    image.setAttribute('src', '/hero.png')
    document.body.appendChild(image)
    box(image, 300, 300)
    const resolved = resolveMediaSource(image, 'image', 'https://page.example.com/post/1')
    expect(resolved.kind).toBe('direct')
    expect(resolved.attachable).toBe(true)
    expect(resolved.src).toBe(new URL('/hero.png', location.href).href)
  })
})

describe('action-layer degradation', () => {
  const blobPayload: HoveredMedia = {
    id: 'video:blob:https://x.com/1a2b',
    type: 'video',
    src: 'blob:https://x.com/1a2b',
    previewSrc: FRAME,
    pageUrl: 'https://x.com/status/1',
    pageTitle: 'X',
    width: 600,
    height: 340,
    naturalWidth: 1280,
    naturalHeight: 720,
    alt: '视频素材',
    capturedAt: 1,
    sourceKind: 'blob',
    attachable: false,
  }

  it('rewrites a page-scoped video as a page reference', () => {
    const outbound = outboundMedia(blobPayload)
    expect(outbound.src).toBe('https://x.com/status/1')
    expect(outbound.attachable).toBe(true)
    expect(outbound.sourceKind).toBe('page')
    // The frame still travels as the thumbnail.
    expect(outbound.previewSrc).toBe(FRAME)
  })

  it('leaves an attachable payload untouched', () => {
    const direct = { ...blobPayload, src: 'https://cdn.example.com/v/clip.mp4', sourceKind: 'direct' as const, attachable: true }
    expect(outboundMedia(direct)).toBe(direct)
  })

  it('copies the page link, not the dead blob handle', async () => {
    const written: string[] = []
    const bridge = new MediaActionBridge({
      deliverToWorkstation: async () => 'unavailable',
      postToBackground: async () => ({ ok: true }),
      writeClipboard: async (text) => { written.push(text); return true },
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.copyToClipboard(blobPayload)
    expect(written).toEqual(['https://x.com/status/1'])
    expect(outcome.ok).toBe(true)
    expect(outcome.message).toBe(hoverCopy('zh').pageReference)
  })

  it('keeps the ordinary copy message for a fetchable source', async () => {
    const written: string[] = []
    const bridge = new MediaActionBridge({
      deliverToWorkstation: async () => 'unavailable',
      postToBackground: async () => ({ ok: true }),
      writeClipboard: async (text) => { written.push(text); return true },
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.copyToClipboard({
      ...blobPayload,
      src: 'https://cdn.example.com/v/clip.mp4',
      sourceKind: 'direct',
      attachable: true,
    })
    expect(written).toEqual(['https://cdn.example.com/v/clip.mp4'])
    expect(outcome.message).toBe(hoverCopy('zh').done.copy)
  })

  it('delivers a page-scoped video to the workbench as a page reference', async () => {
    const delivered: HoveredMedia[] = []
    const bridge = new MediaActionBridge({
      deliverToWorkstation: async (payload) => { delivered.push(payload); return 'attached' },
      postToBackground: async () => ({ ok: true }),
      writeClipboard: async () => true,
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.attachToConversation(blobPayload)
    expect(outcome.ok).toBe(true)
    expect(delivered[0].src).toBe('https://x.com/status/1')
  })
})
