/**
 * FAB & Immersive Workstation Companion:
 * Injects a squircle draggable FAB into the host page via Shadow DOM.
 * Expands into a 760px immersive workstation running panel/index.html?mode=float.
 *
 * It is also the transport the hover capsule uses to deliver a page media element
 * into the conversation: `openWorkstationWithMedia` expands the workstation,
 * posts `MEDIA_ATTACH_REQUEST`, and resolves only when the panel answers with a
 * `MEDIA_ATTACH_RESULT` receipt.
 */

import { getFullContext, detectPlatform } from './page-sensor.ts'
import { fillHostInput } from './dom-fill.ts'
import { fillFormFields } from './form-draft.ts'
import { sniffViewportMedia } from './media-sniffer.ts'
import { BRIDGE_MESSAGE, CONTENT_MESSAGE_SOURCE, TIMING } from './media-hover/messages.ts'
import { BRAND_GHOST_PATH } from './media-hover/overlay-icons.ts'
import type { HoveredMedia } from './media-hover/types.ts'
import { FEATURE_FLAG, readFlag, readFlagSync, subscribeFlag } from '../feature-flags.ts'

/** A media-attach request awaiting the panel's receipt. */
interface PendingAttach {
  resolve: (ok: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

/** Per-page registry of attach requests; a fresh injection clears the old one. */
const HOST_SHELL = globalThis as typeof globalThis & {
  __dshBrowserMediaAttach?: Map<string, PendingAttach>
}

function pendingAttachMap(): Map<string, PendingAttach> {
  if (HOST_SHELL.__dshBrowserMediaAttach === undefined) HOST_SHELL.__dshBrowserMediaAttach = new Map()
  return HOST_SHELL.__dshBrowserMediaAttach
}

export function initFabCompanion(): void {
  // Only inject in top window
  if (window !== window.top) return
  if (document.getElementById('omnimux-companion-root')) return

  const host = document.createElement('div')
  host.id = 'omnimux-companion-root'
  host.style.position = 'fixed'
  host.style.zIndex = '2147483647'
  host.style.top = '0'
  host.style.left = '0'
  host.style.width = '0'
  host.style.height = '0'
  host.style.overflow = 'visible'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png')
  const panelUrl = chrome.runtime.getURL('panel/index.html?mode=float')
  const parsedPanelUrl = new URL(panelUrl)
  const panelOrigin = `${parsedPanelUrl.protocol}//${parsedPanelUrl.host}`

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", sans-serif;
      }

      /* Squircle micro-3D floating action button (FAB) · 对齐推特官方浮标规格 */
      .omnimux-fab {
        position: fixed;
        box-sizing: border-box;
        width: 55px;
        height: 55px;
        border-radius: 16px;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgb(75, 78, 82);
        box-shadow: rgba(255, 255, 255, 0.2) 0px 0px 15px 0px, rgba(255, 255, 255, 0.15) 0px 0px 3px 1px;
        color: #e7e9ea;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        touch-action: none;
        z-index: 2147483647;
        opacity: 1;
        transform: scale(1);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                    opacity 0.2s ease,
                    box-shadow 0.2s ease,
                    background-color 0.2s ease,
                    border-color 0.2s ease;
      }

      .omnimux-fab:hover {
        transform: scale(1.04);
        border-color: rgba(255, 255, 255, 0.45);
        box-shadow: rgba(255, 255, 255, 0.35) 0px 0px 20px 0px, rgba(255, 255, 255, 0.25) 0px 0px 4px 1px;
        background: rgba(15, 15, 18, 0.75);
      }

      .omnimux-fab:active {
        cursor: grabbing;
        transform: scale(0.96);
      }

      .omnimux-fab.fab-hidden {
        opacity: 0;
        transform: scale(0.6);
        pointer-events: none;
      }

      .omnimux-fab svg {
        width: 32px;
        height: 32px;
        fill: currentColor;
        pointer-events: none;
        display: block;
      }

      /* YouMind-style compact workstation container (430px width) */
      .omnimux-workstation-container {
        position: fixed;
        top: 14px;
        right: 14px;
        bottom: 14px;
        width: min(430px, calc(100vw - 28px));
        height: calc(100vh - 28px);
        max-height: calc(100vh - 28px);
        border-radius: 18px;
        background: rgba(14, 15, 20, 0.96);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        z-index: 2147483646;
        opacity: 0;
        transform: translateX(40px) scale(0.98);
        pointer-events: none;
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    opacity 0.22s ease;
      }

      @media (prefers-color-scheme: light) {
        .omnimux-workstation-container {
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.12);
        }
      }

