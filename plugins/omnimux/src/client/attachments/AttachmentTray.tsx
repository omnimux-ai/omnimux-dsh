import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AttachmentCard } from './AttachmentCard.tsx';
import { isMediaAttachment, isVideoAttachment } from './media-detector.ts';
import { Button } from 'dsh-ui-kit';
import { getGlobalAttachmentStore } from './store.ts';
import type { ConversationAttachment, DraftFileUpload } from './types.ts';
import { PromptSlotChips } from './PromptSlotChips.tsx';
import { usePromptSlotEnhancer } from './usePromptSlotEnhancer.ts';
import { ensureStylesInjected } from './trayStyles.ts';
import { insertNativeVideoChip } from './nativeVideoChip.ts';
import { COMPOSER_EDITOR_SELECTOR, focusEditorElement } from './focusEditorElement.ts';
import { useDragDrop } from './useDragDrop.ts';
import { useCommentAttachment, removeCommentAttachment } from './useCommentAttachment.ts';
import { usePasteVideoInterceptor } from './usePasteVideoInterceptor.ts';
import { VideoLinkPopover } from './VideoLinkPopover.tsx';
import { DropOverlay } from './DropOverlay.tsx';
import { getGlobalQuickShortcutStore } from '../composer-quick-shortcuts/store.js';
import {
  buildQuickLinkSlots,
  detectedSlotsDraftText,
  isQuickLinkSlotFilled,
  quickLinkLabels,
  splitQuickLinkSlots,
} from '../composer-quick-shortcuts/links.js';
import { readDraft, insertTokenAtCursor } from '../composer-quick-shortcuts/dom.js';
import { resolveComposerSessionId } from '../composer-quick-shortcuts/session.js';
import { AttachmentPreviewModal, type PreviewTarget } from './AttachmentPreviewModal.tsx';
import {
  NativeAttachmentCard,
  resolveNativeTitle,
  resolveRetryHandler,
  type NativeAttachmentUpload,
  type NativeComposerAttachment,
} from './NativeAttachmentCard.tsx';

/** 官方 DraftFileUpload：会话草稿里的上传回执（定义收敛于 ./types.ts）。 */
export type { DraftFileUpload };

