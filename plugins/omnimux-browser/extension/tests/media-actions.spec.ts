// @vitest-environment jsdom
/**
 * Action-layer contract for the three capsule shortcuts.
 *
 * Every case drives the bridge through an injected transport, so the messaging
 * contract, the receipt wait and both degradation paths are covered without a
 * live extension runtime.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MediaActionBridge,
  browserTransport,
  type ActionTransport,
  type SidePanelState,
  type WorkstationResult,
} from '../src/content/media-hover/actions.ts'
import { mediaElementFor, planMediaDownload } from '../src/content/media-hover/download-plan.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { RUNTIME_MESSAGE, TIMING } from '../src/content/media-hover/messages.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

const PAYLOAD: HoveredMedia = {
  id: 'image:https://cdn.example.com/a.png',
  type: 'image',
  src: 'https://cdn.example.com/a.png',
  previewSrc: 'https://cdn.example.com/a.png',
  pageUrl: 'https://page.example.com/post/1',
  pageTitle: '示例页面',
  width: 480,
  height: 320,
  naturalWidth: 960,
  naturalHeight: 640,
  alt: '示例图片',
  capturedAt: 1_700_000_000_000,
}

/** A generic video that only exposes its poster: not a downloadable file. */
const POSTER_ONLY_VIDEO: HoveredMedia = {
  ...PAYLOAD,
  id: 'video:https://cdn.example.com/clip-poster.jpg',
  type: 'video',
  src: 'https://cdn.example.com/clip-poster.jpg',
  previewSrc: 'https://cdn.example.com/clip-poster.jpg',
  sourceKind: 'poster',
}

function transport(overrides: Partial<ActionTransport> = {}): ActionTransport {
  return {
    sidePanelState: async () => 'inactive',
    deliverToWorkstation: vi.fn(async (): Promise<WorkstationResult> => 'unavailable'),
    postToBackground: vi.fn(async () => ({ ok: true, result: {} })),
    copy: () => hoverCopy('zh'),
    ...overrides,
  }
}

describe('add to inspiration library', () => {
  it('delegates the write to the background worker', async () => {
    const postToBackground = vi.fn(async () => ({ ok: true, result: { total: 3, duplicate: false } }))
    const bridge = new MediaActionBridge(transport({ postToBackground }))

    const outcome = await bridge.saveToInspiration(PAYLOAD)

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('saved')
    expect(outcome.message).toBe('已加入灵感库')
    expect(postToBackground).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGE.mediaToInspiration,
      payload: PAYLOAD,
    })
  })

  it('reports a failure instead of throwing when the store rejects', async () => {
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: false, error: { code: 'storage-failed', message: 'x' } })),
    }))
    const outcome = await bridge.saveToInspiration(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('refuses a saved mark when the accepted write reports its own rejection', async () => {
    // QA-1: the store answers once, with `ok: false`, when the write was lost.
    // An envelope that merely says "the worker replied" is not a save.
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: true, result: { ok: false, total: 0, duplicate: false } })),
    }))
    const outcome = await bridge.saveToInspiration(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('treats a missing runtime as a failure, never as a silent success', async () => {
    const bridge = new MediaActionBridge(transport({ postToBackground: vi.fn(async () => null) }))
    const outcome = await bridge.saveToInspiration(PAYLOAD)
    expect(outcome.ok).toBe(false)
  })
})

