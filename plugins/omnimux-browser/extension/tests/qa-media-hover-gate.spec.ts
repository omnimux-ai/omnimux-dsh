// @vitest-environment jsdom
/**
 * QA acceptance gate for the page-media hover assistant.
 *
 * Written independently of the feature's own specs, this file asserts the five
 * acceptance areas from the requirement rather than re-testing the implementation
 * shape:
 *
 *  A. the tooltip is a top-level SIBLING of the capsule inside the shadow root,
 *     so a media card with `overflow: hidden` cannot clip it;
 *  B. the tooltip is pure white, sits above the icon with a downward tail, and
 *     flips below when the icon is near the viewport top;
 *  C. the >= 40px media threshold admits images and videos and ignores avatars;
 *  D. the three shortcuts close their loops (library / clipboard / conversation);
 *  E. the cross-module constants agree;
 *  F. the capsule is two-staged: a 36px brand circle that widens to the 112px
 *     row of three actions, and folds back on the required buffer.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaActionBridge, browserTransport, legacyCopy } from '../src/content/media-hover/actions.ts'
import { MediaCapsule } from '../src/content/media-hover/capsule.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { MediaDetector } from '../src/content/media-hover/detector.ts'
import {
  CAPSULE_SPEC,
  INSPIRATION_STORE,
  RUNTIME_MESSAGE,
  TIMING,
  TOOLTIP_SPEC,
  computeCapsuleGeometry,
} from '../src/content/media-hover/messages.ts'
import { MEDIA_OVERLAY_HOST_ID, MediaOverlay } from '../src/content/media-hover/overlay.ts'
import {
  MIN_MEDIA_SIZE_PX,
  isEligibleMediaSize,
  measureElement,
  normalizeMedia,
  toAbsoluteUrl,
} from '../src/content/media-hover/payload.ts'
import { MediaTooltip, placeTooltip, trimTooltipText } from '../src/content/media-hover/tooltip.ts'
import type { AnchorRect, HoverCandidate, HoveredMedia, ViewportBox } from '../src/content/media-hover/types.ts'
import {
  MEDIA_INSPIRATION_KEY,
  MEDIA_INSPIRATION_LIMIT,
  appendMediaInspiration,
  readMediaInspiration,
  type MediaInspirationRecord,
} from '../src/background/media-library.ts'

// ---------------------------------------------------------------- helpers ---

/**
 * The authored overlay stylesheet, read from disk.
 *
 * Vitest stubs `?inline` imports, so the string the shadow root receives at
 * runtime is empty inside this environment; the authored file is the exact input
 * the build minifies into that string, so asserting on it checks the real source.
 */
const OVERLAY_STYLES = readFileSync(
  resolve(process.cwd(), 'src/content/media-hover/styles.css'),
  'utf8',
)

/** Removes `/* … *\/` blocks so a selector inside a comment cannot be matched. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Declaration block of the first real rule for `selector`. */
function declarationsOf(css: string, selector: string): string {
  const clean = stripComments(css)
  let from = 0
  for (;;) {
    const at = clean.indexOf(selector, from)
    if (at < 0) throw new Error(`rule not found in stylesheet: ${selector}`)
    const after = clean.slice(at + selector.length)
    const brace = after.indexOf('{')
    const prefix = brace < 0 ? '' : after.slice(0, brace).trim()
    if (brace >= 0 && (prefix === '' || prefix.startsWith(','))) {
      const body = after.slice(brace + 1)
      return body.slice(0, body.indexOf('}')).replace(/\s+/g, '')
    }
    from = at + selector.length
  }
}

