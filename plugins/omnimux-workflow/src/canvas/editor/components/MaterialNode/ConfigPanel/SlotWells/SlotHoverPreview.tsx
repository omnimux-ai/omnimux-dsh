import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../../../../i18n';
import { calculatePopoverPosition } from '../cfg/viewportPositioner.ts';
import type { PopoverPosition } from '../cfg/types.ts';
import type { UpstreamMediaItem } from '../../../../hooks/useUpstreamMedia.ts';

interface SlotHoverPreviewProps {
  anchor: HTMLElement;
  upstream?: UpstreamMediaItem;
  onReplace?: () => void;
  state?: 'ready' | 'inactive' | 'pending' | 'invalid';
  reasonCode?: string;
  onReturnFocus?: (anchor: HTMLElement) => void;
  use?: 'active' | 'inactive';
  onSetUse?: (use: 'active' | 'inactive') => void;
  onClose: () => void;
}

/** 操作行高度预算：32px 按钮 + 卡片上下内边距 + 与媒体的间距。媒体先让位，操作行始终留在卡内。 */
const ACTION_ROW_HEIGHT = 56;

/** One hover region spans thumbnail, gap, preview and action, outside the clipped canvas. */
export default function SlotHoverPreview({ anchor, upstream, state, reasonCode, onReturnFocus, onReplace, use = 'active', onSetUse, onClose }: SlotHoverPreviewProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  useEffect(() => {
    let frame = 0;
    let previous = '';
    const update = () => {
      if (!anchor.isConnected) { onClose(); return; }
      const rect = anchor.getBoundingClientRect();
      const signature = `${rect.x}:${rect.y}:${rect.width}:${rect.height}:${window.innerWidth}:${window.innerHeight}`;
      if (signature !== previous) {
        previous = signature;
        setPosition(calculatePopoverPosition(rect, { width: window.innerWidth, height: window.innerHeight }, 240));
      }
      frame = requestAnimationFrame(update);
    };
    update();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const move = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchor.contains(target) || panelRef.current?.contains(target)) cancel();
      else if (!timer) timer = setTimeout(onClose, 180);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose();
        if (onReturnFocus) onReturnFocus(anchor); else anchor.focus(); }
      else if (event.key === 'Tab' && document.activeElement === anchor && !event.shiftKey) {
        const action = panelRef.current?.querySelector<HTMLButtonElement>('button');
        if (action) { event.preventDefault(); action.focus(); }
      }
    };
    const outside = (event: PointerEvent) => { if (!anchor.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) onClose(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    return () => { cancelAnimationFrame(frame); cancel(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true); };
  }, [anchor, onClose, onReturnFocus]);
  if (!position) return null;
  const available = Math.max(0, Math.min(position.maxHeight, position.placement === 'top' ? window.innerHeight - (position.bottom ?? 0) - 12 : window.innerHeight - (position.top ?? 0) - 12));
  const hasActions = Boolean(onReplace || onSetUse);
  const mediaMaxHeight = Math.max(0, available - (hasActions ? ACTION_ROW_HEIGHT : 16));
  const media = state === 'invalid' || state === 'pending' ? <span>{t(reasonCode === 'input_unavailable' ? 'input.state.unavailable'
    : state === 'pending' ? 'input.state.pending' : 'input.state.invalid')}</span>
    : upstream?.url && upstream.availability === 'ready' && upstream.materialType === 'image' ? <img src={upstream.url} alt={upstream.label} style={{ maxHeight: mediaMaxHeight }} />
      : upstream?.url && upstream.availability === 'ready' && upstream.materialType === 'video' ? <video src={upstream.url} muted controls style={{ maxHeight: mediaMaxHeight }} />
        : upstream?.url && upstream.availability === 'ready' && upstream.materialType === 'audio' ? <audio src={upstream.url} controls />
          : upstream?.textContent && upstream.availability === 'ready' ? <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{upstream.textContent}</span>
            : <span>{t(upstream?.availability === 'unavailable' ? 'input.state.unavailable' : 'input.state.pending')}</span>;
  return createPortal(
    <div ref={panelRef} className="wf-slot-hover-preview nodrag nowheel" role="dialog" aria-label={t('mention.preview')}
      style={{ position: 'fixed', left: position.left, width: position.width, maxHeight: available, ...(position.placement === 'top' ? { bottom: position.bottom } : { top: position.top }) }}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <div className="wf-slot-hover-preview__media">{media}</div>
      {hasActions ? (
        <div className="wf-slot-hover-preview__actions">
          {onReplace && <button type="button" className="wf-slot-well__replace-pill nodrag" aria-label={t('node.replace')} onClick={(event) => { event.stopPropagation(); onReplace(); onClose(); }}>{t('node.replace')}</button>}
          {onSetUse && <button type="button" className="wf-slot-well__replace-pill nodrag" onClick={event => { event.stopPropagation(); onSetUse(use === 'inactive' ? 'active' : 'inactive'); onClose(); }}>{t(use === 'inactive' ? 'input.use' : 'input.disable')}</button>}
        </div>
      ) : null}
    </div>, document.body,
  );
}
