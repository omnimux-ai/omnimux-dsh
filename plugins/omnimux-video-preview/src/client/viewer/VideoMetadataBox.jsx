import React from 'react'
import { UserIcon, ClockIcon, EyeIcon, ExternalLinkIcon } from '../icons.jsx'
import { formatViews } from './breakdownDataUtils.js'

function resolveAuthorHandle(video) {
  if (video.author_handle) return video.author_handle
  if (video.author_name) return `@${video.author_name}`
  return '@creator'
}

export function VideoMetadataBox({ video = {}, shotsCount = 0, isZh = true }) {
  const authorHandle = resolveAuthorHandle(video)
  const durationText = video.duration_text || '0:17'
  const viewsText = formatViews(video.views)
  const sceneCount = video.scene_count || shotsCount || 0
  const sceneLabel = isZh ? '个场景' : 'scenes'
  const extLinkTitle = isZh ? '访问原视频链接' : 'Visit original video link'
  const captionText = video.caption || video.title || ''

  return (
    <div className="omnimux-video-info-box">
      <div className="omnimux-video-info-title-row">
        <span className="omnimux-video-info-caption">{captionText}</span>
        {video.source_url ? (
          <a
            href={video.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="omnimux-video-info-ext-link"
            title={extLinkTitle}
            aria-label={extLinkTitle}
          >
            <ExternalLinkIcon size={14} />
          </a>
        ) : null}
      </div>

      <div className="omnimux-video-info-meta-row">
        <span className="omnimux-video-info-meta-item">
          <UserIcon size={13} />
          <span>{authorHandle}</span>
        </span>
        <span className="omnimux-video-info-meta-item">
          <ClockIcon size={13} />
          <span>{durationText}</span>
        </span>
        <span className="omnimux-video-info-meta-item">
          <EyeIcon size={13} />
          <span>{viewsText}</span>
        </span>
      </div>

      <div className="omnimux-video-info-scenes">
        <span>{sceneCount} {sceneLabel}</span>
      </div>
    </div>
  )
}
