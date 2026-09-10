import React, { useState, useMemo, useRef } from 'react'

export function VideoBreakdownViewer({ content, path, title }) {
  const [activeTab, setActiveTab] = useState('shots')
  const [copied, setCopied] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef(null)
  const containerRef = useRef(null)

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

  const handleCopyShots = () => {
    if (!shots.length) return
    const text = shots.map((s, idx) => {
      const range = s.time_range || `${s.start_seconds || 0}s - ${s.end_seconds || 0}s`
      const stage = s.stage ? ` [${s.stage}]` : ''
      const tags = Array.isArray(s.tags) && s.tags.length ? `\n属性：${s.tags.join(' | ')}` : ''
      const desc = s.description ? `\n描述：${s.description}` : ''
      return `${range} ${s.title || `分镜 ${idx + 1}`}${stage}${tags}${desc}`
    }).join('\n\n')

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }

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

  if (!data) {
    return React.createElement('div', {
      style: {
        padding: '32px',
        color: 'var(--dsw-alias-text-secondary, #94a3b8)',
        textAlign: 'center',
        background: 'var(--dsw-alias-bg-base, #0c0e12)',
        height: '100%',
        boxSizing: 'border-box',
      },
    }, '正在加载或未找到有效视频拆解数据')
  }

  return React.createElement('div', {
    ref: containerRef,
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: 'var(--dsw-alias-bg-base, #0c0e12)',
      color: 'var(--dsw-alias-text-primary, #f3f4f6)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
  },
    // 1. Header
    React.createElement('div', {
      style: {
        height: '48px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--dsw-alias-border-subtle, #1f2430)',
        background: 'var(--dsw-alias-bg-surface-1, #13161f)',
        flexShrink: 0,
      },
    },
      React.createElement('div', {
        style: {
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--dsw-alias-text-contrast, #ffffff)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        },
      }, '视频分析'),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('button', {
          onClick: toggleFullscreen,
          title: '全屏',
          style: {
            background: 'transparent',
            border: 'none',
            color: 'var(--dsw-alias-text-secondary, #94a3b8)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          },
        },
          React.createElement('svg', {
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2,
          },
            React.createElement('path', { d: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7' })
          )
        )
      )
    ),

    // 2. Main Body Container
    React.createElement('div', {
      style: {
        display: 'flex',
        flex: 1,
        height: 'calc(100% - 48px)',
        overflow: 'hidden',
      },
    },
      // Left: Video Player Column
      React.createElement('div', {
        style: {
          width: '360px',
          minWidth: '300px',
          maxWidth: '420px',
          borderRight: '1px solid var(--dsw-alias-border-subtle, #1f2430)',
          background: 'var(--dsw-alias-bg-surface-subtle, #090b0e)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          overflowY: 'auto',
          boxSizing: 'border-box',
        },
      },
        React.createElement('div', {
          style: {
            position: 'relative',
            width: '100%',
            aspectRatio: '9 / 16',
            maxHeight: '560px',
            borderRadius: '10px',
            overflow: 'hidden',
            background: 'var(--dsw-alias-bg-base, #000000)',
            boxShadow: '0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.6))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          },
        },
          // Video Tag
          streamUrl ? React.createElement('video', {
            ref: videoRef,
            src: streamUrl,
            poster: coverUrl,
            controls: true,
            playsInline: true,
            onTimeUpdate: (e) => setCurrentTime(e.target.currentTime),
            style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
          }) : (coverUrl ? React.createElement('img', {
            src: coverUrl,
            alt: 'Cover',
            style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
          }) : null),

          // Top Overlay
          React.createElement('div', {
            style: {
              position: 'relative',
              zIndex: 2,
              padding: '12px',
              background: 'linear-gradient(180deg, var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.7)) 0%, transparent 100%)',
              pointerEvents: 'none',
            },
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              video.author_avatar ? React.createElement('img', {
                src: video.author_avatar,
                alt: 'Avatar',
                style: {
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: '1px solid var(--dsw-alias-border-translucent, rgba(255, 255, 255, 0.7))',
                },
              }) : null,
              React.createElement('div', null,
                React.createElement('div', {
                  style: {
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--dsw-alias-text-contrast, #ffffff)',
                  },
                }, video.author_name || 'Creator'),
                React.createElement('div', {
                  style: {
                    fontSize: '11px',
                    color: 'var(--dsw-alias-text-translucent, rgba(255, 255, 255, 0.7))',
                  },
                }, video.author_handle || '@creator')
              )
            ),
            React.createElement('div', {
              style: {
                marginTop: '8px',
                fontSize: '12px',
                color: 'var(--dsw-alias-text-contrast, #ffffff)',
                lineHeight: 1.4,
                fontWeight: 500,
                textShadow: '0 1px 2px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.8))',
              },
            }, video.title || '')
          ),

          // Right Floating Stats
          React.createElement('div', {
            style: {
              position: 'absolute',
              right: '10px',
              bottom: '56px',
              zIndex: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--dsw-alias-text-contrast, #ffffff)',
              fontSize: '11px',
              fontWeight: 600,
              textShadow: '0 1px 3px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.8))',
              pointerEvents: 'none',
            },
          },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } },
              React.createElement('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'var(--dsw-alias-text-contrast, #ffffff)' },
                React.createElement('path', { d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' })
              ),
              React.createElement('span', null, video.likes || '0')
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } },
              React.createElement('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'var(--dsw-alias-text-contrast, #ffffff)' },
                React.createElement('path', { d: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z' })
              ),
              React.createElement('span', null, video.comments || '0')
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } },
              React.createElement('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'var(--dsw-alias-text-contrast, #ffffff)' },
                React.createElement('path', { d: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z' })
              ),
              React.createElement('span', null, video.shares || '0')
            )
          ),

          // Bottom Overlay
          React.createElement('div', {
            style: {
              position: 'relative',
              zIndex: 2,
              padding: '12px 12px 8px',
              background: 'linear-gradient(0deg, var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.85)) 0%, transparent 100%)',
              pointerEvents: 'none',
            },
          },
            React.createElement('div', {
              style: {
                display: 'inline-block',
                fontSize: '10px',
                color: 'var(--dsw-alias-text-translucent, rgba(255, 255, 255, 0.85))',
                background: 'var(--dsw-alias-bg-mask-subtle, rgba(0, 0, 0, 0.4))',
                padding: '2px 6px',
                borderRadius: '3px',
                border: '1px solid var(--dsw-alias-border-translucent, rgba(255, 255, 255, 0.15))',
                marginBottom: '4px',
              },
            }, 'Creator labeled as AI-generated'),
            React.createElement('div', {
              style: {
                fontSize: '11px',
                color: 'var(--dsw-alias-text-translucent, rgba(255, 255, 255, 0.8))',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              },
            }, `${formatCurrentTime(currentTime)} / ${durationText}`)
          )
        ),

        // Video Caption & Details under video card
        React.createElement('div', { style: { marginTop: '12px' } },
          React.createElement('div', {
            style: {
              fontSize: '13px',
              color: 'var(--dsw-alias-text-description, #cbd5e1)',
              lineHeight: 1.45,
              marginBottom: '8px',
            },
          }, video.caption || video.title || ''),
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: 'var(--dsw-alias-text-muted, #64748b)',
            },
          },
            React.createElement('span', null, `${video.author_handle || ''} ⏱ ${durationText} 👁 ${video.views || '0'} ${shots.length}个场景`),
            video.source_url ? React.createElement('a', {
              href: video.source_url,
              target: '_blank',
              rel: 'noopener noreferrer',
              style: { color: 'var(--dsw-alias-text-muted, #64748b)', textDecoration: 'none' },
              title: '原视频链接',
            }, '↗') : null
          )
        )
      ),

      // Right: Breakdown Details Column
      React.createElement('div', {
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--dsw-alias-bg-base, #0c0e12)',
          overflow: 'hidden',
          position: 'relative',
        },
      },
        // Tabs Header
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 20px',
            borderBottom: '1px solid var(--dsw-alias-border-subtle, #1f2430)',
            background: 'var(--dsw-alias-bg-surface-1, #13161f)',
            flexShrink: 0,
          },
        },
          React.createElement('div', {
            style: {
              display: 'inline-flex',
              background: 'var(--dsw-alias-bg-base, #0e1117)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--dsw-alias-border-subtle, #1f2430)',
              width: '100%',
              maxWidth: '440px',
            },
          },
            React.createElement('button', {
              onClick: () => setActiveTab('shots'),
              style: {
                flex: 1,
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: activeTab === 'shots' ? 600 : 500,
                color: activeTab === 'shots' ? 'var(--dsw-alias-text-contrast, #ffffff)' : 'var(--dsw-alias-text-secondary, #94a3b8)',
                background: activeTab === 'shots' ? 'var(--dsw-alias-bg-surface-elevated, #1c202a)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              },
            }, '分镜'),
            React.createElement('button', {
              onClick: () => setActiveTab('structure'),
              style: {
                flex: 1,
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: activeTab === 'structure' ? 600 : 500,
                color: activeTab === 'structure' ? 'var(--dsw-alias-text-contrast, #ffffff)' : 'var(--dsw-alias-text-secondary, #94a3b8)',
                background: activeTab === 'structure' ? 'var(--dsw-alias-bg-surface-elevated, #1c202a)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              },
            }, '结构拆解')
          )
        ),

        // Tab Content Area
        React.createElement('div', {
          style: {
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px 72px',
            boxSizing: 'border-box',
          },
        },
          activeTab === 'shots' ? (
            // Shots List View
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
              shots.map((shot, idx) =>
                React.createElement('div', {
                  key: shot.id || idx,
                  onClick: () => handleSeek(shot.start_seconds || 0),
                  style: {
                    background: 'var(--dsw-alias-bg-surface-2, #151821)',
                    border: '1px solid var(--dsw-alias-border-subtle, #202430)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease',
                  },
                  onMouseEnter: (e) => (e.currentTarget.style.borderColor = 'var(--dsw-alias-border-strong, #2e3547)'),
                  onMouseLeave: (e) => (e.currentTarget.style.borderColor = 'var(--dsw-alias-border-subtle, #202430)'),
                },
                  React.createElement('div', {
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' },
                  },
                    React.createElement('div', {
                      style: {
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--dsw-alias-text-contrast, #ffffff)',
                        display: 'flex',
                        gap: '8px',
                      },
                    },
                      React.createElement('span', null, shot.time_range || '0:00 - 0:00'),
                      React.createElement('span', null, shot.title || `分镜 ${idx + 1}`)
                    ),
                    shot.stage ? React.createElement('div', {
                      style: {
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'var(--dsw-alias-warning-bg, rgba(245, 158, 11, 0.12))',
                        color: 'var(--dsw-alias-warning, #f59e0b)',
                        border: '1px solid var(--dsw-alias-warning-border, rgba(245, 158, 11, 0.28))',
                      },
                    }, shot.stage) : null
                  ),
                  Array.isArray(shot.tags) && shot.tags.length ? React.createElement('div', {
                    style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' },
                  },
                    shot.tags.map((tag, tIdx) =>
                      React.createElement('span', {
                        key: tIdx,
                        style: {
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--dsw-alias-bg-surface-elevated, #1c202a)',
                          color: 'var(--dsw-alias-text-description, #cbd5e1)',
                          border: '1px solid var(--dsw-alias-border-subtle, #293040)',
                        },
                      }, tag)
                    )
                  ) : null,
                  React.createElement('div', {
                    style: { fontSize: '13px', lineHeight: 1.6, color: 'var(--dsw-alias-text-description, #cbd5e1)' },
                  }, shot.description || '')
                )
              )
            )
          ) : (
            // Structure View
            React.createElement('div', null,
              React.createElement('div', {
                style: { fontSize: '13px', color: 'var(--dsw-alias-text-secondary, #94a3b8)', marginBottom: '18px' },
              }, '识别结构片断并进行内容分析，帮助你审视节奏、卖点顺序与脚本编排。'),
              // Pipeline Pill Flow
              React.createElement('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  marginBottom: '22px',
                  flexWrap: 'wrap',
                },
              },
                pipeline.map((p, idx) =>
                  React.createElement(React.Fragment, { key: p },
                    React.createElement('span', {
                      style: {
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '4px 12px',
                        borderRadius: '16px',
                        background: 'var(--dsw-alias-warning-bg, rgba(245, 158, 11, 0.12))',
                        color: 'var(--dsw-alias-warning, #f59e0b)',
                        border: '1px solid var(--dsw-alias-warning-border, rgba(245, 158, 11, 0.28))',
                      },
                    }, p),
                    idx < pipeline.length - 1 ? React.createElement('span', {
                      style: { color: 'var(--dsw-alias-text-muted, #64748b)', fontSize: '12px' },
                    }, '→') : null
                  )
                )
              ),
              // Structure Cards
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
                structure.map((st, idx) =>
                  React.createElement('div', {
                    key: st.stage || idx,
                    style: {
                      background: 'var(--dsw-alias-bg-surface-2, #151821)',
                      border: '1px solid var(--dsw-alias-border-subtle, #202430)',
                      borderRadius: '8px',
                      padding: '16px 18px',
                    },
                  },
                    React.createElement('div', {
                      style: {
                        fontSize: '15px',
                        fontWeight: 600,
                        color: 'var(--dsw-alias-text-contrast, #ffffff)',
                        marginBottom: '8px',
                      },
                    }, st.title || st.stage),
                    React.createElement('div', {
                      style: { fontSize: '13px', lineHeight: 1.6, color: 'var(--dsw-alias-text-description, #cbd5e1)' },
                    }, st.description || '')
                  )
                )
              )
            )
          )
        ),

        // Bottom Fixed Bar for Shots Tab
        activeTab === 'shots' ? React.createElement('div', {
          style: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '56px',
            background: 'var(--dsw-alias-bg-mask-1, rgba(18, 21, 28, 0.94))',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid var(--dsw-alias-border-subtle, #1f2430)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            zIndex: 10,
          },
        },
          React.createElement('button', {
            onClick: handleCopyShots,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              borderRadius: '6px',
              background: copied ? 'var(--dsw-alias-success-bg, #065f46)' : 'transparent',
              border: `1px solid ${copied ? 'var(--dsw-alias-success, #059669)' : 'var(--dsw-alias-border-strong, #2e3547)'}`,
              color: copied ? 'var(--dsw-alias-success-text, #a7f3d0)' : 'var(--dsw-alias-text-primary, #e2e8f0)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            },
          },
            React.createElement('svg', {
              width: 14,
              height: 14,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 2,
            },
              React.createElement('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
              React.createElement('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
            ),
            React.createElement('span', null, copied ? '已复制分镜' : '复制分镜')
          )
        ) : null
      )
    )
  )
}
