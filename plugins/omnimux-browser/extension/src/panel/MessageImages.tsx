import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PanelApi } from './api.ts'
import {
  isVideoMediaType,
  mediaFormatTag,
  mediaResponseDataUrl,
} from './attachments.ts'
import {
  PRODUCED_MEDIA_RPC_METHOD,
  producedMediaKey,
  producedMediaKind,
  producedMediaResponseDataUrl,
  type ProducedMediaRef,
} from './produced-media.ts'
import type { PanelCopy } from './strings.ts'

type MediaSource =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'failed' }

/** The stage keeps its box while the bytes are still in flight. */
const LOADING: MediaSource = { status: 'loading' }
const FAILED: MediaSource = { status: 'failed' }

/**
 * Path references carry no declared dimensions: the stage assumes a neutral
 * 4:3 and the element's natural size replaces it once the media loads. The
 * clamp keeps a degenerate sensor reading (a 0-height video, a broken stream)
 * from stretching the stage to a stripe.
 */
const MIN_STAGE_RATIO = 0.25
const MAX_STAGE_RATIO = 4
const FALLBACK_STAGE_RATIO = 4 / 3

function clampRatio(width: number, height: number): number {
  const ratio = width / height
  if (!Number.isFinite(ratio) || ratio <= 0) return FALLBACK_STAGE_RATIO
  return Math.min(MAX_STAGE_RATIO, Math.max(MIN_STAGE_RATIO, ratio))
}

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
  images: readonly ProducedMediaRef[]
  sessionId: string
  api: PanelApi
  align: 'start' | 'end'
  copy: PanelCopy
}): React.JSX.Element | null {
  const { sources, retry } = useMediaSources(images, sessionId, api)
  const [selected, setSelected] = useState(0)
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  // Measured aspect ratios for path-sourced media, keyed like `sources`.
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const railRef = useRef<HTMLDivElement | null>(null)

  // File-kind references (pdf/document/html/file) are file cards, not stage
  // items; audio is a controls strip. Only image/video enter the lightbox.
  const { stageItems, audioItems, fileItems } = useMemo(() => {
    const stageItems: ProducedMediaRef[] = []
    const audioItems: ProducedMediaRef[] = []
    const fileItems: ProducedMediaRef[] = []
    for (const item of images) {
      const kind = producedMediaKind(item)
      if (kind === 'audio') audioItems.push(item)
      else if (kind === 'image' || kind === 'video') stageItems.push(item)
      else fileItems.push(item)
    }
    return { stageItems, audioItems, fileItems }
  }, [images])

  const multi = stageItems.length > 1
  // A reused row can swap its media under a selection that is out of range.
  const index = stageItems.length === 0 ? 0 : Math.min(selected, stageItems.length - 1)

  const labelOf = useCallback(
    (attachment: ProducedMediaRef): string => attachment.name ?? copy.app.image,
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
    setSelected((value) => (value + delta + stageItems.length) % stageItems.length)
  }, [stageItems.length])

  const measureStage = useCallback((item: ProducedMediaRef, width: number, height: number): void => {
    // Attachments declare exact dimensions — only path references need measuring.
    if (item.source !== 'path') return
    const key = producedMediaKey(item)
    const ratio = clampRatio(width, height)
    setRatios((previous) => (previous[key] === ratio ? previous : { ...previous, [key]: ratio }))
  }, [])

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
  }, [stageItems.length])

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

  const active = stageItems.length > 0 ? stageItems[index]! : null
  const activeSource = active === null ? LOADING : (sources[producedMediaKey(active)] ?? LOADING)
  const activeLabel = active === null ? '' : labelOf(active)
  const activeRatio = active === null
    ? FALLBACK_STAGE_RATIO
    : active.source === 'attachment'
      ? active.width / active.height
      : (ratios[producedMediaKey(active)] ?? FALLBACK_STAGE_RATIO)
  const stageStyle: React.CSSProperties & Record<'--media-ratio', string> = {
    '--media-ratio': `${activeRatio}`,
  }

  /**
   * Two shapes over one data path.
   *
   * The media a user sent is a receipt — "this much went out" — so it renders as
   * 48px chips that open the viewer on click. Media the assistant produced is the
   * deliverable and keeps the browseable stage-and-rail gallery. Both read the
   * same `sources` map and open the same lightbox; only the resting layout differs.
   */
  const compact = align === 'end'

  return (
    <div className={`message-images ${align}`}>
      {compact && (
        <div className="media-chips" aria-label={copy.app.mediaPreview}>
          {images.map((attachment, position) => {
            const key = producedMediaKey(attachment)
            const source = sources[key] ?? LOADING
            const label = labelOf(attachment)
            const failed = source.status === 'failed'
            return (
              <button
                key={`${key}:${position}`}
                type="button"
                className={`media-chip${failed ? ' failed' : ''}`}
                // A failed chip retries instead of opening a viewer with nothing
                // in it, so the compact shape answers a failure the same way the
                // assistant's stage does.
                aria-label={failed ? `${label} · ${copy.app.mediaLoadFailed}` : copy.app.openNamedImage(label)}
                title={failed ? copy.app.mediaLoadFailed : undefined}
                onClick={() => {
                  if (failed) {
                    retry()
                    return
                  }
                  setSelected(position)
                  setOpen(true)
                }}
              >
                {source.status === 'ready'
                  ? <ThumbMedia attachment={attachment} src={source.src} label={label} />
                  : failed
                    ? <span className="media-chip-failed" aria-hidden="true"><BrokenMediaIcon /></span>
                    : <span className="media-chip-skeleton" aria-hidden="true" />}
                {isVideoMediaType(attachment.mediaType) && !failed && (
                  <span className="thumb-play"><PlayIcon /></span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {!compact && stageItems.length > 0 && active !== null && (
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
                  ? (
                    <StageMedia
                      attachment={active}
                      src={activeSource.src}
                      label={activeLabel}
                      onMeasured={(width, height) => measureStage(active, width, height)}
                    />
                  )
                  : <span className="stage-skeleton" aria-hidden="true" />}
                <span className="stage-kind">{mediaFormatTag(active.mediaType)}</span>
                {multi && (
                  <span className="stage-count">{copy.app.stageCount(index + 1, stageItems.length)}</span>
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
              {stageItems.map((attachment, position) => {
                const key = producedMediaKey(attachment)
                const source = sources[key] ?? LOADING
                const label = labelOf(attachment)
                return (
                  <button
                    key={`${key}:${position}`}
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
        </div>
      )}

      {!compact && audioItems.map((attachment) => {
        const key = producedMediaKey(attachment)
        const source = sources[key] ?? LOADING
        const label = labelOf(attachment)
        return (
          <div key={key} className="audio-strip">
            {source.status === 'ready'
              ? <audio src={source.src} controls preload="metadata" aria-label={label} />
              : source.status === 'failed'
                ? (
                  <>
                    <span className="audio-strip-failed">{copy.app.mediaLoadFailed}</span>
                    <button type="button" className="stage-retry" onClick={retry}>{copy.app.imageRetry}</button>
                  </>
                )
                : <span className="media-chip-skeleton" aria-hidden="true" />}
          </div>
        )
      })}

      {!compact && fileItems.length > 0 && (
        <div className="produced-files">
          {fileItems.map((attachment, position) => {
            const key = producedMediaKey(attachment)
            const label = labelOf(attachment)
            const kindLabel = fileKindLabel(attachment, copy)
            const detail = typeof attachment.bytes === 'number'
              ? `${formatProducedBytes(attachment.bytes)} · ${kindLabel}`
              : kindLabel
            return (
              <div key={`${key}:${position}`} className="file-card" aria-label={`${label} · ${detail}`}>
                <span className="file-card-icon" aria-hidden="true"><FileIcon /></span>
                <span className="file-card-name" title={label}>{label}</span>
                <span className="file-card-meta">
                  {typeof attachment.bytes === 'number' && (
                    <span className="file-card-size">{formatProducedBytes(attachment.bytes)}</span>
                  )}
                  <span className="file-card-kind">{kindLabel}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {open && active !== null && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={copy.app.mediaPreview}
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}
        >
          <div className="image-lightbox-bar">
            <span className="image-lightbox-title">{activeLabel}</span>
            <span className="image-lightbox-count">{copy.app.stageCount(index + 1, stageItems.length)}</span>
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
                // Never blank: a viewer opened on a failure has to say so.
                : <span className="image-lightbox-failed">
                  {activeSource.status === 'failed' ? copy.app.mediaLoadFailed : copy.app.imageLoading}
                </span>}
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
            {stageItems.map((attachment, position) => {
              const key = producedMediaKey(attachment)
              const source = sources[key] ?? LOADING
              const label = labelOf(attachment)
              return (
                <button
                  key={`${key}:${position}`}
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
  )
})

/**
 * Fetch every renderable item's bytes for the stage, rail, chips and audio strip.
 *
 * Keyed on item identity rather than the array reference: the message row
 * hands back a fresh `images` array on each parent render, so a reference
 * dependency would refetch on every keystroke. File cards carry no bytes and
 * never reach the bridge.
 */
function useMediaSources(
  images: readonly ProducedMediaRef[],
  sessionId: string,
  api: PanelApi,
): { sources: Record<string, MediaSource>; retry: () => void } {
  const pending = useMemo(() => images.filter((item) => producedMediaKind(item) !== 'file'
    && producedMediaKind(item) !== 'pdf'
    && producedMediaKind(item) !== 'document'
    && producedMediaKind(item) !== 'html'), [images])
  const identity = pending
    .map((item) => {
      const key = producedMediaKey(item)
      const size = item.source === 'attachment' ? `${item.width}x${item.height}` : ''
      return `${key}:${item.mediaType}:${size}`
    })
    .join('|')
  const [attempt, setAttempt] = useState(0)
  const [sources, setSources] = useState<Record<string, MediaSource>>({})
  const memoized = useMemo(() => pending, [identity])

  useEffect(() => {
    let current = true
    setSources(Object.fromEntries(memoized.map((item) => [producedMediaKey(item), LOADING])))
    for (const item of memoized) {
      const key = producedMediaKey(item)
      const request = item.source === 'attachment'
        ? api.rpc('session.attachment', { sessionId, attachmentId: item.attachmentId })
          .then((value) => mediaResponseDataUrl(value, item))
        : api.rpc(PRODUCED_MEDIA_RPC_METHOD, { sessionId, path: item.path })
          .then((value) => producedMediaResponseDataUrl(value, item))
      request.then((url) => {
        if (!current) return
        setSources((previous) => ({
          ...previous,
          [key]: url === null ? FAILED : { status: 'ready', src: url },
        }))
      }).catch(() => {
        if (!current) return
        setSources((previous) => ({ ...previous, [key]: FAILED }))
      })
    }
    return () => { current = false }
  }, [api, memoized, sessionId, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { sources, retry }
}

/** Stage and full-screen media: video is user-initiated and never autoplays. */
function StageMedia({
  attachment,
  src,
  label,
  onMeasured,
}: {
  attachment: ProducedMediaRef
  src: string
  label: string
  onMeasured?: (width: number, height: number) => void
}): React.JSX.Element {
  if (isVideoMediaType(attachment.mediaType)) {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        aria-label={label}
        onLoadedMetadata={(event) => onMeasured?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
      />
    )
  }
  return (
    <img
      src={src}
      alt={label}
      onLoad={(event) => onMeasured?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
    />
  )
}

/** Rail thumbnails: silent stills, no transport controls. */
function ThumbMedia({
  attachment,
  src,
  label,
}: {
  attachment: ProducedMediaRef
  src: string
  label: string
}): React.JSX.Element {
  if (isVideoMediaType(attachment.mediaType)) {
    return <video src={src} muted preload="metadata" playsInline aria-label={label} />
  }
  return <img src={src} alt={label} />
}

/** The file-card type name — the only vocabulary the PM locked for this feature. */
function fileKindLabel(attachment: ProducedMediaRef, copy: PanelCopy): string {
  const kind = producedMediaKind(attachment)
  if (kind === 'pdf') return copy.app.fileKindPdf
  if (kind === 'document' || kind === 'html') return copy.app.fileKindDocument
  return copy.app.fileKindFile
}

/** Compact byte count for the file card (`2048` → `2 KB`, `0` → `0 B`). */
function formatProducedBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024) * 10) / 10} MB`
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${bytes} B`
}

function FileIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
    </svg>
  )
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

/** Marks a thumb whose bytes could not be fetched; the chip retries on click. */
function BrokenMediaIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="m6 17 4.5-5 3 3 2-2 2.5 4" />
      <path d="M4 4l16 16" />
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
