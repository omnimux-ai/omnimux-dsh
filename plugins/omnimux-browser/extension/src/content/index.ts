/**
 * Content script entry: listens for DSH_ACTION messages from the background
 * service worker, runs the action against the real page, and answers with a
 * text-only result. Starts the DOM watcher that marks the snapshot dirty, and
 * the panel-gated watcher that reports what the user highlights.
 *
 * The content script is the only part that touches the page; the bridge and
 * the model never see page internals beyond the structured text snapshots.
 *
 * @module
 */

import { DEFAULT_SNAPSHOT_MAX_CHARS } from 'omnimux-browser/src/protocol.ts'
import { runAction, ActionError } from './actions.ts'
import { capturePost } from './capture/index.ts'
import type { CapturedPost } from './capture/index.ts'
import { captureAccount, mergeAccountSnapshots } from './capture/account.ts'
import { planRelayChunks } from '../shared/media-relay.ts'
import { ElementIds } from './ids.ts'
import { SelectionWatcher } from './selection.ts'
import { detectPageType, detectPlatform } from './page-sensor.ts'
import type { SnapshotBudget } from './snapshot.ts'

/** Negotiated snapshot budgets, patched in from the background via message. */
let budget: SnapshotBudget = { maxItems: 60, maxForms: 30, maxChars: DEFAULT_SNAPSHOT_MAX_CHARS }

const ids = new ElementIds()

const selectionWatcher = new SelectionWatcher((selection) => {
  void chrome.runtime.sendMessage({ type: 'DSH_SELECTION', selection }).catch(() => {})
})

const CONTENT_SCRIPT_LISTENER = '__dshBrowserContentScriptListener__'
const CONTENT_SELECTION_WATCHER = '__dshBrowserSelectionWatcher__'
type ContentListener = typeof onMessage

/** A tool-call result for the bridge. */
export interface ToolResult {
  ok: boolean
  result?: { text: string; pageContent?: string; navigationPending?: boolean }
  error?: { code: string; message: string }
}

/** One page capture, as the background asks for it (spec §3.1). */
export interface CapturePostResponse {
  ok: boolean
  post?: CapturedPost
}

/** One media file relayed in chunks; `bytes` is the full file length. */
export interface RelayMediaResponse {
  ok: boolean
  bytes?: number
  error?: string
}

type ContentResponse = ToolResult | CapturePostResponse | RelayMediaResponse

