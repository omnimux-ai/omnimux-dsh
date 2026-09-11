import React from 'react'
import { createRoot } from 'react-dom/client'
import { RichVideoLinkCard } from './RichVideoLinkCard.jsx'
import { isSocialMediaVideoUrl } from './url-matcher.js'

export { isSocialMediaVideoUrl }

/**
 * Automatically transforms plain links in the conversation stream into Figure 3 rich cards.
 */
export function installRichVideoLinkTransformer(doc, sidebarService) {
  if (!doc || typeof doc.querySelectorAll !== 'function' || !doc.defaultView) return () => {}

  const roots = new WeakMap()

  function transformElement(a) {
    if (!a || a.dataset.omxRichTransformed) return
    const href = a.getAttribute('href') || a.href
    if (!isSocialMediaVideoUrl(href)) return

    a.dataset.omxRichTransformed = 'true'
    a.style.display = 'none'

    const container = doc.createElement('div')
    container.className = 'omx-rich-card-container'
    if (a.parentNode) {
      a.parentNode.insertBefore(container, a.nextSibling)
    }

    const root = createRoot(container)
    roots.set(container, root)

    const handleClick = () => {
      if (sidebarService && typeof sidebarService.openTab === 'function') {
        sidebarService.openTab({ path: href, title: '视频分析' })
      }
      try {
        doc.defaultView?.dispatchEvent(new CustomEvent('omnimux:open-video-preview', { detail: { url: href } }))
      } catch {}
    }

    root.render(
      React.createElement(RichVideoLinkCard, {
        url: href,
        onClick: handleClick,
      })
    )
  }

  function scan() {
    const anchors = doc.querySelectorAll(
      '[data-conversation-scroll] a[href], [data-role="user"] a[href], .chat-bubble a[href], div[class*="message"] a[href], div[class*="Bubble"] a[href]'
    )
    for (const a of anchors) {
      transformElement(a)
    }
  }

  scan()
  const Observer = doc.defaultView.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null)
  if (!Observer || !doc.body) return () => {}

  const observer = new Observer(() => {
    scan()
  })

  observer.observe(doc.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
  }
}
