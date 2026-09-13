// @vitest-environment jsdom
/**
 * Detection-layer contract: pointer → element resolution, eligibility
 * thresholds, URL normalisation and the WeakMap candidate cache.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaDetector } from '../src/content/media-hover/detector.ts'
import {
  MIN_MEDIA_SIZE_PX,
  findMediaElement,
  isEligibleMediaSize,
  mediaIdOf,
  normalizeMedia,
  toAbsoluteUrl,
} from '../src/content/media-hover/payload.ts'

const VIEWPORT = { width: 1200, height: 800 }

function makeEnvironment() {
  return {
    elementFromPoint: () => null as Element | null,
    viewport: () => ({ ...VIEWPORT }),
    now: () => 1_700_000_000_000,
  }
}

/** An <img> with an explicit layout box; jsdom has no layout engine. */
function appendImage(options: {
  width: number
  height: number
  src?: string
  naturalWidth?: number
  naturalHeight?: number
  top?: number
  left?: number
  alt?: string
}): HTMLImageElement {
  const img = document.createElement('img')
  img.setAttribute('src', options.src ?? 'https://cdn.example.com/a.png')
  img.setAttribute('alt', options.alt ?? '')
  if (options.naturalWidth !== undefined) {
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: options.naturalWidth })
  }
  if (options.naturalHeight !== undefined) {
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: options.naturalHeight })
  }
  const box = {
    x: options.left ?? 100,
    y: options.top ?? 100,
    left: options.left ?? 100,
    top: options.top ?? 100,
    right: (options.left ?? 100) + options.width,
    bottom: (options.top ?? 100) + options.height,
    width: options.width,
    height: options.height,
    toJSON: () => ({}),
  }
  img.getBoundingClientRect = () => box as DOMRect
  document.body.appendChild(img)
  return img
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('eligibility threshold', () => {
  it('accepts exactly 40px and rejects 39px', () => {
    expect(MIN_MEDIA_SIZE_PX).toBe(40)
    expect(isEligibleMediaSize(40, 40)).toBe(true)
    expect(isEligibleMediaSize(39, 40)).toBe(false)
    expect(isEligibleMediaSize(40, 39)).toBe(false)
  })

  it('rejects a media element one pixel below the threshold', () => {
    const detector = new MediaDetector({ onCandidate: vi.fn() }, makeEnvironment())
    const tooSmall = appendImage({ width: 39, height: 120 })
    expect(detector.peek(tooSmall)).toBeNull()
    expect(detector.rectOf(tooSmall).width).toBe(39)
  })

  it('accepts a media element exactly at the threshold', () => {
    const img = appendImage({ width: 40, height: 40 })
    expect(isEligibleMediaSize(40, 40)).toBe(true)
    expect(normalizeMedia(img, 'image', 'https://page.example.com/')).not.toBeNull()
  })
})

describe('URL normalisation', () => {
  it('absolutises a relative source against the page address', () => {
    expect(toAbsoluteUrl('/media/a.png', 'https://page.example.com/post/1'))
      .toBe('https://page.example.com/media/a.png')
    expect(toAbsoluteUrl('b.png', 'https://page.example.com/post/1'))
      .toBe('https://page.example.com/post/b.png')
  })

  it('rejects inline and object URLs that cannot be re-fetched downstream', () => {
    const base = 'https://page.example.com/'
    const inlineImage = appendImage({ width: 200, height: 200, src: 'data:image/png;base64,AAAA' })
    const blobImage = appendImage({ width: 200, height: 200, src: 'blob:https://page.example.com/x' })
    expect(normalizeMedia(inlineImage, 'image', base)).toBeNull()
    expect(normalizeMedia(blobImage, 'image', base)).toBeNull()
  })

  it('falls back to the first <source> when a video has no poster', () => {
    const video = document.createElement('video')
    const source = document.createElement('source')
    source.setAttribute('src', '/v/clip.mp4')
    video.appendChild(source)
    const box = {
      x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 200,
      width: 300, height: 200, toJSON: () => ({}),
    }
    video.getBoundingClientRect = () => box as DOMRect
    document.body.appendChild(video)

    const payload = normalizeMedia(video, 'video', 'https://page.example.com/watch')
    // Relative sources resolve against the page address the detector read from
    // the document, so the payload is absolute before it leaves this layer.
    expect(payload?.src).toBe('https://page.example.com/v/clip.mp4')
    expect(payload?.pageUrl).toBe(location.href)
    expect(payload?.type).toBe('video')
    expect(payload?.type).toBe('video')
  })

  it('prefers the poster of a video over its playable source', () => {
    const video = document.createElement('video')
    video.setAttribute('poster', '/p/cover.jpg')
    video.setAttribute('src', '/v/clip.mp4')
    video.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 200,
      width: 300, height: 200, toJSON: () => ({}),
    }) as DOMRect
    document.body.appendChild(video)
    // A bare relative poster resolves against the live document, because that is
    // what the page itself would request; an absolute one passes straight through.
    expect(normalizeMedia(video, 'video', 'https://page.example.com/')?.src)
      .toBe(new URL('/p/cover.jpg', location.href).href)
    video.setAttribute('poster', 'https://cdn.example.com/p/cover.jpg')
    expect(normalizeMedia(video, 'video', 'https://page.example.com/')?.src)
      .toBe('https://cdn.example.com/p/cover.jpg')
  })
})

