// @vitest-environment jsdom
/**
 * V1 capsule behaviour for saving a hovered image into the host asset library.
 *
 * Covers the content-side seam: save-intent routing, the primary slot's
 * verbatim UI-Spec copy in both locales, the icon swap to the assets mark, the
 * MediaActionBridge message contract and the overlay's honest state machine
 * (busy / done / failure / unconfirmed / stale-response isolation).
 */
import { strict as assert } from 'node:assert'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaCapsule } from '../src/content/media-hover/capsule.ts'

// assert.equal keeps the hard-assertion contract explicit for review.
assert.equal(typeof MediaCapsule.create, 'function')
import { MediaActionBridge, type ActionTransport } from '../src/content/media-hover/actions.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { resolveSaveIntent } from '../src/content/media-hover/save-intent.ts'
import { MediaOverlay, MEDIA_OVERLAY_HOST_ID } from '../src/content/media-hover/overlay.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

const IMAGE: HoveredMedia = {
  id: 'image:https://cdn.example.com/photo.png',
  type: 'image',
  src: 'https://cdn.example.com/photo.png',
  previewSrc: 'https://cdn.example.com/photo.png',
  pageUrl: 'https://page.example.com/post/1',
  pageTitle: '示例页面',
  width: 480,
  height: 320,
  naturalWidth: 960,
  naturalHeight: 640,
  alt: '示例图片',
  capturedAt: 1_700_000_000_000,
}

const VIDEO: HoveredMedia = {
  ...IMAGE,
  id: 'video:https://cdn.example.com/clip-poster.jpg',
  type: 'video',
  src: 'https://cdn.example.com/clip-poster.jpg',
  previewSrc: 'https://cdn.example.com/clip-poster.jpg',
  sourceKind: 'poster',
}

function primaryButton(capsule: MediaCapsule): HTMLButtonElement {
  const button = capsule.buttonElement('inspiration')
  if (button === null) throw new Error('primary slot missing')
  return button
}

// The capsule stamps the painted glyph onto the button as `data-icon`, so the
// state machine can be asserted without parsing SVG markup.
function iconName(button: HTMLButtonElement): string | undefined {
  const icon = button.getAttribute('data-icon')
  assert.equal(icon === null || typeof icon === 'string', true)
  return icon ?? undefined
}

describe('save intent routing', () => {
  it('routes an image payload to the asset-library save path', () => {
    expect(resolveSaveIntent(IMAGE)).toBe('image-asset')
  })

  it('keeps video payloads, including poster-only covers, on inspiration', () => {
    expect(resolveSaveIntent(VIDEO)).toBe('video-inspiration')
    expect(resolveSaveIntent({ ...VIDEO, sourceKind: 'direct' })).toBe('video-inspiration')
    expect(resolveSaveIntent({ ...VIDEO, sourceKind: 'blob' })).toBe('video-inspiration')
  })
})

describe('capsule primary slot: image', () => {
  it('shows the assets glyph and the verbatim idle label in zh', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(IMAGE)
    const primary = primaryButton(capsule)
    expect(primary.getAttribute('aria-label')).toBe('加入资产库')
    expect(iconName(primary)).toBe('asset')
  })

  it('shows the assets glyph and the verbatim idle label in en', () => {
    const capsule = MediaCapsule.create(hoverCopy('en'))
    capsule.render(IMAGE)
    const primary = primaryButton(capsule)
    expect(primary.getAttribute('aria-label')).toBe('Add to asset library')
    expect(iconName(primary)).toBe('asset')
  })

  it('marks the slot busy with the busy copy while the save is in flight', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(IMAGE)
    capsule.setState({ busyAction: 'inspiration' })
    const primary = primaryButton(capsule)
    expect(primary.getAttribute('aria-busy')).toBe('true')
    expect(primary.getAttribute('aria-label')).toBe('正在加入资产库')
  })

  it('syncs the title channel with the aria-label across idle, busy and done', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(IMAGE)
    const primary = primaryButton(capsule)
    const idleTitle = primary.getAttribute('title')
    const idleLabel = primary.getAttribute('aria-label')
    expect(idleTitle).toBe('加入资产库')
    expect(idleLabel).toBe(idleTitle)

    capsule.setState({ busyAction: 'inspiration' })
    const busyTitle = primary.getAttribute('title')
    const busyLabel = primary.getAttribute('aria-label')
    expect(busyTitle).toBe('正在加入资产库')
    expect(busyLabel).toBe(busyTitle)

    capsule.setState({ busyAction: null, saved: true })
    const doneTitle = primary.getAttribute('title')
    const doneLabel = primary.getAttribute('aria-label')
    expect(doneTitle).toBe('已加入资产库')
    expect(doneLabel).toBe(doneTitle)
  })

  it('shows the check mark and done copy only after a real saved state', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(IMAGE)
    capsule.setState({ saved: true })
    const primary = primaryButton(capsule)
    expect(iconName(primary)).toBe('check')
    expect(primary.getAttribute('aria-label')).toBe('已加入资产库')
  })

  it('returns to the idle label after a failed save', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(IMAGE)
    capsule.setState({ busyAction: 'inspiration' })
    capsule.setState({ busyAction: null })
    const primary = primaryButton(capsule)
    expect(primary.getAttribute('aria-busy')).toBe('false')
    expect(primary.getAttribute('aria-label')).toBe('加入资产库')
    expect(iconName(primary)).toBe('asset')
  })

  it('does not reuse the video star for an image save', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(IMAGE)
    capsule.setState({ saved: true })
    expect(iconName(primaryButton(capsule))).not.toBe('star')
  })
})

