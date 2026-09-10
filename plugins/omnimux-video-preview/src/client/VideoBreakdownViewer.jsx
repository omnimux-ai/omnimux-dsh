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

  // Extract TikTok video ID and construct official embed URL
  const embedUrl = useMemo(() => {
    const raw = video.source_url || video.video_url || ''
    if (!raw) return null
    const m = String(raw).match(/tiktok\.com\/@?[^/]+\/video\/(\d{15,25})/i) ||
      String(raw).match(/tiktok\.com\/v\/(\d{15,25})/i) ||
      String(raw).match(/tiktok\.com\/player\/v1\/(\d{15,25})/i)
    if (m && m[1]) {
      return `https://www.tiktok.com/player/v1/${m[1]}`
    }
    return null
  }, [video.source_url, video.video_url])

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

  const structureCopyContent = useMemo(() => {
    if (!structure.length) return ''
    return structure.map((item) => {
      const title = item.stage || item.title
      return `【${title}】\n${item.description || ''}`
    }).join('\n\n')
  }, [structure])

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
    if (tagStr.includes('特写')) {
      return <span className="omnimux-video-tag-sym">↖</span>
    }
    if (tagStr.includes('中景')) {
      return <span className="omnimux-video-tag-sym">↗</span>
    }
    if (tagStr.includes('全景')) {
      return <span className="omnimux-video-tag-sym">⤢</span>
    }
    if (tagStr.includes('手机') || tagStr.includes('手持') || tagStr.includes('相机')) {
      return <CameraIcon size={12} />
    }
    if (tagStr.includes('俯视')) {
      return <span className="omnimux-video-tag-sym">▽</span>
    }
    if (tagStr.includes('仰视')) {
      return <span className="omnimux-video-tag-sym">△</span>
    }
    if (tagStr.includes('平视')) {
      return <span className="omnimux-video-tag-sym">▷</span>
    }
    if (tagStr.includes('微动')) {
      return <span className="omnimux-video-tag-sym">✛</span>
    }
    if (tagStr.includes('平移') || tagStr.includes('移动')) {
      return <span className="omnimux-video-tag-sym">⇋</span>
    }
    return <FramingIcon size={12} />
  }

  const cleanTagText = (tagStr) => {
    return String(tagStr || '').replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, '').trim()
  }

  const formatStructureDescription = (desc) => {
    if (!desc || typeof desc !== 'string') return ''
    const clean = desc.replace(/---\s*$/, '').trim()
    const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)

    const hasHeadings = lines.some((l) => l.startsWith('### '))
    const hasKeyValues = lines.some((l) => l.includes(': ') || l.includes('：'))

    if (!hasHeadings && !hasKeyValues) {
      return <div className="omnimux-video-breakdown-desc-line">{clean}</div>
    }

    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <div key={idx} className="omnimux-video-breakdown-desc-heading">
            {line.replace(/^###\s*/, '')}
          </div>
        )
      }
      const colonIdx = line.indexOf(': ') !== -1 ? line.indexOf(': ') : line.indexOf('：')
      if (colonIdx !== -1 && colonIdx < 35) {
        const key = line.slice(0, colonIdx).trim()
        const val = line.slice(colonIdx + 1).trim()
        return (
          <div key={idx} className="omnimux-video-breakdown-desc-row">
            <span className="omnimux-video-breakdown-desc-label">{key}：</span>
            <span className="omnimux-video-breakdown-desc-value">{val}</span>
          </div>
        )
      }
      return (
        <div key={idx} className="omnimux-video-breakdown-desc-line">
          {line}
        </div>
      )
    })
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
          {/* Video Player Card (TikTok Official Embed Player preferred) */}
          <div className="omnimux-video-breakdown-player-card">
            {embedUrl ? (
              <div className="omnimux-video-player-wrapper is-embed">
                <iframe
                  title={video.title || 'TikTok Video Player'}
                  src={embedUrl}
                  className="omnimux-video-breakdown-embed-frame"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : streamUrl ? (
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
          </div>
        </aside>

        {/* Right: Analysis Column */}
        <main className="omnimux-video-breakdown-right">
          {/* Tabs Bar (Segmented Control matching Image 1 & 2) */}
          <div className="omnimux-video-breakdown-tabs-bar">
            <div className="omnimux-video-breakdown-tabs-container">
              {tabsItems.map((tab) => (
                <button // exempt-ui01 segmented tab pill button
                  key={tab.id}
                  type="button"
                  className={`omnimux-video-breakdown-tab-btn${activeTab === tab.id ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
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
                          <span className="omnimux-video-breakdown-shot-time">{shot.time_range || '0:00 - 0:00'}</span>
                          <span className="omnimux-video-breakdown-shot-title">{shot.title || `分镜 ${idx + 1}`}</span>
                        </div>
                        {shot.stage ? (
                          <div className="omnimux-video-breakdown-stage-pill">{shot.stage}</div>
                        ) : null}
                      </div>

                      {Array.isArray(shot.tags) && shot.tags.length > 0 ? (
                        <div className="omnimux-video-breakdown-pills-row">
                          {shot.tags.map((tag, tIdx) => (
                            <span key={tIdx} className="omnimux-video-breakdown-pill">
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
                <div className="omnimux-video-breakdown-structure-hint">
                  识别结构片段并进行内容分析，帮助你审视节奏、卖点顺序与脚本编排。
                </div>

                {/* 1. Stages Pipeline Breadcrumb */}
                <div className="omnimux-video-breakdown-pipeline-row">
                  {pipeline.map((stageName, pIdx) => (
                    <React.Fragment key={pIdx}>
                      <span className="omnimux-video-breakdown-pipeline-item">{stageName}</span>
                      {pIdx < pipeline.length - 1 ? (
                        <span className="omnimux-video-breakdown-pipeline-arrow">→</span>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>

                {/* 2. Structured Stage Cards matching Image 2 */}
                <div className="omnimux-video-breakdown-structure-cards">
                  {structure.map((item, sIdx) => {
                    const displayTitle = item.stage || item.title || `阶段 ${sIdx + 1}`
                    return (
                      <div key={sIdx} className="omnimux-video-breakdown-structure-card">
                        <div className="omnimux-video-breakdown-structure-title">{displayTitle}</div>
                        <div className="omnimux-video-breakdown-structure-desc">
                          {formatStructureDescription(item.description)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Footer Actions */}
          <footer className="omnimux-video-breakdown-bottom-bar">
            <CopyButton
              variant="outline"
              size="sm"
              text={activeTab === 'shots' ? shotsCopyContent : structureCopyContent}
              successText={activeTab === 'shots' ? '已复制分镜脚本' : '已复制结构拆解'}
            >
              {activeTab === 'shots' ? '复制分镜' : '复制结构拆解'}
            </CopyButton>
          </footer>
        </main>
      </div>
    </div>
  )
}