/** Read one media URL with the page session; the host cannot download these CDNs. */
function readMediaBytes(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.withCredentials = true
    xhr.responseType = 'arraybuffer'
    xhr.timeout = 120_000
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(new Uint8Array(xhr.response || new ArrayBuffer(0)))
      else reject(new Error(`media-http-${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('media-network-error'))
    xhr.ontimeout = () => reject(new Error('media-timeout'))
    xhr.send()
  })
}

/** Base64 for a binary chunk, built in slices so a 1MB chunk cannot overflow the stack. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

/**
 * Read one media URL and stream it to the host through the background in chunks.
 *
 * Each chunk is acknowledged by the background only after the host accepted it,
 * which keeps the upload ordered and bounded. A rejected read throws; the caller
 * answers with the explicit failure instead of pretending the save succeeded.
 */
async function relayMediaBytes(sessionId: string, index: number, url: string): Promise<RelayMediaResponse> {
  const bytes = await readMediaBytes(url)
  const ranges = planRelayChunks(bytes.length)
  for (const range of ranges) {
    const data = bytesToBase64(bytes.subarray(range.start, range.end))
    const ack = await chrome.runtime.sendMessage({
      type: 'CAPTURE_MEDIA_CHUNK',
      sessionId,
      index,
      seq: range.seq,
      data,
      final: range.final,
    }) as { ok?: boolean, error?: string } | undefined
    if (!ack || ack.ok !== true) return { ok: false, error: (ack && ack.error) || 'chunk-rejected' }
  }
  return { ok: true, bytes: bytes.length }
}

function onMessage(message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: ContentResponse) => void): true | undefined {
  if (typeof message !== 'object' || message === null) return
  const msg = message as { type?: string; action?: string }
  if (msg.action === 'CAPTURE_POST' || msg.type === 'CAPTURE_POST') {
    // 只有顶层 frame 代表作品页；iframe 里的页面不是用户保存的对象。
    if (window.top !== window) {
      sendResponse({ ok: false })
      return
    }
    try {
      const post = capturePost()
      sendResponse(post === null ? { ok: false } : { ok: true, post })
    } catch {
      sendResponse({ ok: false })
    }
    return
  }
  if (msg.action === 'RELAY_CAPTURE_MEDIA') {
    // 只有顶层 frame 代表作品页；iframe 不能替用户保存。
    if (window.top !== window) {
      sendResponse({ ok: false, error: 'not-top-frame' })
      return
    }
    const request = message as { sessionId?: unknown, index?: unknown, url?: unknown }
    if (typeof request.sessionId !== 'string' || typeof request.index !== 'number' || typeof request.url !== 'string') {
      sendResponse({ ok: false, error: 'bad-relay-request' })
      return
    }
    void relayMediaBytes(request.sessionId, request.index, request.url).then(
      (response) => sendResponse(response),
      (error) => sendResponse({ ok: false, error: String(error instanceof Error ? error.message : error) }),
    )
    return true
  }
  if (msg.type === 'DSH_BUDGET') {
    const incoming = (message as { budget?: Partial<SnapshotBudget> }).budget
    if (incoming !== undefined) {
      budget = { ...budget, ...incoming }
      sendResponse({ ok: true, result: { text: `快照预算已更新: ${JSON.stringify(budget)}` } })
    }
    return
  }
  if (msg.type === 'DSH_SELECTION_WATCH') {
    const command = message as { enabled?: unknown; epoch?: unknown; revision?: unknown }
    const epoch = typeof command.epoch === 'string' ? command.epoch : undefined
    const revision = typeof command.revision === 'number' ? command.revision : undefined
    selectionWatcher.setEnabled(command.enabled === true, revision, epoch)
    sendResponse({ ok: true })
    return
  }
  if (msg.type === 'DSH_SELECTION_RESET') {
    // The panel dropped this frame's quote; let the same passage be re-reported.
    selectionWatcher.resetDedupe()
    sendResponse({ ok: true })
    return
  }
  if (msg.type !== 'DSH_ACTION') return
  const actionMsg = message as {
    action?: string
    args?: Record<string, unknown>
    budget?: Partial<SnapshotBudget>
    includePageDelta?: boolean
  }
  const action = actionMsg.action ?? ''
  const args = actionMsg.args ?? {}
  const actionBudget = actionMsg.budget === undefined ? budget : { ...budget, ...actionMsg.budget }
  void runAction(action, args, {
    ids,
    budget: actionBudget,
    includePageDelta: actionMsg.includePageDelta === true,
  }).then(
    (result) => { sendResponse({ ok: true, result }) },
    (error: unknown) => {
      const code = error instanceof ActionError ? error.code : 'action-failed'
      const messageText = error instanceof Error ? error.message : String(error)
      sendResponse({ ok: false, error: { code, message: messageText } })
    },
  )
  return true // async response
}

// executeScript is used to recover tabs opened before extension install/reload.
// Replace any stale listener left in the isolated world so a reload always
// installs a listener belonging to the current extension context.
const contentGlobal = globalThis as typeof globalThis & {
  [CONTENT_SCRIPT_LISTENER]?: ContentListener
  [CONTENT_SELECTION_WATCHER]?: { dispose: () => void }
}
const previousListener = contentGlobal[CONTENT_SCRIPT_LISTENER]
if (previousListener !== undefined) {
  try { chrome.runtime.onMessage.removeListener(previousListener) } catch { /* stale extension context */ }
}
// A replaced content script keeps its page listeners until this instance
// releases them: `selectionchange` is a document listener, not an extension one.
contentGlobal[CONTENT_SELECTION_WATCHER]?.dispose()
contentGlobal[CONTENT_SCRIPT_LISTENER] = onMessage
contentGlobal[CONTENT_SELECTION_WATCHER] = selectionWatcher
chrome.runtime.onMessage.addListener(onMessage)

// A navigation action answers before unloading. The replacement content
// script announces when the new document can accept its automatic snapshot,
// and learns from the reply whether a side panel wants selection reports.
void chrome.runtime.sendMessage({ type: 'DSH_CONTENT_READY' }).then((response: unknown) => {
  if (typeof response !== 'object' || response === null) return
  const ready = response as {
    selectionWatch?: unknown
    selectionWatchEpoch?: unknown
    selectionWatchRevision?: unknown
  }
  const epoch = typeof ready.selectionWatchEpoch === 'string' ? ready.selectionWatchEpoch : undefined
  const revision = typeof ready.selectionWatchRevision === 'number' ? ready.selectionWatchRevision : undefined
  selectionWatcher.setEnabled(ready.selectionWatch === true, revision, epoch)
}).catch(() => {})

// Mount OmniMux FAB & Immersive Workstation companion
import('./fab-companion.ts').then(({ initFabCompanion }) => {
  initFabCompanion()
}).catch(() => {})

// Mount Twitter Velocity Indicators & Snipe Action
import('./twitter-velocity/index.ts').then(({ initTwitterVelocity }) => {
  initTwitterVelocity()
}).catch(() => {})

// Mount Twitter Native In-page Copilot (Post & Reply Assistants)
import('./twitter-copilot/index.ts').then(({ initTwitterCopilot }) => {
  initTwitterCopilot()
}).catch(() => {})

// Mount the X poster surface: one trigger per tweet, local canvas rendering, and
// the composer hand-off that attaches the image and prefills the opinion.
import('./twitter-poster/index.ts').then(({ initTwitterPoster }) => {
  initTwitterPoster()
}).catch(() => {})

// Mount the page-media hover assistant (capsule + white tooltip).
// A re-injected content script replaces its own listeners, so the previous
// overlay is disposed first; the page must never accumulate shadow hosts.
const MEDIA_OVERLAY_HANDLE = '__dshBrowserMediaOverlay'
const contentShell = globalThis as typeof globalThis & {
  [MEDIA_OVERLAY_HANDLE]?: { dispose: () => void }
}
import('./media-hover/overlay.ts').then(({ initMediaHoverOverlay, MEDIA_OVERLAY_HOST_ID }) => {
  // A replaceable content script keeps its DOM until something removes it.
  contentShell[MEDIA_OVERLAY_HANDLE]?.dispose()
  for (const stale of document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)) stale.remove()
  const overlay = initMediaHoverOverlay(document)
  contentShell[MEDIA_OVERLAY_HANDLE] = overlay
}).catch(() => {})

// Mount the card trigger: the small mark that fades in on a work card under
// the pointer and opens the shortcut toolbar when the pointer reaches it.
// TikTok rewrites its address without a navigation event, so the page facts are
// re-read on every scan instead of captured once here.
import('./surfaces/media-trigger.ts').then(({ initMediaTrigger, MEDIA_TRIGGER_HOST_ID }) => {
  const shell = globalThis as typeof globalThis & {
    __dshMediaTrigger?: { dispose: () => void }
  }
  shell.__dshMediaTrigger?.dispose()
  for (const stale of document.querySelectorAll(`#${MEDIA_TRIGGER_HOST_ID}`)) stale.remove()
  const handle = initMediaTrigger(document, () => ({
    platform: detectPlatform(),
    pageType: detectPageType(detectPlatform()),
    pathname: window.location.pathname,
  }))
  if (handle !== null) shell.__dshMediaTrigger = handle
}).catch(() => {})

// Mount the TikTok scene trigger: the avatar-anchored shortcut menu for
// watermark-free download, original audio, and saving into the inspiration
// library. It self-disposes when the page is not TikTok.
import('./tiktok-scene/index.ts').then(({ initTiktokScene }) => {
  initTiktokScene()
}).catch(() => {})

// ---- 手动「更新这个账号」（#3556） ----
//
// 客户端在默认浏览器里打开带 #omnimux-refresh=<token> 的账号主页；本脚本识别
// token，采集 profile + 首屏作品回写 host，成功后请求关闭这个标签页。
// 失败时保留标签页并显示原因，绝不假装成功。

const ACCOUNT_REFRESH_HASH_RE = /#omnimux-refresh=([a-f0-9]{32})/
const ACCOUNT_REFRESH_SCROLL_TIMES = 5
const ACCOUNT_REFRESH_POST_TARGET = 24

function accountRefreshStrings(): Record<string, string> {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  return zh
    ? {
        working: 'OmniMux 正在更新这个账号…',
        done: 'OmniMux 已更新',
        posts: '条新作品',
        failed: '更新失败：',
        noPlugin: '未连接 OmniMux',
      }
    : {
        working: 'OmniMux is updating this account…',
        done: 'OmniMux updated',
        posts: 'new posts',
        failed: 'Update failed: ',
        noPlugin: 'OmniMux is not connected',
      }
}

function accountRefreshOverlay(): { setText: (text: string) => void, remove: () => void } {
  const host = document.createElement('div')
  host.id = 'omnimux-account-refresh'
  host.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'closed' })
  const box = document.createElement('div')
  box.style.cssText = 'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;background:rgba(17,17,19,.92);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:8px 16px;box-shadow:0 8px 24px rgba(0,0,0,.28);max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
  shadow.appendChild(box)
  document.documentElement.appendChild(host)
  return {
    setText: (text: string) => { box.textContent = text },
    remove: () => host.remove(),
  }
}

