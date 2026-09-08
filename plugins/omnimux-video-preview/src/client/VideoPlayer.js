import React, { useState } from 'react'

export function VideoPlayer({ mediaUrl, path, title }) {
  const [error, setError] = useState(null)

  // Use custom streaming endpoint if path is available, otherwise fallback to mediaUrl
  const streamUrl = path
    ? `/omnimux/video-preview/stream?path=${encodeURIComponent(path)}`
    : mediaUrl

  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        minHeight: '280px',
        backgroundColor: 'var(--dsw-alias-bg-surface-1, #0c0c0e)',
        padding: '16px',
        boxSizing: 'border-box',
      },
    },
    error
      ? React.createElement(
          'div',
          {
            style: {
              color: 'var(--dsw-alias-text-secondary, #999)',
              textAlign: 'center',
              padding: '24px',
            },
          },
          React.createElement('div', { style: { marginBottom: '12px' } }, '视频无法直接播放或解码受限'),
          mediaUrl &&
            React.createElement(
              'a',
              {
                href: mediaUrl,
                download: title || 'video',
                style: {
                  color: 'var(--dsw-alias-brand-accent, #3b82f6)',
                  textDecoration: 'underline',
                  fontSize: '13px',
                },
              },
              '下载原文件'
            )
        )
      : React.createElement('video', {
          src: streamUrl,
          controls: true,
          playsInline: true,
          onError: () => setError('Video playback error'),
          style: {
            maxWidth: '100%',
            maxHeight: '100%',
            borderRadius: 'var(--dsw-alias-radius-md, 8px)',
            boxShadow: '0 4px 20px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.4))',
            backgroundColor: 'var(--dsw-alias-bg-base, #000)',
            outline: 'none',
          },
        })
  )
}