/** Normalises a CSS colour declaration to `rgb()`/`rgba()` so alpha cannot hide. */
function normalizeColor(raw: string): string {
  const value = raw.trim().toLowerCase()
  const short = /^#([0-9a-f]{3})$/.exec(value)
  if (short !== null) {
    const [r, g, b] = short[1]!.split('')
    return `rgb(${parseInt(`${r}${r}`, 16)}, ${parseInt(`${g}${g}`, 16)}, ${parseInt(`${b}${b}`, 16)})`
  }
  const long = /^#([0-9a-f]{6})$/.exec(value)
  if (long !== null) {
    const hex = long[1]!
    return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`
  }
  return value
}

function backgroundOf(declarations: string): string {
  const match = /background:([^;]+)/.exec(declarations)
  if (match === null) throw new Error('no background declaration')
  return normalizeColor(match[1]!)
}

/** Fixed pixel box for an element; jsdom has no layout engine. */
function stubBox(element: Element, width: number, height: number, left = 0, top = 0): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect)
}

function rect(left: number, top: number, width: number, height: number): AnchorRect {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

const VIEWPORT: ViewportBox = { width: 1280, height: 800, margin: TOOLTIP_SPEC.viewportMargin }
const TOOLTIP_BOX = { width: 96, height: 28 }

function media(src: string, id = src): HoveredMedia {
  return {
    id,
    type: 'image',
    src,
    previewSrc: src,
    pageUrl: 'https://page.example.com/post/1',
    pageTitle: '示例页面',
    width: 480,
    height: 320,
    naturalWidth: 960,
    naturalHeight: 640,
    alt: '示例图片',
    capturedAt: 1_700_000_000_000,
  }
}

/** Drives the detector once over `element` and returns what it reported. */
function detectOnce(element: Element): HoverCandidate[] {
  const hits: HoverCandidate[] = []
  const detector = new MediaDetector(
    { onCandidate: (candidate) => { hits.push(candidate) } },
    {
      elementFromPoint: () => element,
      viewport: () => ({ width: 1280, height: 800 }),
      now: () => 1_000,
    },
  )
  detector.start()
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: 12, clientY: 12, bubbles: true }))
  detector.dispose()
  return hits
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`).forEach((node) => node.remove())
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    i18n: { getUILanguage: () => 'zh-CN' },
  })
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__dshBrowserWorkstation
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ------------------------------------------------------------------ A. 架构 ---

