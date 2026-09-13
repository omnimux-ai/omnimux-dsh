// @vitest-environment jsdom
/**
 * Video detection contract.
 *
 * Modern players paint a transparent click catcher over the video, so the
 * pointer hits a `<div>` that is the video's *sibling*. Walking up from it never
 * reaches the video, which is why hovering a Twitter/X video produced nothing.
 * These cases pin the sideways probe, the control guard and the point-based
 * disambiguation that keep the fix from over-reaching.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaDetector, resolvePointerTarget } from '../src/content/media-hover/detector.ts'
import { findMediaElement, normalizeMedia, siblingMediaOf } from '../src/content/media-hover/payload.ts'
import { isControlSizedElement } from '../src/content/media-hover/video-anchor.ts'

const VIEWPORT = { width: 1200, height: 800 }

/** jsdom has no layout engine, so every box is declared explicitly. */
function box(element: Element, left: number, top: number, width: number, height: number): void {
  const rect = {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }
  element.getBoundingClientRect = () => rect as DOMRect
}

/** The X/Twitter shape: a video and a click catcher side by side in one wrapper. */
function appendOverlaidVideo(options: {
  src?: string
  poster?: string
  width?: number
  height?: number
  left?: number
  top?: number
} = {}): { wrapper: HTMLDivElement; video: HTMLVideoElement; overlay: HTMLDivElement } {
  const wrapper = document.createElement('div')
  const video = document.createElement('video')
  if (options.src !== undefined) video.setAttribute('src', options.src)
  if (options.poster !== undefined) video.setAttribute('poster', options.poster)
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  wrapper.append(video, overlay)
  // The capsule is offered for posts and works only, so the fixture is mounted
  // in a post container: a bare player under <body> is rejected by the
  // creative-asset classifier however large it renders.
  document.body.insertAdjacentHTML('beforeend', '<article></article>')
  const article = document.querySelector('article')
  if (article === null) throw new Error('article fixture missing')
  article.appendChild(wrapper)

  const width = options.width ?? 600
  const height = options.height ?? 340
  const left = options.left ?? 100
  const top = options.top ?? 100
  box(wrapper, left, top, width, height)
  box(video, left, top, width, height)
  box(overlay, left, top, width, height)
  return { wrapper, video, overlay }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('sibling overlay probing', () => {
  it('resolves the video beside a transparent click catcher', () => {
    const { wrapper, video, overlay } = appendOverlaidVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    // Walk up from the overlay, exactly as the detector does.
    expect(findMediaElement(overlay, { x: 400, y: 250 })).toBe(video)

    // …and through the public entry point the detector uses.
    expect(resolvePointerTarget(400, 250, () => overlay)).toBe(video)
    expect(wrapper.contains(video)).toBe(true)
  })

  it('reads the whole ladder for a blob video instead of dropping it', () => {
    const { video, overlay } = appendOverlaidVideo({ src: 'blob:https://x.com/9f3c-1a2b' })
    const resolved = resolvePointerTarget(400, 250, () => overlay)
    expect(resolved).toBe(video)

    const payload = normalizeMedia(video, 'video', 'https://x.com/status/1')
    // A `blob:` handle is page-scoped, so it is recorded as an identity and
    // flagged non-attachable rather than being filtered out of existence.
    expect(payload).not.toBeNull()
    expect(payload?.sourceKind).toBe('blob')
    expect(payload?.attachable).toBe(false)
    expect(payload?.src).toBe('blob:https://x.com/9f3c-1a2b')
  })

  it('prefers the media whose box actually contains the pointer', () => {
    const wrapper = document.createElement('div')
    const first = document.createElement('video')
    const second = document.createElement('video')
    first.setAttribute('src', 'https://cdn.example.com/v/one.mp4')
    second.setAttribute('src', 'https://cdn.example.com/v/two.mp4')
    const overlay = document.createElement('div')
    wrapper.append(first, second, overlay)
    document.body.appendChild(wrapper)
    box(wrapper, 0, 0, 900, 400)
    box(first, 0, 0, 400, 400)
    box(second, 500, 0, 400, 400)
    box(overlay, 0, 0, 900, 400)

    expect(findMediaElement(overlay, { x: 700, y: 200 })).toBe(second)
    expect(findMediaElement(overlay, { x: 100, y: 200 })).toBe(first)
  })

  it('refuses a sibling that a pointer position does not touch', () => {
    const { overlay } = appendOverlaidVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    // Well outside the video box: a caption or a toolbar beside the player is
    // not a request for the video capsule.
    expect(findMediaElement(overlay, { x: 5000, y: 5000 })).toBeNull()
  })

  it('falls back to the first eligible media when no point is known', () => {
    const { video, overlay } = appendOverlaidVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    expect(siblingMediaOf(overlay.parentElement as Element)).toBe(video)
  })

  it('ignores a sibling below the 40px threshold', () => {
    const wrapper = document.createElement('div')
    const tiny = document.createElement('video')
    tiny.setAttribute('src', 'https://cdn.example.com/v/tiny.mp4')
    const overlay = document.createElement('div')
    wrapper.append(tiny, overlay)
    document.body.appendChild(wrapper)
    box(wrapper, 100, 100, 300, 300)
    box(tiny, 100, 100, 36, 36)
    box(overlay, 100, 100, 300, 300)
    expect(findMediaElement(overlay, { x: 200, y: 200 })).toBeNull()
  })

  it('never scans the document body', () => {
    const video = document.createElement('video')
    video.setAttribute('src', 'https://cdn.example.com/v/far.mp4')
    document.body.appendChild(video)
    box(video, 0, 0, 600, 400)
    const stray = document.createElement('div')
    document.body.appendChild(stray)
    box(stray, 900, 700, 20, 20)
    expect(siblingMediaOf(document.body)).toBeNull()
  })

  it('keeps descendant resolution working', () => {
    const img = document.createElement('img')
    img.setAttribute('src', 'https://cdn.example.com/a.png')
    const badge = document.createElement('span')
    img.appendChild(badge)
    document.body.appendChild(img)
    expect(findMediaElement(badge)).toBe(img)
  })
})

describe('control guard', () => {
  it('treats a small button as a control and a small image as content', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    box(button, 0, 0, 40, 40)
    expect(isControlSizedElement(button)).toBe(true)

    const link = document.createElement('a')
    link.setAttribute('href', '/x')
    document.body.appendChild(link)
    box(link, 0, 0, 32, 32)
    expect(isControlSizedElement(link)).toBe(true)

    const image = document.createElement('img')
    image.setAttribute('src', 'https://cdn.example.com/a.png')
    document.body.appendChild(image)
    box(image, 0, 0, 36, 36)
    // A thumbnail CSS shrank to 36px is still a thumbnail, not a control.
    expect(isControlSizedElement(image)).toBe(false)
  })

  it('does not treat a full-width link wrapper as a control', () => {
    const link = document.createElement('a')
    link.setAttribute('href', '/post/1')
    document.body.appendChild(link)
    box(link, 0, 0, 600, 400)
    expect(isControlSizedElement(link)).toBe(false)
  })

  it('returns no candidate while the pointer aims at the player controls', () => {
    const { video, overlay } = appendOverlaidVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    const play = document.createElement('button')
    play.className = 'play'
    overlay.appendChild(play)
    box(play, 108, 400, 44, 44)

    expect(resolvePointerTarget(120, 410, () => play)).toBeNull()
    // The same position resolved to the video when the control is not there.
    expect(resolvePointerTarget(120, 410, () => overlay)).toBe(video)
  })
})

