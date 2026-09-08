import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../../../../i18n';
import { calculatePopoverPosition } from '../cfg/viewportPositioner.ts';
import type { PopoverPosition } from '../cfg/types.ts';
import type { UpstreamMediaItem } from '../../../../hooks/useUpstreamMedia.ts';

interface SlotHoverPreviewProps {
  anchor: HTMLElement;
  upstream?: UpstreamMediaItem;
  onReplace: () => void;
  onClose: () => void;
}

/** One hover region spans thumbnail, gap, preview and action, outside the clipped canvas. */
export default function SlotHoverPreview({ anchor, upstream, onReplace, onClose }: SlotHoverPreviewProps) {
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
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    const outside = (event: PointerEvent) => { if (!anchor.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) onClose(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    return () => { cancelAnimationFrame(frame); cancel(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true); };
  }, [anchor, onClose]);
  if (!position) return null;
  const available = Math.max(0, Math.min(position.maxHeight, position.placement === 'top' ? window.innerHeight - (position.bottom ?? 0) - 12 : window.innerHeight - (position.top ?? 0) - 12));
  return createPortal(
    <div ref={panelRef} className="wf-slot-hover-preview nodrag nowheel" role="dialog" aria-label={t('mention.preview')}
      style={{ position: 'fixed', left: position.left, width: position.width, maxHeight: available, ...(position.placement === 'top' ? { bottom: position.bottom } : { top: position.top }) }}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      {upstream?.url && upstream.availability === 'ready' && upstream.materialType === 'image' ? <img src={upstream.url} alt={upstream.label} style={{ maxHeight: Math.max(0, available - 56) }} />
        : upstream?.url && upstream.availability === 'ready' && upstream.materialType === 'video' ? <video src={upstream.url} muted controls style={{ maxHeight: Math.max(0, available - 56) }} />
          : <span>{t(upstream?.availability === 'unavailable' ? 'mention.unavailable' : 'mention.waiting')}</span>}
      <button type="button" className="wf-slot-well__replace-pill nodrag" aria-label={t('node.replaceMaterial')} onClick={(event) => { event.stopPropagation(); onReplace(); onClose(); }}>{t('node.replaceMaterial')}</button>
    </div>, document.body,
  );
}