describe('A. tooltip and capsule are sibling top-level nodes', () => {
  it('mounts both as direct children of the same shadow layer, never nested', () => {
    const overlay = new MediaOverlay(document)
    overlay.mount()

    const host = document.getElementById(MEDIA_OVERLAY_HOST_ID) as HTMLElement
    const shadow = host.shadowRoot!
    const layer = shadow.querySelector('.omnimux-media-hover-layer')!
    const capsule = shadow.querySelector('.omnimux-capsule-bar') as HTMLElement
    const tooltip = shadow.querySelector('.white-tooltip') as HTMLElement

    // Both are DIRECT children of the same layer: neither wraps the other.
    expect(capsule.parentElement).toBe(layer)
    expect(tooltip.parentElement).toBe(layer)
    expect(capsule.parentElement).toBe(tooltip.parentElement)

    // The tooltip can never be inside the capsule, at any depth.
    const ancestorsOfTooltip: Node[] = []
    for (let node: Node | null = tooltip.parentNode; node !== null; node = node.parentNode) {
      ancestorsOfTooltip.push(node)
    }
    expect(ancestorsOfTooltip).not.toContain(capsule)

    overlay.dispose()
  })

  it('keeps the tooltip outside an overflow-hidden media card entirely', () => {
    document.body.innerHTML = '<div id="card" style="overflow:hidden">'
      + '<img id="hero" width="640" height="420" src="https://cdn.example.com/hero.png">'
      + '</div>'
    const card = document.getElementById('card') as HTMLElement

    const overlay = new MediaOverlay(document)
    overlay.mount()

    const host = document.getElementById(MEDIA_OVERLAY_HOST_ID) as HTMLElement
    const shadow = host.shadowRoot!
    const tooltip = shadow.querySelector('.white-tooltip')!
    const capsule = shadow.querySelector('.omnimux-capsule-bar')!

    // A clipping ancestor can only hide its own descendants.
    expect(card.contains(tooltip)).toBe(false)
    expect(card.contains(capsule)).toBe(false)
    expect(tooltip.getRootNode()).toBe(shadow)
    // The host itself lives on <html>, above every page card.
    expect(host.parentElement).toBe(document.documentElement)

    overlay.dispose()
  })

  it('pins both nodes with fixed positioning so page overflow cannot clip them', () => {
    expect(declarationsOf(OVERLAY_STYLES, '.white-tooltip')).toContain('position:fixed')
    expect(declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar')).toContain('position:fixed')
    expect(declarationsOf(OVERLAY_STYLES, '.omnimux-media-hover-layer')).toContain('overflow:visible')
  })

  it('layers the tooltip independently of the capsule', () => {
    expect(declarationsOf(OVERLAY_STYLES, '.white-tooltip')).toContain(`z-index:${2147483645}`)
    expect(declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar')).toContain(`z-index:${2147483646}`)
  })
})

// ------------------------------------------------------------ B. 气泡与翻转 ---

describe('B. pure-white tooltip placement and top-edge flip', () => {
  it('paints an opaque pure-white background, not a translucent one', () => {
    expect(TOOLTIP_SPEC.background.toLowerCase()).toBe('#ffffff')
    expect(backgroundOf(declarationsOf(OVERLAY_STYLES, '.white-tooltip'))).toBe('rgb(255, 255, 255)')
  })

  it('floats above the icon with a downward-pointing tail', () => {
    const anchor = rect(600, 400, CAPSULE_SPEC.iconSize, CAPSULE_SPEC.iconSize)
    const placement = placeTooltip(anchor, VIEWPORT, TOOLTIP_BOX)

    expect(placement.side).toBe('above')
    expect(placement.flipped).toBe(false)
    // Bottom edge of the bubble sits the spec gap above the icon's top edge.
    expect(placement.top + TOOLTIP_BOX.height).toBe(anchor.top - TOOLTIP_SPEC.offsetY)
    // Horizontally centred on the icon.
    expect(placement.left + TOOLTIP_BOX.width / 2).toBe(anchor.left + anchor.width / 2)

    const tail = declarationsOf(OVERLAY_STYLES, '.white-tooltip[data-side="above"] .white-tooltip-arrow')
    expect(tail).toContain('top:100%')
    expect(tail).toContain('border-top:5pxsolid#fff')
    expect(tail).not.toContain('border-bottom')
  })

  it('flips below when the icon is against the browser top edge', () => {
    const anchor = rect(600, 3, CAPSULE_SPEC.iconSize, CAPSULE_SPEC.iconSize)
    const placement = placeTooltip(anchor, VIEWPORT, TOOLTIP_BOX)

    expect(placement.side).toBe('below')
    expect(placement.flipped).toBe(true)
    // Clear of the icon and still inside the viewport.
    expect(placement.top).toBeGreaterThanOrEqual(anchor.bottom + TOOLTIP_SPEC.offsetY + TOOLTIP_SPEC.arrow.size)
    expect(placement.top).toBeGreaterThanOrEqual(VIEWPORT.margin)
    expect(placement.top + TOOLTIP_BOX.height).toBeLessThanOrEqual(VIEWPORT.height - VIEWPORT.margin)

    const tail = declarationsOf(OVERLAY_STYLES, '.white-tooltip[data-side="below"] .white-tooltip-arrow')
    expect(tail).toContain('bottom:100%')
    expect(tail).toContain('border-bottom:5pxsolid#fff')
    expect(tail).not.toContain('border-top')
  })

  it('never pushes the bubble off screen when no side has room', () => {
    const tiny: ViewportBox = { width: 320, height: 24, margin: TOOLTIP_SPEC.viewportMargin }
    const anchor = rect(160, 20, 24, 24)
    const placement = placeTooltip(anchor, tiny, TOOLTIP_BOX)

    expect(placement.top).toBeGreaterThanOrEqual(tiny.margin)
    expect(placement.left).toBeGreaterThanOrEqual(tiny.margin)
    expect(placement.left + TOOLTIP_BOX.width).toBeLessThanOrEqual(
      Math.max(tiny.margin, tiny.width - tiny.margin),
    )
  })

  it('keeps the bubble inside both horizontal edges for edge icons', () => {
    for (const anchor of [rect(0, 400, 30, 30), rect(1250, 400, 30, 30)]) {
      const placement = placeTooltip(anchor, VIEWPORT, TOOLTIP_BOX)
      expect(placement.left).toBeGreaterThanOrEqual(VIEWPORT.margin)
      expect(placement.left + TOOLTIP_BOX.width).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT.margin)
    }
  })

  it('applies the flip to the real node, not only to the geometry helper', () => {
    const tooltip = MediaTooltip.create(() => TOOLTIP_BOX.width)
    const anchor = rect(600, 2, 30, 30)
    tooltip.show('加入灵感库', anchor, VIEWPORT)

    expect(tooltip.element.getAttribute('data-side')).toBe('below')
    expect(Number.parseFloat(tooltip.element.style.top)).toBeGreaterThanOrEqual(anchor.bottom)
    // The tail is positioned relative to the bubble and stays inside it.
    const arrowLeft = Number.parseFloat((tooltip.element.querySelector('.white-tooltip-arrow') as HTMLElement).style.left)
    expect(arrowLeft).toBeGreaterThanOrEqual(0)
    expect(arrowLeft).toBeLessThanOrEqual(TOOLTIP_BOX.width)

    tooltip.destroy()
    expect(document.querySelector('.white-tooltip')).toBeNull()
  })

  it('truncates an over-long label instead of overflowing the bubble', () => {
    const label = trimTooltipText('灵感'.repeat(400))
    expect(label.length).toBeLessThanOrEqual(260)
    expect(label.endsWith('…')).toBe(true)
  })
})

// --------------------------------------------------------------- C. 侦测阈值 ---

describe('C. the >= 40px media threshold', () => {
  it('admits exactly 40px and rejects every smaller edge', () => {
    const cases: [number, number, boolean][] = [
      [39, 40, false],
      [40, 39, false],
      [39, 39, false],
      [40, 40, true],
      [41, 40, true],
      [40, 2000, true],
      [1920, 1080, true],
    ]
    for (const [width, height, expected] of cases) {
      expect(isEligibleMediaSize(width, height), `${width}x${height}`).toBe(expected)
    }
    expect(MIN_MEDIA_SIZE_PX).toBe(40)
  })

  it('treats degenerate sizes as ineligible', () => {
    expect(isEligibleMediaSize(0, 0)).toBe(false)
    expect(isEligibleMediaSize(-40, -40)).toBe(false)
    expect(isEligibleMediaSize(Number.NaN, 40)).toBe(false)
    expect(isEligibleMediaSize(40, Number.NaN)).toBe(false)
  })

  it('triggers the hover bar for an eligible image', () => {
    const image = document.createElement('img')
    image.src = 'https://cdn.example.com/hero.png'
    document.body.appendChild(image)
    stubBox(image, 640, 420)

    const hits = detectOnce(image)

    expect(hits).toHaveLength(1)
    expect(hits[0]?.payload.src).toBe('https://cdn.example.com/hero.png')
    expect(hits[0]?.payload.type).toBe('image')
  })

  it('ignores an avatar rendered below the threshold', () => {
    const avatar = document.createElement('img')
    avatar.src = 'https://cdn.example.com/avatar.png'
    document.body.appendChild(avatar)
    stubBox(avatar, 32, 32)

    expect(detectOnce(avatar)).toHaveLength(0)
  })

  it('ignores a large image that CSS shrank to avatar size', () => {
    const image = document.createElement('img')
    image.src = 'https://cdn.example.com/huge.png'
    image.setAttribute('width', '1200')
    image.setAttribute('height', '800')
    document.body.appendChild(image)
    // The rendered box is what counts, not the intrinsic or declared size.
    stubBox(image, 36, 36)

    expect(measureElement(image)).toEqual({ width: 36, height: 36 })
    expect(detectOnce(image)).toHaveLength(0)
  })

  it('applies the same threshold to video elements', () => {
    const video = document.createElement('video')
    video.setAttribute('poster', 'https://cdn.example.com/poster.png')
    document.body.appendChild(video)
    stubBox(video, 40, 40)
    expect(detectOnce(video)[0]?.payload.type).toBe('video')

    stubBox(video, 40, 39)
    expect(detectOnce(video)).toHaveLength(0)
  })

  it('resolves a relative media source to an absolute address', () => {
    expect(toAbsoluteUrl('/hero.png', 'https://page.example.com/post/1'))
      .toBe('https://page.example.com/hero.png')
    // A bare file name resolves against the page's directory, not its root.
    expect(toAbsoluteUrl('hero.png', 'https://page.example.com/post/1'))
      .toBe('https://page.example.com/post/hero.png')
    expect(toAbsoluteUrl('https://cdn.example.com/a.png', 'https://page.example.com/'))
      .toBe('https://cdn.example.com/a.png')
    expect(toAbsoluteUrl('', 'https://page.example.com/')).toBe('')

    const image = document.createElement('img')
    image.setAttribute('src', '/hero.png')
    document.body.appendChild(image)
    stubBox(image, 100, 100)
    const payload = normalizeMedia(image, 'image', 'https://page.example.com/post/1', {
      pageUrl: 'https://page.example.com/post/1',
      pageTitle: 'p',
      capturedAt: 1,
    })
    // The payload must never carry a relative address into the workbench.
    expect(payload?.src).toMatch(/^https?:\/\//)
    expect(payload?.src).toBe(new URL('/hero.png', location.href).href)
  })
})

// ----------------------------------------------------------- D. 功能闭环 ---

describe('D1. add to inspiration library', () => {
  function stubStorage(seed: Record<string, unknown> = {}): Map<string, unknown> {
    const data = new Map<string, unknown>(Object.entries(seed))
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => (data.has(key) ? { [key]: data.get(key) } : {})),
          set: vi.fn(async (patch: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(patch)) data.set(key, value)
          }),
        },
      },
    })
    return data
  }

  it('persists the record locally with its capture time', async () => {
    const data = stubStorage()
    const result = await appendMediaInspiration(media('https://cdn.example.com/a.png', 'a'), 1_700_000_000_000)

    expect(result.duplicate).toBe(false)
    const stored = data.get(MEDIA_INSPIRATION_KEY) as MediaInspirationRecord[]
    expect(stored).toHaveLength(1)
    expect(stored[0]?.src).toBe('https://cdn.example.com/a.png')
    expect(stored[0]?.savedAt).toBe(1_700_000_000_000)
    expect(await readMediaInspiration()).toHaveLength(1)
  })

  it('de-duplicates by media address without writing again', async () => {
    const data = stubStorage()
    await appendMediaInspiration(media('https://cdn.example.com/a.png', 'a'), 1)
    const setCalls = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls.length

    const second = await appendMediaInspiration(media('https://cdn.example.com/a.png', 'a'), 2)

    expect(second.duplicate).toBe(true)
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(setCalls)
    expect((data.get(MEDIA_INSPIRATION_KEY) as unknown[])).toHaveLength(1)
  })

  it('evicts the oldest record at the cap and keeps the newest first', async () => {
    const seeded = Array.from({ length: MEDIA_INSPIRATION_LIMIT }, (_unused, index) => ({
      ...media(`https://cdn.example.com/${index}.png`, `id-${index}`),
      savedAt: index,
    }))
    const data = stubStorage({ [MEDIA_INSPIRATION_KEY]: seeded })

    const result = await appendMediaInspiration(media('https://cdn.example.com/newest.png', 'newest'), 10_000)

    expect(result.evicted).toBe(1)
    const stored = data.get(MEDIA_INSPIRATION_KEY) as MediaInspirationRecord[]
    expect(stored).toHaveLength(MEDIA_INSPIRATION_LIMIT)
    expect(stored[0]?.id).toBe('newest')
    expect(stored.some((record) => record.id === `id-${MEDIA_INSPIRATION_LIMIT - 1}`)).toBe(false)
  })

  it('lets the caller see a rejected write instead of reporting a save', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => { throw new Error('quota') }) } },
    })

    const result = await appendMediaInspiration(media('https://cdn.example.com/a.png', 'a'), 1_000)

    // QA-1: a failed write must be distinguishable from a completed one, because
    // the background handler turns ANY resolved result into `{ ok: true }`.
    expect(result).toMatchObject({ ok: false })
  })

  it('does not paint the saved state when the library write was rejected', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => { throw new Error('quota') }) } },
    })
    const failures: unknown[] = []
    const bridge = new MediaActionBridge({
      deliverToWorkstation: vi.fn(async () => 'unavailable' as const),
      postToBackground: vi.fn(async () => {
        // Mirrors background/index.ts: the store's own `ok` decides the receipt, so
        // a rejected write reaches the capsule as `{ ok: false }` instead of as a
        // library entry nobody wrote.
        const result = await appendMediaInspiration(media('https://cdn.example.com/a.png', 'a'), 1_000)
        return result.ok
          ? { ok: true, result }
          : { ok: false, error: { code: 'storage-failed', message: 'inspiration store rejected the write' } }
      }),
      writeClipboard: vi.fn(async () => true),
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.saveToInspiration(media('https://cdn.example.com/a.png', 'a'))
    if (!outcome.ok) failures.push(outcome)

    // QA-1: nothing was stored, so the capsule must not show the saved mark.
    expect(outcome.ok).toBe(false)
    expect(failures).toHaveLength(1)
  })
})

