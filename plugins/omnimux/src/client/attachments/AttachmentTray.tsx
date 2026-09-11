import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AttachmentCard } from './AttachmentCard.tsx';
import { getGlobalAttachmentStore } from './store.ts';
import type { ConversationAttachment } from './types.ts';
import { ComposerPresetsChips, getCreativePresetsStore } from '../presets/index.js';

const ATTACHMENTS_STYLE_ID = 'omnimux-attachments-styles';

const BASE_CSS = `
.omx-attachment-dock {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 12px 2px 12px;
  margin: 0;
}
.omx-video-token-action-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 2px 0 6px 0 !important;
  box-sizing: border-box !important;
}
.omx-btn-insert-link {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  height: 28px !important;
  box-sizing: border-box !important;
  padding: 0 12px !important;
  border-radius: 9999px !important;
  border: 1px dashed var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.22)) !important; /* exempt-ui03: 虚线胶囊边框 */
  background: transparent !important;
  color: var(--dsw-alias-label-secondary, inherit) !important;
  font: inherit !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
  cursor: pointer !important;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
  user-select: none !important;
  flex-shrink: 0 !important;
}
.omx-btn-insert-link span {
  white-space: nowrap !important;
  display: inline-block !important;
}
.omx-btn-insert-link:hover {
  border-color: rgba(140, 111, 247, 0.5) !important; /* exempt-ui03: 悬浮紫色边框 */
  color: #c4b5fd !important; /* exempt-ui03: 悬浮紫色文字 */
  background: rgba(121, 97, 242, 0.16) !important; /* exempt-ui03: 悬浮紫色背景 */
  transform: translateY(-0.5px) !important;
}
[data-composer-chip="video"] {
  display: inline-flex !important;
  vertical-align: middle !important;
  margin: 0 6px !important;
}
[data-composer-chip="video"] > span {
  background: rgba(121, 97, 242, 0.16) !important; /* exempt-ui03: 极光紫半透底色 */
  border: 1px solid rgba(140, 111, 247, 0.45) !important; /* exempt-ui03: 极光紫微光描边 */
  color: #c4b5fd !important; /* exempt-ui03: 浅亮紫文字 */
  box-shadow: 0 0 0 1px rgba(121, 97, 242, 0.2) !important; /* exempt-ui03: 极光紫微光晕 */
  border-radius: 6px !important;
  padding: 2px 8px !important;
  transition: all 0.15s ease !important;
}
[data-composer-chip="video"] > span:hover {
  background: rgba(121, 97, 242, 0.25) !important; /* exempt-ui03: 悬浮紫 */
  border-color: #a78bfa !important; /* exempt-ui03: 悬浮高亮描边 */
  color: #ffffff !important; /* exempt-ui03: 高亮白色文字 */
}
[data-composer-chip="video"] svg {
  color: #a78bfa !important; /* exempt-ui03: 极光紫图标 */
}
.omx-video-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: var(--dsw-alias-bg-mask-1); /* exempt-ui03: 弹窗遮罩背景 */
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: omx-fade-in 0.15s ease-out;
}
@keyframes omx-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.omx-video-popover-card {
  box-sizing: border-box;
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: var(--dsw-alias-shadow-l3, 0 16px 36px rgba(0, 0, 0, 0.45)); /* exempt-ui03: 弹窗卡片阴影 */
  animation: omx-popover-zoom 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes omx-popover-zoom {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.omx-video-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.omx-video-popover-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: all 0.12s ease;
}
.omx-video-popover-close:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.omx-video-popover-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  padding: 0 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-video-popover-input-wrap:focus-within {
  border-color: #8c6ff7; /* exempt-ui03: 聚焦品牌紫 */
  box-shadow: 0 0 0 2px rgba(121, 97, 242, 0.25); /* exempt-ui03: 聚焦微光 */
}
.omx-video-popover-input-icon {
  color: #a78bfa; /* exempt-ui03: 链接品牌紫 */
  margin-right: 8px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.omx-video-popover-input {
  flex: 1;
  height: 36px;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.omx-video-popover-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.4;
  padding: 0 2px;
}
.omx-video-popover-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.omx-video-popover-btn-cancel {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}
.omx-video-popover-btn-cancel:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-btn-confirm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid rgba(140, 111, 247, 0.4); /* exempt-ui03: 确认按钮边框 */
  background: rgba(121, 97, 242, 0.4); /* exempt-ui03: 确认按钮底色 */
  color: #c4b5fd; /* exempt-ui03: 确认按钮文字 */
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.omx-video-popover-btn-confirm:hover {
  background: rgba(121, 97, 242, 0.65); /* exempt-ui03: 悬浮底色 */
  border-color: #a78bfa; /* exempt-ui03: 悬浮高亮 */
  color: #ffffff; /* exempt-ui03: 白色文字 */
  transform: translateY(-0.5px);
}
.omx-video-popover-btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
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

if (typeof document !== 'undefined') {
  try {
    ensureStylesInjected();
  } catch {}
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

const CloseIcon = ({ size = 8 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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

function isVideoUrl(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes('tiktok.com') ||
    lower.includes('douyin.com') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('bilibili.com') ||
    lower.includes('instagram.com') ||
    lower.includes('xiaohongshu.com') ||
    lower.includes('xhslink.com') ||
    lower.includes('.mp4') ||
    lower.includes('.mov') ||
    lower.includes('.webm')
  );
}

function insertNativeVideoChip(url: string, savedRange?: Range | null): boolean {
  if (typeof document === 'undefined') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const editor = document.querySelector(
    '[data-composer-card] [contenteditable="true"], [data-lexical-editor="true"], [data-composer-input="true"], div[role="textbox"][contenteditable="true"]'
  ) as HTMLElement | null;

  if (!editor) return false;
  editor.focus();

  // Restore saved range if provided
  if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
    try {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    } catch {}
  }

  const lexicalKey = Object.keys(editor).find((k) => k.startsWith('__lexicalEditor'));
  const lexicalEditor = lexicalKey ? (editor as any)[lexicalKey] : null;

  let platform = '视频';
  const lower = trimmed.toLowerCase();
  if (lower.includes('tiktok.com')) platform = 'TikTok';
  else if (lower.includes('douyin.com')) platform = '抖音';
  else if (lower.includes('youtube.com') || lower.includes('youtu.be')) platform = 'YouTube';
  else if (lower.includes('bilibili.com')) platform = 'B站';
  else if (lower.includes('instagram.com')) platform = 'Instagram';
  else if (lower.includes('xiaohongshu.com') || lower.includes('xhslink.com')) platform = '小红书';

  if (lexicalEditor && typeof lexicalEditor.update === 'function') {
    const chipReg = lexicalEditor._nodes?.get('reference-chip');
    const ChipKlass = chipReg?.klass;

    if (ChipKlass) {
      try {
        lexicalEditor.update(() => {
          const chip = new ChipKlass({
            source: 'video',
            ref: trimmed,
            label: `视频 · ${platform}`,
            appearance: 'file',
            clipboardText: `[视频](${trimmed})`,
          });

          // Insert into current selection or append to root paragraph
          const root = lexicalEditor._editorState?._nodeMap?.get('root');
          const targetBlock = root?.getLastChild?.() || root?.getFirstChild?.();
          if (targetBlock) {
            targetBlock.append(chip);
          }
        });
        return true;
      } catch (err) {
        console.warn('[omnimux] Lexical chip insert failed, falling back:', err);
      }
    }
  }

  // Fallback: document.execCommand insertText
  try {
    return document.execCommand('insertText', false, `[视频](${trimmed}) `);
  } catch {
    return false;
  }
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

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverUrl, setPopoverUrl] = useState('');
  const savedRangeRef = useRef<Range | null>(null);
  const popoverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') || '';
      if (isVideoUrl(text)) {
        const editor = document.querySelector(
          '[data-composer-card] [contenteditable="true"], [data-lexical-editor="true"], [data-composer-input="true"]'
        );
        if (editor && editor.contains(e.target as Node)) {
          e.preventDefault();
          e.stopPropagation();
          insertNativeVideoChip(text.trim());
        }
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('paste', onPaste, true);
    };
  }, []);

  const handleOpenPopover = useCallback(() => {
    if (typeof document === 'undefined') return;
    const editorEl = document.querySelector(
      '[data-composer-card] [contenteditable="true"], [data-lexical-editor="true"], [data-composer-input="true"], div[role="textbox"][contenteditable="true"]'
    );
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorEl && editorEl.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
    setPopoverUrl('');
    setIsPopoverOpen(true);
    setTimeout(() => {
      popoverInputRef.current?.focus();
    }, 50);
  }, []);

  const handleClosePopover = useCallback(() => {
    setIsPopoverOpen(false);
    setPopoverUrl('');
    if (typeof document !== 'undefined') {
      const editorEl = document.querySelector(
        '[data-composer-card] [contenteditable="true"], [data-lexical-editor="true"], [data-composer-input="true"], div[role="textbox"][contenteditable="true"]'
      ) as HTMLElement | null;
      editorEl?.focus();
    }
  }, []);

  const handleConfirmInsert = useCallback(() => {
    const trimmed = popoverUrl.trim();
    if (!trimmed) return;
    insertNativeVideoChip(trimmed, savedRangeRef.current);
    setIsPopoverOpen(false);
    setPopoverUrl('');
  }, [popoverUrl]);

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
      {isPopoverOpen && typeof document !== 'undefined' && document.body && createPortal(
        <div
          className="omx-video-popover-backdrop"
          onClick={handleClosePopover}
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
                <span>插入视频链接</span>
              </div>
              <button /* exempt-ui01: 弹窗关闭按钮 */
                type="button"
                className="omx-video-popover-close"
                onClick={handleClosePopover}
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
                  ref={popoverInputRef}
                  type="text"
                  className="omx-video-popover-input"
                  placeholder="粘贴视频链接 (TikTok / 抖音 / YouTube 等)"
                  value={popoverUrl}
                  onChange={(e) => setPopoverUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmInsert();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleClosePopover();
                    }
                  }}
                />
              </div>
              <div className="omx-video-popover-hint">
                确认后将在输入框当前光标处插入标准 Markdown 格式 <code>[视频](url)</code>，可与文字自由混排并随时删除。
              </div>
            </div>
            <div className="omx-video-popover-footer">
              <button /* exempt-ui01: 取消按钮 */
                type="button"
                className="omx-video-popover-btn-cancel"
                onClick={handleClosePopover}
              >
                取消
              </button>
              <button /* exempt-ui01: 确认插入按钮 */
                type="button"
                className="omx-video-popover-btn-confirm"
                onClick={handleConfirmInsert}
                disabled={!popoverUrl.trim()}
              >
                <span>插入到光标处</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <ComposerPresetsChips sessionId={currentSessionId} />
      <div className="omx-attachment-dock" data-omnimux-attachments-dock="true">
        <div className="omx-video-token-action-row">
          <button /* exempt-ui01: 视频链接插入按钮 */
            type="button"
            className="omx-btn-insert-link"
            onClick={handleOpenPopover}
            title="点击在输入框光标位置插入视频链接"
          >
            <LinkIcon size={14} />
            <span>视频链接</span>
          </button>
        </div>
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