describe('download the media file', () => {
  it('asks the background worker to save the resolved file', async () => {
    const postToBackground = vi.fn(async () => ({ ok: true, downloadId: 42, filename: 'a.png' }))
    const bridge = new MediaActionBridge(transport({ postToBackground }))

    const outcome = await bridge.downloadMedia(PAYLOAD)

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('downloading')
    expect(outcome.message).toBe('已开始下载')
    expect(postToBackground).toHaveBeenCalledTimes(1)
    expect(postToBackground).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGE.mediaDownload,
      request: {
        url: 'https://cdn.example.com/a.png',
        filename: '',
        pageUrl: 'https://page.example.com/post/1',
        pageTitle: '示例页面',
        type: 'image',
      },
    })
  })

  it('reports the download-failed copy when the worker refuses to start it', async () => {
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: false, error: { code: 'download-failed' } })),
    }))
    const outcome = await bridge.downloadMedia(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
    expect(outcome.message).toBe('下载失败，请重试')
  })

  it('reports an unusable address instead of sending it to the worker', async () => {
    const postToBackground = vi.fn(async () => ({ ok: true, downloadId: 1 }))
    const bridge = new MediaActionBridge(transport({ postToBackground }))
    const blobImage: HoveredMedia = { ...PAYLOAD, src: 'blob:https://page.example.com/1', previewSrc: 'blob:https://page.example.com/1' }

    const outcome = await bridge.downloadMedia(blobImage)

    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('该素材地址不可用')
    expect(postToBackground).not.toHaveBeenCalled()
  })

  it('never downloads a video poster as if it were the video file', async () => {
    // The press must resolve a progressive file: the poster the capsule paints
    // is a thumbnail, and saving it would report a video that was never saved.
    const postToBackground = vi.fn(async () => ({ ok: true, downloadId: 1 }))
    const bridge = new MediaActionBridge(transport({ postToBackground }))

    const outcome = await bridge.downloadMedia(POSTER_ONLY_VIDEO)

    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
    expect(outcome.message).toBe('该视频仅在页面内可播，无法直接下载')
    expect(postToBackground).not.toHaveBeenCalledWith(expect.objectContaining({
      type: RUNTIME_MESSAGE.mediaDownload,
    }))
  })
})

describe('resolve the real source of an X video before downloading', () => {
  const TWEET_ID = '2112819774573179175'
  const POSTER = `https://pbs.twimg.com/amplify_video_thumb/${TWEET_ID}/img/abc.jpg`
  const MP4_480 = 'https://video.twimg.com/amplify_video/1/vid/avc1/480x270/clip.mp4?tag=12'
  const MP4_1080 = 'https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/clip.mp4?tag=12'
  const HLS = 'https://video.twimg.com/amplify_video/1/pl/playlist.m3u8'

  const X_VIDEO: HoveredMedia = {
    ...PAYLOAD,
    id: `video:${POSTER}`,
    type: 'video',
    src: POSTER,
    previewSrc: POSTER,
    pageUrl: `https://x.com/robot/status/${TWEET_ID}`,
    sourceKind: 'poster',
  }

  /** Mounts the tweet card the pointer is actually hovering. */
  function mountTweet(): void {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <a href="/robot/status/${TWEET_ID}"></a>
        <video poster="${POSTER}"></video>
      </article>`
  }

  /** One syndication payload whose `media_url_https` repeats the hovered poster. */
  function syndication(...variants: Array<{ url: string; content_type: string; bitrate: number }>): Record<string, unknown> {
    return {
      mediaDetails: [{
        media_url_https: `${POSTER}?format=jpg&name=small`,
        video_info: { variants },
      }],
    }
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('asks the worker for the variants, then downloads the best mp4', async () => {
    mountTweet()
    const postToBackground = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === RUNTIME_MESSAGE.xVideoVariants) {
        return {
          ok: true,
          result: syndication(
            { url: MP4_480, content_type: 'video/mp4', bitrate: 256_000 },
            { url: MP4_1080, content_type: 'video/mp4', bitrate: 2_176_000 },
            { url: HLS, content_type: 'application/x-mpegURL', bitrate: 0 },
          ),
        }
      }
      return { ok: true, downloadId: 42 }
    })
    const bridge = new MediaActionBridge(transport({ postToBackground }))

    const outcome = await bridge.downloadMedia(X_VIDEO)

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('downloading')
    expect(outcome.message).toBe('已开始下载')
    expect(postToBackground).toHaveBeenNthCalledWith(1, {
      type: RUNTIME_MESSAGE.xVideoVariants,
      tweetId: TWEET_ID,
    })
    expect(postToBackground).toHaveBeenNthCalledWith(2, {
      type: RUNTIME_MESSAGE.mediaDownload,
      request: {
        url: MP4_1080,
        filename: `x-${TWEET_ID}-1920x1080.mp4`,
        pageUrl: X_VIDEO.pageUrl,
        pageTitle: '示例页面',
        type: 'video',
      },
    })
  })

  it('never substitutes another video when the matched poster has no video_info', async () => {
    mountTweet()
    const OTHER_POSTER = `https://pbs.twimg.com/amplify_video_thumb/${TWEET_ID}/img/other.jpg`
    const postToBackground = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === RUNTIME_MESSAGE.xVideoVariants) {
        return {
          ok: true,
          result: {
            mediaDetails: [
              { media_url_https: POSTER },
              { media_url_https: OTHER_POSTER, video_info: { variants: [{ url: MP4_1080, content_type: 'video/mp4', bitrate: 2_176_000 }] } },
            ],
          },
        }
      }
      return { ok: true, downloadId: 42 }
    })
    const bridge = new MediaActionBridge(transport({ postToBackground }))

    const outcome = await bridge.downloadMedia(X_VIDEO)

    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('该视频仅在页面内可播，无法直接下载')
    expect(postToBackground).not.toHaveBeenCalledWith(expect.objectContaining({
      type: RUNTIME_MESSAGE.mediaDownload,
    }))
  })

  it('refuses an HLS-only post rather than saving the playlist', async () => {
    mountTweet()
    const postToBackground = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === RUNTIME_MESSAGE.xVideoVariants) {
        return { ok: true, result: syndication({ url: HLS, content_type: 'application/x-mpegURL', bitrate: 0 }) }
      }
      return { ok: true, downloadId: 42 }
    })
    const bridge = new MediaActionBridge(transport({ postToBackground }))

    const outcome = await bridge.downloadMedia(X_VIDEO)

    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('该视频仅在页面内可播，无法直接下载')
    expect(postToBackground).not.toHaveBeenCalledWith(expect.objectContaining({
      type: RUNTIME_MESSAGE.mediaDownload,
    }))
  })
})