describe('D2. copy the media link', () => {
  it('writes the absolute address to the system clipboard', async () => {
    const writeClipboard = vi.fn(async () => true)
    const bridge = new MediaActionBridge({
      deliverToWorkstation: vi.fn(async () => 'unavailable' as const),
      postToBackground: vi.fn(async () => ({ ok: true })),
      writeClipboard,
      copy: () => hoverCopy('zh'),
    })

    const outcome = await bridge.copyToClipboard(media('https://cdn.example.com/a.png'))

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('copied')
    expect(writeClipboard).toHaveBeenCalledWith('https://cdn.example.com/a.png')
  })

  it('prefers the async clipboard API through the real transport', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      const copied = await browserTransport(() => hoverCopy('zh'))
        .writeClipboard('https://cdn.example.com/a.png')
      expect(copied).toBe(true)
      expect(writeText).toHaveBeenCalledWith('https://cdn.example.com/a.png')
    } finally {
      Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'clipboard')
    }
  })

  it('falls back to the copy command and leaves no scratch node behind', () => {
    const exec = vi.fn(() => true)
    ;(document as Document & { execCommand?: (command: string) => boolean }).execCommand = exec

    expect(legacyCopy('https://cdn.example.com/a.png')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    // The hidden textarea the fallback creates must be removed again.
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })
})

