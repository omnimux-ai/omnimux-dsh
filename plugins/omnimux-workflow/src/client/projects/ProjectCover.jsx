import React, { useEffect, useRef, useState } from 'react'
import { loadCoverThumbnail } from './coverThumbnail.js'
import { injectFolderStyles } from './folderStyles.js'

function CoverGlyph({ kind }) {
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {kind === 'empty' ? <path d="M9 49V16a4 4 0 0 1 4-4h12l6 8h18a4 4 0 0 1 4 4v5H23l-9 20h35l7-20" />
      : kind === 'video' ? <><rect x="9" y="14" width="46" height="36" rx="6"/><path d="m27 23 14 9-14 9Z"/></>
      : kind === 'image' ? <><rect x="8" y="12" width="48" height="40" rx="5"/><circle cx="23" cy="25" r="4"/><path d="m10 48 15-14 10 9 9-11 10 16"/></>
      : <><path d="M17 8h22l10 10v38H17Z M39 8v12h10 M24 30h18 M24 38h18 M24 46h12"/></>}
  </svg>
}
function AudioCover() {
  return <svg className="omnimux-cover-audio" viewBox="0 0 420 240" aria-hidden="true">
    {Array.from({ length: 160 }, (_, i) => {
      const envelope = Math.max(0.03, Math.sin(i * 0.067) ** 14, 0.6 * Math.sin(i * 0.14 + 1) ** 20)
      const height = 3 + envelope * (12 + Math.abs(Math.sin(i * 2.17)) * 66)
      return <path key={i} d={`M${10 + i * 2.5} ${112 - height / 2}v${height}`} stroke="currentColor" strokeWidth="1.7" />
    })}
  </svg>
}
/** Static cover only: media playback never starts in the project library. */
export function ProjectCover({ cover, renderFrame }) {
  const kind = cover?.kind || 'empty'
  const [url, setUrl] = useState(null)
  const [failedUrl, setFailedUrl] = useState(null)
  const root = useRef(null)
  const source = cover?.sourceRevision || cover?.thumbnailUrl || cover?.mediaUrl
  useEffect(() => {
    injectFolderStyles()
    let alive = true
    let objectUrl
    let retryTimer
    let attempts = 0
    setUrl(null)
    setFailedUrl(null)
    const load = () => {
      loadCoverThumbnail(cover || {}).then((blob) => {
        if (!alive || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setFailedUrl(null)
      }).catch(() => {
        if (!alive) return
        const fallback = kind === 'image' ? cover?.mediaUrl : cover?.thumbnailUrl
        if (fallback) setUrl(fallback)
        else setFailedUrl(source)
        if (++attempts < 3) retryTimer = setTimeout(load, 31000)
      })
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load() }
    }, { rootMargin: '150px' })
    if (root.current) observer.observe(root.current)
    return () => { alive = false; clearTimeout(retryTimer); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [source, kind])
  const showImage = url && url !== failedUrl && (kind === 'image' || kind === 'video')
  const content = <div ref={root} className={`omnimux-cover-content omnimux-cover-content--${kind}`} data-cover-kind={kind} data-cover-unavailable={Boolean(cover?.unavailable || failedUrl)}>
    {!showImage && (cover?.unavailable || failedUrl) && <span className="omnimux-cover-status" role="img" aria-label="Preview unavailable">!</span>}
    {!showImage && !failedUrl && !cover?.unavailable && (!cover || (source && ['image', 'video'].includes(kind))) && <span className="omnimux-cover-status" role="img" aria-label="Loading preview">•••</span>}
    {showImage ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />
      : kind === 'audio' ? <AudioCover /> : <CoverGlyph kind={kind} />}
  </div>
  // Decoration shares this loader's blob lifetime; remote fallbacks are never loaded twice.
  return renderFrame ? renderFrame(content, showImage && url.startsWith('blob:') ? url : null) : content
}
