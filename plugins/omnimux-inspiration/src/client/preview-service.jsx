import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationPreviewModal } from './InspirationPreviewModal.jsx'
import { PreviewModalLayer } from './PreviewModalLayer.jsx'
import { injectInspirationStyles } from './styles.js'

/** Owner-side API: callers provide records and actions, never detail markup. */
export function registerPreviewService(t, target = window) {
  target.__omnimuxInspirationPreview?.dispose?.('replaced')
  let active = null
  let disposed = false
  const service = {
    open({ row, onClose, onReplicate }) {
      if (disposed) return () => {}
      active?.()
      injectInspirationStyles()
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      let closed = false
      const close = (reason = 'dismissed') => {
        if (closed) return
        closed = true
        if (active === close) active = null
        // A bridge may close during another root's effect cleanup. Keep React
        // commits out of that stack, and finish cleanup before the next mount.
        queueMicrotask(() => {
          root.unmount()
          host.remove()
        })
        onClose?.(reason)
      }
      active = close
      queueMicrotask(() => {
        if (!closed) {
          root.render(
            createElement(PreviewModalLayer, { onClose: () => close(), title: row?.title || '' },
              createElement(InspirationPreviewModal, { row, t, onClose: () => close(), onReplicate })
            )
          )
        }
      })
      return close
    },
    dispose(reason = 'unavailable') {
      if (disposed) return
      disposed = true
      if (target.__omnimuxInspirationPreview === service) delete target.__omnimuxInspirationPreview
      active?.(reason)
    },
  }
  target.__omnimuxInspirationPreview = service
  const EventConstructor = target.Event || (typeof Event !== 'undefined' ? Event : null)
  if (EventConstructor) {
    target.dispatchEvent(new EventConstructor('omnimux:inspiration-preview:ready'))
  }
  return () => service.dispose()
}