export interface AttachmentTrayProps {
  attachments?: readonly any[];
  canAcceptDrop?: boolean;
  onAddFiles?: (files: readonly File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  uploads?: Readonly<Record<string, DraftFileUpload>>;
  onRetryFile?: (id: string) => void;
  dropLimits?: { readonly count: number; readonly size: string };
  getSessions?: () => any;
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
  const editor = document.querySelector(COMPOSER_EDITOR_SELECTOR);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

/** 提交桥接等模块复用同一实现；实现在 ./focusEditorElement.ts。 */
export { focusEditorElement };

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
        isMediaAttachment(att) ? (
          <NativeAttachmentCard
            key={att.id}
            attachment={{
              id: att.id,
              kind: isVideoAttachment(att) ? 'video' : 'image',
              previewUrl: att.previewUrl,
              title: att.title,
            }}
            onOpen={() => {
              if (att.previewUrl) onOpenOmnimux(att);
            }}
            onRemove={onRemoveOmnimux}
            removeAriaLabel={`移除 ${att.title}`}
          />
        ) : (
          <AttachmentCard
            key={att.id}
            attachment={att}
            onRemove={onRemoveOmnimux}
            onOpen={att.previewUrl ? onOpenOmnimux : undefined}
          />
        )
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

/** 中枢「把视线带到附件区」事件：跨插件调用方只在拿不到能力时静默跳过。 */
export const REVEAL_ATTACHMENTS_EVENT = 'omnimux:attachments:reveal';
/** 复用既有 omx-att-card--highlight / omx-att-pulse（0.6s 脉冲）的清理余量，总时长 ≤1.2s。 */
const REVEAL_HIGHLIGHT_MS = 900;
/** 附件落库通知与 React 重渲染之间有一拍延迟，首次未命中时补一次。 */
const REVEAL_RETRY_MS = 60;
const REVEAL_HIGHLIGHT_CLASS = 'omx-att-card--highlight';

/** 附件区可视容器。 */
const ATTACHMENT_DOCK_SELECTOR = '[data-omnimux-attachments-dock="true"]';
/** 卡片根节点；带 data 属性的那批由本插件托管，优先级高于原生上传卡片。 */
const ATTACHMENT_CARD_SELECTOR = '.omx-att-card';

export const AttachmentTray: React.FC<AttachmentTrayProps> = (props) => {
  const store = getGlobalAttachmentStore();
  // 会话标识走与输入框快捷方式同一条派生链（`composer-quick-shortcuts/session.js`）：
  // 两侧命中同一行，链接卡槽与技能胶囊才会落到同一个会话上。
  const currentSessionId = resolveComposerSessionId(
    props.session,
    props.sessionId,
    store.getActiveSessionId(),
  );

  const { error: commentError, retry: retryComments } = useCommentAttachment(props, currentSessionId);
  const nativeAttachments: readonly NativeComposerAttachment[] = Array.isArray(props.attachments)
    ? (props.attachments as readonly NativeComposerAttachment[])
    : [];
  const nativeUploads = props.uploads;
  const nativeOnRemove = props.onRemoveAttachment;
  const nativeOnRetry = props.onRetryFile;
  const nativeOnAddFiles = props.onAddFiles;
  const nativeDropLimits = props.dropLimits;
  const canAcceptDrop = Boolean(props.canAcceptDrop) && typeof nativeOnAddFiles === 'function';

  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);

  usePasteVideoInterceptor();
  const { slots, activeSlotIndex, selectSlot, replaceSlot } = usePromptSlotEnhancer();

  // 快捷方式带来的链接卡槽与输入框自带的变量槽位**共用同一行**：
  // 卡槽状态来自快捷方式的会话级 Store（删掉胶囊后卡槽仍在，因此可再点），
  // 输入框文本里解析出的同名令牌不再重复成第二个卡槽。
  const quickStore = getGlobalQuickShortcutStore();
  const subscribeQuick = useCallback(
    (notify: () => void) => quickStore.subscribe(currentSessionId, notify),
    [quickStore, currentSessionId],
  );
  const getQuickSnapshot = useCallback(
    () => quickStore.getSnapshot(currentSessionId),
    [quickStore, currentSessionId],
  );
  const quickState = useSyncExternalStore(subscribeQuick, getQuickSnapshot, getQuickSnapshot);

  const quickLabels = quickLinkLabels(props.t);
  const quickLinkSlots = buildQuickLinkSlots(quickState.links, quickLabels);
  const quickTokens = new Set(quickLinkSlots.map((slot) => slot.raw));
  const derivedSlots = slots.filter((slot) => !quickTokens.has(slot.raw));
  const mergedSlots = quickLinkSlots.length > 0 ? [...quickLinkSlots, ...derivedSlots] : derivedSlots;
  // 两态判据随草稿响应式重算：输入框已解析出的令牌就是草稿文本的投影
  // （`detectedSlotsDraftText`），因此不在渲染期读 DOM。
  const { filledIds: quickFilledIds } = splitQuickLinkSlots(detectedSlotsDraftText(slots), quickLinkSlots);
  // 合并数组把快捷卡槽排在最前，输入框自带槽位整体后移：按槽位 id 重新定位高亮，
  // 否则索引落在原数组上会高亮到别的槽位。
  const activeSlot = activeSlotIndex === null || activeSlotIndex === undefined
    ? null
    : slots[activeSlotIndex] || null;
  const mergedActiveSlotIndex = activeSlot
    ? mergedSlots.findIndex((slot) => slot.id === activeSlot.id)
    : null;
  const resolvedActiveSlotIndex = mergedActiveSlotIndex === -1 ? null : mergedActiveSlotIndex;
  const dragActive = useDragDrop({
    canAcceptDrop,
    onAddFiles: nativeOnAddFiles,
  });

  useEffect(() => {
    ensureStylesInjected();
  }, []);

  // 「把视线带到附件区」：滚动到可见 + 末张卡片一次克制高亮。
  // 由 `__omnimuxComposerActions.revealAttachments()` 派发（其同时聚焦输入框）。
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let highlighted: HTMLElement | null = null;

    const clearHighlight = () => {
      if (highlightTimer !== null) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
      }
      if (highlighted) {
        highlighted.classList.remove(REVEAL_HIGHLIGHT_CLASS);
        highlighted = null;
      }
    };

