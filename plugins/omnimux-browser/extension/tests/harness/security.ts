import { isPostOrWorkMedia, isExcludedRegionElement, isSocialPlatformHost } from '../../src/content/media-hover/classifier.ts'
import { findMediaElement, measureElement, resolveMediaSource } from '../../src/content/media-hover/payload.ts'
import { initMediaHoverOverlay } from '../../src/content/media-hover/overlay.ts'
import { initFabCompanion } from '../../src/content/fab-companion.ts'
import { createMediaGrants } from '../../src/background/media-grants.ts'
const startButton = document.getElementById('start-security') as HTMLButtonElement
startButton.addEventListener('click', (event) => {
  if (!event.isTrusted || startButton.disabled) return
  startButton.disabled = true
  startSecurityVerification()
})

function startSecurityVerification(): void {
// This disposable fixture owns only this document. Remove conflicting injected
// presentation roots before the real initializers run; never touch extension
// storage/settings, other tabs, or reattach a detached production element.
for (const id of ['omnimux-companion-root', 'omnimux-media-hover-root']) document.getElementById(id)?.remove()

const frameUrl = new URL('./frame.html?mode=float&security=1&width=760', location.href).href
const grants = createMediaGrants('synthetic-extension', frameUrl)
const content = { id: 'synthetic-extension', tab: { id: 1 }, frameId: 0, url: location.href }
const panel = { ...content, frameId: 1, url: frameUrl }
const listeners: Array<(request: unknown, sender: unknown, reply: (value: unknown) => void) => unknown> = []
const runtime = async (message: any, source: 'panel' | 'content'): Promise<any> => {
  if (message.type === 'DSH_CHECK_SIDE_PANEL_OPEN') return { ok: true, active: false }
  if (source === 'content' && message.type === 'ISSUE_FLOAT_MEDIA_GRANT') return { grant: grants.issue(content, message.payload) }
  if (source === 'panel' && message.type === 'TAKE_FLOAT_MEDIA_GRANT') return { media: grants.take(panel, message.grant) }
  if (source === 'panel' && message.type === 'FILL_FLOAT_STRUCTURED_DRAFT') return await new Promise((resolve) => {
    for (const listener of listeners) listener({ action: 'FILL_STRUCTURED_DRAFT', payload: message.payload }, {}, resolve)
  })
  return null
}
Object.assign(globalThis, {
  __securityPanelRuntime: (message: unknown) => runtime(message, 'panel'),
  chrome: { runtime: { getURL: () => frameUrl, sendMessage: (message: unknown) => runtime(message, 'content'),
    onMessage: { addListener: (listener: typeof listeners[number]) => listeners.push(listener), removeListener: () => {} } },
    storage: { local: { get: async () => ({ omnimux_media_hover_enabled: true, omnimux_fab_enabled: true }), set: async () => {} }, onChanged: { addListener: () => {}, removeListener: () => {} } } },
})
initFabCompanion()
const diagnostic = { candidates: 0, lastCandidate: null as unknown,
  detectorHitTests: 0, lastDetectorHit: null as unknown, bubbles: 0, lastBubble: null as unknown,
  hideCalls: [] as Array<Record<string, unknown>>, timersSet: 0, timersCleared: 0 }
const overlay = initMediaHoverOverlay(document)
const observedOverlay = overlay as any
const originalHide = observedOverlay.hideNow
observedOverlay.hideNow = function (...args: unknown[]) {
  diagnostic.hideCalls.push({ at: Date.now(), args, phase: this.state.phase, stack: new Error('hideNow caller').stack })
  if (diagnostic.hideCalls.length > 12) diagnostic.hideCalls.shift()
  return originalHide.apply(this, args)
}
for (const [method, key] of [['setTimer', 'timersSet'], ['clearTimer', 'timersCleared']] as const) {
  const original = observedOverlay[method]
  if (typeof original === 'function') observedOverlay[method] = function (...args: unknown[]) {
    diagnostic[key] += 1
    return original.apply(this, args)
  }
}
const disposeDiagnostics: Array<() => void> = []
for (const kind of ['pointermove', 'pointerover', 'mousemove']) {
 const listener = (event: Event) => {
  const pointer = event as MouseEvent
  diagnostic.bubbles += 1
  diagnostic.lastBubble = { kind, x: pointer.clientX, y: pointer.clientY, target: (event.target as Element)?.tagName, trusted: event.isTrusted }
 }
 document.addEventListener(kind, listener)
 disposeDiagnostics.push(() => document.removeEventListener(kind, listener))
}
// This loopback fixture represents a supported social post. Override only the
// detector's existing environment host seam; hit testing, real pointer events,
// classification, timers, capsule and action transport remain production code.
setTimeout(() => {
  const detector = (overlay as any).detector
  if (detector) {
    detector.env.host = () => 'instagram.com'
    const originalCandidate = detector.options.onCandidate
    detector.options.onCandidate = (...args: unknown[]) => {
      diagnostic.candidates += 1
      diagnostic.lastCandidate = (args[0] as any)?.payload?.id ?? null
      return originalCandidate(...args)
    }
    // Observe the actual hit-test seam without changing its result or dispatch.
    const originalHitTest = detector.env.elementFromPoint
    detector.env.elementFromPoint = (x: number, y: number) => {
      diagnostic.detectorHitTests += 1
      const hit = originalHitTest(x, y)
      diagnostic.lastDetectorHit = { x, y, tag: hit?.tagName, id: hit?.id }
      return hit
    }
  }
}, 0)
const pointerTrace: Array<Record<string, unknown>> = []
for (const kind of ['pointermove', 'pointerover', 'mousemove']) {
 const listener = (event: Event) => {
  const pointer = event as MouseEvent
  pointerTrace.push({ kind, trusted: event.isTrusted, x: pointer.clientX, y: pointer.clientY,
    target: (event.target as Element)?.tagName, time: Date.now() })
  if (pointerTrace.length > 20) pointerTrace.shift()
 }
 document.addEventListener(kind, listener, { capture: true })
 disposeDiagnostics.push(() => document.removeEventListener(kind, listener, { capture: true }))
}
const cleanupDiagnostics = () => {
  for (const dispose of disposeDiagnostics) dispose()
  window.removeEventListener('pagehide', cleanupDiagnostics)
}
window.addEventListener('pagehide', cleanupDiagnostics, { once: true })
Object.assign(globalThis, { __securityOverlayProbe: () => {
  const detector = (overlay as any).detector
  const img = document.querySelector('article img')!
  const last = pointerTrace[pointerTrace.length - 1]
  const hit = last ? document.elementFromPoint(Number(last.x), Number(last.y)) : null
  const rect = img.getBoundingClientRect()
  let described: unknown
  try { described = detector?.describe(img) ?? null } catch (error) { described = String(error) }
  return { enabled: overlay.isEnabled(), platform: detector?.env.host?.(),
    phase: (overlay as any).state.phase, active: detector?.active?.payload?.id ?? null,
    capsuleConnected: observedOverlay.capsule?.element?.isConnected,
    capsuleMatchesDocument: observedOverlay.capsule?.element === document.getElementById('omnimux-media-hover-root')?.shadowRoot?.querySelector('.omnimux-capsule-bar'),
    actualCapsuleClass: observedOverlay.capsule?.element?.className,
    actualCapsuleStyle: observedOverlay.capsule?.element?.getAttribute('style'),
    hostConnected: observedOverlay.host?.isConnected,
    diagnostic, pointerTrace, hit: hit?.tagName, hitId: hit?.id, rect: rect.toJSON(),
    metric: measureElement(img), social: isSocialPlatformHost('instagram.com'),
    excluded: isExcludedRegionElement(img), classified: isPostOrWorkMedia(img, 'instagram.com'),
    found: findMediaElement(img)?.tagName, source: resolveMediaSource(img, 'image', location.href, false),
    detectorBound: detector?.bound, detectorDisposed: detector?.disposed,
    described: described ? { present: true, id: (described as any).payload?.id } : null }

} })
const frame = document.getElementById('omnimux-companion-root')!.shadowRoot!.querySelector('iframe')!
if (frame.src !== frameUrl) {
  document.getElementById('result')!.textContent = '当前页面已有其他扩展面板，合成验证未启动；不会调用真实扩展服务。'
  return
}
for (const id of ['forge-fill', 'forge-media', 'choose-media', 'trusted-fill']) (document.getElementById(id) as HTMLButtonElement).disabled = false

const media = { id: 'security-selected', type: 'image', src: new URL('./media/photo_sq.png', location.href).href, previewSrc: '', pageUrl: location.href, pageTitle: 'Synthetic', width: 600, height: 400, naturalWidth: 600, naturalHeight: 400, alt: '选中素材', capturedAt: Date.now() }
const result = document.getElementById('result')!
const update = (value: string) => { result.textContent = value }
document.getElementById('forge-fill')!.onclick = () => {
  window.postMessage({ type: 'FILL_STRUCTURED_DRAFT', fields: [{ id: 'security-draft', value: 'forged' }] }, location.origin)
  update('已发送网页伪造填写请求，草稿应保持为空')
}
document.getElementById('forge-media')!.onclick = () => {
  frame.contentWindow!.postMessage({ type: 'MEDIA_ATTACH_REQUEST', payload: media }, location.origin)
  update('已发送网页伪造素材请求，素材应保持为空')
}
document.getElementById('choose-media')!.onclick = async () => {
  const shell = globalThis as any
  const accepted = await shell.__dshBrowserWorkstation.openWithMedia(media)
  update(accepted ? '选中素材已添加' : '素材未添加：检查面板初始化或测试图片')
}
document.getElementById('trusted-fill')!.onclick = async () => {
  const response = await runtime({ type: 'FILL_FLOAT_STRUCTURED_DRAFT', payload: { fields: [{ id: 'security-draft', value: '用户授权草稿' }] } }, 'panel')
  update(JSON.stringify(response))
}

}