describe('D3. add to the conversation', () => {
  it('wakes the floating workstation and trusts its receipt', async () => {
    const openWithMedia = vi.fn(async () => true)
    ;(globalThis as Record<string, unknown>).__dshBrowserWorkstation = { openWithMedia, isOpen: () => false }

    const outcome = await new MediaActionBridge(browserTransport(() => hoverCopy('zh')))
      .attachToConversation(media('https://cdn.example.com/a.png'))

    expect(openWithMedia).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ ok: true, status: 'attached', channel: 'workbench' })
  })

  it('falls back to the native side panel when no workstation is mounted', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, result: { channel: 'side-panel' } }))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })

    const outcome = await new MediaActionBridge(browserTransport(() => hoverCopy('zh')))
      .attachToConversation(media('https://cdn.example.com/a.png'))

    expect(outcome).toMatchObject({ ok: true, status: 'attached', channel: 'side-panel' })
    expect(sendMessage).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGE.openAssistantWithMedia,
      payload: expect.objectContaining({ src: 'https://cdn.example.com/a.png' }),
    })
  })

  it('never reports success when both channels fail', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => ({ ok: false })) } })

    const outcome = await new MediaActionBridge(browserTransport(() => hoverCopy('zh')))
      .attachToConversation(media('https://cdn.example.com/a.png'))

    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })
})

