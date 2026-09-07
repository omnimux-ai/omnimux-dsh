import { useEffect, useRef, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { ChatIcon, CloseIcon, FileIcon } from './icons.jsx'
import { addMediaToConversation } from './add-to-chat.js'

/**
 * Tab-internal zoomed modal preview for creative media items and files.
 * Aligns with the InspirationPreviewModal paradigm.
 *
 * @param {{
 *   item: {
 *     id?: string,
 *     title?: string,
 *     extension?: string,
 *     kind?: 'folder' | 'image' | 'video' | 'file',
 *     previewUrl?: string,
 *     pathInfo?: string,
 *     sourceAssetId?: string,
 *     sourceAsset?: any,
 *     rawItem?: any,
 *   } | null,
 *   t: (key: string) => string,
 *   onClose: () => void,
 *   onAddToConversation?: (item: any) => void,
 * }} props
 */
export function AssetPreviewModal({ item, t, onClose, onAddToConversation }) {
  const [added, setAdded] = useState(false)
  const [broken, setBroken] = useState(false)
  const timerRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    setBroken(false)
  }, [item?.id, item?.previewUrl])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (videoRef.current) {
        try {
          videoRef.current.pause()
        } catch {
          // ignore video pause error
        }
      }
    }
  }, [])

  if (!item) return null

  const handleAdd = (event) => {
    event?.stopPropagation()
    if (added) return
    if (typeof onAddToConversation === 'function') {
      onAddToConversation(item)
    } else {
      addMediaToConversation(item)
    }
    setAdded(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setAdded(false)
    }, 1800)
  }

  const isImage = item.kind === 'image' && Boolean(item.previewUrl) && !broken
  const isVideo = item.kind === 'video' && Boolean(item.previewUrl) && !broken

  return (
    <div
      className="omnimux-assets-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title || 'Preview'}
    >
      <div
        className="omnimux-assets-modal-container"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="omnimux-assets-modal-header">
          <div className="omnimux-assets-modal-header-left">
            <h3 className="omnimux-assets-modal-title" title={item.title}>
              {item.title}
            </h3>
            {item.extension ? (
              <span className="omnimux-assets-modal-badge">
                {String(item.extension).toUpperCase()}
              </span>
            ) : null}
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            className="omnimux-assets-modal-close"
            aria-label={t('modal.close') || t('stage.close') || '关闭预览'}
            onClick={onClose}
          >
            <CloseIcon size={16} />
          </IconButton>
        </header>

        <main className="omnimux-assets-modal-body">
          {isImage ? (
            <div className="omnimux-assets-modal-media-wrap">
              <img
                src={item.previewUrl}
                alt={item.title || ''}
                className="omnimux-assets-modal-image"
                onError={() => setBroken(true)}
              />
            </div>
          ) : isVideo ? (
            <div className="omnimux-assets-modal-media-wrap">
              <video
                ref={videoRef}
                src={item.previewUrl}
                controls
                playsInline
                autoPlay={false}
                preload="metadata"
                className="omnimux-assets-modal-video"
                onError={() => setBroken(true)}
              />
            </div>
          ) : (
            <div className="omnimux-assets-modal-unsupported">
              <div className="omnimux-assets-modal-unsupported-icon">
                <FileIcon size={48} />
              </div>
              <p className="omnimux-assets-modal-unsupported-text">
                {t('modal.unsupportedMedia')}
              </p>
              <div className="omnimux-assets-modal-unsupported-filename">
                {item.title}
              </div>
            </div>
          )}
        </main>

        <footer className="omnimux-assets-modal-footer">
          <div className="omnimux-assets-modal-path" title={item.pathInfo || ''}>
            {item.pathInfo ? (
              <>
                <span className="omnimux-assets-modal-path-label">{t('modal.path') || '路径'}:</span>
                <span className="omnimux-assets-modal-path-text">{item.pathInfo}</span>
              </>
            ) : <span />}
          </div>
          <div className="omnimux-assets-modal-actions">
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<ChatIcon size={14} />}
              disabled={added}
              onClick={handleAdd}
            >
              {added ? t('modal.addedToConversation') : t('modal.addToConversation')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
