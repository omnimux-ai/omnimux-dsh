import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AttachmentCard } from './AttachmentCard.tsx';
import { getGlobalAttachmentStore } from './store.ts';
import type { ConversationAttachment } from './types.ts';
import { PromptSlotChips } from './PromptSlotChips.tsx';
import { usePromptSlotEnhancer } from './usePromptSlotEnhancer.ts';
import { ensureStylesInjected } from './trayStyles.ts';
import { insertNativeVideoChip } from './nativeVideoChip.ts';
import { useDragDrop } from './useDragDrop.ts';
import { usePasteVideoInterceptor } from './usePasteVideoInterceptor.ts';
import { VideoLinkPopover } from './VideoLinkPopover.tsx';
import { DropOverlay } from './DropOverlay.tsx';
import { AttachmentPreviewModal, type PreviewTarget } from './AttachmentPreviewModal.tsx';
import {
  NativeAttachmentCard,
  resolveNativeTitle,
  resolveRetryHandler,
  type NativeAttachmentUpload,
  type NativeComposerAttachment,
} from './NativeAttachmentCard.tsx';

/** 官方 DraftFileUpload：会话草稿里的上传回执。 */
export type DraftFileUpload =
  | { readonly status: 'uploading'; readonly loaded: number; readonly total?: number }
  | { readonly status: 'ready'; readonly receiptId: string; readonly file: unknown }
  | { readonly status: 'error'; readonly message: string };

export interface AttachmentTrayProps {
  attachments?: readonly any[];
  canAcceptDrop?: boolean;
  onAddFiles?: (files: readonly File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  uploads?: Readonly<Record<string, DraftFileUpload>>;
  onRetryFile?: (id: string) => void;
  dropLimits?: { readonly count: number; readonly size: string };
  sessionId?: string;
  session?: { sessionId?: string; id?: string } | null;
  t?: (key: string, vars?: any) => string;
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

const LinkIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

function captureEditorSelection(): Range | null {
  if (typeof document === 'undefined') return null;
  const editor = document.querySelector(
    '[data-composer-card] [contenteditable="true"], [data-lexical-editor="true"], [data-composer-input="true"], div[role="textbox"][contenteditable="true"]',
  );
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

function focusEditorElement(): void {
  if (typeof document === 'undefined') return;
  const editor = document.querySelector(
    '[data-composer-card] [contenteditable="true"], [data-lexical-editor="true"], [data-composer-input="true"], div[role="textbox"][contenteditable="true"]',
  ) as HTMLElement | null;
  if (editor) {
    editor.focus();
  }
}

interface AttachmentTrayRailProps {
  label: string;
  omnimuxAttachments: readonly ConversationAttachment[];
  nativeAttachments: readonly NativeComposerAttachment[];
  onRemoveOmnimux: (id: string) => void;
  onOpenOmnimux: (attachment: ConversationAttachment) => void;
  onRemoveNative: (id: string) => void;
  onOpenNative: (attachment: NativeComposerAttachment) => void;
  uploads?: Readonly<Record<string, DraftFileUpload>>;
  onRetryFile?: (id: string) => void;
  t?: AttachmentTrayProps['t'];
}

const AttachmentTrayRail: React.FC<AttachmentTrayRailProps> = (props) => {
  const {
    label,
    omnimuxAttachments,
    nativeAttachments,
    onRemoveOmnimux,
    onOpenOmnimux,
    onRemoveNative,
    onOpenNative,
    uploads,
    onRetryFile,
    t,
  } = props;

  return (
    <div className="omx-attachment-tray" role="list" aria-label={label}>
      {omnimuxAttachments.map((att) => (
        <AttachmentCard
          key={att.id}
          attachment={att}
          onRemove={onRemoveOmnimux}
          onOpen={att.previewUrl ? onOpenOmnimux : undefined}
        />
      ))}
      {nativeAttachments.map((att) => {
        const draft = uploads?.[att.id];
        const upload: NativeAttachmentUpload | undefined = draft
          ? {
            status: draft.status,
            ...(draft.status === 'uploading' ? { loaded: draft.loaded, total: draft.total } : {}),
            ...(draft.status === 'error' ? { message: draft.message } : {}),
          }
          : undefined;
        return (
          <NativeAttachmentCard
            key={`native-${att.id}`}
            attachment={att}
            onOpen={onOpenNative}
            onRemove={onRemoveNative}
            upload={upload}
            onRetry={resolveRetryHandler(upload, onRetryFile)}
            removeAriaLabel={translate(t, 'attachments.removeNative', '移除 {name}', {
              name: resolveNativeTitle(att),
            })}
          />
        );
      })}
    </div>
  );
};

const SHOW_MANUAL_LINK_BUTTON = false;

export const AttachmentTray: React.FC<AttachmentTrayProps> = (props) => {
  const store = getGlobalAttachmentStore();
  const sessionObj = props.session;
  const currentSessionId =
    sessionObj?.sessionId ||
    props.sessionId ||
    sessionObj?.id ||
    store.getActiveSessionId() ||
    'default';

  const canAcceptDrop = Boolean(props.canAcceptDrop) && typeof props.onAddFiles === 'function';
  const nativeAttachments: readonly NativeComposerAttachment[] = Array.isArray(props.attachments)
    ? (props.attachments as readonly NativeComposerAttachment[])
    : [];

  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);

  usePasteVideoInterceptor();
  const { slots, activeSlotIndex, selectSlot, replaceSlot } = usePromptSlotEnhancer();
  const dragActive = useDragDrop({
    canAcceptDrop,
    onAddFiles: props.onAddFiles,
  });

  useEffect(() => {
    ensureStylesInjected();
  }, []);

  useEffect(() => {
    store.setActiveSessionId(currentSessionId);
    store.claimPendingAttachments(currentSessionId);
  }, [store, currentSessionId]);

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
    if (!stillOmnimux && !stillNative) {
      setPreview(null);
    }
  }, [omnimuxAttachments, nativeAttachments, preview]);

