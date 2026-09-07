import React, { useMemo, useState } from 'react';
import type { ConversationAttachment } from './types.ts';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
  isMediaAttachment,
  isVideoAttachment,
} from './media-detector.ts';

export {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
  isMediaAttachment,
  isVideoAttachment,
};

interface AttachmentCardProps {
  attachment: ConversationAttachment;
  onRemove: (id: string) => void;
  onOpen?: (attachment: ConversationAttachment) => void;
  isHighlighted?: boolean;
}

// 矢量 SVG 图标定义（杜绝 Emoji，消费 --dsw-*）
const PlayTriangleIcon = () => (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const TableFileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
);

const DocFileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
  </svg>
);

const MediaPlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const AudioFileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export const AttachmentCard: React.FC<AttachmentCardProps> = ({
  attachment,
  onRemove,
  onOpen,
  isHighlighted,
}) => {
  const [imageError, setImageError] = useState(false);

  const ext = (attachment.extension || '').toUpperCase();
  const isMedia = isMediaAttachment(attachment);
  const isVideo = isVideoAttachment(attachment);

  const fileIcon = useMemo(() => {
    if (attachment.kind === 'table') {
      return <TableFileIcon />;
    }
    if (attachment.kind === 'inspiration') {
      return <SparklesIcon />;
    }
    if (attachment.kind === 'audio' || AUDIO_EXTENSIONS.has(ext)) {
      return <AudioFileIcon />;
    }
    return <DocFileIcon />;
  }, [attachment.kind, ext]);

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(attachment.id);
  };

  const handleOpen = () => {
    onOpen?.(attachment);
  };

  if (isMedia) {
    return (
      <div
        className={`omx-att-card omx-att-card--media ${isHighlighted ? 'omx-att-card--highlight' : ''}`}
        role="listitem"
        title={`${attachment.title} (${attachment.relativePath})`}
        onClick={onOpen ? handleOpen : undefined}
      >
        {/* 圆角裁剪收敛到内部 frame，外凸的移除按钮不再被 overflow 裁掉 */}
        <div className="omx-att-card__media-frame">
          {attachment.previewUrl && !imageError ? (
            <img
              src={attachment.previewUrl}
              alt={attachment.title}
              className="omx-att-card__media-thumb"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="omx-att-card__media-placeholder">
              <MediaPlaceholderIcon />
            </div>
          )}

          {isVideo && (
            <>
              <div className="omx-att-card__play-icon">
                <PlayTriangleIcon />
              </div>
              {attachment.duration && (
                <span className="omx-att-card__duration-badge">
                  {attachment.duration}
                </span>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          className="omx-att-card__remove-btn omx-att-card__remove-btn--media"
          onClick={handleRemoveClick}
          aria-label={`移除 ${attachment.title}`}
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`omx-att-card omx-att-card--file ${isHighlighted ? 'omx-att-card--highlight' : ''}`}
      role="listitem"
      title={`${attachment.title} (${attachment.relativePath})`}
    >
      <div className="omx-att-card__file-icon">
        {fileIcon}
      </div>
      <div className="omx-att-card__file-info">
        <span className="omx-att-card__file-title">
          {attachment.title}
        </span>
        <span className="omx-att-card__file-ext">
          {attachment.extension || 'FILE'}
        </span>
      </div>

      <button
        type="button"
        className="omx-att-card__remove-btn"
        onClick={handleRemoveClick}
        aria-label={`移除 ${attachment.title}`}
      >
        <CloseIcon />
      </button>
    </div>
  );
};
