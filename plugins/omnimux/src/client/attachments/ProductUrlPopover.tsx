import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ProductUrlPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
  t?: (key: string, vars?: any) => string;
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

export const ProductUrlPopover: React.FC<ProductUrlPopoverProps> = ({
  isOpen,
  onClose,
  onConfirm,
  t = (k) => k,
}) => {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

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
      aria-label="从 URL 添加产品链接"
    >
      <div
        className="omx-video-popover-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="omx-video-popover-header">
          <div className="omx-video-popover-title">
            <LinkIcon size={16} />
            <span>从 URL 添加产品</span>
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
              type="url"
              className="omx-video-popover-input"
              placeholder="输入或粘贴产品页面网址 (Amazon, Shopify, 独立站等)..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <p className="omx-video-popover-hint">
            支持亚马逊、Shopify、TikTok Shop 或任意品牌独立站商品页面链接
          </p>
        </div>
        <div className="omx-video-popover-footer">
          <button /* exempt-ui01: 取消按钮 */
            type="button"
            className="omx-btn-popover-cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button /* exempt-ui01: 确定按钮 */
            type="button"
            className="omx-btn-popover-confirm"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            确认添加
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
