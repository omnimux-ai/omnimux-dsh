import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'dsh-ui-kit';
import { validLinkUrl, type LinkKind } from './linkReference.ts';
import { ensureStylesInjected } from './trayStyles.ts';

export type LinkPopoverCloseReason = 'cancel' | 'outside' | 'replaced' | 'unmounted' | 'success';

export interface VideoLinkPopoverProps {
  isOpen: boolean;
  anchor: HTMLElement | null;
  onClose: (reason?: LinkPopoverCloseReason) => void;
  onConfirm: (url: string) => Promise<boolean> | boolean;
  kind?: LinkKind;
  t?: (key: string, vars?: any) => string;
}

export const VideoLinkPopover: React.FC<VideoLinkPopoverProps> = ({ isOpen, anchor, onClose, onConfirm, kind = 'video', t }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const composing = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: 0, top: 0, width: 420, maxHeight: 600 });

  useLayoutEffect(() => {
    if (!isOpen || !anchor) return;
    ensureStylesInjected();
    generation.current += 1;
    locked.current = false;
    composing.current = false;
    setBusy(false);
    setUrl('');
    setError('');
    const claim = new Event('omnimux:link-popover-open');
    document.dispatchEvent(claim);
    const replace = () => close.current('replaced');
    document.addEventListener('omnimux:link-popover-open', replace);
    const reposition = () => {
      if (!anchor.isConnected) return close.current('unmounted');
      const rect = anchor.getBoundingClientRect();
      const column = anchor.closest('[data-phase]') ?? anchor.closest('[data-session-id]');
      const bounds = column?.getBoundingClientRect();
      const leftEdge = Math.max(12, (bounds?.left ?? 0) + 12);
      const rightEdge = Math.min(window.innerWidth - 12, (bounds?.right ?? window.innerWidth) - 12);
      if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= leftEdge || rect.left >= rightEdge || rightEdge <= leftEdge) return close.current('unmounted');
      const width = Math.min(420, rightEdge - leftEdge);
      const height = card.current?.getBoundingClientRect().height || 150;
      const topEdge = Math.max(12, (bounds?.top ?? 0) + 12);
      const bottomEdge = Math.min(window.innerHeight - 12, (bounds?.bottom ?? window.innerHeight) - 12);
      const above = rect.top - 8 - topEdge;
      const below = bottomEdge - rect.bottom - 8;
      const useAbove = above >= height || above >= below;
      const maxHeight = Math.max(0, useAbove ? above : below);
      if (maxHeight < 32) return close.current('unmounted');
      const top = useAbove ? Math.max(topEdge, rect.top - 8 - Math.min(height, maxHeight)) : rect.bottom + 8;
      setPosition({ left: Math.max(leftEdge, Math.min(rect.left, rightEdge - width)), top, width, maxHeight });
    };
    reposition();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(reposition) : null;
    observer?.observe(anchor);
    if (card.current) observer?.observe(card.current);
    const visibility = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) close.current('unmounted'); })
      : null;
    visibility?.observe(anchor);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const outside = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) {
        close.current('outside');
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current('cancel');
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    input.current?.focus();
    return () => {
      generation.current += 1;
      document.removeEventListener('omnimux:link-popover-open', replace);
      observer?.disconnect();
      visibility?.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [isOpen, anchor, kind]);

  useEffect(() => { if (!isOpen) { setUrl(''); setError(''); } }, [isOpen]);

  const translate = (key: string, fallback: string) => {
    if (typeof t !== 'function') return fallback;
    const value = t(key);
    return typeof value === 'string' && value && value !== key ? value : fallback;
  };

  const title = kind === 'video'
    ? translate('attachments.popover.videoTitle', '添加视频链接')
    : translate('attachments.popover.productTitle', '添加商品链接');
  const placeholder = kind === 'video'
    ? translate('attachments.popover.videoPlaceholder', '粘贴视频链接')
    : translate('attachments.popover.productPlaceholder', '粘贴商品页面链接');
  const hint = kind === 'video'
    ? translate('attachments.popover.videoHint', '添加参考视频，用于拆解或复刻。')
    : translate('attachments.popover.productHint', '添加商品页面，用于介绍产品或制作带货视频。');
  const invalidUrlError = translate('attachments.popover.invalidUrl', '请粘贴一个完整的 http 或 https 链接');
  const addFailedError = translate('attachments.popover.addFailed', '未能添加链接，请重试');
  const closeLabel = translate('attachments.popover.close', '关闭');
  const addLabel = translate('attachments.popover.add', '添加');

  const confirm = async () => {
    if (locked.current || composing.current || !url.trim()) return;
    const value = validLinkUrl(url);
    if (!value) { setError(invalidUrlError); return; }
    locked.current = true;
    setBusy(true);
    setError('');
    const operation = generation.current;
    try {
      const accepted = await onConfirm(value);
      if (operation !== generation.current) return;
      if (accepted) close.current('success');
      else setError(addFailedError);
    } catch {
      if (operation === generation.current) setError(addFailedError);
    } finally {
      if (operation === generation.current) { locked.current = false; setBusy(false); }
    }
  };

  if (!isOpen || !anchor || typeof document === 'undefined') return null;

  return createPortal(
    <div ref={card} className="omx-link-popover" role="dialog" aria-label={title}
      style={position} /* exempt-ui02 dynamic anchor geometry */
      onKeyDown={event => {
        event.stopPropagation();
        if (event.target === input.current && event.key === 'Enter' && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault();
          void confirm();
        }
      }}>
      <div className="omx-link-popover-header">
        <span className="omx-link-popover-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>{title}</span>
        <Button type="button" className="omx-link-popover-close" aria-label={closeLabel} onClick={() => close.current('cancel')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></Button>
      </div>
      <div className="omx-link-popover-form">
        <input ref={input} aria-label={placeholder} placeholder={placeholder} value={url} type="text" autoComplete="off"
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onChange={event => { setUrl(event.target.value); setError(''); }} />
        <Button type="button" className="omx-link-popover-add" disabled={!url.trim() || busy} onClick={() => void confirm()}>{addLabel}</Button>
      </div>
      {error ? <p role="alert" className="omx-link-popover-error">{error}</p> : <p>{hint}</p>}
    </div>, document.body,
  );
};