describe('pointer target resolution', () => {
  it('walks up from a descendant to the nearest media ancestor', () => {
    const wrapper = document.createElement('div')
    const img = document.createElement('img')
    img.setAttribute('src', 'https://cdn.example.com/a.png')
    const badge = document.createElement('span')
    img.appendChild(badge)
    wrapper.appendChild(img)
    document.body.appendChild(wrapper)
    expect(findMediaElement(badge)).toBe(img)
  })

  it('resolves the element the hit test returns, not the event target', () => {
    const img = appendImage({ width: 300, height: 300 })
    const events: string[] = []
    const detector = new MediaDetector(
      { onCandidate: (candidate) => { events.push(candidate.payload.src) } },
      { ...makeEnvironment(), elementFromPoint: () => img },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 150 }))
    expect(events).toEqual(['https://cdn.example.com/a.png'])
    detector.dispose()
  })

  it('stays silent when the hit test lands outside any media', () => {
    const onCandidate = vi.fn()
    const detector = new MediaDetector(
      { onCandidate },
      { ...makeEnvironment(), elementFromPoint: () => document.body },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }))
    expect(onCandidate).not.toHaveBeenCalled()
    detector.dispose()
  })

  it('reports nothing while the pointer rests on a below-threshold element', () => {
    const onCandidate = vi.fn()
    const small = appendImage({ width: 20, height: 20 })
    const detector = new MediaDetector(
      { onCandidate },
      { ...makeEnvironment(), elementFromPoint: () => small },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 5, clientY: 5 }))
    expect(onCandidate).not.toHaveBeenCalled()
    detector.dispose()
  })
})

describe('candidate cache', () => {
  it('reuses one payload for repeated moves over the same element', () => {
    const img = appendImage({ width: 300, height: 300 })
    const payloads: string[] = []
    const detector = new MediaDetector(
      { onCandidate: (candidate) => { payloads.push(candidate.payload.id) } },
      { ...makeEnvironment(), elementFromPoint: () => img },
    )
    detector.start()
    for (let i = 0; i < 5; i += 1) {
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 120 + i, clientY: 120 }))
    }
    expect(payloads).toHaveLength(5)
    expect(new Set(payloads).size).toBe(1)
    expect(payloads[0]).toBe(mediaIdOf('image', 'https://cdn.example.com/a.png'))
    detector.dispose()
  })

  it('stops reporting after dispose', () => {
    const img = appendImage({ width: 300, height: 300 })
    const onCandidate = vi.fn()
    const detector = new MediaDetector(
      { onCandidate },
      { ...makeEnvironment(), elementFromPoint: () => img },
    )
    detector.start()
    detector.dispose()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 120 }))
    expect(onCandidate).not.toHaveBeenCalled()
  })

  it('drops a candidate whose element left the viewport', () => {
    const img = appendImage({ width: 300, height: 300, top: 100 })
    const onInvalidate = vi.fn()
    const detector = new MediaDetector(
      { onCandidate: vi.fn(), onInvalidate },
      { ...makeEnvironment(), elementFromPoint: () => img },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 150 }))

    img.getBoundingClientRect = () => ({
      x: 0, y: -900, left: 0, top: -900, right: 300, bottom: -600,
      width: 300, height: 300, toJSON: () => ({}),
    }) as DOMRect
    detector.refresh()
    expect(onInvalidate).toHaveBeenCalledWith('scroll')
    detector.dispose()
  })
})
