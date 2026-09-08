import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AttachmentCard } from './AttachmentCard.tsx';
import { getGlobalAttachmentStore } from './store.ts';
import type { ConversationAttachment } from './types.ts';

const ATTACHMENTS_STYLE_ID = 'omnimux-attachments-styles';

const BASE_CSS = `
.omx-attachment-dock {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 12px 2px 12px;
  margin: 0;
}
.omx-attachment-tray {
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  padding: 6px 0 2px 0;
}
.omx-attachment-tray::-webkit-scrollbar {
  display: none;
}
.omx-att-card {
  position: relative;
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  user-select: none;
  cursor: default;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-att-card:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l3);
  z-index: 2;
}
.omx-att-card--highlight {
  animation: omx-att-pulse 0.6s ease-in-out;
}
@keyframes omx-att-pulse {
  0% { transform: scale(1); border-color: var(--dsw-alias-state-business-primary); }
  50% { transform: scale(1.04); border-color: var(--dsw-alias-state-business-primary); }
  100% { transform: scale(1); border-color: var(--dsw-alias-border-l2); }
}
.omx-att-card--media {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  padding: 0;
  justify-content: center;
  cursor: zoom-in;
}
.omx-att-card__media-frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 8px;
}
.omx-att-card__media-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.omx-att-card__media-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
}
.omx-att-card__play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(2px);
  border-radius: 50%;
  color: var(--dsw-static-neutral-00);
  pointer-events: none;
}
.omx-att-card__duration-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(4px);
  color: var(--dsw-static-neutral-00);
  font-size: 9px;
  font-weight: 500;
  line-height: 11px;
  padding: 0 3px;
  border-radius: 4px;
  pointer-events: none;
}
.omx-att-card--file {
  height: 40px;
  min-width: 110px;
  max-width: 165px;
  border-radius: 8px;
  padding: 4px 8px;
  gap: 6px;
}
.omx-att-card__file-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
}
.omx-att-card__file-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
}
.omx-att-card__file-title {
  font-size: 12px;
  font-weight: 500;
  line-height: 15px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}
.omx-att-card__file-ext {
  font-size: 9px;
  font-weight: 600;
  line-height: 11px;
  color: var(--dsw-alias-label-tertiary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.omx-att-card__remove-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 9px;
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease, color 0.15s ease;
  z-index: 6;
}
.omx-att-card__remove-btn--media {
  background: var(--dsw-alias-bg-mask-1);
  border-color: transparent;
  color: var(--dsw-static-neutral-00);
  backdrop-filter: blur(2px);
  box-shadow: var(--dsw-shadow-lv1);
}
.omx-att-card:hover .omx-att-card__remove-btn,
.omx-att-card__remove-btn:focus-visible {
  opacity: 1;
  transform: scale(1);
}
.omx-att-card__remove-btn:hover {
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-static-neutral-00);
}
@media (pointer: coarse) {
  .omx-att-card__remove-btn {
    opacity: 1;
    transform: scale(1);
  }
}
.omx-att-drop-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background-color: var(--dsw-alias-bg-mask-drop, var(--dsw-alias-bg-mask-1));
  backdrop-filter: blur(10px);
}
.omx-att-drop-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 40px;
  color: var(--dsw-alias-label-primary);
  text-align: center;
}
.omx-att-drop-title {
  font: var(--dsw-font-l-20, 600 20px/28px inherit);
}
.omx-att-drop-desc {
  margin-top: 12px;
  font: var(--dsw-font-s-14, 400 14px/20px inherit);
  color: var(--dsw-alias-label-tertiary);
  white-space: pre-wrap;
}
.omx-att-preview {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 40px;
}
.omx-att-preview__mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur, blur(8px));
}
.omx-att-preview__image {
  position: relative;
  max-width: min(100%, 1600px);
  max-height: calc(100vh - 80px);
  object-fit: contain;
  border-radius: 12px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-elevated));
  box-shadow: var(--dsw-shadow-lv3);
}
.omx-att-preview__close {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-elevated));
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
`;

