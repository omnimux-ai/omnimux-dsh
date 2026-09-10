import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Badge, CopyButton, IconButton, Tabs } from 'dsh-ui-kit'
import { ensureBreakdownStyles } from './styles.js'
import {
  ClockIcon,
  EyeIcon,
  LayersIcon,
  FramingIcon,
  CameraIcon,
  AngleIcon,
  MotionIcon,
  ArrowRightIcon,
  ExpandIcon,
  CloseIcon,
  ExternalLinkIcon,
  HeartIcon,
  MessageCircleIcon,
  ShareIcon,
  TikTokIcon,
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  VolumeXIcon,
} from './icons.jsx'

export function VideoBreakdownViewer({ content, path, title, onClose }) {
  const [activeTab, setActiveTab] = useState('shots')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [activeShotId, setActiveShotId] = useState(null)
  const videoRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    ensureBreakdownStyles()
  }, [])

  // Parse breakdown json content
  const data = useMemo(() => {
    if (!content) return null
    try {
      if (typeof content === 'object') return content
      return JSON.parse(content)
    } catch {
      return null
    }
  }, [content])

  const video = data?.video || {}
  const shots = Array.isArray(data?.shots) ? data.shots : []
  const structure = Array.isArray(data?.structure) ? data.structure : []
  const pipeline = Array.isArray(data?.pipeline) ? data.pipeline : ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene']

  const streamUrl = video.stream_url || video.video_url || ''
  const coverUrl = video.cover_url || ''
  const durationText = video.duration_text || '0:17'

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    const next = !videoRef.current.muted
    videoRef.current.muted = next
    setIsMuted(next)
  }

  const handleSeek = (sec) => {
    if (videoRef.current && Number.isFinite(sec)) {
      videoRef.current.currentTime = sec
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  const shotsCopyContent = useMemo(() => {
    if (!shots.length) return ''
    return shots.map((s, idx) => {
      const range = s.time_range || `${s.start_seconds || 0}s - ${s.end_seconds || 0}s`
      const stage = s.stage ? ` [${s.stage}]` : ''
      const tags = Array.isArray(s.tags) && s.tags.length ? `\n属性：${s.tags.join(' | ')}` : ''
      const desc = s.description ? `\n描述：${s.description}` : ''
      return `${range} ${s.title || `分镜 ${idx + 1}`}${stage}${tags}${desc}`
    }).join('\n\n')
  }, [shots])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }

  const formatCurrentTime = (sec) => {
    const total = Math.floor(sec || 0)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const renderTagIcon = (tagStr) => {
    if (tagStr.includes('特写') || tagStr.includes('中景') || tagStr.includes('全景')) {
      return <FramingIcon size={12} />
    }
    if (tagStr.includes('机位') || tagStr.includes('手机') || tagStr.includes('手持') || tagStr.includes('相机')) {
      return <CameraIcon size={12} />
    }
    if (tagStr.includes('俯视') || tagStr.includes('平视') || tagStr.includes('仰视') || tagStr.includes('角度')) {
      return <AngleIcon size={12} />
    }
    if (tagStr.includes('微动') || tagStr.includes('移动') || tagStr.includes('推') || tagStr.includes('拉')) {
      return <MotionIcon size={12} />
    }
    return <FramingIcon size={12} />
  }

  const cleanTagText = (tagStr) => {
    return String(tagStr || '').replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, '').trim()
  }

  const tabsItems = [
    { id: 'shots', label: '分镜' },
    { id: 'structure', label: '结构拆解' },
  ]

  if (!data) {
    return (
      <div className="omnimux-video-breakdown-empty">
        <span>正在加载或未找到有效视频拆解数据</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="omnimux-video-breakdown-root">
      {/* 1. Header */}
      <header className="omnimux-video-breakdown-header">
        <div className="omnimux-video-breakdown-header-title">
          <span>视频分析</span>
        </div>
        <div className="omnimux-video-breakdown-header-actions">
          <IconButton
            variant="ghost"
            size="sm"
            title="全屏切换"
            aria-label="全屏切换"
            onClick={toggleFullscreen}
          >
            <ExpandIcon size={14} />
          </IconButton>
          {typeof onClose === 'function' ? (
            <IconButton
              variant="ghost"
              size="sm"
              title="关闭"
              aria-label="关闭"
              onClick={onClose}
            >
              <CloseIcon size={14} />
            </IconButton>
          ) : null}
        </div>
      </header>

      {/* 2. Main Body Container */}
      <div className="omnimux-video-breakdown-body">
        {/* Left: Video Player & Metadata Column */}
        <aside className="omnimux-video-breakdown-left">
          {/* Native Local Video Player Card */}
          <div className="omnimux-video-breakdown-player-card">
            {streamUrl ? (
              <div className="omnimux-video-player-wrapper" onClick={togglePlay}>
                <video
                  ref={videoRef}
                  className="omnimux-video-breakdown-video-el"
                  src={streamUrl}
                  poster={coverUrl}
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onLoadedMetadata={(e) => {
                    if (e.target.duration && Number.isFinite(e.target.duration)) {
                      setDuration(e.target.duration)
                    }
                  }}
                />

                {/* Central Play Badge when paused */}
                {!isPlaying ? (
                  <div
                    className="omnimux-video-play-center-btn"
                    title="播放视频"
                    aria-label="播放视频"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePlay()
                    }}
                  >
                    <PlayIcon size={28} />
                  </div>
                ) : null}

                {/* Native Custom Controls Bar */}
                <div className="omnimux-video-controls-bar" onClick={(e) => e.stopPropagation()}>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={togglePlay}
                    title={isPlaying ? '暂停' : '播放'}
                    aria-label={isPlaying ? '暂停' : '播放'}
                  >
                    {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                  </IconButton>

                  <div className="omnimux-video-time-display">
                    <span>{formatCurrentTime(currentTime)}</span>
                    <span className="omnimux-video-time-sep">/</span>
                    <span>{durationText}</span>
                  </div>

                  <input
                    type="range"
                    className="omnimux-video-progress-slider"
                    min={0}
                    max={duration || video.duration_seconds || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      setCurrentTime(val)
                      if (videoRef.current) videoRef.current.currentTime = val
                    }}
                    aria-label="视频播放进度"
                  />

                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={toggleMute}
                    title={isMuted ? '取消静音' : '静音'}
                    aria-label={isMuted ? '取消静音' : '静音'}
                  >
                    {isMuted ? <VolumeXIcon size={14} /> : <VolumeIcon size={14} />}
                  </IconButton>
                </div>
              </div>
            ) : coverUrl ? (
              <img className="omnimux-video-breakdown-video-el" src={coverUrl} alt="Video Cover" />
            ) : null}
          </div>

          {/* Structured Video Metadata Card */}
          <div className="omnimux-video-breakdown-meta-card">
            {/* Author Header */}
            <div className="omnimux-video-breakdown-author-row">
              {video.author_avatar ? (
                <img className="omnimux-video-breakdown-avatar" src={video.author_avatar} alt="Avatar" />
              ) : null}
              <div className="omnimux-video-author-info-box">
                <div className="omnimux-video-breakdown-author-name">
                  <span>{video.author_name || 'Creator'}</span>
                  <TikTokIcon size={13} />
                </div>
                <div className="omnimux-video-breakdown-author-handle">{video.author_handle || '@creator'}</div>
              </div>
              {video.source_url ? (
                <a
                  href={video.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="omnimux-video-breakdown-ext-link"
                  title="访问原视频链接"
                  aria-label="访问原视频链接"
                >
                  <ExternalLinkIcon size={12} />
                </a>
              ) : null}
            </div>

            {/* Caption / Title */}
            <div className="omnimux-video-breakdown-caption">
              {video.caption || video.title || ''}
            </div>

            {/* Engagement Metrics Stats Grid */}
            <div className="omnimux-video-metrics-grid">
              <div className="omnimux-video-metric-item">
                <div className="omnimux-video-metric-val">{video.views || '0'}</div>
                <div className="omnimux-video-metric-lbl">
                  <EyeIcon size={11} /> 播放量
                </div>
              </div>
              <div className="omnimux-video-metric-item">
                <div className="omnimux-video-metric-val">{video.likes || '0'}</div>
                <div className="omnimux-video-metric-lbl">
                  <HeartIcon size={11} /> 点赞
                </div>
              </div>
              <div className="omnimux-video-metric-item">
                <div className="omnimux-video-metric-val">{video.comments || '0'}</div>
                <div className="omnimux-video-metric-lbl">
                  <MessageCircleIcon size={11} /> 评论
                </div>
              </div>
              <div className="omnimux-video-metric-item">
                <div className="omnimux-video-metric-val">{video.shares || '0'}</div>
                <div className="omnimux-video-metric-lbl">
                  <ShareIcon size={11} /> 分享
                </div>
              </div>
            </div>

            {/* Local playback status banner */}
            <div className="omnimux-video-cache-badge">
              <span className="omnimux-video-cache-dot" />
              <span>本地 MP4 视频流服务已就绪（支持分段拖拽与精准分镜跳转）</span>
            </div>
          </div>
        </aside>

        {/* Right: Analysis Column */}
        <main className="omnimux-video-breakdown-right">
          {/* Tabs Bar */}
          <div className="omnimux-video-breakdown-tabs-bar">
            <Tabs
              variant="pill"
              size="sm"
              items={tabsItems}
              activeId={activeTab}
              onChange={setActiveTab}
              aria-label="视频分析视图切换"
            />
          </div>

          {/* Scroll Area */}
          <div className="omnimux-video-breakdown-scroll-area">
            {activeTab === 'shots' ? (
              /* Shots List View */
              <div className="omnimux-video-breakdown-shots-list">
                {shots.map((shot, idx) => {
                  const isCurrent = activeShotId === (shot.id || idx) ||
                    (currentTime >= (shot.start_seconds || 0) && currentTime < (shot.end_seconds || 999999))
                  return (
                    <div
                      key={shot.id || idx}
                      className={`omnimux-video-breakdown-shot-card${isCurrent ? ' is-active' : ''}`}
                      onClick={() => {
                        handleSeek(shot.start_seconds || 0)
                        setActiveShotId(shot.id || idx)
                      }}
                    >
                      <div className="omnimux-video-breakdown-shot-header">
                        <div className="omnimux-video-breakdown-shot-title-box">
                          <span>{shot.time_range || '0:00 - 0:00'}</span>
                          <span>{shot.title || `分镜 ${idx + 1}`}</span>
                        </div>
                        {shot.stage ? (
                          <Badge size="sm" variant="warning" shape="capsule">
                            {shot.stage}
                          </Badge>
                        ) : null}
                      </div>

                      {Array.isArray(shot.tags) && shot.tags.length > 0 ? (
                        <div className="omnimux-video-breakdown-tags-row">
                          {shot.tags.map((tag, tIdx) => (
                            <span key={tIdx} className="omnimux-video-breakdown-tag">
                              {renderTagIcon(tag)}
                              <span>{cleanTagText(tag)}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {shot.description ? (
                        <div className="omnimux-video-breakdown-shot-desc">{shot.description}</div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Narrative Structure Pipeline View */
              <div className="omnimux-video-breakdown-structure-view">
                {/* 1. Stages Pipeline Breadcrumb */}
                <div className="omnimux-video-breakdown-pipeline-bar">
                  {pipeline.map((stageName, pIdx) => (
                    <React.Fragment key={pIdx}>
                      <span className="omnimux-video-breakdown-pipeline-node">{stageName}</span>
                      {pIdx < pipeline.length - 1 ? <ArrowRightIcon size={11} /> : null}
                    </React.Fragment>
                  ))}
                </div>

                {/* 2. Structured Stage Cards */}
                <div className="omnimux-video-breakdown-stage-cards">
                  {structure.map((item, sIdx) => (
                    <div key={sIdx} className="omnimux-video-breakdown-stage-card">
                      <div className="omnimux-video-breakdown-stage-header">
                        <Badge size="sm" variant="brand" shape="capsule">
                          {item.stage || `阶段 ${sIdx + 1}`}
                        </Badge>
                        <span className="omnimux-video-breakdown-stage-title">{item.title || item.stage}</span>
                      </div>
                      <div className="omnimux-video-breakdown-stage-desc">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Footer Actions */}
          <footer className="omnimux-video-breakdown-footer">
            <CopyButton
              variant="outline"
              size="sm"
              text={shotsCopyContent}
              successText="已复制分镜脚本"
            >
              复制分镜
            </CopyButton>
          </footer>
        </main>
      </div>
    </div>
  )
}
