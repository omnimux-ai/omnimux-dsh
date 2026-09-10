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
} from './icons.jsx'

export function VideoBreakdownViewer({ content, path, title, onClose }) {
  const [activeTab, setActiveTab] = useState('shots')
  const [currentTime, setCurrentTime] = useState(0)
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

  const handleSeek = (sec) => {
    if (videoRef.current && Number.isFinite(sec)) {
      videoRef.current.currentTime = sec
      videoRef.current.play().catch(() => {})
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
        {/* Left: Video Player Column */}
        <aside className="omnimux-video-breakdown-left">
          <div className="omnimux-video-breakdown-player-card">
            {streamUrl ? (
              <video
                ref={videoRef}
                className="omnimux-video-breakdown-video-el"
                src={streamUrl}
                poster={coverUrl}
                controls
                playsInline
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
              />
            ) : coverUrl ? (
              <img className="omnimux-video-breakdown-video-el" src={coverUrl} alt="Video Cover" />
            ) : null}

            {/* Overlay Top */}
            <div className="omnimux-video-breakdown-overlay-top">
              <div className="omnimux-video-breakdown-author-row">
                {video.author_avatar ? (
                  <img className="omnimux-video-breakdown-avatar" src={video.author_avatar} alt="Avatar" />
                ) : null}
                <div>
                  <div className="omnimux-video-breakdown-author-name">
                    <span>{video.author_name || 'Creator'}</span>
                    <TikTokIcon size={13} />
                  </div>
                  <div className="omnimux-video-breakdown-author-handle">{video.author_handle || '@creator'}</div>
                </div>
              </div>
              <div className="omnimux-video-breakdown-overlay-caption">{video.title || ''}</div>
            </div>

            {/* Right Floating Stats */}
            <div className="omnimux-video-breakdown-stats-col">
              <div className="omnimux-video-breakdown-stat-item">
                <HeartIcon size={20} />
                <span>{video.likes || '0'}</span>
              </div>
              <div className="omnimux-video-breakdown-stat-item">
                <MessageCircleIcon size={20} />
                <span>{video.comments || '0'}</span>
              </div>
              <div className="omnimux-video-breakdown-stat-item">
                <ShareIcon size={20} />
                <span>{video.shares || '0'}</span>
              </div>
            </div>

            {/* Bottom Overlay on Player */}
            <div className="omnimux-video-breakdown-overlay-bottom">
              <div className="omnimux-video-breakdown-ai-label">Creator labeled as AI-generated</div>
              <div className="omnimux-video-breakdown-timecode">
                <span>{formatCurrentTime(currentTime)}</span>
                <span> / </span>
                <span>{durationText}</span>
              </div>
            </div>
          </div>

          {/* Details below player */}
          <div className="omnimux-video-breakdown-details">
            <div className="omnimux-video-breakdown-caption">{video.caption || video.title || ''}</div>
            <div className="omnimux-video-breakdown-meta-bar">
              <div className="omnimux-video-breakdown-meta-group">
                <span>{video.author_handle || ''}</span>
                <span className="omnimux-video-breakdown-meta-item">
                  <ClockIcon size={12} />
                  <span>{durationText}</span>
                </span>
                <span className="omnimux-video-breakdown-meta-item">
                  <EyeIcon size={12} />
                  <span>{video.views || '0'}</span>
                </span>
                <span className="omnimux-video-breakdown-meta-item">
                  <LayersIcon size={12} />
                  <span>{shots.length} 个场景</span>
                </span>
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
                {shots.map((shot, idx) => (
                  <div
                    key={shot.id || idx}
                    className="omnimux-video-breakdown-shot-card"
                    onClick={() => handleSeek(shot.start_seconds || 0)}
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

                    {Array.isArray(shot.tags) && shot.tags.length ? (
                      <div className="omnimux-video-breakdown-pills-row">
                        {shot.tags.map((tag, tIdx) => (
                          <div key={tIdx} className="omnimux-video-breakdown-pill">
                            {renderTagIcon(tag)}
                            <span>{cleanTagText(tag)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="omnimux-video-breakdown-shot-desc">{shot.description || ''}</div>
                  </div>
                ))}
              </div>
            ) : (
              /* Structure View */
              <div>
                <div className="omnimux-video-breakdown-structure-hint">
                  识别结构片断并进行内容分析，帮助你审视节奏、卖点顺序与脚本编排。
                </div>

                {/* Pipeline Flow */}
                <div className="omnimux-video-breakdown-pipeline-row">
                  {pipeline.map((p, idx) => (
                    <React.Fragment key={p}>
                      <div className="omnimux-video-breakdown-pipeline-item">{p}</div>
                      {idx < pipeline.length - 1 ? (
                        <div className="omnimux-video-breakdown-pipeline-arrow">
                          <ArrowRightIcon size={12} />
                        </div>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>

                {/* Structure Cards */}
                <div>
                  {structure.map((st, idx) => (
                    <div key={st.stage || idx} className="omnimux-video-breakdown-structure-card">
                      <div className="omnimux-video-breakdown-structure-title">{st.title || st.stage}</div>
                      <div className="omnimux-video-breakdown-structure-desc">{st.description || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Bar for Shots Tab */}
          {activeTab === 'shots' ? (
            <div className="omnimux-video-breakdown-bottom-bar">
              <CopyButton
                text={shotsCopyContent}
                label="复制分镜"
                copiedLabel="已复制分镜"
                size="sm"
                variant="outline"
              />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}
