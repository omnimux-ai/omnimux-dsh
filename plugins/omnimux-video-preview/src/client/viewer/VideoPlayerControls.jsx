import React from 'react'
import { IconButton } from 'dsh-ui-kit'
import { PlayIcon, PauseIcon, VolumeIcon, VolumeXIcon } from '../icons.jsx'
import { formatCurrentTime } from './breakdownDataUtils.js'

export function VideoPlayerModeBar({ playerMode, setPlayerMode }) {
  const isNative = playerMode === 'native'
  const isEmbed = playerMode === 'embed'

  return (
    <div className="omnimux-video-player-mode-bar">
      <div className="omnimux-video-player-mode-switch">
        <button // exempt-ui01 player mode pill
          type="button"
          className={`omnimux-video-player-mode-btn${isNative ? ' is-active' : ''}`}
          onClick={() => setPlayerMode('native')}
          title="分镜毫秒级双向联动播放"
        >
          分镜联动
        </button>
        <button // exempt-ui01 player mode pill
          type="button"
          className={`omnimux-video-player-mode-btn${isEmbed ? ' is-active' : ''}`}
          onClick={() => setPlayerMode('embed')}
          title="TikTok 官方内嵌播放器"
        >
          TikTok 原版
        </button>
      </div>
    </div>
  )
}

function VideoTimeDisplay({ currentTimeText, durationText }) {
  return (
    <div className="omnimux-video-time-display">
      <span>{currentTimeText}</span>
      <span className="omnimux-video-time-sep">/</span>
      <span>{durationText}</span>
    </div>
  )
}

function VideoProgressSlider({ currentTime, maxDuration, onSliderChange }) {
  return (
    <input
      type="range"
      className="omnimux-video-progress-slider"
      min={0}
      max={maxDuration}
      step={0.1}
      value={currentTime}
      onChange={onSliderChange}
      aria-label="视频播放进度"
    />
  )
}

export function VideoControlsBar({
  isPlaying,
  isMuted,
  currentTime,
  maxDuration,
  durationText,
  onTogglePlay,
  onToggleMute,
  onSliderChange,
}) {
  const playLabel = isPlaying ? '暂停' : '播放'
  const muteLabel = isMuted ? '取消静音' : '静音'
  const currentTimeText = formatCurrentTime(currentTime)

  return (
    <div className="omnimux-video-controls-bar" onClick={(e) => e.stopPropagation()}>
      <IconButton
        variant="ghost"
        size="sm"
        onClick={onTogglePlay}
        title={playLabel}
        aria-label={playLabel}
      >
        {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </IconButton>

      <VideoTimeDisplay currentTimeText={currentTimeText} durationText={durationText} />
      <VideoProgressSlider currentTime={currentTime} maxDuration={maxDuration} onSliderChange={onSliderChange} />

      <IconButton
        variant="ghost"
        size="sm"
        onClick={onToggleMute}
        title={muteLabel}
        aria-label={muteLabel}
      >
        {isMuted ? <VolumeXIcon size={14} /> : <VolumeIcon size={14} />}
      </IconButton>
    </div>
  )
}
