import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PanelApi } from './api.ts'
import {
  isVideoMediaType,
  mediaFormatTag,
  mediaResponseDataUrl,
  type MediaAttachmentRef,
} from './attachments.ts'
import type { PanelCopy } from './strings.ts'

type MediaSource =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'failed' }

/** The stage keeps its box while the bytes are still in flight. */
const LOADING: MediaSource = { status: 'loading' }
const FAILED: MediaSource = { status: 'failed' }

/**
 * Conversation media gallery.
 *
 * The panel is a narrow portrait column (320–520px), so the layout is fixed
 * top-to-bottom: a full-width stage with the thumbnail rail underneath. Stage
 * height comes from the attachment aspect ratio through the `--media-ratio`
 * custom property, never from a JS width measurement — measuring the first
 * frame reads a container width that has not settled yet.
 *
 * Every piece of gallery state lives in this component. The message row is
 * memoized, so lifting the selected index to the row or the list would
 * re-render the whole transcript on each keystroke.
 */
export const MessageImages = memo(function MessageImages({
  images,
  sessionId,
  api,
  align,
  copy,
}: {
  images: readonly MediaAttachmentRef[]
  sessionId: string
  api: PanelApi
  align: 'start' | 'end'
  copy: PanelCopy
}): React.JSX.Element | null {
  const { sources, retry } = useMediaSources(images, sessionId, api)
  const [selected, setSelected] = useState(0)
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const railRef = useRef<HTMLDivElement | null>(null)

  const multi = images.length > 1
  // A reused row can swap its media under a selection that is out of range.
  const index = images.length === 0 ? 0 : Math.min(selected, images.length - 1)

  const labelOf = useCallback(
    (attachment: MediaAttachmentRef): string => attachment.name ?? copy.app.image,
    [copy],
  )

  const select = useCallback((next: number): void => {
    setSelected(next)
    const thumb = railRef.current?.children[next]
    // jsdom has no layout engine and no scrollIntoView; browsers do.
    if (thumb instanceof HTMLElement && typeof thumb.scrollIntoView === 'function') {
      thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [])

  const step = useCallback((delta: number): void => {
    setSelected((value) => (value + delta + images.length) % images.length)
  }, [images.length])

  useEffect(() => {
    const rail = railRef.current
    if (rail === null) return
    const update = (): void => {
      const next = rail.scrollWidth > rail.clientWidth + 1
      setOverflow((value) => (value === next ? value : next))
    }
    update()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(update)
    observer.observe(rail)
    return () => observer.disconnect()
  }, [images.length])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
      else if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, step])

  if (images.length === 0) return null

  const active = images[index]!
  const activeSource = sources[active.attachmentId] ?? LOADING
  const activeLabel = labelOf(active)
  const stageStyle: React.CSSProperties & Record<'--media-ratio', string> = {
    '--media-ratio': `${active.width} / ${active.height}`,
  }

  return (
    <div className={`message-images ${align}`}>
      <div className={`gallery${multi ? '' : ' single'}`}>
        {activeSource.status === 'failed'
          ? (
            <div className="stage-box stage-fail" style={stageStyle}>
              <span>{copy.app.mediaLoadFailed}</span>
              <button type="button" className="stage-retry" onClick={retry}>{copy.app.imageRetry}</button>
            </div>
          )
          : (
            <button
              type="button"
              className="stage-box"
              style={stageStyle}
              disabled={activeSource.status !== 'ready'}
              title={copy.app.openImage}
              aria-label={copy.app.viewLargeImage}
              onClick={() => setOpen(true)}
            >
              {activeSource.status === 'ready'
                ? <StageMedia attachment={active} src={activeSource.src} label={activeLabel} />
                : <span className="stage-skeleton" aria-hidden="true" />}
              <span className="stage-kind">{mediaFormatTag(active.mediaType)}</span>
              {multi && (
                <span className="stage-count">{copy.app.stageCount(index + 1, images.length)}</span>
              )}
            </button>
          )}

        {multi && (
          <div
            ref={railRef}
            className={`rail${overflow ? ' scrollable' : ''}`}
            role="tablist"
            aria-label={copy.app.mediaPreview}
          >
            {images.map((attachment, position) => {
              const source = sources[attachment.attachmentId] ?? LOADING
              const label = labelOf(attachment)
              return (
                <button
                  key={`${attachment.attachmentId}:${position}`}
                  type="button"
                  className="thumb"
                  role="tab"
                  aria-selected={position === index}
                  aria-label={copy.app.openNamedImage(label)}
                  onClick={() => select(position)}
                >
                  {source.status === 'ready' ? <ThumbMedia attachment={attachment} src={source.src} label={label} /> : null}
                  <span className="thumb-kind">{mediaFormatTag(attachment.mediaType)}</span>
                  {isVideoMediaType(attachment.mediaType) && (
                    <span className="thumb-play"><PlayIcon /></span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {open && (
          <div
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={copy.app.mediaPreview}
            onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}
          >
            <div className="image-lightbox-bar">
              <span className="image-lightbox-title">{activeLabel}</span>
              <span className="image-lightbox-count">{copy.app.stageCount(index + 1, images.length)}</span>
              <button
                type="button"
                className="image-lightbox-close"
                aria-label={copy.app.closeImage}
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="image-lightbox-stage">
              <button
                type="button"
                className="image-lightbox-nav"
                aria-label={copy.app.previousImage}
                disabled={!multi}
                onClick={() => step(-1)}
              >
                <PreviousIcon />
              </button>
              <div className="image-lightbox-media" onClick={(event) => event.stopPropagation()}>
                {activeSource.status === 'ready'
                  ? <StageMedia attachment={active} src={activeSource.src} label={activeLabel} />
                  : null}
              </div>
              <button
                type="button"
                className="image-lightbox-nav"
                aria-label={copy.app.nextImage}
                disabled={!multi}
                onClick={() => step(1)}
              >
                <NextIcon />
              </button>
            </div>
            <div className="image-lightbox-strip" role="tablist" aria-label={copy.app.mediaPreview}>
              {images.map((attachment, position) => {
                const source = sources[attachment.attachmentId] ?? LOADING
                const label = labelOf(attachment)
                return (
                  <button
                    key={`${attachment.attachmentId}:${position}`}
                    type="button"
                    className="thumb"
                    role="tab"
                    aria-selected={position === index}
                    aria-label={copy.app.openNamedImage(label)}
                    onClick={() => setSelected(position)}
                  >
                    {source.status === 'ready' ? <ThumbMedia attachment={attachment} src={source.src} label={label} /> : null}
                    {isVideoMediaType(attachment.mediaType) && (
                      <span className="thumb-play"><PlayIcon /></span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Fetch every attachment's bytes for the stage and the rail.
 *
 * Keyed on attachment identity rather than the array reference: the message row
 * hands back a fresh `images` array on each parent render, so a reference
 * dependency would refetch on every keystroke.
 */
function useMediaSources(
  images: readonly MediaAttachmentRef[],
  sessionId: string,
  api: PanelApi,
): { sources: Record<string, MediaSource>; retry: () => void } {
  const identity = images
    .map((image) => `${image.attachmentId}:${image.mediaType}:${image.width}x${image.height}`)
    .join('|')
  const [attempt, setAttempt] = useState(0)
  const [sources, setSources] = useState<Record<string, MediaSource>>({})
  const pending = useMemo(() => images, [identity])

  useEffect(() => {
    let current = true
    setSources(Object.fromEntries(pending.map((image) => [image.attachmentId, LOADING])))
    for (const attachment of pending) {
      void api.rpc('session.attachment', {
        sessionId,
        attachmentId: attachment.attachmentId,
      }).then((value) => {
        if (!current) return
        const url = mediaResponseDataUrl(value, attachment)
        setSources((previous) => ({
          ...previous,
          [attachment.attachmentId]: url === null ? FAILED : { status: 'ready', src: url },
        }))
      }).catch(() => {
        if (!current) return
        setSources((previous) => ({ ...previous, [attachment.attachmentId]: FAILED }))
      })
    }
    return () => { current = false }
  }, [api, pending, sessionId, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { sources, retry }
}

/** Stage and full-screen media: video is user-initiated and never autoplays. */
function StageMedia({
  attachment,
  src,
  label,
}: {
  attachment: MediaAttachmentRef
  src: string
  label: string
}): React.JSX.Element {
  if (isVideoMediaType(attachment.mediaType)) {
    return <video src={src} controls preload="metadata" playsInline aria-label={label} />
  }
  return <img src={src} alt={label} />
}

/** Rail thumbnails: silent stills, no transport controls. */
function ThumbMedia({
  attachment,
  src,
  label,
}: {
  attachment: MediaAttachmentRef
  src: string
  label: string
}): React.JSX.Element {
  if (isVideoMediaType(attachment.mediaType)) {
    return <video src={src} muted preload="metadata" playsInline aria-label={label} />
  }
  return <img src={src} alt={label} />
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function PreviousIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function NextIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
