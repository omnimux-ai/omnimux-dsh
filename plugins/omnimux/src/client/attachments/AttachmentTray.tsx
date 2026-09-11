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
.omx-video-token-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0 6px 0;
  box-sizing: border-box;
}
.omx-btn-insert-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  box-sizing: border-box;
  padding: 0 12px;
  border-radius: 9999px;
  border: 1px dashed var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.22)); /* exempt-ui03: 虚线胶囊边框 */
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}
.omx-btn-insert-link:hover {
  border-color: var(--dsw-alias-border-l3, rgba(56, 189, 248, 0.45)); /* exempt-ui03: 悬浮青蓝边框 */
  color: var(--dsw-alias-label-primary, #38bdf8); /* exempt-ui03: 悬浮青蓝文字 */
  background: var(--dsw-alias-bg-module-platform, rgba(14, 116, 144, 0.16)); /* exempt-ui03: 悬浮青蓝背景 */
  transform: translateY(-0.5px);
}
.omx-video-token-capsule {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 32px;
  max-width: 320px;
  padding: 0 10px 0 12px;
  border-radius: 9999px;
  background: var(--dsw-alias-bg-module-platform, rgba(14, 116, 144, 0.18)); /* exempt-ui03: 视频青蓝半透底色 */
  border: 1px solid var(--dsw-alias-border-l3, rgba(56, 189, 248, 0.45)); /* exempt-ui03: 视频青蓝微光描边 */
  color: var(--dsw-alias-label-primary, #38bdf8); /* exempt-ui03: 视频青蓝文字 */
  margin: 2px 6px 2px 0;
  transition: all 0.15s ease;
  user-select: none;
  vertical-align: middle;
  box-shadow: var(--dsw-alias-shadow-overlay, 0 1px 4px rgba(0, 0, 0, 0.1)); /* exempt-ui03: 胶囊阴影 */
}
.omx-video-token-capsule:focus-within {
  border-color: var(--dsw-alias-brand-primary, #38bdf8); /* exempt-ui03: 聚焦青蓝 */
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35); /* exempt-ui03: 聚焦青蓝光晕 */
}
.omx-video-token-prefix {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #38bdf8); /* exempt-ui03: 视频前缀文字 */
  flex-shrink: 0;
}
.omx-video-token-divider {
  width: 1px;
  height: 12px;
  background: var(--dsw-alias-border-l3, rgba(56, 189, 248, 0.35)); /* exempt-ui03: 细分割线 */
  margin: 0 8px;
  flex-shrink: 0;
}
.omx-video-token-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--dsw-alias-label-primary, #38bdf8); /* exempt-ui03: 输入框青蓝文字 */
  font-family: inherit;
  font-size: 13px;
  width: 140px;
  min-width: 60px;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omx-video-token-input::placeholder {
  color: var(--dsw-alias-label-tertiary, rgba(56, 189, 248, 0.65)); /* exempt-ui03: 占位符青蓝 */
}
.omx-video-token-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, rgba(56, 189, 248, 0.7)); /* exempt-ui03: 关闭按钮 */
  cursor: pointer;
  margin-left: 6px;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.12s ease;
}
.omx-video-token-remove:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(56, 189, 248, 0.25)); /* exempt-ui03: 悬浮背景 */
  color: var(--dsw-alias-label-primary, #ffffff);
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

const LinkIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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

function isVideoCategory(cat?: string | null): boolean {
  if (!cat || typeof cat !== 'string') return false;
  const lower = cat.toLowerCase();
  return (
    cat === '创作视频' ||
    cat === 'video-creation' ||
    cat === '搜索爆款视频' ||
    cat === 'search-viral-video' ||
    lower.includes('视频') ||
    lower.includes('video')
  );
}

function insertVideoToken(doc: Document): boolean {
  if (!doc) return false;
  const editor = doc.querySelector(
    '[data-composer-card] [contenteditable="true"], [data-lexical-editor="true"], [data-composer-input="true"], div[role="textbox"][contenteditable="true"]'
  );
  if (!editor) return false;

  const existing = doc.querySelector('[data-omx-video-token="true"]');
  if (existing) {
    const input = existing.querySelector('input');
    input?.focus();
    return true;
  }

  const token = doc.createElement('span');
  token.className = 'omx-video-token-capsule';
  token.setAttribute('contenteditable', 'false');
  token.setAttribute('data-omx-video-token', 'true');
  token.setAttribute('title', '单击进行链接编辑、修改与删除');

  token.innerHTML = `
    <span class="omx-video-token-prefix">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <span>视频</span>
    </span>
    <span class="omx-video-token-divider"></span>
    <input
      type="text"
      class="omx-video-token-input"
      placeholder="粘贴 TikTok 视频链接"
      title="单击输入或粘贴链接"
    />
    <button /* exempt-ui01: 移除按钮 */
      type="button"
      class="omx-video-token-remove"
      title="删除视频链接 Token"
      aria-label="删除视频链接 Token"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M2 2L8 8M8 2L2 8" />
      </svg>
    </button>
  `;

  const inputEl = token.querySelector('input') as HTMLInputElement;
  const removeBtn = token.querySelector('button') as HTMLButtonElement;

  inputEl?.addEventListener('input', () => {
    if (typeof window !== 'undefined') {
      (window as any).__omnimuxVideoToken = { url: inputEl.value.trim(), label: '视频' };
    }
  });

  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    token.remove();
    if (typeof window !== 'undefined') {
      (window as any).__omnimuxVideoToken = null;
    }
    (editor as HTMLElement).focus?.();
  });

  const sel = doc.defaultView?.getSelection?.();
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.insertNode(token);
    range.setStartAfter(token);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    if (editor.firstChild) {
      editor.insertBefore(token, editor.firstChild);
    } else {
      editor.appendChild(token);
    }
  }

  const space = doc.createTextNode(' ');
  if (token.nextSibling) {
    editor.insertBefore(space, token.nextSibling);
  } else {
    editor.appendChild(space);
  }

  try {
    const Input = typeof InputEvent === 'function' ? InputEvent : Event;
    editor.dispatchEvent(new Input('input', { bubbles: true, cancelable: true }));
  } catch {}

  inputEl?.focus();
  return true;
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

  const [videoSkillActive, setVideoSkillActive] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && (window as any).__omnimuxActiveSkill) {
      const cat = (window as any).__omnimuxActiveSkill.category || '';
      return isVideoCategory(cat);
    }
    return false;
  });
  const [hasVideoToken, setHasVideoToken] = useState<boolean>(false);
  const [videoUrl, setVideoUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onSkillChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ skill?: unknown; category?: string }>;
      const cat = customEvent.detail?.category || '';
      setVideoSkillActive(isVideoCategory(cat));
    };
    const onTokenClear = () => {
      setHasVideoToken(false);
      setVideoUrl('');
    };
    window.addEventListener('omnimux:skill:changed', onSkillChange);
    window.addEventListener('omnimux:video-token:cleared', onTokenClear);
    return () => {
      window.removeEventListener('omnimux:skill:changed', onSkillChange);
      window.removeEventListener('omnimux:video-token:cleared', onTokenClear);
    };
  }, []);

  const handleInsertVideoToken = useCallback(() => {
    if (typeof document === 'undefined') return;
    const ok = insertVideoToken(document);
    if (!ok) {
      setHasVideoToken(true);
    }
  }, []);

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
  const hasVideoContent = videoSkillActive || hasVideoToken;
  if (!hasOmnimux && !hasNative && !dragActive && !preview && !hasVideoContent) {
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
      {(hasOmnimux || hasNative || hasVideoContent) && (
        <div className="omx-attachment-dock" data-omnimux-attachments-dock="true">
          {videoSkillActive && (
            <div className="omx-video-token-action-row">
              <button /* exempt-ui01: 视频链接插入按钮 */
                type="button"
                className="omx-btn-insert-link"
                onClick={handleInsertVideoToken}
                title="点击在输入框插入视频链接 Token 组件"
              >
                <LinkIcon size={14} />
                <span>视频链接</span>
              </button>
            </div>
          )}
          {hasVideoToken && (
            <div className="omx-video-token-capsule" title="单击进行链接编辑、修改与删除">
              <div className="omx-video-token-prefix">
                <LinkIcon size={13} />
                <span>视频</span>
              </div>
              <div className="omx-video-token-divider" />
              <input
                type="text"
                className="omx-video-token-input"
                placeholder="粘贴 TikTok 视频链接"
                value={videoUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setVideoUrl(val);
                  if (typeof window !== 'undefined') {
                    (window as any).__omnimuxVideoToken = {
                      url: val,
                      label: '视频',
                    };
                  }
                }}
              />
              <button /* exempt-ui01: 视频 Token 删除按钮 */
                type="button"
                className="omx-video-token-remove"
                title="删除视频链接 Token"
                onClick={() => {
                  setHasVideoToken(false);
                  setVideoUrl('');
                  if (typeof window !== 'undefined') {
                    (window as any).__omnimuxVideoToken = null;
                  }
                }}
              >
                <CloseIcon />
              </button>
            </div>
          )}
          {(hasOmnimux || hasNative) && (
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
          )}
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