describe('capsule primary slot: unknown intent', () => {
  const UNKNOWN: HoveredMedia = {
    ...IMAGE,
    id: 'unknown:media',
    type: 'unknown' as unknown as HoveredMedia['type'],
  }

  it('keeps the bulb and stamps the typeUnknown copy on title and aria', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(UNKNOWN)
    const primary = primaryButton(capsule)
    // UI-Spec §2 *.primary.unknown: the slot keeps the baseline bulb but its
    // title, aria-label and tooltip all speak the typeUnknown line — never
    // the inspiration name that would suggest a write is coming.
    assert.equal(iconName(primary), 'bulb')
    assert.equal(primary.getAttribute('aria-label'), '无法确认素材类型，请刷新后重试')
    assert.equal(primary.getAttribute('title'), '无法确认素材类型，请刷新后重试')
  })

  it('stamps the English typeUnknown copy the same way', () => {
    const capsule = MediaCapsule.create(hoverCopy('en'))
    capsule.render(UNKNOWN)
    const primary = primaryButton(capsule)
    assert.equal(iconName(primary), 'bulb')
    assert.equal(primary.getAttribute('aria-label'), 'Media type could not be confirmed. Refresh and try again.')
    assert.equal(primary.getAttribute('title'), 'Media type could not be confirmed. Refresh and try again.')
  })
})

describe('capsule primary slot: video unchanged', () => {
  it('keeps the bulb icon and the inspiration label', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(VIDEO)
    const primary = primaryButton(capsule)
    expect(primary.getAttribute('aria-label')).toBe('加入灵感库')
    expect(iconName(primary)).toBe('bulb')
  })

  it('keeps the star saved state for videos', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(VIDEO)
    capsule.setState({ saved: true })
    expect(iconName(primaryButton(capsule))).toBe('star')
  })
})

describe('copy and attach slots unchanged', () => {
  it('keeps the verbatim copy and chat labels', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    capsule.render(IMAGE)
    expect(capsule.buttonElement('copy')?.getAttribute('aria-label')).toBe('复制')
    expect(capsule.buttonElement('attach')?.getAttribute('aria-label')).toBe('加入对话')
  })
})

