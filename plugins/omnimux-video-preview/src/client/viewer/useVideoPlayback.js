import { useState, useMemo, useEffect, useRef } from 'react'

const TIKTOK_ID_PATTERNS = [
  /tiktok\.com\/@?[^/]+\/video\/(\d{15,25})/i,
  /tiktok\.com\/v\/(\d{15,25})/i,
  /tiktok\.com\/player\/v1\/(\d{15,25})/i,
]

export function extractTikTokEmbedUrl(sourceUrl, videoUrl) {
  const raw = String(sourceUrl || videoUrl || '')
  if (!raw) return null
  for (const pattern of TIKTOK_ID_PATTERNS) {
    const match = raw.match(pattern)
    if (match && match[1]) {
      return `https://www.tiktok.com/player/v1/${match[1]}`
    }
  }
  return null
}

export function findCurrentPlayingShotIndex(shots, currentTime) {
  if (typeof currentTime !== 'number' || !Array.isArray(shots) || shots.length === 0) {
    return -1
  }
  return shots.findIndex((s) => {
    const start = s.start_seconds || 0
    const end = s.end_seconds || (start + 3)
    return currentTime >= start && currentTime < end
  })
}

function safelyPlayVideo(el, onPlaySuccess) {
  if (!el) return
  const promise = el.play()
  if (promise && typeof promise.then === 'function') {
    promise.then(() => onPlaySuccess()).catch(() => {})
  }
}

function safelyPauseVideo(el, onPauseSuccess) {
  if (!el) return
  el.pause()
  onPauseSuccess()
}

function scrollShotIntoView(shotIndex) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(`omnimux-shot-card-${shotIndex}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

export function useVideoPlayback({ video, shots, activeTab, streamUrl }) {
  const [playerMode, setPlayerMode] = useState('native')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const videoRef = useRef(null)

  const embedUrl = useMemo(() => {
    return extractTikTokEmbedUrl(video?.source_url, video?.video_url)
  }, [video?.source_url, video?.video_url])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      safelyPlayVideo(el, () => setIsPlaying(true))
    } else {
      safelyPauseVideo(el, () => setIsPlaying(false))
    }
  }

  const toggleMute = () => {
    const el = videoRef.current
    if (!el) return
    const next = !el.muted
    el.muted = next
    setIsMuted(next)
  }

  const handleSeek = (sec) => {
    const el = videoRef.current
    if (!el || !Number.isFinite(sec)) return
    if (playerMode !== 'native' && streamUrl) {
      setPlayerMode('native')
    }
    el.currentTime = sec
    safelyPlayVideo(el, () => setIsPlaying(true))
  }

  const currentPlayingShotIndex = useMemo(() => {
    return findCurrentPlayingShotIndex(shots, currentTime)
  }, [shots, currentTime])

  useEffect(() => {
    const shouldScroll = activeTab === 'shots' && isPlaying && currentPlayingShotIndex >= 0
    if (shouldScroll) {
      scrollShotIntoView(currentPlayingShotIndex)
    }
  }, [currentPlayingShotIndex, activeTab, isPlaying])

  return {
    videoRef,
    playerMode,
    setPlayerMode,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    isPlaying,
    setIsPlaying,
    isMuted,
    embedUrl,
    togglePlay,
    toggleMute,
    handleSeek,
    currentPlayingShotIndex,
  }
}
