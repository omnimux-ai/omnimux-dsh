import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Badge, CopyButton, IconButton, Tabs } from 'dsh-ui-kit'
import { ensureBreakdownStyles } from './styles.js'
import {
  ClockIcon,
  EyeIcon,
  UserIcon,
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
  HeadphonesIcon,
  TranslateIcon,
  ChevronDownIcon,
} from './icons.jsx'
import {
  localizeStage,
  METADATA_HEADING_REGEX,
  mapToCanonicalStage,
} from '../breakdown-parser.js'

function useIsZh() {
  const [isZh, setIsZh] = useState(() => {
    if (typeof document !== 'undefined') {
      const l = (document.documentElement.lang || '').toLowerCase()
      if (l.startsWith('en')) return false
    }
    return true
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const update = () => {
      const l = (document.documentElement.lang || '').toLowerCase()
      setIsZh(!l.startsWith('en'))
    }
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])

  return isZh
}

export function VideoBreakdownViewer({ content, path, title, onClose }) {
  const isZh = useIsZh()
  const [activeTab, setActiveTab] = useState('shots')
  const [playerMode, setPlayerMode] = useState('native') // 'native' | 'embed'
  const [isTranslated, setIsTranslated] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
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

  // Filter out any metadata headings ("叙事结构链路", "结构阶段解构") and unpack sub-stages
  const cleanStructure = useMemo(() => {
    if (!Array.isArray(data?.structure)) return []
    const cleaned = []
    const seen = new Set()
    for (const item of data.structure) {
      let stage = item.stage || item.title || ''
      let desc = item.description || ''
      if (METADATA_HEADING_REGEX.test(stage)) {
        const m = desc.match(/###?\s*([A-Za-z\s]+|[^\n]+)\n+([\s\S]*)/)
        if (m && !METADATA_HEADING_REGEX.test(m[1].trim())) {
          stage = mapToCanonicalStage(m[1].trim(), cleaned.length)
          desc = m[2].trim()
        } else {
          continue
        }
      }
      stage = mapToCanonicalStage(stage, cleaned.length)
      if (!stage || seen.has(stage) || METADATA_HEADING_REGEX.test(stage)) continue
      seen.add(stage)
      const cleanDesc = desc.replace(/^###?\s*(?:Hook|Product Intro|Usage Detail|Demo Scene|Cta|CTA|[^\n]+)\n+/i, '').trim()
      cleaned.push({
        ...item,
        stage,
        title: stage,
        description: cleanDesc,
      })
    }
    return cleaned
  }, [data?.structure])

  const cleanPipeline = useMemo(() => {
    if (cleanStructure.length > 0) {
      return cleanStructure.map((s) => s.stage)
    }
    const raw = Array.isArray(data?.pipeline) ? data.pipeline : []
    return raw
      .filter((name) => !METADATA_HEADING_REGEX.test(name))
      .map((name, idx) => mapToCanonicalStage(name, idx))
      .filter(Boolean)
  }, [cleanStructure, data?.pipeline])

  const structure = cleanStructure
  const pipeline = cleanPipeline.length > 0 ? cleanPipeline : ['Hook', 'Product Intro', 'Usage Detail', 'Demo Scene']

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
      const stageName = mapToCanonicalStage(s.stage, idx)
      const stage = stageName ? ` [${stageName}]` : ''
      const tags = Array.isArray(s.tags) && s.tags.length ? `\n${isZh ? '属性' : 'Tags'}：${s.tags.join(' | ')}` : ''
      const speech = s.speech ? `\n${isZh ? '台词' : 'Speech'}：${s.speech}` : ''
      const desc = s.description ? `\n${isZh ? '描述' : 'Description'}：${s.description}` : ''
      const defaultTitle = `${isZh ? '分镜' : 'Shot'} ${idx + 1}`
      return `${range} ${s.title || defaultTitle}${stage}${tags}${speech}${desc}`
    }).join('\n\n')
  }, [shots, isZh])

  const scriptCopyContent = useMemo(() => {
    if (!shots.length) return ''
    const lines = shots
      .map((s) => {
        const speech = s.speech || s.dialogue || s.subtitle || ''
        const time = s.time_range || `${s.start_seconds || 0}s`
        return speech ? `${time} ${speech}` : null
      })
      .filter(Boolean)
    if (lines.length > 0) return lines.join('\n\n')
    return shots.map((s, idx) => `${s.time_range || (isZh ? `分镜 ${idx + 1}` : `Shot ${idx + 1}`)} ${s.description || ''}`).join('\n\n')
  }, [shots, isZh])

  const structureCopyContent = useMemo(() => {
    if (!structure.length) return ''
    return structure.map((item, idx) => {
      const title = mapToCanonicalStage(item.stage || item.title, idx)
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

  const formatViews = (rawViews) => {
    if (!rawViews) return '0'
    const str = String(rawViews).trim()
    if (/[kmb]$/i.test(str)) return str
    const num = Number(str)
    if (!Number.isFinite(num) || num === 0) return str
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`.replace('.0M', 'M')
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`.replace('.0K', 'K')
    }
    return String(num)
  }

  // Calculate which shot is currently playing based on currentTime
  const currentPlayingShotIndex = useMemo(() => {
    if (typeof currentTime !== 'number' || shots.length === 0) return -1
    return shots.findIndex((s) => {
      const start = s.start_seconds || 0
      const end = s.end_seconds || (start + 3)
      return currentTime >= start && currentTime < end
    })
  }, [shots, currentTime])

  // Automatically scroll active playing shot card into view gently while playing
  useEffect(() => {
    if (activeTab === 'shots' && isPlaying && currentPlayingShotIndex >= 0) {
      const el = document.getElementById(`omnimux-shot-card-${currentPlayingShotIndex}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [currentPlayingShotIndex, activeTab, isPlaying])

  const renderTagIcon = (tagStr) => {
    const s = String(tagStr || '')
    if (/特写|远景|全景|中景|近景|景别/i.test(s)) {
      return <FramingIcon size={12} />
    }
    if (/手机|相机|机位|车载|设备|航拍|云台|固定/i.test(s)) {
      return <CameraIcon size={12} />
    }
    if (/俯视|平视|仰视|顶视|角度|俯角|仰角|视点/i.test(s)) {
      return <AngleIcon size={12} />
    }
    if (/微动|平移|移动|推拉|摇镜|运镜|跟随|旋转|环绕/i.test(s)) {
      return <MotionIcon size={12} />
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
    { id: 'shots', label: isZh ? '分镜' : 'Shots' },
    { id: 'structure', label: isZh ? '结构拆解' : 'Structure' },
  ]

  if (!data) {
    return (
      <div className="omnimux-video-breakdown-empty">
        <span>{isZh ? '正在加载或未找到有效视频拆解数据' : 'Loading or no valid video breakdown data found'}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="omnimux-video-breakdown-root">
      {/* 1. Header */}
      <header className="omnimux-video-breakdown-header">
        <div className="omnimux-video-breakdown-header-title">
          <span>{isZh ? '视频分析' : 'Video Breakdown'}</span>
        </div>
        <div className="omnimux-video-breakdown-header-actions">
          <IconButton
            variant="ghost"
            size="sm"
            title={isZh ? '全屏切换' : 'Toggle Fullscreen'}
            aria-label={isZh ? '全屏切换' : 'Toggle Fullscreen'}
            onClick={toggleFullscreen}
          >
            <ExpandIcon size={14} />
          </IconButton>
          {typeof onClose === 'function' ? (
            <IconButton
              variant="ghost"
              size="sm"
              title={isZh ? '关闭' : 'Close'}
              aria-label={isZh ? '关闭' : 'Close'}
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
          {/* Video Player Mode Switcher (when both interactive stream & TikTok embed exist) */}
          {embedUrl && streamUrl ? (
            <div className="omnimux-video-player-mode-bar">
              <div className="omnimux-video-player-mode-switch">
                <button // exempt-ui01 player mode pill
                  type="button"
                  className={`omnimux-video-player-mode-btn${playerMode === 'native' ? ' is-active' : ''}`}
                  onClick={() => setPlayerMode('native')}
                  title="分镜毫秒级双向联动播放"
                >
                  分镜联动
                </button>
                <button // exempt-ui01 player mode pill
                  type="button"
                  className={`omnimux-video-player-mode-btn${playerMode === 'embed' ? ' is-active' : ''}`}
                  onClick={() => setPlayerMode('embed')}
                  title="TikTok 官方内嵌播放器"
                >
                  TikTok 原版
                </button>
              </div>
            </div>
          ) : null}

          {/* Video Player Card */}
          <div className="omnimux-video-breakdown-player-card">
            {embedUrl && playerMode === 'embed' ? (
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
            ) : embedUrl ? (
              <div className="omnimux-video-player-wrapper is-embed">
                <iframe
                  title={video.title || 'TikTok Video Player'}
                  src={embedUrl}
                  className="omnimux-video-breakdown-embed-frame"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : coverUrl ? (
              <img className="omnimux-video-breakdown-video-el" src={coverUrl} alt="Video Cover" />
            ) : null}
          </div>

          {/* Video Metadata Section (1:1 matching Reference Image 2) */}
          <div className="omnimux-video-info-box">
            {/* 1. Title/Caption with External Link */}
            <div className="omnimux-video-info-title-row">
              <span className="omnimux-video-info-caption">
                {video.caption || video.title || ''}
              </span>
              {video.source_url ? (
                <a
                  href={video.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="omnimux-video-info-ext-link"
                  title={isZh ? '访问原视频链接' : 'Visit original video link'}
                  aria-label={isZh ? '访问原视频链接' : 'Visit original video link'}
                >
                  <ExternalLinkIcon size={14} />
                </a>
              ) : null}
            </div>

            {/* 2. Inline Metadata: Author, Duration, Views */}
            <div className="omnimux-video-info-meta-row">
              <span className="omnimux-video-info-meta-item">
                <UserIcon size={13} />
                <span>{video.author_handle || (video.author_name ? `@${video.author_name}` : '@creator')}</span>
              </span>
              <span className="omnimux-video-info-meta-item">
                <ClockIcon size={13} />
                <span>{durationText}</span>
              </span>
              <span className="omnimux-video-info-meta-item">
                <EyeIcon size={13} />
                <span>{formatViews(video.views)}</span>
              </span>
            </div>

            {/* 3. Scene Count */}
            <div className="omnimux-video-info-scenes">
              <span>{video.scene_count || shots.length || 0} {isZh ? '个场景' : 'scenes'}</span>
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
                  const isPlayingThisShot = idx === currentPlayingShotIndex
                  const isCurrent = isPlayingThisShot
                  const defaultTitle = `${isZh ? '分镜' : 'Shot'} ${idx + 1}`
                  return (
                    <div
                      id={`omnimux-shot-card-${idx}`}
                      key={shot.id || idx}
                      className={`omnimux-video-breakdown-shot-card${isCurrent ? ' is-active' : ''}`}
                      onClick={() => {
                        if (playerMode !== 'native' && streamUrl) {
                          setPlayerMode('native')
                        }
                        handleSeek(shot.start_seconds || 0)
                      }}
                      title={isZh ? '点击跳转并从该分镜开始播放' : 'Click to seek and play from this shot'}
                    >
                      <div className="omnimux-video-breakdown-shot-header">
                        <div className="omnimux-video-breakdown-shot-title-box">
                          <span className="omnimux-video-breakdown-shot-time">{shot.time_range || '0:00 - 0:00'}</span>
                          <span className="omnimux-video-breakdown-shot-title">{shot.title || defaultTitle}</span>
                          {isPlayingThisShot && isPlaying ? (
                            <span className="omnimux-video-shot-playing-badge">
                              <span className="omnimux-video-shot-playing-dot" />
                              {isZh ? '播放中' : 'Playing'}
                            </span>
                          ) : null}
                        </div>
                        {shot.stage ? (
                          <div className="omnimux-video-breakdown-stage-pill">{mapToCanonicalStage(shot.stage, idx)}</div>
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

                      {shot.speech ? (
                        <div className="omnimux-video-breakdown-shot-speech">
                          <HeadphonesIcon size={13} />
                          <span className="omnimux-video-shot-speech-text">
                            {isTranslated && shot.speech_zh ? shot.speech_zh : shot.speech}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Narrative Structure Pipeline View */
              <div className="omnimux-video-breakdown-structure-view">
                <div className="omnimux-video-breakdown-structure-hint">
                  {isZh
                    ? '识别结构片段并进行内容分析，帮助你审视节奏、卖点顺序与脚本编排。'
                    : 'Identify structural segments and analyze content pacing, selling points, and script narrative.'}
                </div>

                {/* 1. Stages Pipeline Breadcrumb */}
                <div className="omnimux-video-breakdown-pipeline-row">
                  {pipeline.map((stageName, pIdx) => (
                    <React.Fragment key={pIdx}>
                      <span className="omnimux-video-breakdown-pipeline-item">{mapToCanonicalStage(stageName, pIdx)}</span>
                      {pIdx < pipeline.length - 1 ? (
                        <span className="omnimux-video-breakdown-pipeline-arrow">→</span>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>

                {/* 2. Structured Stage Cards matching Image 1 */}
                <div className="omnimux-video-breakdown-structure-cards">
                  {structure.map((item, sIdx) => {
                    const displayTitle = mapToCanonicalStage(item.stage || item.title, sIdx)
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

          {/* Bottom Footer Actions (1:1 with Image 1) */}
          <footer className="omnimux-video-breakdown-bottom-bar">
            <div className="omnimux-video-breakdown-footer-left">
              <button // exempt-ui01 translate action button
                type="button"
                className={`omnimux-video-footer-btn${isTranslated ? ' is-active' : ''}`}
                onClick={() => setIsTranslated(!isTranslated)}
                title={isTranslated ? (isZh ? '切换为原文' : 'Switch to Original') : (isZh ? '翻译为中文' : 'Translate')}
              >
                <TranslateIcon size={14} />
                <span>{isTranslated ? (isZh ? '原文' : 'Original') : (isZh ? '翻译' : 'Translate')}</span>
                <ChevronDownIcon size={11} />
              </button>
            </div>

            <div className="omnimux-video-breakdown-footer-right">
              {activeTab === 'shots' ? (
                <>
                  <CopyButton
                    variant="outline"
                    size="sm"
                    text={scriptCopyContent}
                    label={isZh ? '复制脚本' : 'Copy Script'}
                    copiedLabel={isZh ? '已复制脚本' : 'Script Copied'}
                  />
                  <CopyButton
                    variant="outline"
                    size="sm"
                    text={shotsCopyContent}
                    label={isZh ? '复制分镜' : 'Copy Shots'}
                    copiedLabel={isZh ? '已复制分镜' : 'Shots Copied'}
                  />
                </>
              ) : (
                <CopyButton
                  variant="outline"
                  size="sm"
                  text={structureCopyContent}
                  label={isZh ? '复制结构拆解' : 'Copy Structure'}
                  copiedLabel={isZh ? '已复制结构拆解' : 'Structure Copied'}
                />
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}
