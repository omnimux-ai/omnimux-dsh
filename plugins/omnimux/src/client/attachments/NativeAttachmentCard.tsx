import React from 'react';

export interface NativeComposerAttachment {
  id: string;
  kind?: string;
  file?: { name?: string } | File;
  previewUrl?: string;
  title?: string;
}

/** Host upload state for one draft file; file-kind attachments only. */
export interface NativeAttachmentUpload {
  status: 'uploading' | 'ready' | 'error';
  loaded?: number;
  total?: number;
  message?: string;
}

export interface NativeAttachmentCardProps {
  attachment: NativeComposerAttachment;
  onOpen: (attachment: NativeComposerAttachment) => void;
  onRemove: (id: string) => void;
  removeAriaLabel?: string;
  upload?: NativeAttachmentUpload;
  onRetry?: (id: string) => void;
  labels?: NativeAttachmentCardLabels;
}

export interface NativeAttachmentCardLabels {
  uploading?: string;
  failed?: string;
  retry?: string;
  file?: string;
}

const FALLBACK_LABELS: Required<NativeAttachmentCardLabels> = {
  uploading: '上传中',
  failed: '上传失败',
  retry: '重试',
  file: '文件',
};

function label(
  labels: NativeAttachmentCardLabels | undefined,
  key: keyof NativeAttachmentCardLabels,
): string {
  const value = labels?.[key];
  return typeof value === 'string' && value ? value : FALLBACK_LABELS[key];
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toUpperCase() : 'FILE';
}

export function resolveNativeTitle(attachment: NativeComposerAttachment): string {
  if (attachment.file && typeof attachment.file.name === 'string' && attachment.file.name) {
    return attachment.file.name;
  }
  if (typeof attachment.title === 'string' && attachment.title) {
    return attachment.title;
  }
  return attachment.kind === 'file' ? FALLBACK_LABELS.file : 'image';
}

/** 只有失败态才把重试回调交给卡片；uploading / ready / 无回执一律不提供重试。 */
export function resolveRetryHandler(
  upload: NativeAttachmentUpload | undefined,
  onRetry: ((id: string) => void) | undefined,
): ((id: string) => void) | undefined {
  return upload?.status === 'error' && typeof onRetry === 'function' ? onRetry : undefined;
}

const MediaPlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const FilePlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const CloseIcon = ({ size = 8 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const SpinnerIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    className="omx-att-card__spinner"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export const NativeAttachmentCard: React.FC<NativeAttachmentCardProps> = (props) => {
  const { attachment, onOpen, onRemove, removeAriaLabel, upload, onRetry, labels } = props;
  const title = resolveNativeTitle(attachment);
  const removeLabel = removeAriaLabel || `移除 ${title}`;

  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRemove(attachment.id);
  };

  const handleRetryClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRetry?.(attachment.id);
  };

  const removeButton = (
    <button /* exempt-ui01: 附件托盘删除按钮 */
      type="button"
      className={`omx-att-card__remove-btn${attachment.kind === 'file' ? '' : ' omx-att-card__remove-btn--media'}`}
      onClick={handleRemoveClick}
      aria-label={removeLabel}
    >
      <CloseIcon />
    </button>
  );

  // 文件类附件没有缩略图，走紧凑文件卡片：上传中 / 失败重试 / 文件名与扩展名。
  if (attachment.kind === 'file') {
    const extension = extensionOf(title);
    if (upload?.status === 'uploading') {
      return (
        <div className="omx-att-card omx-att-card--file omx-att-card--uploading" role="listitem" title={title}>
          <div className="omx-att-card__file-icon">
            <SpinnerIcon />
          </div>
          <div className="omx-att-card__file-info">
            <span className="omx-att-card__file-title">{title}</span>
            <span className="omx-att-card__file-ext">
              {label(labels, 'uploading')}
              {typeof upload.total === 'number' && upload.total > 0
                ? ` ${Math.min(100, Math.round(((upload.loaded ?? 0) / upload.total) * 100))}%`
                : ''}
            </span>
          </div>
          {removeButton}
        </div>
      );
    }
    if (upload?.status === 'error') {
      return (
        <div className="omx-att-card omx-att-card--file omx-att-card--failed" role="listitem" title={upload.message || title}>
          <div className="omx-att-card__file-icon">
            <FilePlaceholderIcon />
          </div>
          <div className="omx-att-card__file-info">
            <span className="omx-att-card__file-title">{title}</span>
            <span className="omx-att-card__file-ext">{upload.message || label(labels, 'failed')}</span>
          </div>
          <button /* exempt-ui01: 附件托盘重试按钮 */
            type="button"
            className="omx-att-card__retry-btn"
            onClick={handleRetryClick}
            disabled={typeof onRetry !== 'function'}
          >
            {label(labels, 'retry')}
          </button>
          {removeButton}
        </div>
      );
    }
    return (
      <div className="omx-att-card omx-att-card--file" role="listitem" title={title}>
        <div className="omx-att-card__file-icon">
          <FilePlaceholderIcon />
        </div>
        <div className="omx-att-card__file-info">
          <span className="omx-att-card__file-title">{title}</span>
          <span className="omx-att-card__file-ext">{extension}</span>
        </div>
        {removeButton}
      </div>
    );
  }

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
      {removeButton}
    </div>
  );
};
