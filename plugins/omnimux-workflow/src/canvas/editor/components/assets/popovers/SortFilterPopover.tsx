import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { stopToolbarNativeEvent } from '../../toolbarPointerGuard';
import { useT } from '../../../../i18n';

interface SortFilterPopoverProps {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  sortValue: 'recent' | 'name' | 'count';
  onChange: (val: 'recent' | 'name' | 'count') => void;
  onClose: () => void;
}

export const SortFilterPopover: React.FC<SortFilterPopoverProps> = ({
  isOpen,
  anchorRect,
  sortValue,
  onChange,
  onClose,
}) => {
  const t = useT();
  const popoverRef = useRef<HTMLDivElement>(null);

  const getSortOptionLabel = (id: string, defaultLabel: string) => {
    switch (id) {
      case 'recent': return t('assets.popover.sortRecent') || defaultLabel;
      case 'name': return t('assets.popover.sortNameAZ') || defaultLabel;
      case 'count': return t('assets.popover.sortCount') || defaultLabel;
      default: return defaultLabel;
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  const top = anchorRect.bottom + 6;
  const left = Math.min(anchorRect.left, window.innerWidth - 180);

  const OPTIONS = [
    { id: 'recent', label: '最近更新' },
    { id: 'name', label: '名称 A-Z' },
    { id: 'count', label: '素材数量' },
  ];

  return createPortal(
    <div
      ref={popoverRef}
      className="wf-popover-portal nodrag nopan"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: '160px',
        zIndex: 9999,
      }}
      onMouseDown={stopToolbarNativeEvent}
      onPointerDown={stopToolbarNativeEvent}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="wf-popover-body">
        {OPTIONS.map((opt) => {
          const isSelected = sortValue === opt.id;
          return (
            <div
              key={opt.id}
              className={`wf-popover-item ${isSelected ? 'wf-popover-item--selected' : ''}`}
              onClick={() => {
                onChange(opt.id as any);
                onClose();
              }}
            >
              <span className="wf-popover-item-label">{getSortOptionLabel(opt.id, opt.label)}</span>
              {isSelected && <Check size={14} className="wf-popover-item-check" />}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
