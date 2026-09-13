/**
 * FAB & Immersive Workstation Companion:
 * Injects a squircle draggable FAB into the host page via Shadow DOM.
 * Expands into a 760px immersive workstation running panel/index.html?mode=float.
 */

import { getFullContext, detectPlatform } from './page-sensor.ts'
import { fillHostInput } from './dom-fill.ts'
import { sniffViewportMedia } from './media-sniffer.ts'

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

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", sans-serif;
      }

      /* Squircle micro-3D floating action button (FAB) */
      .omnimux-fab {
        position: fixed;
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: #111115;
        border: 1.5px solid rgba(184, 183, 255, 0.45);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 16px rgba(184, 183, 255, 0.25);
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        touch-action: none;
        z-index: 2147483647;
        opacity: 1;
        transform: scale(1);
        transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    opacity 0.2s ease,
                    box-shadow 0.2s ease,
                    border-color 0.2s ease;
      }

      .omnimux-fab:hover {
        transform: scale(1.08);
        border-color: #b8b7ff;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8), 0 0 24px rgba(184, 183, 255, 0.45);
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

      .omnimux-fab img {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        pointer-events: none;
        display: block;
      }

      /* 760px Immersive workstation container */
      .omnimux-workstation-container {
        position: fixed;
        top: 14px;
        right: 14px;
        bottom: 14px;
        width: min(760px, calc(100vw - 28px));
        height: calc(100vh - 28px);
        max-height: calc(100vh - 28px);
        border-radius: 20px;
        background: rgba(11, 11, 14, 0.94);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 32px rgba(139, 92, 246, 0.15);
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
      <img src="${iconUrl}" alt="OmniMux">
    </div>

    <div id="omnimux-workstation" class="omnimux-workstation-container" role="dialog" aria-label="OmniMux工作台">
      <iframe id="omnimux-panel-iframe" class="omnimux-iframe" src="${panelUrl}" allow="clipboard-read; clipboard-write" allowtransparency="true"></iframe>
    </div>
  `

  const fab = shadow.getElementById('omnimux-fab-btn') as HTMLElement
  const workstation = shadow.getElementById('omnimux-workstation') as HTMLElement
  const iframe = shadow.getElementById('omnimux-panel-iframe') as HTMLIFrameElement

  let isExpanded = false

  // Load saved position
  const savedPos = (() => {
    try {
      const raw = localStorage.getItem('omnimux_fab_pos_v2')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  let currentX = window.innerWidth - 80
  let currentY = window.innerHeight - 88

  if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
    currentX = Math.max(10, Math.min(window.innerWidth - 66, savedPos.x))
    currentY = Math.max(10, Math.min(window.innerHeight - 66, savedPos.y))
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
    if (!iframe || !iframe.contentWindow) return
    try {
      const context = getFullContext()
      const media = sniffViewportMedia()
      iframe.contentWindow.postMessage({
        source: 'omnimux-content-script',
        type: 'PAGE_CONTEXT_UPDATE',
        payload: { ...context, media },
        timestamp: Date.now(),
      }, '*')
    } catch {
      // Ignore cross-origin issues
    }
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
    if (!e.data || typeof e.data !== 'object') return
    const { type, text } = e.data

    if (type === 'COLLAPSE_WORKSTATION') {
      collapseWorkstation()
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
      }, '*')
      return
    }

    if (type === 'FILL_HOST_DOM') {
      const platform = detectPlatform()
      const result = await fillHostInput(text || '', platform)
      iframe.contentWindow?.postMessage({
        source: 'omnimux-content-script',
        type: 'FILL_HOST_DOM_RESULT',
        payload: result,
      }, '*')
      return
    }
  }
  window.addEventListener('message', handleMessage)

  // Unsubscribe and remove global event listeners
  const unsubscribe = () => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('message', handleMessage)
  }
  (window as unknown as { __omnimux_fab_unsubscribe?: () => void }).__omnimux_fab_unsubscribe = unsubscribe

  // Also respond to runtime messages from native side panel
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