describe('download planning', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('plans an image download from its own address', () => {
    const plan = planMediaDownload({ payload: PAYLOAD, pageUrl: PAYLOAD.pageUrl })
    expect(plan).toEqual({
      ok: true,
      request: {
        url: 'https://cdn.example.com/a.png',
        filename: '',
        pageUrl: 'https://page.example.com/post/1',
        pageTitle: '示例页面',
        type: 'image',
      },
    })
  })

  it('falls back to the preview address when the image src is not fetchable', () => {
    const blobImage: HoveredMedia = { ...PAYLOAD, src: 'blob:https://page.example.com/1' }
    const plan = planMediaDownload({ payload: blobImage, pageUrl: PAYLOAD.pageUrl })
    expect(plan).toMatchObject({
      ok: true,
      request: { url: 'https://cdn.example.com/a.png', type: 'image' },
    })
  })

  it('picks the highest-resolution mp4 variant and names it by tweet id', () => {
    const TWEET_ID = '2112819774573179175'
    const plan = planMediaDownload({
      payload: {
        ...PAYLOAD,
        id: 'video:x',
        type: 'video',
        src: 'https://pbs.twimg.com/amplify_video_thumb/x/img/a.jpg',
        previewSrc: 'https://pbs.twimg.com/amplify_video_thumb/x/img/a.jpg',
        pageUrl: `https://x.com/robot/status/${TWEET_ID}`,
      },
      pageUrl: `https://x.com/robot/status/${TWEET_ID}`,
      variants: [
        { url: 'https://video.twimg.com/a/vid/avc1/480x270/clip.mp4', contentType: 'video/mp4', bitrate: 256_000 },
        { url: 'https://video.twimg.com/a/vid/avc1/1920x1080/clip.mp4', contentType: 'video/mp4', bitrate: 2_176_000 },
        { url: 'https://video.twimg.com/a/pl/playlist.m3u8', contentType: 'application/x-mpegURL', bitrate: 0 },
      ],
    })

    expect(plan).toEqual({
      ok: true,
      request: {
        url: 'https://video.twimg.com/a/vid/avc1/1920x1080/clip.mp4',
        filename: `x-${TWEET_ID}-1920x1080.mp4`,
        pageUrl: `https://x.com/robot/status/${TWEET_ID}`,
        pageTitle: '示例页面',
        type: 'video',
      },
    })
  })

  it('answers video-unavailable for an HLS-only variant list', () => {
    const plan = planMediaDownload({
      payload: { ...PAYLOAD, id: 'video:x', type: 'video', src: 'https://pbs.twimg.com/amplify_video_thumb/x/img/a.jpg', previewSrc: 'https://pbs.twimg.com/amplify_video_thumb/x/img/a.jpg' },
      pageUrl: 'https://x.com/robot/status/2112819774573179175',
      variants: [{ url: 'https://video.twimg.com/a/pl/playlist.m3u8', contentType: 'application/x-mpegURL', bitrate: 0 }],
    })
    expect(plan).toEqual({ ok: false, reason: 'video-unavailable' })
  })

  it('downloads a generic page video declared through og:video', () => {
    document.head.innerHTML = '<meta property="og:video" content="https://cdn.example.com/clip.mp4">'
    const video = document.createElement('video')
    document.body.appendChild(video)
    const payload: HoveredMedia = {
      ...PAYLOAD,
      id: 'video:https://cdn.example.com/clip-poster.jpg',
      type: 'video',
      src: 'https://cdn.example.com/clip-poster.jpg',
      previewSrc: 'https://cdn.example.com/clip-poster.jpg',
      sourceKind: 'poster',
    }

    const plan = planMediaDownload({
      payload,
      pageUrl: 'https://blog.example.com/post/1',
      element: video,
      entryNames: [],
    })

    expect(plan).toMatchObject({
      ok: true,
      request: { url: 'https://cdn.example.com/clip.mp4', type: 'video', filename: '' },
    })
  })

  it('never treats a poster-only video as a downloadable file', () => {
    const poster = 'https://cdn.example.com/clip-poster.jpg'
    document.body.innerHTML = `<video poster="${poster}"></video>`
    const video = document.querySelector('video')!
    const payload: HoveredMedia = {
      ...PAYLOAD,
      id: `video:${poster}`,
      type: 'video',
      src: poster,
      previewSrc: poster,
      sourceKind: 'poster',
    }

    const plan = planMediaDownload({ payload, pageUrl: 'https://blog.example.com/post/1', element: video, entryNames: [] })

    expect(plan).toEqual({ ok: false, reason: 'video-unavailable' })
  })

  it('matches the live media element by its poster', () => {
    const poster = 'https://cdn.example.com/clip-poster.jpg'
    document.body.innerHTML = `
      <video poster="https://cdn.example.com/other.jpg"></video>
      <video poster="${poster}"></video>`
    const [other, hovered] = [...document.querySelectorAll('video')]
    const payload: HoveredMedia = {
      ...PAYLOAD,
      id: `video:${poster}`,
      type: 'video',
      src: poster,
      previewSrc: poster,
    }

    expect(mediaElementFor(payload, document)).toBe(hovered)

    const recycled: HoveredMedia = { ...payload, previewSrc: 'https://cdn.example.com/missing.jpg', src: 'https://cdn.example.com/missing.jpg' }
    expect(mediaElementFor(recycled, document)).toBeNull()
    expect(other).not.toBe(hovered)
  })
})