describe('D4. capsule icon state machine', () => {
  it('swaps the bulb for the kept mark and exposes the pressed state', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    const bulb = capsule.buttonElement('inspiration')!

    expect(bulb.getAttribute('aria-pressed')).toBe('false')
    const idle = bulb.innerHTML

    capsule.setState({ saved: true })

    expect(bulb.getAttribute('aria-pressed')).toBe('true')
    expect(bulb.classList.contains('is-saved')).toBe(true)
    expect(bulb.innerHTML).not.toBe(idle)
    capsule.destroy()
  })

  it('shows the tick on the copy icon and restores it afterwards', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    const copy = capsule.buttonElement('copy')!
    const idle = copy.innerHTML

    capsule.setState({ copied: true })
    expect(copy.classList.contains('is-done')).toBe(true)
    expect(copy.innerHTML).toContain('M20.5 6.5')  // check mark path

    capsule.setState({ copied: false })
    expect(copy.classList.contains('is-done')).toBe(false)
    expect(copy.innerHTML).toBe(idle)
    capsule.destroy()
  })

  it('clears the per-media state when a different media is hovered', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(media('https://cdn.example.com/a.png', 'a'))
    capsule.setState({ saved: true, copied: true, attached: true })
    expect(capsule.buttonElement('inspiration')!.getAttribute('aria-pressed')).toBe('true')

    capsule.render(media('https://cdn.example.com/b.png', 'b'))

    const snapshot = capsule.snapshot()
    expect(snapshot.saved).toBe(false)
    expect(snapshot.copied).toBe(false)
    expect(snapshot.attached).toBe(false)
    expect(capsule.buttonElement('inspiration')!.getAttribute('aria-pressed')).toBe('false')
    capsule.destroy()
  })
})

