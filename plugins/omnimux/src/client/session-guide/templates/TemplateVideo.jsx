import React, { useEffect, useRef, useState } from 'react'

/** Only active, visible previews acquire a media source. Detail playback stays user-controlled. */
export function TemplateVideo({ src, poster, active = false, controls = false, className, title, onError }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [foreground, setForeground] = useState(() => typeof document !== 'undefined' && !document.hidden)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0))
      : null
    if (observer) observer.observe(element)
    else setVisible(true)
    const visibility = () => setForeground(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  const enabled = visible && foreground && (controls || active)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let cancelled = false
    setPlaying(false)
    if (enabled && !controls) {
      element.muted = true
      element.play()?.catch((error) => {
        if (cancelled) return
        setPlaying(false)
        // Policy rejection is recoverable on the next activation, not a broken resource.
        if (error?.name !== 'AbortError' && error?.name !== 'NotAllowedError') onError?.()
      })
    } else if (!enabled) {
      element.pause()
    }
    return () => {
      cancelled = true
      element.pause()
    }
  }, [enabled, controls, src, onError])
  return (
    <video
      ref={ref}
      src={controls || enabled ? src : undefined}
      poster={poster || undefined}
      className={`${className}${!controls && !playing ? ' is-preview-pending' : ''}`}
      muted={!controls}
      loop={!controls}
      playsInline
      controls={controls}
      preload="none"
      aria-label={controls ? title : undefined}
      aria-hidden={controls ? undefined : true}
      onPlaying={() => setPlaying(true)}
      onError={onError}
    />
  )
}
