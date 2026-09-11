import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface PreviewTarget {
  src: string;
  alt: string;
}

export interface AttachmentPreviewModalProps {
  preview: PreviewTarget | null;
  onClose: () => void;
  previewLabel?: string;
  closeLabel?: string;
}

const CloseIcon = ({ size = 8 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function handleEscapeKey(event: KeyboardEvent, onClose: () => void): void {
  if (event.key === 'Escape') {
    onClose();
  }
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = (props) => {
  const { preview, onClose, previewLabel = '图片预览', closeLabel = '关闭预览' } = props;

  useEffect(() => {
    if (!preview || typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => handleEscapeKey(event, onClose);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview, onClose]);

  if (!preview || typeof document === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(
    <div
      className="omx-att-preview"
      role="dialog"
      aria-modal="true"
      aria-label={previewLabel}
    >
      <div className="omx-att-preview__mask" aria-hidden="true" onMouseDown={onClose} />
      <img className="omx-att-preview__image" src={preview.src} alt={preview.alt} />
      <button /* exempt-ui01: 大图预览关闭按钮 */
        type="button"
        className="omx-att-preview__close"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>,
    document.body,
  );
};