      .omnimux-workstation-container.expanded {
        opacity: 1;
        transform: translateX(0) scale(1);
        pointer-events: auto;
      }

      .omnimux-iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: transparent;
        display: block;
      }
    </style>

    <div id="omnimux-fab-btn" class="omnimux-fab" title="OmniMux-精灵助手 大工作台 (可拖拽移动，点击展开)">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" fill-rule="evenodd" aria-hidden="true" focusable="false">
        <path d="${BRAND_GHOST_PATH}"/>
      </svg>
    </div>

    <div id="omnimux-workstation" class="omnimux-workstation-container" role="dialog" aria-label="OmniMux工作台">
      <iframe id="omnimux-panel-iframe" class="omnimux-iframe" src="${panelUrl}" allow="clipboard-read; clipboard-write" allowtransparency="true"></iframe>
    </div>
  `

  const fab = shadow.getElementById('omnimux-fab-btn') as HTMLElement
  const workstation = shadow.getElementById('omnimux-workstation') as HTMLElement
  const iframe = shadow.getElementById('omnimux-panel-iframe') as HTMLIFrameElement

  let isExpanded = false

  /**
   * Whether the panel's "floating ball" switch leaves the ball on screen.
   *
   * Off hides the ball itself, not the workstation: the hover capsule's "add to
   * conversation" shortcut expands the workstation, and that belongs to the
   * image-toolbar switch rather than this one.
   */
  let fabEnabled = readFlagSync(FEATURE_FLAG.fab)

  function applyFabVisibility(): void {
    fab.style.display = fabEnabled ? '' : 'none'
  }

  applyFabVisibility()

  // The panel writes the switch; the change arrives through storage and through
  // the message it sends to this tab, whichever lands first.
  const unsubscribeFlag = subscribeFlag(FEATURE_FLAG.fab, (enabled) => {
    fabEnabled = enabled
    applyFabVisibility()
  })
  void readFlag(FEATURE_FLAG.fab).then((enabled) => {
    fabEnabled = enabled
    applyFabVisibility()
  })

  // Load saved position
  const savedPos = (() => {
    try {
      const raw = localStorage.getItem('omnimux_fab_pos_v2')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  // 默认位置：对齐推特右下角抽屉浮标纵向成列布局
  // 推特浮标基准：Chat (bottom 12px, right 20px, 55x55), Grok (bottom 79px, right 20px, 55x55), 间距 12px
  // OmniMux 位于 Grok 正上方 12px：bottom = 79 + 55 + 12 = 146px，right = 20px
  function computeDefaultPosition(): { x: number; y: number } {
    const grokEl = document.querySelector('[data-testid="GrokDrawerHeader"]')
    if (grokEl) {
      const r = grokEl.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        return {
          x: Math.round(r.left),
          y: Math.max(10, Math.round(r.top - 12 - 55)),
        }
      }
    }
    const chatEl = document.querySelector('[data-testid="chat-drawer-main"]')
    if (chatEl) {
      const r = chatEl.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        return {
          x: Math.round(r.left),
          y: Math.max(10, Math.round(r.top - 12 - 55 - 12 - 55)),
        }
      }
    }
    return {
      x: Math.max(10, window.innerWidth - 75), // 20px 右边距 (window.innerWidth - 20 - 55)
      y: Math.max(10, window.innerHeight - 201), // 146px 底边距 (window.innerHeight - 146 - 55)
    }
  }

  const defaultPos = computeDefaultPosition()
  let currentX = defaultPos.x
  let currentY = defaultPos.y

  if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
    currentX = Math.max(10, Math.min(window.innerWidth - 65, savedPos.x))
    currentY = Math.max(10, Math.min(window.innerHeight - 65, savedPos.y))
  }

  function applyFabPosition(x: number, y: number) {
    fab.style.left = `${x}px`
    fab.style.top = `${y}px`
    fab.style.right = 'auto'
    fab.style.bottom = 'auto'
  }

  applyFabPosition(currentX, currentY)

  function openWorkstation() {
    if (isExpanded) return
    isExpanded = true
    fab.classList.add('fab-hidden')
    workstation.classList.add('expanded')
    syncContextToIframe()
  }

  function collapseWorkstation() {
    if (!isExpanded) return
    isExpanded = false
    workstation.classList.remove('expanded')
    fab.classList.remove('fab-hidden')
  }

  function syncContextToIframe() {
    broadcastContextUpdate()
  }

  function broadcastContextUpdate() {
    try {
      const context = getFullContext()
      const media = sniffViewportMedia()
      const payload = { ...context, media }

      // 1. 同步到浮动工作台 iframe
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
          source: 'omnimux-content-script',
          type: 'PAGE_CONTEXT_UPDATE',
          payload,
          timestamp: Date.now(),
        }, panelOrigin)
      }

      // 2. 主动广播给 Chrome 原生侧边栏 / 扩展后台
      try {
        chrome.runtime?.sendMessage({
          action: 'PAGE_CONTEXT_UPDATE',
          payload,
        }).catch(() => {})
      } catch {
        // Ignore extension invalidated
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Expands the workstation and hands it one page media element.
   *
   * Resolves `true` only when the panel confirms the attachment, so the caller
   * can fall back to the native side panel instead of claiming success.
   */
  function openWorkstationWithMedia(payload: HoveredMedia): Promise<boolean> {
    openWorkstation()
    if (!iframe?.contentWindow) return Promise.resolve(false)

    const pending = pendingAttachMap()
    const previous = pending.get(payload.id)
    if (previous !== undefined) {
      clearTimeout(previous.timer)
      pending.delete(payload.id)
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(payload.id)
        resolve(false)
      }, TIMING.attachReceiptTimeout)
      pending.set(payload.id, { resolve, timer })
      void chrome.runtime.sendMessage({ type: 'ISSUE_FLOAT_MEDIA_GRANT', payload }).then((result) => {
        if (typeof result?.grant !== 'string') throw new Error('media grant refused')
        iframe.contentWindow?.postMessage({
          source: CONTENT_MESSAGE_SOURCE,
          type: BRIDGE_MESSAGE.mediaAttachRequest,
          grant: result.grant,
          timestamp: Date.now(),
        }, panelOrigin)
      }).catch(() => {
        clearTimeout(timer)
        pending.delete(payload.id)
        resolve(false)
      })
    })
  }

  /** Whether the floating workstation is currently expanded. */
  function isWorkstationOpen(): boolean {
    return isExpanded
  }

  /** Resolves a waiting attach request when the panel reports the outcome. */
  function handleAttachResult(payload: unknown): void {
    if (typeof payload !== 'object' || payload === null) return
    const receipt = payload as { id?: unknown; ok?: unknown }
    if (typeof receipt.id !== 'string') return
    const pending = pendingAttachMap().get(receipt.id)
    if (pending === undefined) return
    pendingAttachMap().delete(receipt.id)
    clearTimeout(pending.timer)
    pending.resolve(receipt.ok === true)
  }

  // The hover capsule consumes this handle instead of keeping a second iframe
  // channel, so the workstation owns its own message contract in one place.
  const shell = globalThis as typeof globalThis & {
    __dshBrowserWorkstation?: {
      openWithMedia: (payload: HoveredMedia) => Promise<boolean>
      isOpen: () => boolean
    }
  }
  shell.__dshBrowserWorkstation = {
    openWithMedia: openWorkstationWithMedia,
    isOpen: isWorkstationOpen,
  }

  // Free Dragging
  let isDragging = false
  let hasMoved = false
  let dragStartX = 0
  let dragStartY = 0
  let fabOriginX = 0
  let fabOriginY = 0

  fab.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return
    isDragging = true
    hasMoved = false
    dragStartX = e.clientX
    dragStartY = e.clientY

    const rect = fab.getBoundingClientRect()
    fabOriginX = rect.left
    fabOriginY = rect.top

    fab.setPointerCapture(e.pointerId)
    e.preventDefault()
  })

  fab.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true
    }

    let nextX = fabOriginX + dx
    let nextY = fabOriginY + dy

    nextX = Math.max(10, Math.min(window.innerWidth - 66, nextX))
    nextY = Math.max(10, Math.min(window.innerHeight - 66, nextY))

    applyFabPosition(nextX, nextY)
  })

  fab.addEventListener('pointerup', (e: PointerEvent) => {
    if (!isDragging) return
    isDragging = false
    try {
      fab.releasePointerCapture(e.pointerId)
    } catch {
      // Ignore
    }

    const rect = fab.getBoundingClientRect()
    currentX = rect.left
    currentY = rect.top

    try {
      localStorage.setItem('omnimux_fab_pos_v2', JSON.stringify({ x: currentX, y: currentY }))
    } catch {
      // Ignore
    }

    if (!hasMoved) {
      openWorkstation()
    }
  })

  // Press ESC to collapse
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isExpanded) {
      collapseWorkstation()
    }
  }
  window.addEventListener('keydown', handleKeyDown)

  // Listen for messages from workstation iframe
  const handleMessage = async (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow || e.origin !== panelOrigin) return
    if (!e.data || typeof e.data !== 'object') return
    const { type, text } = e.data

    if (type === 'COLLAPSE_WORKSTATION') {
      collapseWorkstation()
      return
    }

    if (type === 'OMNIMUX_PANEL_ERROR') {
      console.error('[OmniMux-Workstation-Fatal]', e.data.error)
      return
    }

    if (type === 'GET_PAGE_CONTEXT') {
      syncContextToIframe()
      return
    }

    if (type === 'SNIFF_MEDIA_REQUEST') {
      const media = sniffViewportMedia()
      iframe.contentWindow?.postMessage({
        source: 'omnimux-content-script',
        type: 'MEDIA_SNIFFED_RESULT',
        payload: media,
      }, panelOrigin)
      return
    }

    if (type === BRIDGE_MESSAGE.mediaAttachResult) {
      handleAttachResult(e.data.payload)
      return
    }

    if (type === 'FILL_STRUCTURED_DRAFT') {
      const fields = e.data.fields || []
      const result = await fillFormFields(document, fields)
      iframe.contentWindow?.postMessage({
        source: 'omnimux-content-script',
        type: 'FILL_STRUCTURED_DRAFT_RESULT',
        requestId: e.data.requestId,
        payload: result,
      }, panelOrigin)
      return
    }

    if (type === 'FILL_HOST_DOM') {
      const platform = detectPlatform()
      const result = await fillHostInput(text || '', platform)
      iframe.contentWindow?.postMessage({
        source: 'omnimux-content-script',
        type: 'FILL_HOST_DOM_RESULT',
        requestId: e.data.requestId,
        payload: result,
      }, panelOrigin)
      return
    }
  }
  window.addEventListener('message', handleMessage)

  // 实时感知算法：深度监听 SPA (Twitter/X, TikTok, etc.) 单页路由、标题及内容变动
  let lastTrackedUrl = window.location.href
  let lastTrackedTitle = document.title

  const checkAndNotifyPageChange = () => {
    const currentUrl = window.location.href
    const currentTitle = document.title
    if (currentUrl !== lastTrackedUrl || currentTitle !== lastTrackedTitle) {
      lastTrackedUrl = currentUrl
      lastTrackedTitle = currentTitle
      broadcastContextUpdate()
    }
  }

  // 1. 劫持 History API (pushState & replaceState)
  const originalPushState = history.pushState
  history.pushState = function (...args) {
    originalPushState.apply(this, args)
    setTimeout(checkAndNotifyPageChange, 80)
    setTimeout(checkAndNotifyPageChange, 300)
  }

  const originalReplaceState = history.replaceState
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    setTimeout(checkAndNotifyPageChange, 80)
    setTimeout(checkAndNotifyPageChange, 300)
  }

  // 2. 监听 popstate 与 hashchange
  window.addEventListener('popstate', () => {
    setTimeout(checkAndNotifyPageChange, 80)
    setTimeout(checkAndNotifyPageChange, 300)
  })
  window.addEventListener('hashchange', () => {
    setTimeout(checkAndNotifyPageChange, 80)
  })

  // 3. 监听 document.title 变化 (SPA 页面通常跳转后异步更新 title)
  const titleTag = document.querySelector('title')
  if (titleTag) {
    const titleObs = new MutationObserver(() => checkAndNotifyPageChange())
    titleObs.observe(titleTag, { subtree: true, characterData: true, childList: true })
  }

  // 4. 定时轻量巡检兜底 (每 800ms 巡检一次 URL 与 Title 状态)
  const routePollTimer = setInterval(checkAndNotifyPageChange, 800)

  // Unsubscribe and remove global event listeners
  const unsubscribe = () => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('message', handleMessage)
    clearInterval(routePollTimer)
    unsubscribeFlag()
  }
  (window as unknown as { __omnimux_fab_unsubscribe?: () => void }).__omnimux_fab_unsubscribe = unsubscribe

  // Also respond to runtime messages from native side panel
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'FILL_STRUCTURED_DRAFT') {
      const fields = request.payload?.fields || []
      void fillFormFields(document, fields).then((res) => sendResponse(res))
      return true
    }
    if (request.action === 'FILL_HOST_DOM') {
      const textToFill = (request.payload && request.payload.text) || request.text || ''
      const platform = detectPlatform()
      void fillHostInput(textToFill, platform).then((res) => sendResponse(res))
      return true
    }
    if (request.action === 'EXTRACT_PAGE_CONTEXT' || request.action === 'GET_PAGE_CONTEXT') {
      const ctx = getFullContext()
      const media = sniffViewportMedia()
      sendResponse({ ...ctx, media })
      return true
    }
    return true
  })
}