describe('MediaActionBridge.saveImageToAssets', () => {
  function transport(overrides: Partial<ActionTransport> = {}): ActionTransport {
    return {
      sidePanelState: async () => 'inactive',
      deliverToWorkstation: async () => 'unavailable',
      postToBackground: vi.fn(async () => ({ ok: true, result: { status: 'saved', assetId: 'a1', fileId: 'f1', lrev: 2 } })),
      writeClipboard: vi.fn(async () => true),
      copy: () => hoverCopy('zh'),
      ...overrides,
    }
  }

  it('posts DSH_MEDIA_TO_ASSETS with the media payload and a bounded request id', async () => {
    const postToBackground = vi.fn(async (_message: Record<string, unknown>) => ({ ok: true, result: { status: 'saved', assetId: 'a1', fileId: 'f1', lrev: 2 } }))
    expect(typeof postToBackground).toBe('function')
    const bridge = new MediaActionBridge(transport({ postToBackground }))
    const outcome = await bridge.saveImageToAssets(IMAGE)

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('saved')
    expect(outcome.message).toBe('已加入资产库')
    const call = postToBackground.mock.calls[0]![0] as Record<string, unknown>
    expect(call.type).toBe('DSH_MEDIA_TO_ASSETS')
    expect(call.payload).toBe(IMAGE)
    expect(typeof call.requestId).toBe('string')
    expect((call.requestId as string).length).toBeGreaterThan(0)
    expect((call.requestId as string).length).toBeLessThanOrEqual(128)
  })

  it('treats a duplicate receipt as a completed save', async () => {
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: true, result: { status: 'duplicate', assetId: 'a1', fileId: 'f1', lrev: 4 } })),
    }))
    const outcome = await bridge.saveImageToAssets(IMAGE)
    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('saved')
    expect(outcome.message).toBe('已加入资产库')
  })

  it('never paints an empty or shapeless result as saved', async () => {
    // lrev parity with the host parser (protocol.ts: safe integer, >= 0): a
    // fractional, negative or out-of-range revision is not a real receipt.
    for (const result of [{}, { status: 'saved' }, { status: 'saved', assetId: '', fileId: 'f1', lrev: 2 }, { status: 'saved', assetId: 'a', fileId: 'f', lrev: 'x' }, { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1.5 }, { status: 'saved', assetId: 'a', fileId: 'f', lrev: -1 }, { status: 'saved', assetId: 'a', fileId: 'f', lrev: Number.MAX_SAFE_INTEGER + 1 }, { status: 'unknown' }, null, 'ok']) {
      const bridge = new MediaActionBridge(transport({
        postToBackground: vi.fn(async () => ({ ok: true, result })),
      }))
      const outcome = await bridge.saveImageToAssets(IMAGE)
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toBe('未确认保存结果，请稍后查看资产库')
    }
  })

  it('maps download failures to the download-failed copy', async () => {
    for (const status of ['http-error', 'timeout']) {
      const bridge = new MediaActionBridge(transport({
        postToBackground: vi.fn(async () => ({ ok: true, result: { status, statusCode: 404 } })),
      }))
      const outcome = await bridge.saveImageToAssets(IMAGE)
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toBe('图片下载失败，请重试')
    }
  })

  it('maps unsaveable sources to the unavailable copy', async () => {
    for (const status of ['invalid-url', 'unsupported-image', 'mime-mismatch', 'too-large']) {
      const bridge = new MediaActionBridge(transport({
        postToBackground: vi.fn(async () => ({ ok: true, result: { status } })),
      }))
      const outcome = await bridge.saveImageToAssets(IMAGE)
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toBe('该图片无法保存')
    }
  })

  it('maps storage and service failures to the save-failed copy', async () => {
    for (const status of ['unavailable', 'storage-failed', 'cancelled']) {
      const bridge = new MediaActionBridge(transport({
        postToBackground: vi.fn(async () => ({ ok: true, result: { status } })),
      }))
      const outcome = await bridge.saveImageToAssets(IMAGE)
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toBe('资产保存失败，请重试')
    }
  })

  it('maps a missing host to the host-unavailable copy', async () => {
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: false, error: { code: 'host-unavailable' } })),
    }))
    const outcome = await bridge.saveImageToAssets(IMAGE)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('宿主未连接，请打开 OmniMux 后重试')
  })

  it('maps a lost receipt to the unconfirmed copy', async () => {
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: false, error: { code: 'save-unconfirmed' } })),
    }))
    const outcome = await bridge.saveImageToAssets(IMAGE)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('未确认保存结果，请稍后查看资产库')
  })

  it('treats a missing runtime answer as host-unavailable, never as saved', async () => {
    const bridge = new MediaActionBridge(transport({ postToBackground: vi.fn(async () => null) }))
    const outcome = await bridge.saveImageToAssets(IMAGE)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('宿主未连接，请打开 OmniMux 后重试')
  })

  it('renders the same state matrix in English', async () => {
    const en = (status: string) => transport({
      postToBackground: vi.fn(async () => ({ ok: true, result: { status } })),
      copy: () => hoverCopy('en'),
    })
    const saved = await new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 } })),
      copy: () => hoverCopy('en'),
    })).saveImageToAssets(IMAGE)
    expect(saved.message).toBe('Added to asset library')

    const dl = await new MediaActionBridge(en('http-error')).saveImageToAssets(IMAGE)
    expect(dl.message).toBe('Image download failed. Try again.')

    const un = await new MediaActionBridge(en('mime-mismatch')).saveImageToAssets(IMAGE)
    expect(un.message).toBe('This image cannot be saved')

    const sf = await new MediaActionBridge(en('storage-failed')).saveImageToAssets(IMAGE)
    expect(sf.message).toBe('Asset could not be saved. Try again.')
  })
})