  const handleOpenPopover = useCallback(() => {
    savedRangeRef.current = captureEditorSelection();
    setIsPopoverOpen(true);
  }, []);

  const handleClosePopover = useCallback(() => {
    setIsPopoverOpen(false);
    focusEditorElement();
  }, []);

  const handleConfirmInsert = useCallback((url: string) => {
    insertNativeVideoChip(url, savedRangeRef.current);
    setIsPopoverOpen(false);
  }, []);

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
    setPreview({ src: attachment.previewUrl, alt: resolveNativeTitle(attachment) });
  }, []);

  const handleRemoveNative = useCallback((id: string) => {
    if (typeof props.onRemoveAttachment === 'function') {
      props.onRemoveAttachment(id);
    }
  }, [props.onRemoveAttachment]);

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  const handleAddProductAttachment = useCallback(
    (product: any) => {
      if (!product) return;
      const cover = product.cover;
      const coverId = cover?.id || product.cover_media_id;
      const previewUrl = coverId
        ? `/omnimux/products/${encodeURIComponent(product.id)}?preview=${encodeURIComponent(coverId)}`
        : cover?.real_path
          ? `file://${cover.real_path}`
          : '';

      const relativePath = cover?.real_path || `products/${product.id}.json`;

      store.addAttachment(currentSessionId, {
        sourcePlugin: 'omnimux-products',
        kind: 'product',
        entityId: product.id || String(Date.now()),
        title: product.name || product.title || '产品',
        extension: 'JSON',
        relativePath,
        previewUrl,
        metadata: {
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            sku: product.sku,
            brand: product.brand,
            description: product.description,
            selling_points: product.selling_points,
            features: product.features,
            target_audience: product.target_audience,
          },
        },
      });
    },
    [store, currentSessionId],
  );

  const hasOmnimux = Boolean(omnimuxAttachments && omnimuxAttachments.length > 0);
  const hasNative = nativeAttachments.length > 0;
  const hasRailContent = hasOmnimux || hasNative;

  const railLabel = translate(props.t, 'attachments.rail', '会话关联附件导轨');
  const dropTitle = canAcceptDrop
    ? translate(props.t, 'attachments.dropTitle', '将图片拖放到此处')
    : translate(props.t, 'attachments.dropBlocked', '当前无法添加图片');
  const dropDesc = canAcceptDrop && props.dropLimits
    ? translate(props.t, 'attachments.dropDesc', '最多 {count} 张，单张不超过 {size}', props.dropLimits)
    : '';

  return (
    <>
      <DropOverlay active={dragActive} title={dropTitle} description={dropDesc} disabled={!canAcceptDrop} />
      {SHOW_MANUAL_LINK_BUTTON && (
        <VideoLinkPopover
          isOpen={isPopoverOpen}
          onClose={handleClosePopover}
          onConfirm={handleConfirmInsert}
        />
      )}
      <PromptSlotChips
        slots={slots}
        activeSlotIndex={activeSlotIndex}
        onSelectSlot={selectSlot}
        onReplaceSlot={replaceSlot}
        onAddFiles={props.onAddFiles}
        onAddProductAttachment={handleAddProductAttachment}
        t={props.t}
      />
      {(SHOW_MANUAL_LINK_BUTTON || hasRailContent) && (
        <div className="omx-attachment-dock" data-omnimux-attachments-dock="true">
          {SHOW_MANUAL_LINK_BUTTON && (
            <div className="omx-video-token-action-row">
              <button /* exempt-ui01: 链接插入按钮 */
                type="button"
                className="omx-btn-insert-link"
                onClick={handleOpenPopover}
                title="点击在输入框光标位置插入链接"
              >
                <LinkIcon size={14} />
                <span>插入链接</span>
              </button>
            </div>
          )}
          {hasRailContent && (
            <AttachmentTrayRail
              label={railLabel}
              omnimuxAttachments={omnimuxAttachments}
              nativeAttachments={nativeAttachments}
              onRemoveOmnimux={handleRemoveOmnimux}
              onOpenOmnimux={handleOpenOmnimux}
              onRemoveNative={handleRemoveNative}
              onOpenNative={handleOpenNative}
              uploads={props.uploads}
              onRetryFile={props.onRetryFile}
              t={props.t}
            />
          )}
        </div>
      )}
      <AttachmentPreviewModal
        preview={preview}
        onClose={closePreview}
        previewLabel={translate(props.t, 'attachments.preview', '图片预览')}
        closeLabel={translate(props.t, 'attachments.closePreview', '关闭预览')}
      />
    </>
  );
};
