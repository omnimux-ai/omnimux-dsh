import React from 'react';

export interface NativeComposerAttachment {
  id: string;
  kind?: string;
  file?: { name?: string } | File;
  previewUrl?: string;
  title?: string;
}

export interface NativeAttachmentCardProps {
  attachment: NativeComposerAttachment;
  onOpen: (attachment: NativeComposerAttachment) => void;
  onRemove: (id: string) => void;
  removeAriaLabel?: string;
}

export function resolveNativeTitle(attachment: NativeComposerAttachment): string {
  if (attachment.file && typeof attachment.file.name === 'string' && attachment.file.name) {
    return attachment.file.name;
  }
  if (typeof attachment.title === 'string' && attachment.title) {
    return attachment.title;
  }
  return 'image';
}

const MediaPlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const CloseIcon = ({ size = 8 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const NativeAttachmentCard: React.FC<NativeAttachmentCardProps> = (props) => {
  const { attachment, onOpen, onRemove, removeAriaLabel } = props;
  const title = resolveNativeTitle(attachment);

  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRemove(attachment.id);
  };

  return (
    <div
      className="omx-att-card omx-att-card--media"
      role="listitem"
      title={title}
      onClick={() => onOpen(attachment)}
    >
      <div className="omx-att-card__media-frame">
        {attachment.previewUrl ? (
          <img
            src={attachment.previewUrl}
            alt={title}
            className="omx-att-card__media-thumb"
          />
        ) : (
          <div className="omx-att-card__media-placeholder">
            <MediaPlaceholderIcon />
          </div>
        )}
      </div>
      <button /* exempt-ui01: 附件托盘删除按钮 */
        type="button"
        className="omx-att-card__remove-btn omx-att-card__remove-btn--media"
        onClick={handleRemoveClick}
        aria-label={removeAriaLabel || `移除 ${title}`}
      >
        <CloseIcon />
      </button>
    </div>
  );
};