function sendAccountRefresh(type: string, payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime?.lastError || !response) resolve({ ok: false, error: 'extension-unavailable' })
        else resolve(response)
      })
    } catch {
      resolve({ ok: false, error: 'extension-unavailable' })
    }
  })
}

function isAccountProfilePath(hostname: string, pathname: string): boolean {
  if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) {
    return /^\/@[^/]+\/?$/.test(pathname)
  }
  if (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) {
    if (/^\/(?:home|explore|search|notifications|messages|i|settings|login|signup|logout|compose)\b/.test(pathname)) return false
    return /^\/[A-Za-z0-9_]+\/?$/.test(pathname)
  }
  // 小红书 profile: /user/profile/<24 hex uid>. The note page (`/explore/<id>`)
  // and every other route are not profiles; a signed-out redirect to `/login`
  // fails this pattern, so no capture starts on it.
  if (hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com')) {
    return /^\/user\/profile\/[0-9a-fA-F]{24}\/?$/.test(pathname)
  }
  return false
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForAccountCapture(href: string): Promise<ReturnType<typeof captureAccount>> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (document.readyState === 'complete') {
      const captured = captureAccount(document, href)
      if (captured.ok) return captured
    }
    await sleep(800)
  }
  return captureAccount(document, href)
}

