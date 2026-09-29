import { useEffect, useRef } from 'react'

/** Thin lazy bridge; the inspiration plugin owns all detail UI and copy. */
export function TrendingDetailModal({ item, open = true, onClose, onRecreate }) {
  const callbacks = useRef({ onClose, onRecreate })
  callbacks.current = { onClose, onRecreate }
  useEffect(() => {
    if (!open || !item) return
    let close
    let disposed = false
    const launch = () => {
      const service = window.__omnimuxInspirationPreview
      if (close || !service) return
      if (typeof service.open !== 'function') {
        callbacks.current.onClose?.()
        return
      }
      close = service.open({
        row: item.inspirationRow || {
          ...item, cover_url: item.cover, video_url: item.videoUrl,
          source_url: item.sourceUrl,
        },
        onClose: (reason) => {
          close = undefined
          if (!disposed && reason !== 'replaced' && reason !== 'unavailable') callbacks.current.onClose?.()
        },
        onReplicate: () => callbacks.current.onRecreate?.(item),
      })
    }
    window.addEventListener('omnimux:inspiration-preview:ready', launch)
    launch()
    return () => {
      disposed = true
      window.removeEventListener('omnimux:inspiration-preview:ready', launch)
      close?.()
    }
  }, [open, item])
  return null
}
