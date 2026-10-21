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
import { RUNTIME_MESSAGE } from '../src/content/media-hover/messages.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  pickDownloadCandidate,
  pickXVideoVariant,
  resolveSyncVideoCandidates,
  videoCandidatesFromElement,
  videoCandidatesFromResourceTiming,
  xMediaIdFromPoster,
  xTweetIdOf,
  xVariantsOfTweetResult,
} from '../src/content/media-hover/video-source.ts'

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

  it('refuses the page-scoped blob instead of downloading a dead handle', async () => {
    const posted: Record<string, unknown>[] = []
    const bridge = new MediaActionBridge({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: async () => 'unavailable',
      postToBackground: async (message) => { posted.push(message); return { ok: true } },
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.downloadMedia(blobPayload)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
    expect(outcome.message).toBe(hoverCopy('zh').downloadUnavailable)
    // Neither the blob: handle nor the page address may reach the worker as a
    // download request: the page only plays this stream.
    expect(posted).toEqual([])
  })

  it('starts a download for a fetchable source and reports the download message', async () => {
    const posted: Record<string, unknown>[] = []
    const bridge = new MediaActionBridge({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: async () => 'unavailable',
      postToBackground: async (message) => { posted.push(message); return { ok: true, downloadId: 7 } },
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.downloadMedia({
      ...blobPayload,
      src: 'https://cdn.example.com/v/clip.mp4',
      sourceKind: 'direct',
      attachable: true,
    })
    expect(posted).toEqual([{
      type: RUNTIME_MESSAGE.mediaDownload,
      request: {
        url: 'https://cdn.example.com/v/clip.mp4',
        filename: '',
        pageUrl: 'https://x.com/status/1',
        pageTitle: 'X',
        type: 'video',
      },
    }])
    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('downloading')
    expect(outcome.message).toBe(hoverCopy('zh').done.download)
  })

  it('delivers a page-scoped video to the workbench as a page reference', async () => {
    const delivered: HoveredMedia[] = []
    const bridge = new MediaActionBridge({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: async (payload) => { delivered.push(payload); return 'attached' },
      postToBackground: async () => ({ ok: true }),
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.attachToConversation(blobPayload)
    expect(outcome.ok).toBe(true)
    expect(delivered[0].src).toBe('https://x.com/status/1')
  })
})

/*
 * Real video sources behind a media element.
 *
 * The ladder above answers "what is this element known by"; a download needs
 * the actual bytes. On X the element only exposes a `blob:` handle and a poster
 * jpg, so the progressive mp4 has to be found through the syndication payload
 * (keyed by the poster's media id), and an HLS-only video must be reported as
 * HLS rather than saved as a fake mp4. The cases below pin `video-source.ts` on
 * the real syndication response captured from
 * `x.com/UnitreeRobotics/status/2112819774573179175` (trimmed to the fields the
 * parser reads).
 */

const FIXTURE = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/x-tweet-result-2112819774573179175.json'), 'utf8'),
)

const VIDEO_PAGE_URL = 'https://x.com/UnitreeRobotics/status/2112819774573179175'
const VIDEO_TWEET_ID = '2112819774573179175'
const VIDEO_MEDIA_ID = '2112814220194828288'
const VIDEO_POSTER = `https://pbs.twimg.com/amplify_video_thumb/${VIDEO_MEDIA_ID}/img/RL8lXu0dfq4qop9M.jpg`
const PROGRESSIVE_1080 = `https://video.twimg.com/amplify_video/${VIDEO_MEDIA_ID}/vid/avc1/1920x1080/dphHVlNFst1G9RW0.mp4`
const PROGRESSIVE_720 = `https://video.twimg.com/amplify_video/${VIDEO_MEDIA_ID}/vid/avc1/1280x720/qQFeTMrcQITPE76L.mp4`
const VIDEO_HLS = `https://video.twimg.com/amplify_video/${VIDEO_MEDIA_ID}/pl/avc1/1920x1080/PqHdT7JdCpzdyCe8.m3u8`
const AUDIO_HLS = `https://video.twimg.com/amplify_video/${VIDEO_MEDIA_ID}/pl/mp4a/128000/J5REvP2MxRPAUdYA.m3u8`
const INIT_SEGMENT = `https://video.twimg.com/amplify_video/${VIDEO_MEDIA_ID}/vid/avc1/0/0/1920x1080/RAi0PxLhJnDHpM0O.mp4`
const SECOND_MEDIA_ID = '2112835817609596928'
const SECOND_POSTER = `https://pbs.twimg.com/amplify_video_thumb/${SECOND_MEDIA_ID}/img/secondVideo.jpg`
const SECOND_720 = `https://video.twimg.com/amplify_video/${SECOND_MEDIA_ID}/vid/avc1/1280x720/second720.mp4`

afterEach(() => {
  document.head.innerHTML = ''
})

/** Mounts a video element from markup and returns it. */
function mountVideo(markup: string): HTMLVideoElement {
  document.body.innerHTML = markup
  const video = document.querySelector('video')
  if (video === null) throw new Error('test markup did not mount a <video> element')
  return video
}

describe('video source: X poster id and tweet id', () => {
  it('extracts the media id from both X video thumbnail hosts', () => {
    expect(xMediaIdFromPoster(VIDEO_POSTER)).toBe(VIDEO_MEDIA_ID)
    expect(
      xMediaIdFromPoster(`https://pbs.twimg.com/ext_tw_video_thumb/${VIDEO_MEDIA_ID}/pu/img/abc.jpg`),
    ).toBe(VIDEO_MEDIA_ID)
    expect(xMediaIdFromPoster('https://pbs.twimg.com/media/Gx1abcdef.jpg')).toBeNull()
    expect(xMediaIdFromPoster('')).toBeNull()
    expect(xMediaIdFromPoster('https://pbs.twimg.com/amplify_video_thumb/not-a-number/img/x.jpg')).toBeNull()
  })

  it('reads the tweet id from the nearest tweet article status link', () => {
    const video = mountVideo(`
      <article data-testid="tweet">
        <a href="/UnitreeRobotics/status/${VIDEO_TWEET_ID}/video/1">12:00</a>
        <div><video poster="${VIDEO_POSTER}"></video></div>
      </article>
    `)
    expect(xTweetIdOf(video, 'https://x.com/home')).toBe(VIDEO_TWEET_ID)
  })

  it('prefers the nearest tweet article over an enclosing one', () => {
    const video = mountVideo(`
      <article data-testid="tweet">
        <a href="/outer/status/1111111111111111111">outer</a>
        <article data-testid="tweet">
          <a href="/inner/status/2222222222222222222">inner</a>
          <video poster="${VIDEO_POSTER}"></video>
        </article>
      </article>
    `)
    expect(xTweetIdOf(video, 'https://x.com/outer/status/1111111111111111111')).toBe('2222222222222222222')
  })

  it('falls back to the page status url when no tweet article exists', () => {
    const video = mountVideo(`<video poster="${VIDEO_POSTER}"></video>`)
    expect(xTweetIdOf(video, VIDEO_PAGE_URL)).toBe(VIDEO_TWEET_ID)
    expect(xTweetIdOf(video, 'https://x.com/home')).toBeNull()
    expect(xTweetIdOf(video, 'https://x.com/UnitreeRobotics/status/12345')).toBeNull()
  })
})

describe('video source: syndication variants', () => {
  it('selects the 1080p progressive mp4 from the real syndication fixture', () => {
    const media = FIXTURE.mediaDetails[0]
    expect(media.media_url_https).toBe(VIDEO_POSTER)

    const variants = xVariantsOfTweetResult(FIXTURE, media.media_url_https)
    expect(variants).toHaveLength(5)
    expect(pickXVideoVariant(variants)).toEqual({
      url: PROGRESSIVE_1080,
      contentType: 'video/mp4',
      bitrate: 10368000,
    })
  })

  it('matches the poster across query-string differences', () => {
    expect(pickXVideoVariant(xVariantsOfTweetResult(FIXTURE, `${VIDEO_POSTER}?name=orig`))?.url).toBe(
      PROGRESSIVE_1080,
    )
    const payloadWithQuery = {
      mediaDetails: [
        {
          media_url_https: `${VIDEO_POSTER}?format=jpg&name=small`,
          video_info: FIXTURE.mediaDetails[0].video_info,
        },
      ],
    }
    expect(pickXVideoVariant(xVariantsOfTweetResult(payloadWithQuery, VIDEO_POSTER))?.url).toBe(PROGRESSIVE_1080)
  })

  it('uses the hovered poster to choose between several videos in one tweet', () => {
    const second = {
      media_url_https: SECOND_POSTER,
      video_info: {
        variants: [
          {
            content_type: 'application/x-mpegURL',
            url: `https://video.twimg.com/amplify_video/${SECOND_MEDIA_ID}/pl/second.m3u8`,
          },
          { bitrate: 2176000, content_type: 'video/mp4', url: SECOND_720 },
        ],
      },
    }
    const multiVideo = { mediaDetails: [FIXTURE.mediaDetails[0], second] }

    expect(pickXVideoVariant(xVariantsOfTweetResult(multiVideo, SECOND_POSTER))?.url).toBe(SECOND_720)
    expect(pickXVideoVariant(xVariantsOfTweetResult(multiVideo, VIDEO_POSTER))?.url).toBe(PROGRESSIVE_1080)
    expect(
      xVariantsOfTweetResult(multiVideo, 'https://pbs.twimg.com/amplify_video_thumb/0000000000000000000/img/x.jpg'),
    ).toEqual([])
  })

  it('falls back to the HLS manifest when the payload has no mp4', () => {
    const hlsOnly = {
      mediaDetails: [
        {
          media_url_https: VIDEO_POSTER,
          video_info: {
            variants: [
              { content_type: 'application/x-mpegURL', url: VIDEO_HLS },
              { content_type: 'video/webm', url: 'https://video.twimg.com/amplify_video/1/vid/x.webm' },
            ],
          },
        },
      ],
    }
    expect(pickXVideoVariant(xVariantsOfTweetResult(hlsOnly, VIDEO_POSTER))).toEqual({
      url: VIDEO_HLS,
      contentType: 'application/x-mpegURL',
      bitrate: 0,
    })
  })

  it('uses the only video manifest when the poster matches no entry', () => {
    expect(pickXVideoVariant(xVariantsOfTweetResult(FIXTURE, ''))?.bitrate).toBe(10368000)
    expect(pickXVideoVariant(xVariantsOfTweetResult(FIXTURE, 'https://example.com/unknown.jpg'))?.url).toBe(
      PROGRESSIVE_1080,
    )
  })

  it('returns no variants when the payload is malformed', () => {
    const malformed = [
      null,
      undefined,
      'not json',
      42,
      [],
      {},
      { mediaDetails: null },
      { mediaDetails: 'nope' },
      { mediaDetails: [null, 7, 'x'] },
      { mediaDetails: [{ media_url_https: VIDEO_POSTER, type: 'photo' }] },
      { mediaDetails: [{ media_url_https: VIDEO_POSTER, video_info: { variants: 'nope' } }] },
      {
        mediaDetails: [
          {
            media_url_https: VIDEO_POSTER,
            video_info: { variants: [{ url: 1, content_type: 'video/mp4' }] },
          },
        ],
      },
    ]
    for (const payload of malformed) {
      expect(xVariantsOfTweetResult(payload, VIDEO_POSTER)).toEqual([])
    }
    expect(pickXVideoVariant([])).toBeNull()
  })

  it('does not substitute another video for a poster that is not a video', () => {
    const second = {
      media_url_https: SECOND_POSTER,
      video_info: { variants: [{ bitrate: 2176000, content_type: 'video/mp4', url: SECOND_720 }] },
    }
    const payload = { mediaDetails: [{ media_url_https: VIDEO_POSTER, type: 'photo' }, second] }
    expect(xVariantsOfTweetResult(payload, VIDEO_POSTER)).toEqual([])
  })
})

describe('video source: download candidate choice', () => {
  it('prefers mp4 and ranks by height, then width, then bitrate', () => {
    expect(
      pickDownloadCandidate([
        { url: 'https://cdn.example.com/480x270.mp4', kind: 'mp4', origin: 'performance', width: 480, height: 270, bitrate: 256000 },
        { url: 'https://cdn.example.com/1920x1080.mp4', kind: 'mp4', origin: 'performance', width: 1920, height: 1080, bitrate: 10368000 },
        { url: 'https://cdn.example.com/1280x720.mp4', kind: 'mp4', origin: 'performance', width: 1280, height: 720, bitrate: 2176000 },
      ])?.url,
    ).toBe('https://cdn.example.com/1920x1080.mp4')
    expect(
      pickDownloadCandidate([
        { url: 'https://cdn.example.com/1920x720.mp4', kind: 'mp4', origin: 'performance', width: 1920, height: 720 },
        { url: 'https://cdn.example.com/640x1080.mp4', kind: 'mp4', origin: 'performance', width: 640, height: 1080 },
      ])?.url,
    ).toBe('https://cdn.example.com/640x1080.mp4')
    expect(
      pickDownloadCandidate([
        { url: 'https://cdn.example.com/1280x1080.mp4', kind: 'mp4', origin: 'performance', width: 1280, height: 1080, bitrate: 999999 },
        { url: 'https://cdn.example.com/1920x1080-low.mp4', kind: 'mp4', origin: 'performance', width: 1920, height: 1080, bitrate: 1 },
      ])?.url,
    ).toBe('https://cdn.example.com/1920x1080-low.mp4')
    expect(
      pickDownloadCandidate([
        { url: 'https://cdn.example.com/1920x1080-slow.mp4', kind: 'mp4', origin: 'performance', width: 1920, height: 1080, bitrate: 1000 },
        { url: 'https://cdn.example.com/1920x1080-fast.mp4', kind: 'mp4', origin: 'performance', width: 1920, height: 1080, bitrate: 8000 },
      ])?.url,
    ).toBe('https://cdn.example.com/1920x1080-fast.mp4')
    expect(
      pickDownloadCandidate([
        { url: 'https://cdn.example.com/unknown.mp4', kind: 'mp4', origin: 'performance' },
        { url: 'https://cdn.example.com/measured.mp4', kind: 'mp4', origin: 'performance', width: 480, height: 270 },
      ])?.url,
    ).toBe('https://cdn.example.com/measured.mp4')
  })

  it('falls back to the HLS playlist only when no mp4 exists', () => {
    expect(pickDownloadCandidate([{ url: VIDEO_HLS, kind: 'hls', origin: 'x-syndication' }])?.kind).toBe('hls')
    expect(
      pickDownloadCandidate([
        { url: VIDEO_HLS, kind: 'hls', origin: 'x-syndication' },
        { url: PROGRESSIVE_720, kind: 'mp4', origin: 'x-syndication' },
      ])?.kind,
    ).toBe('mp4')
    expect(pickDownloadCandidate([])).toBeNull()
  })

  it('rejects addresses the browser cannot download', () => {
    expect(
      pickDownloadCandidate([{ url: 'blob:https://x.com/371793ee', kind: 'mp4', origin: 'element' }]),
    ).toBeNull()
    expect(
      pickDownloadCandidate([{ url: 'data:video/mp4;base64,AAAA', kind: 'mp4', origin: 'element' }]),
    ).toBeNull()
  })
})

describe('video source: element and metadata candidates', () => {
  it('collects direct video and source addresses, skipping unsupported containers', () => {
    const video = document.createElement('video')
    video.setAttribute('src', 'https://video.example.com/clip.mp4')
    const hlsSource = document.createElement('source')
    hlsSource.setAttribute('src', 'https://video.example.com/clip.m3u8')
    hlsSource.setAttribute('type', 'application/x-mpegURL')
    const webmSource = document.createElement('source')
    webmSource.setAttribute('src', 'https://video.example.com/clip.webm')
    webmSource.setAttribute('type', 'video/webm')
    video.append(hlsSource, webmSource)
    document.body.appendChild(video)

    expect(videoCandidatesFromElement(video, VIDEO_PAGE_URL)).toEqual([
      { url: 'https://video.example.com/clip.mp4', kind: 'mp4', origin: 'element' },
      { url: 'https://video.example.com/clip.m3u8', kind: 'hls', origin: 'element' },
    ])
  })

  it('collects og:video and twitter:player:stream metadata, resolving relative addresses', () => {
    document.head.innerHTML = `
      <meta property="og:video:secure_url" content="https://cdn.example.com/secure.mp4">
      <meta property="og:video:url" content="videos/og.mp4">
      <meta property="og:video" content="https://cdn.example.com/video-no-extension">
      <meta name="twitter:player:stream" content="https://cdn.example.com/player.m3u8">
    `
    const video = mountVideo('<video poster="https://cdn.example.com/poster.jpg"></video>')
    expect(videoCandidatesFromElement(video, 'https://news.example.com/post/1')).toEqual([
      { url: 'https://cdn.example.com/secure.mp4', kind: 'mp4', origin: 'meta' },
      { url: 'https://news.example.com/post/videos/og.mp4', kind: 'mp4', origin: 'meta' },
      { url: 'https://cdn.example.com/video-no-extension', kind: 'mp4', origin: 'meta' },
      { url: 'https://cdn.example.com/player.m3u8', kind: 'hls', origin: 'meta' },
    ])
  })

  it('returns nothing for an X video whose only source is a blob handle', () => {
    const video = mountVideo(
      `<video poster="${VIDEO_POSTER}" src="blob:https://x.com/371793ee-089a-42da-8775-9db907965b86"></video>`,
    )
    expect(videoCandidatesFromElement(video, VIDEO_PAGE_URL)).toEqual([])
  })
})

describe('video source: resource-timing candidates', () => {
  it('keeps only the hovered media id and drops the HLS init segment', () => {
    const video = mountVideo(`<video poster="${VIDEO_POSTER}" src="blob:https://x.com/abc"></video>`)
    const foreignHls = 'https://video.twimg.com/amplify_video/2112843337971712000/pl/avc1/1280x720/other.m3u8'
    const entries = [INIT_SEGMENT, VIDEO_HLS, AUDIO_HLS, foreignHls, `${VIDEO_POSTER}?format=jpg`]

    expect(videoCandidatesFromResourceTiming(video, entries, VIDEO_PAGE_URL)).toEqual([
      { url: VIDEO_HLS, kind: 'hls', origin: 'performance', width: 1920, height: 1080 },
      { url: AUDIO_HLS, kind: 'hls', origin: 'performance' },
    ])
  })

  it('puts a progressive mp4 before playlists', () => {
    const video = mountVideo(`<video poster="${VIDEO_POSTER}"></video>`)
    const candidates = videoCandidatesFromResourceTiming(video, [VIDEO_HLS, PROGRESSIVE_1080], VIDEO_PAGE_URL)

    expect(candidates.map((entry) => entry.url)).toEqual([PROGRESSIVE_1080, VIDEO_HLS])
    expect(candidates[0]?.kind).toBe('mp4')
    expect(candidates[1]?.kind).toBe('hls')
  })

  it('accepts any video resource when the poster carries no media id', () => {
    const video = mountVideo('<video src="https://cdn.example.com/clip.mp4"></video>')
    const candidates = videoCandidatesFromResourceTiming(
      video,
      ['https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.m3u8', 'https://cdn.example.com/clip.jpg'],
      'https://news.example.com/post/1',
    )
    expect(candidates.map((entry) => entry.url)).toEqual([
      'https://cdn.example.com/clip.mp4',
      'https://cdn.example.com/clip.m3u8',
    ])
  })
})

describe('video source: synchronous resolution', () => {
  it('combines element and resource candidates without duplicating addresses', () => {
    const video = mountVideo(
      `<video src="https://cdn.example.com/clip.mp4" poster="${VIDEO_POSTER}"></video>`,
    )
    const combined = resolveSyncVideoCandidates(video, VIDEO_PAGE_URL, [
      'https://cdn.example.com/clip.mp4',
      VIDEO_HLS,
      INIT_SEGMENT,
    ])
    expect(combined.map((entry) => entry.url)).toEqual(['https://cdn.example.com/clip.mp4', VIDEO_HLS])
    expect(combined.map((entry) => entry.origin)).toEqual(['element', 'performance'])
  })

  it('falls back to the document resource timings when no entry list is injected', () => {
    const video = mountVideo('<video src="https://cdn.example.com/clip.mp4"></video>')
    expect(resolveSyncVideoCandidates(video, VIDEO_PAGE_URL).map((entry) => entry.url)).toEqual([
      'https://cdn.example.com/clip.mp4',
    ])
  })

  it('reports an X video with only HLS as hls instead of inventing an mp4', () => {
    const video = mountVideo(`<video poster="${VIDEO_POSTER}" src="blob:https://x.com/abc"></video>`)
    const combined = resolveSyncVideoCandidates(video, VIDEO_PAGE_URL, [VIDEO_HLS, AUDIO_HLS, INIT_SEGMENT])
    expect(combined.map((entry) => entry.kind)).toEqual(['hls', 'hls'])
    expect(combined.every((entry) => entry.origin === 'performance')).toBe(true)
    expect(pickDownloadCandidate(combined)?.kind).toBe('hls')
  })
})