// ------------------------------------------------------------ E. 契约一致性 ---

describe('E. cross-module contract agreement', () => {
  it('keeps one cap for the inspiration store', () => {
    expect(INSPIRATION_STORE.limit).toBe(500)
    expect(MEDIA_INSPIRATION_LIMIT).toBe(INSPIRATION_STORE.limit)
  })

  it('keeps the capsule geometry clear of the viewport edges', () => {
    const geometry = computeCapsuleGeometry(
      { left: 1240, top: 100, right: 1276, bottom: 400 },
      { width: 168, height: CAPSULE_SPEC.height },
      VIEWPORT.width,
      VIEWPORT.height,
    )
    expect(geometry.left).toBeGreaterThanOrEqual(CAPSULE_SPEC.edgeMargin)
    expect(geometry.left + 168).toBeLessThanOrEqual(VIEWPORT.width - CAPSULE_SPEC.edgeMargin)
    expect(geometry.alignment).toBe('right')
  })

  it('keeps the attach receipt budget short enough to feel instant', () => {
    expect(TIMING.attachReceiptTimeout).toBeGreaterThan(0)
    expect(TIMING.attachReceiptTimeout).toBeLessThanOrEqual(1_000)
  })
})

// ------------------------------------------------- F. 两段式悬停展开 ---

