import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface VideoLinkPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
}

const CloseIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const LinkIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

function handleKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  confirmAction: () => void,
  closeAction: () => void,
): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmAction();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAction();
  }
}

export const VideoLinkPopover: React.FC<VideoLinkPopoverProps> = (props) => {
  const { isOpen, onClose, onConfirm } = props;
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setUrl('');
      return undefined;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    let trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    onConfirm(trimmed);
    setUrl('');
  }, [url, onConfirm]);

  if (!isOpen || typeof document === 'undefined' || !document.body) {
    return null;
  }

  const isConfirmDisabled = !url.trim();

  return createPortal(
    <div
      className="omx-video-popover-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="omx-video-popover-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="omx-video-popover-header">
          <div className="omx-video-popover-title">
            <LinkIcon size={16} />
            <span>插入链接</span>
          </div>
          <button /* exempt-ui01: 弹窗关闭按钮 */
            type="button"
            className="omx-video-popover-close"
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
          >
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="omx-video-popover-body">
          <div className="omx-video-popover-input-wrap">
            <span className="omx-video-popover-input-icon">
              <LinkIcon size={14} />
            </span>
            <input
              ref={inputRef}
              type="text"
              className="omx-video-popover-input"
              placeholder="粘贴或输入链接 (HTTP / HTTPS)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleConfirm, onClose)}
            />
          </div>
        </div>
        <div className="omx-video-popover-footer">
          <button /* exempt-ui01: 取消按钮 */
            type="button"
            className="omx-video-popover-btn-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button /* exempt-ui01: 确认插入按钮 */
            type="button"
            className="omx-video-popover-btn-confirm"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            <span>确认</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
