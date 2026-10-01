import React, { useMemo, useState } from 'react'
import { PlayIcon } from '../icons.jsx'
import { VideoPlayerModeBar, VideoControlsBar } from './VideoPlayerControls.jsx'
import { pickAspectBucket, resolveDeclaredRatio } from './breakdownDataUtils.js'

function VideoEmbedFrame({ embedUrl, title }) {
  return (
    <div className="omnimux-video-player-wrapper is-embed">
      <iframe
        title={title || 'TikTok Video Player'}
        src={embedUrl}
        className="omnimux-video-breakdown-embed-frame"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}

function VideoCentralPlayButton({ onTogglePlay }) {
  return (
    <div
      className="omnimux-video-play-center-btn"
      title="播放视频"
      aria-label="播放视频"
      onClick={(e) => {
        e.stopPropagation()
        onTogglePlay()
      }}
    >
      <PlayIcon size={28} />
    </div>
  )
}

function handleLoadedMetadata(e, setDuration, onRatioMeasured) {
  const el = e.target
  const dur = el.duration
  if (dur && Number.isFinite(dur)) {
    setDuration(dur)
  }
  if (onRatioMeasured && el.videoWidth > 0 && el.videoHeight > 0) {
    onRatioMeasured(el.videoWidth / el.videoHeight)
  }
}

function NativeVideoPlayer({ opts }) {
  return (
    <div className="omnimux-video-player-wrapper" onClick={opts.onTogglePlay}>
      <video
        ref={opts.videoRef}
        className="omnimux-video-breakdown-video-el"
        src={opts.streamUrl}
        poster={opts.coverUrl}
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => opts.setCurrentTime(e.target.currentTime)}
        onPlay={() => opts.setIsPlaying(true)}
        onPause={() => opts.setIsPlaying(false)}
        onLoadedMetadata={(e) => handleLoadedMetadata(e, opts.setDuration, opts.onRatioMeasured)}
      />
      {!opts.isPlaying ? (
        <VideoCentralPlayButton onTogglePlay={opts.onTogglePlay} />
      ) : null}
      <VideoControlsBar
        isPlaying={opts.isPlaying}
        isMuted={opts.isMuted}
        currentTime={opts.currentTime}
        maxDuration={opts.maxDuration}
        durationText={opts.durationText}
        onTogglePlay={opts.onTogglePlay}
        onToggleMute={opts.onToggleMute}
        onSliderChange={opts.onSliderChange}
      />
    </div>
  )
}

function CoverOnlyImage({ coverUrl, onRatioMeasured }) {
  return (
    <img
      className="omnimux-video-breakdown-video-el"
      src={coverUrl}
      alt="Video Cover"
      onLoad={(e) => {
        const el = e.target
        if (onRatioMeasured && el.naturalWidth > 0 && el.naturalHeight > 0) {
          onRatioMeasured(el.naturalWidth / el.naturalHeight)
        }
      }}
    />
  )
}

function renderPlayerContent(opts) {
  if (opts.isEmbedMode || (!opts.streamUrl && opts.embedUrl)) {
    return <VideoEmbedFrame embedUrl={opts.embedUrl} title={opts.title} />
  }
  if (opts.streamUrl) {
    return <NativeVideoPlayer opts={opts} />
  }
  if (opts.coverUrl) {
    return <CoverOnlyImage coverUrl={opts.coverUrl} onRatioMeasured={opts.onRatioMeasured} />
  }
  return null
}

export function VideoPlayerCard(props) {
  const { video = {}, streamUrl = '', embedUrl = null, playerMode = 'native', setPlayerMode } = props
  const durationText = video.duration_text || '0:17'
  const maxDuration = props.duration || video.duration_seconds || 100
  const showModeBar = Boolean(embedUrl && streamUrl)
  const isEmbedMode = Boolean(embedUrl && playerMode === 'embed')
  const [measuredRatio, setMeasuredRatio] = useState(null)

  const declaredRatio = useMemo(() => resolveDeclaredRatio(video), [video])
  const effectiveRatio = declaredRatio !== null ? declaredRatio : measuredRatio
  const cardStyle = { '--omnimux-player-aspect': pickAspectBucket(effectiveRatio) }

  const handleSliderChange = (e) => {
    const val = parseFloat(e.target.value)
    props.setCurrentTime(val)
    if (props.videoRef.current) {
      props.videoRef.current.currentTime = val
    }
  }

  const contentOpts = {
    isEmbedMode,
    embedUrl,
    title: video.title,
    streamUrl,
    coverUrl: props.coverUrl || '',
    videoRef: props.videoRef,
    isPlaying: props.isPlaying,
    setIsPlaying: props.setIsPlaying,
    isMuted: props.isMuted,
    currentTime: props.currentTime,
    setCurrentTime: props.setCurrentTime,
    maxDuration,
    durationText,
    setDuration: props.setDuration,
    onTogglePlay: props.onTogglePlay,
    onToggleMute: props.onToggleMute,
    onSliderChange: handleSliderChange,
    onRatioMeasured: setMeasuredRatio,
  }

  return (
    <React.Fragment>
      {showModeBar ? (
        <VideoPlayerModeBar playerMode={playerMode} setPlayerMode={setPlayerMode} />
      ) : null}
      <div className="omnimux-video-breakdown-player-card" style={cardStyle}>
        {renderPlayerContent(contentOpts)}
      </div>
    </React.Fragment>
  )
}