async function runAccountRefresh(token: string): Promise<void> {
  const strings = accountRefreshStrings()
  const overlay = accountRefreshOverlay()
  overlay.setText(strings.working)
  const href = location.href
  const first = await waitForAccountCapture(href)
  if (!first.ok) {
    overlay.setText(strings.failed + first.reason)
    await sleep(6000)
    overlay.remove()
    return
  }
  let account = first.account
  const claim = await sendAccountRefresh('ACCOUNT_REFRESH_CLAIM', {
    token,
    pageUrl: href,
    handle: account.handle,
  })
  if (claim?.ok !== true) {
    overlay.setText(strings.failed + String(claim?.error || 'claim-rejected'))
    await sleep(6000)
    overlay.remove()
    return
  }
  // Accumulate across limited scrolling: X virtualizes its list and 小红书
  // lazily fills its note grid, so each pass is captured and merged instead of
  // replacing the previous one.
  for (let pass = 0; pass < ACCOUNT_REFRESH_SCROLL_TIMES; pass += 1) {
    if (account.posts.length >= ACCOUNT_REFRESH_POST_TARGET) break
    const before = account.posts.length
    window.scrollTo(0, document.documentElement.scrollHeight)
    await sleep(1400)
    const next = captureAccount(document, href)
    if (!next.ok) continue
    account = mergeAccountSnapshots(account, next.account)
    if (account.posts.length === before) break
  }
  const completed = await sendAccountRefresh('ACCOUNT_REFRESH_COMPLETE', { token, account })
  if (completed?.ok !== true) {
    overlay.setText(strings.failed + String(completed?.error || 'complete-rejected'))
    await sleep(6000)
    overlay.remove()
    return
  }
  const newPosts = completed?.data?.new_posts
  overlay.setText(`${strings.done} @${account.handle}${typeof newPosts === 'number' ? ` · ${newPosts} ${strings.posts}` : ''}`)
  await sleep(1200)
  await sendAccountRefresh('ACCOUNT_REFRESH_CLOSE_TAB', { token })
}

if (window.top === window && globalThis.__omnimuxAccountRefreshStarted !== true) {
  const match = ACCOUNT_REFRESH_HASH_RE.exec(location.hash)
  if (match !== null && isAccountProfilePath(location.hostname, location.pathname)) {
    (globalThis as typeof globalThis & { __omnimuxAccountRefreshStarted?: boolean }).__omnimuxAccountRefreshStarted = true
    void runAccountRefresh(match[1])
  }
}