describe('detector wiring', () => {
  it('reports a candidate for a video reached through its overlay', () => {
    const { overlay } = appendOverlaidVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    const seen: string[] = []
    const detector = new MediaDetector(
      { onCandidate: (candidate) => { seen.push(candidate.payload.type) } },
      {
        elementFromPoint: () => overlay,
        viewport: () => ({ ...VIEWPORT }),
        now: () => 1_700_000_000_000,
        host: () => 'x.com',
      },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 250 }))
    expect(seen).toEqual(['video'])
    detector.dispose()
  })

  it('reuses the cached candidate across repeated moves', () => {
    const { overlay } = appendOverlaidVideo({ src: 'blob:https://x.com/9f3c-1a2b' })
    const payloads: string[] = []
    const detector = new MediaDetector(
      { onCandidate: (candidate) => { payloads.push(candidate.payload.id) } },
      {
        elementFromPoint: () => overlay,
        viewport: () => ({ ...VIEWPORT }),
        now: () => 1_700_000_000_000,
        host: () => 'x.com',
      },
    )
    detector.start()
    for (let index = 0; index < 4; index += 1) {
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 400 + index, clientY: 250 }))
    }
    expect(payloads).toHaveLength(4)
    expect(new Set(payloads).size).toBe(1)
    detector.dispose()
  })

  it('strictly stays silent on non-whitelisted hosts for video overlay', () => {
    const { overlay } = appendOverlaidVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    const seen: string[] = []
    const detector = new MediaDetector(
      { onCandidate: (candidate) => { seen.push(candidate.payload.type) } },
      {
        elementFromPoint: () => overlay,
        viewport: () => ({ ...VIEWPORT }),
        now: () => 1_700_000_000_000,
        host: () => 'page.example.com',
      },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 250 }))
    expect(seen).toHaveLength(0)
    detector.dispose()
  })

  it('stays silent when the hit test lands on a control', () => {
    const { overlay } = appendOverlaidVideo({ src: 'https://cdn.example.com/v/clip.mp4' })
    const play = document.createElement('button')
    overlay.appendChild(play)
    box(play, 108, 400, 44, 44)

    const onCandidate = vi.fn()
    const detector = new MediaDetector(
      { onCandidate },
      {
        elementFromPoint: () => play,
        viewport: () => ({ ...VIEWPORT }),
        now: () => 1_700_000_000_000,
        host: () => 'page.example.com',
      },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 410 }))
    expect(onCandidate).not.toHaveBeenCalled()
    detector.dispose()
  })
})