describe('overlay image action', () => {
  let overlay: MediaOverlay
  let shadow: ShadowRoot
  let sendMessage: ReturnType<typeof vi.fn>

  const mediaElement = (): HTMLImageElement => {
    const img = document.createElement('img')
    document.body.appendChild(img)
    return img
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`).forEach((node) => node.remove())
    sendMessage = vi.fn(async () => ({ ok: true, result: { status: 'saved', assetId: 'a1', fileId: 'f1', lrev: 2 } }))
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
        sendMessage,
        i18n: { getUILanguage: () => 'zh-CN' },
      },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    })
    // The overlay resolves its locale once at construction; pin the manual
    // preference so these assertions run against the zh dictionary.
    window.localStorage.setItem('omnimux_manual_locale', 'zh')
    overlay = new MediaOverlay(document)
    overlay.mount()
    shadow = hostShadow()
    expect(shadow instanceof ShadowRoot).toBe(true)
  })

  function hostShadow(): ShadowRoot {
    const host = document.getElementById(MEDIA_OVERLAY_HOST_ID) as HTMLElement
    return host.shadowRoot as ShadowRoot
  }

  afterEach(() => {
    overlay.dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function primary(): HTMLButtonElement {
    return shadow.querySelector('[data-action="inspiration"]') as HTMLButtonElement
  }

  function tooltipText(): string {
    return (shadow.querySelector('.white-tooltip-text') as HTMLElement).textContent ?? ''
  }

  function show(payload: HoveredMedia): void {
    const element = mediaElement()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(overlay as any).showNow({ element, payload })
  }

  it('posts DSH_MEDIA_TO_ASSETS for an image and paints the done state', async () => {
    show(IMAGE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DSH_MEDIA_TO_ASSETS',
      payload: IMAGE,
    }))
    expect(tooltipText()).toBe('已加入资产库')
    expect(primary().getAttribute('aria-label')).toBe('已加入资产库')
    expect(iconName(primary())).toBe('check')
  })

  it('marks the button busy while the request is in flight', async () => {
    show(IMAGE)
    let settle!: (value: unknown) => void
    sendMessage.mockImplementation(async () => await new Promise((resolve) => { settle = resolve }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const running = (overlay as any).runAction('inspiration') as Promise<void>
    await vi.waitFor(() => { expect(primary().getAttribute('aria-busy')).toBe('true') })
    expect(primary().getAttribute('aria-label')).toBe('正在加入资产库')
    // The busy feedback is anchored in place the moment the press lands; it
    // must not wait for the user to hover the slot again.
    const busyTip = tooltipText()
    expect(busyTip).toBe('正在加入资产库')
    settle({ ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 } })
    await running
    expect(primary().getAttribute('aria-busy')).toBe('false')
  })

  it('shows the failure copy in place and restores the idle label', async () => {
    sendMessage.mockResolvedValueOnce({ ok: true, result: { status: 'http-error' } })
    show(IMAGE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')
    expect(tooltipText()).toBe('图片下载失败，请重试')
    expect(primary().getAttribute('aria-label')).toBe('加入资产库')
    expect(iconName(primary())).toBe('asset')
  })

  it('shows the unconfirmed copy when the worker cannot confirm the receipt', async () => {
    sendMessage.mockResolvedValueOnce({ ok: false, error: { code: 'save-unconfirmed' } })
    show(IMAGE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')
    expect(tooltipText()).toBe('未确认保存结果，请稍后查看资产库')
    expect(iconName(primary())).toBe('asset')
  })

  it('refuses a second primary press while a save is running', async () => {
    show(IMAGE)
    let settle!: (value: unknown) => void
    sendMessage.mockImplementation(async () => await new Promise((resolve) => { settle = resolve }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = (overlay as any).runAction('inspiration') as Promise<void>
    await vi.waitFor(() => { expect(primary().getAttribute('aria-busy')).toBe('true') })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    settle({ ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 } })
    await first
  })

  it('keeps the done state without resending when a confirmed save is pressed again', async () => {
    show(IMAGE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')
    const doneIcon = iconName(primary())
    expect(doneIcon).toBe('check')

    sendMessage.mockClear()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'DSH_MEDIA_TO_ASSETS',
    }))
    const iconAfter = iconName(primary())
    const labelAfter = primary().getAttribute('aria-label')
    const tipAfter = tooltipText()
    expect(iconAfter).toBe('check')
    expect(labelAfter).toBe('已加入资产库')
    expect(tipAfter).toBe('已加入资产库')
  })

  it('does not mark media B saved when media A receives a late receipt', async () => {
    show(IMAGE)
    let settle!: (value: unknown) => void
    sendMessage.mockImplementation(async () => await new Promise((resolve) => { settle = resolve }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const running = (overlay as any).runAction('inspiration') as Promise<void>
    await vi.waitFor(() => { expect(primary().getAttribute('aria-busy')).toBe('true') })

    const mediaB: HoveredMedia = { ...IMAGE, id: 'image:https://cdn.example.com/other.png', src: 'https://cdn.example.com/other.png' }
    show(mediaB)

    settle({ ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 } })
    await running

    expect(primary().getAttribute('aria-label')).toBe('加入资产库')
    expect(iconName(primary())).toBe('asset')
  })

  it('drops the receipt of a press issued before the media was re-rendered (A→B→A)', async () => {
    show(IMAGE)
    let settle!: (value: unknown) => void
    sendMessage.mockImplementation(async () => await new Promise((resolve) => { settle = resolve }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const running = (overlay as any).runAction('inspiration') as Promise<void>
    await vi.waitFor(() => { expect(primary().getAttribute('aria-busy')).toBe('true') })

    const mediaB: HoveredMedia = { ...IMAGE, id: 'image:https://cdn.example.com/other.png', src: 'https://cdn.example.com/other.png' }
    show(mediaB)
    show(IMAGE)

    settle({ ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 } })
    await running

    // The receipt belongs to the previous render of media A: this fresh render
    // must stay idle rather than inherit a save it did not confirm.
    const labelAfter = primary().getAttribute('aria-label')
    const iconAfter = iconName(primary())
    const tipAfter = tooltipText()
    expect(labelAfter).toBe('加入资产库')
    expect(iconAfter).toBe('asset')
    expect(tipAfter).not.toBe('已加入资产库')
  })

  it('keeps copy and attach usable while the image save is pending', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    show(IMAGE)
    let settle!: (value: unknown) => void
    sendMessage.mockImplementation(async () => await new Promise((resolve) => { settle = resolve }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saving = (overlay as any).runAction('inspiration') as Promise<void>
    await vi.waitFor(() => { expect(primary().getAttribute('aria-busy')).toBe('true') })

    // Only the pending first action blocks itself; UI-Spec freezes copy/attach
    // as independent actions that must stay live during the image save.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('copy')
    expect(writeText).toHaveBeenCalledWith('https://cdn.example.com/photo.png')
    const copyButton = shadow.querySelector('[data-action="copy"]') as HTMLButtonElement
    const copyBusy = copyButton.getAttribute('aria-busy')
    const copyIcon = iconName(copyButton)
    expect(copyBusy).toBe('false')
    // The completed copy keeps its baseline check flash; what matters here is
    // that it ran at all and never painted the other slot's busy spinner.
    expect(copyIcon).toBe('check')
    const saveBusy = primary().getAttribute('aria-busy')
    const saveLabel = primary().getAttribute('aria-label')
    expect(saveBusy).toBe('true')
    expect(saveLabel).toBe('正在加入资产库')

    settle({ ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 } })
    await saving
    const labelAfter = primary().getAttribute('aria-label')
    expect(labelAfter).toBe('已加入资产库')
  })

  it('shows the typeUnknown hint and sends nothing for an unclassifiable media', async () => {
    const unknown: HoveredMedia = {
      ...IMAGE,
      id: 'unknown:media',
      type: 'unknown' as unknown as HoveredMedia['type'],
    }
    show(unknown)
    const primary = shadow.querySelector('[data-action="inspiration"]') as HTMLButtonElement
    expect(primary.getAttribute('title')).toBe('无法确认素材类型，请刷新后重试')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(overlay as any).showHint('inspiration')
    assert.equal(tooltipText(), '无法确认素材类型，请刷新后重试')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')
    assert.equal(tooltipText(), '无法确认素材类型，请刷新后重试')
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'DSH_MEDIA_TO_ASSETS',
    }))
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'DSH_MEDIA_TO_INSPIRATION',
    }))
  })

  it('keeps video clicks on the inspiration message', async () => {
    show(VIDEO)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('inspiration')
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DSH_MEDIA_TO_INSPIRATION',
    }))
    expect(primary().getAttribute('aria-label')).toBe('加入灵感库')
  })

  it('keeps the copy action on the clipboard path for images', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    show(IMAGE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (overlay as any).runAction('copy')
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'DSH_MEDIA_TO_ASSETS' }))
    expect(writeText).toHaveBeenCalledWith('https://cdn.example.com/photo.png')
  })
})