describe('add to conversation', () => {
  it('reports the workbench channel when the panel confirms the receipt', async () => {
    const bridge = new MediaActionBridge(transport({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: vi.fn(async () => 'attached' as WorkstationResult),
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)
    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('workbench')
    expect(outcome.message).toBe('已加入对话')
  })

  it('falls back to the side panel when no workstation exists', async () => {
    const postToBackground = vi.fn(async () => ({ ok: true, result: { channel: 'side-panel' } }))
    const bridge = new MediaActionBridge(transport({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: vi.fn(async () => 'unavailable' as WorkstationResult),
      postToBackground,
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)

    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('side-panel')
    expect(postToBackground).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGE.openAssistantWithMedia,
      payload: PAYLOAD,
    })
  })

  it('does not claim success when the fallback also fails', async () => {
    const bridge = new MediaActionBridge(transport({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: vi.fn(async () => 'unavailable' as WorkstationResult),
      postToBackground: vi.fn(async () => ({ ok: false })),
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('waits at most the receipt budget for an unresponsive workstation', async () => {
    const started = Date.now()
    const bridge = new MediaActionBridge({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: (_media, timeoutMs) => new Promise((resolve) => {
        // Mirror the production timeout, whose budget the bridge owns.
        setTimeout(() => resolve('unavailable'), timeoutMs)
      }),
      postToBackground: vi.fn(async () => ({ ok: true })),
      copy: () => hoverCopy('zh'),
    })
    const outcome = await bridge.attachToConversation(PAYLOAD)
    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('side-panel')
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMING.attachReceiptTimeout - 20)
  })

  it('surfaces a panel that explicitly refuses the media', async () => {
    const bridge = new MediaActionBridge(transport({
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: vi.fn(async () => 'rejected' as WorkstationResult),
      postToBackground: vi.fn(async () => ({ ok: true })),
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)
    // A refusal still hands the media to the side panel rather than dropping it.
    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('side-panel')
  })
})

describe('one window, one conversation', () => {
  /**
   * A transport whose only difference from the default is a live worker.
   *
   * Overriding `postToBackground` alone is not enough: the panel check rides
   * that same channel, so a case that drives the worker by its wire has to say
   * how the check is answered as well.
   */
  function wire(
    postToBackground: (message: Record<string, unknown>) => Promise<unknown>,
    panel: SidePanelState,
  ): ActionTransport {
    return transport({
      sidePanelState: vi.fn(async () => panel),
      postToBackground,
    })
  }

  it('asks the worker about the side panel before it tries anything else', async () => {
    // The question itself is asserted through the real transport below; here the
    // bridge must put it, and only then reach for the workstation.
    const sidePanelState = vi.fn(async () => 'inactive' as const)
    const deliverToWorkstation = vi.fn(async () => 'attached' as WorkstationResult)
    const bridge = new MediaActionBridge(transport({ sidePanelState, deliverToWorkstation }))

    await bridge.attachToConversation(PAYLOAD)

    expect(sidePanelState).toHaveBeenCalledTimes(1)
    expect(deliverToWorkstation).toHaveBeenCalledTimes(1)
  })

  it('delivers to the open side panel and never expands the floating workstation', async () => {
    // The reported defect: with the native side panel already showing the
    // conversation, pressing the capsule expanded the floating workstation
    // beside it, so the same session appeared twice.
    const deliverToWorkstation = vi.fn(async () => 'attached' as WorkstationResult)
    const postToBackground = vi.fn(async () => ({ ok: true, result: { channel: 'side-panel', active: true } }))
    const bridge = new MediaActionBridge({ ...wire(postToBackground, 'active'), deliverToWorkstation })

    const outcome = await bridge.attachToConversation(PAYLOAD)

    expect(deliverToWorkstation).not.toHaveBeenCalled()
    expect(postToBackground).toHaveBeenCalledWith(expect.objectContaining({
      type: RUNTIME_MESSAGE.openAssistantWithMedia,
    }))
    expect(outcome).toMatchObject({ ok: true, status: 'attached', channel: 'side-panel' })
  })

  it('keeps the workstation closed when the worker cannot be reached', async () => {
    // An unreachable worker cannot rule a panel out, and the panel channel holds
    // the media either way — so the workstation stays shut and the request is
    // reported as a failure instead of a success nobody received.
    const deliverToWorkstation = vi.fn(async () => 'attached' as WorkstationResult)
    const postToBackground = vi.fn(async () => null)
    const bridge = new MediaActionBridge({ ...wire(postToBackground, 'unreachable'), deliverToWorkstation })

    const outcome = await bridge.attachToConversation(PAYLOAD)

    expect(deliverToWorkstation).not.toHaveBeenCalled()
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('uses the floating workstation only when no side panel is connected', async () => {
    const deliverToWorkstation = vi.fn(async () => 'attached' as WorkstationResult)
    const postToBackground = vi.fn(async () => ({ ok: true, active: false }))
    const bridge = new MediaActionBridge({ ...wire(postToBackground, 'inactive'), deliverToWorkstation })

    const outcome = await bridge.attachToConversation(PAYLOAD)

    expect(deliverToWorkstation).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ ok: true, channel: 'workbench' })
  })

  it('reads the panel state from the worker through the real transport', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, active: true }))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    try {
      expect(await browserTransport(() => hoverCopy('zh')).sidePanelState()).toBe('active')
      expect(sendMessage).toHaveBeenCalledWith({ type: RUNTIME_MESSAGE.checkSidePanelOpen })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports a closed panel only on a positive answer', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, active: false }))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    try {
      expect(await browserTransport(() => hoverCopy('zh')).sidePanelState()).toBe('inactive')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports an unreachable worker rather than a closed panel', async () => {
    // The distinction matters: "no panel" opens the workstation, "unknown" must
    // not.
    const cases: Array<() => unknown> = [
      () => undefined,
      () => null,
      () => ({ ok: false }),
      () => ({ ok: true }),
      () => ({ ok: true, active: 'yes' }),
    ]
    for (const answer of cases) {
      vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => answer()) } })
      try {
        expect(await browserTransport(() => hoverCopy('zh')).sidePanelState()).toBe('unreachable')
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })
})