    const highlightLatestCard = (): boolean => {
      const dock = document.querySelector(ATTACHMENT_DOCK_SELECTOR);
      if (!dock) return false;
      try {
        dock.scrollIntoView?.({ block: 'nearest' });
      } catch {
        /* 非可滚动容器忽略 */
      }
      const owned = dock.querySelectorAll<HTMLElement>(`${ATTACHMENT_CARD_SELECTOR}[data-omnimux-attachment-id]`);
      const all = dock.querySelectorAll<HTMLElement>(ATTACHMENT_CARD_SELECTOR);
      const pool = owned.length > 0 ? owned : all;
      if (pool.length === 0) return false;

      clearHighlight();
      highlighted = pool[pool.length - 1];
      highlighted.classList.add(REVEAL_HIGHLIGHT_CLASS);
      highlightTimer = setTimeout(clearHighlight, REVEAL_HIGHLIGHT_MS);
      return true;
    };

    const handleReveal = () => {
      // 先给出即时反馈（导轨里已有卡片时就是它）。
      highlightLatestCard();
      // 再补一次确认：附件落库通知与 React 重渲染之间有一拍延迟，首帧的「末张」可能还是上一张，
      // 补读一次让高亮落到刚落库的新卡片上；已有待执行的重试则不重复排程。
      if (retryTimer !== null) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        highlightLatestCard();
      }, REVEAL_RETRY_MS);
    };

    window.addEventListener(REVEAL_ATTACHMENTS_EVENT, handleReveal);
    return () => {
      window.removeEventListener(REVEAL_ATTACHMENTS_EVENT, handleReveal);
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      clearHighlight();
    };
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
    if (typeof nativeOnRemove === 'function') {
      nativeOnRemove(id);
      removeCommentAttachment(currentSessionId, id);
    }
  }, [nativeOnRemove, currentSessionId]);

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
  const dropDesc = canAcceptDrop && nativeDropLimits
    ? translate(props.t, 'attachments.dropDesc', '最多 {count} 张，单张不超过 {size}', nativeDropLimits)
    : '';

  return (
    <>
      <DropOverlay active={dragActive} title={dropTitle} description={dropDesc} disabled={!canAcceptDrop} />
      {commentError && <div role="alert">{commentError}<Button onClick={retryComments}>重试评论附件</Button></div>}
      {SHOW_MANUAL_LINK_BUTTON && (
        <VideoLinkPopover
          isOpen={isPopoverOpen}
          onClose={handleClosePopover}
          onConfirm={handleConfirmInsert}
        />
      )}
      <PromptSlotChips
        slots={mergedSlots}
        activeSlotIndex={resolvedActiveSlotIndex}
        onSelectSlot={(slot) => {
          // 快捷链接卡槽：胶囊已被删掉才会走到这里（存在时卡槽不可点），
          // 点击即把胶囊插回光标处，不再打开任何选择器。
          if (slot && (slot as { quickLinkKind?: string }).quickLinkKind) {
            // 入口再判一次：禁用态滞后一拍时不重复插入同名令牌。
            if (isQuickLinkSlotFilled(readDraft(), slot)) return;
            insertTokenAtCursor(slot.raw);
            return;
          }
          const index = Array.isArray(slots) ? slots.findIndex((item) => item.id === slot.id) : -1;
          selectSlot(slot, index);
        }}
        onReplaceSlot={replaceSlot}
        onAddFiles={nativeOnAddFiles}
        onAddProductAttachment={handleAddProductAttachment}
        disabledSlotIds={quickFilledIds}
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
              uploads={nativeUploads}
              onRetryFile={nativeOnRetry}
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