function ensureStylesInjected() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(ATTACHMENTS_STYLE_ID);
  if (existing) {
    if (existing.textContent !== BASE_CSS) existing.textContent = BASE_CSS;
    return;
  }
  const styleEl = document.createElement('style');
  styleEl.id = ATTACHMENTS_STYLE_ID;
  styleEl.textContent = BASE_CSS;
  document.head.appendChild(styleEl);
}

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function translate(
  t: AttachmentTrayProps['t'],
  key: string,
  fallback: string,
  vars?: Record<string, unknown>,
): string {
  if (typeof t === 'function') {
    const result = t(key, vars);
    if (typeof result === 'string' && result && result !== key) return result;
  }
  return interpolate(fallback, vars);
}

const CloseIcon = () => (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const MediaPlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

interface NativeComposerAttachment {
  id: string;
  kind?: string;
  file?: { name?: string } | File;
  previewUrl?: string;
  title?: string;
}

interface PreviewState {
  src: string;
  alt: string;
}

export interface AttachmentTrayProps {
  // DSH 原生拖拽/粘贴图片
  attachments?: readonly any[];
  canAcceptDrop?: boolean;
  onAddImages?: (files: readonly File[]) => void;
  onRemoveImage?: (id: string) => void;
  dropLimits?: { readonly count: number; readonly size: string };
  // 会话与翻译
  sessionId?: string;
  session?: { sessionId?: string; id?: string } | null;
  t?: (key: string, vars?: any) => string;
}

function nativeTitle(attachment: NativeComposerAttachment): string {
  if (attachment.file && typeof attachment.file.name === 'string' && attachment.file.name) {
    return attachment.file.name;
  }
  if (typeof attachment.title === 'string' && attachment.title) return attachment.title;
  return 'image';
}

export const AttachmentTray: React.FC<AttachmentTrayProps> = (props) => {
  const store = getGlobalAttachmentStore();
  const currentSessionId =
    props.session?.sessionId ||
    props.sessionId ||
    props.session?.id ||
    store.getActiveSessionId() ||
    'default';

  const canAcceptDrop = Boolean(props.canAcceptDrop) && typeof props.onAddImages === 'function';
  const nativeAttachments = Array.isArray(props.attachments)
    ? (props.attachments as readonly NativeComposerAttachment[])
    : [];

  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    ensureStylesInjected();
  }, []);

  useEffect(() => {
    store.setActiveSessionId(currentSessionId);
    store.claimPendingAttachments(currentSessionId);
  }, [store, currentSessionId]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const fileTransfer = (event: DragEvent): DataTransfer | null => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !dataTransfer.types || !dataTransfer.types.includes('Files')) return null;
      return dataTransfer;
    };
    const reset = (): void => {
      dragDepth.current = 0;
      setDragActive(false);
    };
    const onDragEnter = (event: DragEvent): void => {
      if (fileTransfer(event) === null) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragActive(true);
    };
    const onDragOver = (event: DragEvent): void => {
      const dataTransfer = fileTransfer(event);
      if (dataTransfer === null) return;
      event.preventDefault();
      dataTransfer.dropEffect = canAcceptDrop ? 'copy' : 'none';
    };
    const onDragLeave = (event: DragEvent): void => {
      if (fileTransfer(event) === null) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragActive(false);
      const leftViewport = event.clientX <= 0 || event.clientY <= 0
        || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
      if ((event.target === document.documentElement || event.target === document.body) && leftViewport) {
        reset();
      }
    };
    const onDrop = (event: DragEvent): void => {
      const dataTransfer = fileTransfer(event);
      if (dataTransfer === null) return;
      event.preventDefault();
      reset();
      if (canAcceptDrop && typeof props.onAddImages === 'function') {
        props.onAddImages([...dataTransfer.files]);
      }
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    window.addEventListener('dragend', reset);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', reset);
    };
  }, [canAcceptDrop, props.onAddImages]);

  const subscribe = useCallback(
    (callback: () => void) => store.subscribe(currentSessionId, callback),
    [store, currentSessionId],
  );

  const getSnapshot = useCallback(
    () => store.getSnapshot(currentSessionId),
    [store, currentSessionId],
  );

  const omnimuxAttachments = useSyncExternalStore(subscribe, getSnapshot, () => []);

  useEffect(() => {
    if (!preview) return;
    const stillOmnimux = omnimuxAttachments.some((item) => item.previewUrl === preview.src);
    const stillNative = nativeAttachments.some((item) => item.previewUrl === preview.src);
    if (!stillOmnimux && !stillNative) setPreview(null);
  }, [omnimuxAttachments, nativeAttachments, preview]);

  const handleRemoveOmnimux = useCallback(
    (attachmentId: string) => {
      store.removeAttachment(currentSessionId, attachmentId);
    },
    [store, currentSessionId],
  );

  const handleOpenOmnimux = useCallback((attachment: ConversationAttachment) => {
    if (!attachment.previewUrl) return;
    setPreview({ src: attachment.previewUrl, alt: attachment.title || 'image' });
  }, []);

  const handleOpenNative = useCallback((attachment: NativeComposerAttachment) => {
    if (!attachment.previewUrl) return;
    setPreview({ src: attachment.previewUrl, alt: nativeTitle(attachment) });
  }, []);

  const handleRemoveNative = useCallback((id: string) => {
    props.onRemoveImage?.(id);
  }, [props.onRemoveImage]);

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview, closePreview]);

  const hasOmnimux = Boolean(omnimuxAttachments && omnimuxAttachments.length > 0);
  const hasNative = nativeAttachments.length > 0;
  if (!hasOmnimux && !hasNative && !dragActive && !preview) {
    return null;
  }

  const railLabel = translate(props.t, 'attachments.rail', '会话关联附件导轨');
  const dropTitle = canAcceptDrop
    ? translate(props.t, 'attachments.dropTitle', '将图片拖放到此处')
    : translate(props.t, 'attachments.dropBlocked', '当前无法添加图片');
  const dropDesc = canAcceptDrop && props.dropLimits
    ? translate(
      props.t,
      'attachments.dropDesc',
      '最多 {count} 张，单张不超过 {size}',
      props.dropLimits,
    )
    : '';
  const previewLabel = translate(props.t, 'attachments.preview', '图片预览');
  const closePreviewLabel = translate(props.t, 'attachments.closePreview', '关闭预览');

  return (
    <>
      {dragActive && typeof document !== 'undefined' && document.body && createPortal(
        <div className="omx-att-drop-mask" role="status" data-omnimux-drop-overlay="true">
          <div className="omx-att-drop-wrap">
            <div className="omx-att-drop-title">{dropTitle}</div>
            {dropDesc ? <div className="omx-att-drop-desc">{dropDesc}</div> : null}
          </div>
        </div>,
        document.body,
      )}
      {(hasOmnimux || hasNative) && (
        <div className="omx-attachment-dock" data-omnimux-attachments-dock="true">
          <div className="omx-attachment-tray" role="list" aria-label={railLabel}>
            {omnimuxAttachments.map((att) => (
              <AttachmentCard
                key={att.id}
                attachment={att}
                onRemove={handleRemoveOmnimux}
                onOpen={att.previewUrl ? handleOpenOmnimux : undefined}
              />
            ))}
            {nativeAttachments.map((att) => {
              const title = nativeTitle(att);
              return (
                <div
                  key={`native-${att.id}`}
                  className="omx-att-card omx-att-card--media"
                  role="listitem"
                  title={title}
                  onClick={() => handleOpenNative(att)}
                >
                  <div className="omx-att-card__media-frame">
                    {att.previewUrl ? (
                      <img
                        src={att.previewUrl}
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
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveNative(att.id);
                    }}
                    aria-label={translate(props.t, 'attachments.removeNative', '移除 {name}', { name: title })}
                  >
                    <CloseIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {preview && typeof document !== 'undefined' && document.body && createPortal(
        <div
          className="omx-att-preview"
          role="dialog"
          aria-modal="true"
          aria-label={previewLabel}
        >
          <div className="omx-att-preview__mask" aria-hidden="true" onMouseDown={closePreview} />
          <img className="omx-att-preview__image" src={preview.src} alt={preview.alt} />
          <button /* exempt-ui01: 大图预览关闭按钮 */
            type="button"
            className="omx-att-preview__close"
            aria-label={closePreviewLabel}
            onClick={closePreview}
          >
            <CloseIcon />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
};