describe('F. two-stage hover expansion', () => {
  it('paints stage one as a 36px circle and stage two as the 112px row', () => {
    expect(CAPSULE_SPEC.collapsedWidth).toBe(36)
    expect(CAPSULE_SPEC.width).toBe(112)
    // The circle must be exactly that: a 36px box with an 18px radius.
    expect(CAPSULE_SPEC.height).toBe(CAPSULE_SPEC.collapsedWidth)
    expect(CAPSULE_SPEC.borderRadius).toBe(CAPSULE_SPEC.height / 2)

    const base = declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar')
    expect(base).toContain('height:36px')
    expect(base).toContain('border-radius:18px')
    expect(declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar.is-collapsed')).toContain('width:36px')
    expect(declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar.is-expanded')).toContain('width:112px')
  })

  it('animates the width between the stages instead of snapping', () => {
    const base = declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar')
    // 0.22s on the shared ease-out curve, in the pill's own transition list.
    expect(base).toContain('width220mscubic-bezier(0.16,1,0.3,1)')
  })

  it('keeps both stage layers mounted and swaps them by opacity', () => {
    const brand = declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar.is-collapsed .omnimux-capsule-brand')
    const actions = declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar.is-expanded .omnimux-capsule-actions')
    const hiddenBrand = declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar.is-expanded .omnimux-capsule-brand')
    const hiddenActions = declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-bar.is-collapsed .omnimux-capsule-actions')

    expect(brand).toContain('opacity:1')
    expect(actions).toContain('opacity:1')
    expect(hiddenBrand).toContain('opacity:0')
    expect(hiddenActions).toContain('opacity:0')
    // A retiring layer must not keep taking the pointer, or stage one would sit
    // invisibly on top of the three shortcuts.
    expect(hiddenBrand).toContain('pointer-events:none')
    expect(hiddenActions).toContain('pointer-events:none')
  })

  it('keeps the three shortcuts off the pointer until stage two is on screen', () => {
    // `pointer-events` is inherited, but the icons' own `auto` beats the `none`
    // on the retired row: both stage layers are absolutely centred, so while the
    // pill is 36px wide the middle icon covers the brand circle. Without this
    // override a hover on folded stage one lands on the copy button and its hint
    // leaks before the capsule ever opens.
    const collapsedIcon = declarationsOf(
      OVERLAY_STYLES,
      '.omnimux-capsule-bar.is-collapsed .omnimux-capsule-icon',
    )
    const collapsedActions = declarationsOf(
      OVERLAY_STYLES,
      '.omnimux-capsule-bar.is-collapsed .omnimux-capsule-actions',
    )
    const expandedActions = declarationsOf(
      OVERLAY_STYLES,
      '.omnimux-capsule-bar.is-expanded .omnimux-capsule-actions',
    )

    expect(collapsedIcon).toContain('pointer-events:none!important')
    expect(collapsedActions).toContain('pointer-events:none!important')
    expect(collapsedActions).toContain('visibility:hidden')
    expect(expandedActions).toContain('pointer-events:auto')
    expect(expandedActions).toContain('visibility:visible')
    // Stage two is reachable through the base rule, which the busy guard
    // (`.omnimux-capsule-icon.is-busy`) still has to be able to override — so no
    // state rule may re-pin the icons once the row has opened.
    expect(declarationsOf(OVERLAY_STYLES, '.omnimux-capsule-icon')).toContain('pointer-events:auto')
  })

  it('carries the brand trigger in stage one and the three actions behind it', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))

    expect(capsule.stage).toBe('collapsed')
    expect(capsule.element.classList.contains('is-collapsed')).toBe(true)
    expect(capsule.brandElement().getAttribute('aria-label')).toBe('OmniMux')
    expect(capsule.brandElement().querySelectorAll('path').length).toBeGreaterThan(0)

    const actions = [...capsule.element.querySelectorAll('.omnimux-capsule-actions [data-action]')]
    expect(actions.map((node) => node.getAttribute('data-action'))).toEqual(['inspiration', 'copy', 'attach'])

    capsule.expand()
    expect(capsule.element.classList.contains('is-expanded')).toBe(true)
    // Expanding must not disturb the per-media marks the state machine paints.
    capsule.setState({ saved: true })
    expect(capsule.buttonElement('inspiration')!.classList.contains('is-saved')).toBe(true)
    capsule.destroy()
  })

  it('folds back inside the 180-250ms buffer the requirement asks for', () => {
    expect(TIMING.collapseGrace).toBeGreaterThanOrEqual(180)
    expect(TIMING.collapseGrace).toBeLessThanOrEqual(250)
    // Leaving the media still fades the whole capsule out on the shorter grace.
    expect(TIMING.leaveGrace).toBeLessThanOrEqual(TIMING.collapseGrace)
  })

  it('reserves the expanded footprint so stage two never leaves the viewport', () => {
    const media = rect(1240, 100, 36, 300)
    const metrics = { width: CAPSULE_SPEC.width, height: CAPSULE_SPEC.height }

    const geometry = computeCapsuleGeometry(media, metrics, VIEWPORT.width, VIEWPORT.height)

    expect(geometry.alignment).toBe('right')
    expect(geometry.left + CAPSULE_SPEC.width).toBeLessThanOrEqual(VIEWPORT.width - CAPSULE_SPEC.edgeMargin)
    expect(geometry.left + CAPSULE_SPEC.collapsedWidth).toBeLessThanOrEqual(
      geometry.left + CAPSULE_SPEC.width,
    )
  })
})
