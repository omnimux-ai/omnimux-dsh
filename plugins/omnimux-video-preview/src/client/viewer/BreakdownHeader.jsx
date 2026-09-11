import React from 'react'
import { IconButton } from 'dsh-ui-kit'
import { ExpandIcon, CloseIcon } from '../icons.jsx'

export function BreakdownHeader({ isZh, onToggleFullscreen, onClose }) {
  const fullscreenTitle = isZh ? '全屏切换' : 'Toggle Fullscreen'
  const closeTitle = isZh ? '关闭' : 'Close'
  const headerTitle = isZh ? '视频分析' : 'Video Breakdown'

  return (
    <header className="omnimux-video-breakdown-header">
      <div className="omnimux-video-breakdown-header-title">
        <span>{headerTitle}</span>
      </div>
      <div className="omnimux-video-breakdown-header-actions">
        <IconButton
          variant="ghost"
          size="sm"
          title={fullscreenTitle}
          aria-label={fullscreenTitle}
          onClick={onToggleFullscreen}
        >
          <ExpandIcon size={14} />
        </IconButton>
        {typeof onClose === 'function' ? (
          <IconButton
            variant="ghost"
            size="sm"
            title={closeTitle}
            aria-label={closeTitle}
            onClick={onClose}
          >
            <CloseIcon size={14} />
          </IconButton>
        ) : null}
      </div>
    </header>
  )
}
