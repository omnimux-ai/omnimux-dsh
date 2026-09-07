import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, FileText, ImageIcon, Music, Video } from 'lucide-react';
import { useT } from '../../../i18n';
import { rejectReasonKey } from '../../utils/connectionValidator.ts';
import { calculatePopoverPosition } from '../MaterialNode/ConfigPanel/cfg/viewportPositioner.ts';
import type { ReferenceCandidate } from './referenceCandidates.ts';

export interface MentionPopoverProps {
  open: boolean;
  position: { x: number; y: number } | null;
  query: string;
  current: ReferenceCandidate[];
  canvas: ReferenceCandidate[];
  onSelect: (token: ReferenceCandidate) => void;
  onClose: () => void;
}

function CandidateIcon({ candidate }: { candidate: ReferenceCandidate }) {
  if (candidate.mediaUrl && candidate.materialType === 'image') return <img src={candidate.mediaUrl} alt="" className="wf-mention-item__thumb" />;
  const Icon = candidate.materialType === 'text' ? FileText : candidate.materialType === 'video' ? Video : candidate.materialType === 'audio' ? Music : ImageIcon;
  return <Icon size={18} className="wf-mention-item__icon" />;
}

/** Body portals escape the panel clip and ReactFlow's transformed coordinate system. */
export default function MentionPopover({ open, position, query, current, canvas, onSelect, onClose }: MentionPopoverProps) {
  const t = useT();
  const [category, setCategory] = useState<'image' | 'text' | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [inSubmenu, setInSubmenu] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [subStyle, setSubStyle] = useState<React.CSSProperties>({});
  const matches = (item: ReferenceCandidate) => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const references = current.filter(matches);
  const children = canvas.filter((item) => item.materialType === category && matches(item));
  const rootCount = references.length + 2;
  const choose = (item: ReferenceCandidate | undefined) => { if (item && !item.reasonCode) onSelect(item); };

  useEffect(() => { setIndex(0); setCategory(null); setInSubmenu(false); }, [open, query]);
  useEffect(() => {
    if (!open) return;
    const editor = document.activeElement as HTMLElement | null;
    const rect = editor?.getBoundingClientRect();
    originRef.current = rect ? { x: rect.x, y: rect.y } : null;
    let frame = 0;
    const track = () => {
      const current = editor?.getBoundingClientRect();
      const origin = originRef.current;
      if (current && origin && (current.x !== origin.x || current.y !== origin.y)) { onClose(); return; }
      frame = requestAnimationFrame(track);
    };
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(track);
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [open, position, onClose]);
  useLayoutEffect(() => {
    if (!category || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 24);
    const height = Math.min(subRef.current?.scrollHeight ?? 300, window.innerHeight - 24);
    const rightFits = rect.right + width + 4 <= window.innerWidth - 12;
    setSubStyle({ position: 'fixed', width, left: rightFits ? rect.right + 4 : Math.max(12, rect.left - width - 4), top: Math.max(12, Math.min(rect.top, window.innerHeight - height - 12)), maxHeight: window.innerHeight - 24 });
  }, [category, query, children.length, position]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !subRef.current?.contains(event.target as Node)) onClose();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const count = inSubmenu ? children.length : rootCount;
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        setIndex((previous) => count ? (previous + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0);
      } else if (event.key === 'ArrowLeft') {
        setIndex(references.length + (category === 'text' ? 1 : 0)); setInSubmenu(false); setCategory(null);
      } else if (!inSubmenu && index >= references.length) {
        setCategory(index === references.length ? 'image' : 'text'); setInSubmenu(true); setIndex(0);
      } else if (event.key !== 'ArrowRight') choose(inSubmenu ? children[index] : references[index]);
    };
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', onClose);
    return () => { window.removeEventListener('mousedown', outside); window.removeEventListener('keydown', keydown, true); window.removeEventListener('resize', onClose); };
  }, [open, onClose, onSelect, references, children, rootCount, index, inSubmenu, category]);
  useEffect(() => {
    const root = inSubmenu ? subRef.current : rootRef.current;
    root?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [index, inSubmenu]);
  if (!open || !position || typeof document === 'undefined') return null;
  const placement = calculatePopoverPosition({ top: position.y, bottom: position.y, left: position.x, right: position.x, width: 0, height: 0 }, { width: window.innerWidth, height: window.innerHeight });
  const style: React.CSSProperties = { position: 'fixed', left: placement.left, width: Math.min(280, placement.width), maxHeight: Math.max(0, Math.min(400, placement.maxHeight, placement.placement === 'top' ? window.innerHeight - (placement.bottom ?? 0) - 12 : window.innerHeight - (placement.top ?? 0) - 12)), ...(placement.placement === 'top' ? { bottom: placement.bottom } : { top: placement.top }) };
  const renderCandidate = (item: ReferenceCandidate, itemIndex: number, submenu: boolean) => (
    <button key={`${item.nodeId}:${item.slotIndex}`} type="button" role="option" aria-selected={inSubmenu === submenu && index === itemIndex} aria-disabled={Boolean(item.reasonCode)}
      className={`wf-mention-item ${inSubmenu === submenu && index === itemIndex ? 'wf-mention-item--highlighted' : ''}`}
      onMouseEnter={() => { setInSubmenu(submenu); setIndex(itemIndex); if (!submenu) setCategory(null); }} onClick={() => choose(item)}>
      <CandidateIcon candidate={item} />
      <span className="wf-mention-item__text"><span className="wf-mention-item__name">{item.label}</span>
        {item.reasonCode ? <small>{t(rejectReasonKey(item.reasonCode))}</small> : item.availability !== 'ready' ? <small>{t(item.availability === 'waiting' ? 'mention.waiting' : 'mention.unavailable')}</small> : null}
      </span>
    </button>
  );
  return createPortal(<>
    <div ref={rootRef} className="wf-mention-popover nodrag nowheel" role="listbox" aria-label={t('mention.current')} style={style} onMouseDown={(event) => event.preventDefault()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <div className="wf-mention-popover__header">{t('mention.current')}</div>
      {references.length ? references.map((item, itemIndex) => renderCandidate(item, itemIndex, false)) : <div className="wf-mention-popover__empty">{t('mention.empty')}</div>}
      <div className="wf-mention-popover__header wf-mention-popover__divider">{t('mention.canvas')}</div>
      {(['image', 'text'] as const).map((type, offset) => <button key={type} type="button" role="option" aria-selected={!inSubmenu && index === references.length + offset} aria-haspopup="listbox" aria-expanded={category === type} className="wf-mention-item"
        onMouseEnter={() => { setCategory(type); setInSubmenu(false); setIndex(references.length + offset); }} onClick={() => { setCategory(type); setInSubmenu(true); setIndex(0); }}>
        {type === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />}<span className="wf-mention-item__name">{t(`node.type.${type}`)}</span><span>{canvas.filter((item) => item.materialType === type).length}</span><ChevronRight size={14} />
      </button>)}
    </div>
    {category && <div ref={subRef} className="wf-mention-popover wf-mention-submenu nodrag nowheel" style={subStyle} role="listbox" aria-label={t(`node.type.${category}`)} onMouseDown={(event) => event.preventDefault()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      {children.length ? children.map((item, itemIndex) => renderCandidate(item, itemIndex, true)) : <div className="wf-mention-popover__empty">{t('mention.noMatches')}</div>}
    </div>}
  </>, document.body);
}
