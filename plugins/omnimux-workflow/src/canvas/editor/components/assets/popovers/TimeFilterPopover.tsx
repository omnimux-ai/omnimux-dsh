import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { stopToolbarNativeEvent } from '../../toolbarPointerGuard';
import { useT } from '../../../../i18n';

interface TimeFilterPopoverProps {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  sortOrder: 'desc' | 'asc';
  timeRange: 'all' | 'today' | '7d' | '30d' | 'custom';
  onSortChange: (sort: 'desc' | 'asc') => void;
  onRangeChange: (range: 'all' | 'today' | '7d' | '30d' | 'custom') => void;
  onClose: () => void;
}

export const TimeFilterPopover: React.FC<TimeFilterPopoverProps> = ({
  isOpen,
  anchorRect,
  sortOrder,
  timeRange,
  onSortChange,
  onRangeChange,
  onClose,
}) => {
  const t = useT();
  const popoverRef = useRef<HTMLDivElement>(null);

  const getRangeLabel = (id: string, defaultLabel: string) => {
    switch (id) {
      case 'all': return t('assets.popover.all') || defaultLabel;
      case 'today': return t('assets.popover.today') || defaultLabel;
      case '7d': return t('assets.popover.last7Days') || defaultLabel;
      case '30d': return t('assets.popover.last30Days') || defaultLabel;
      case 'custom': return t('assets.popover.custom') || defaultLabel;
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
  const left = Math.min(anchorRect.left, window.innerWidth - 160);

  return createPortal(
    <div
      ref={popoverRef}
      className="wf-popover-portal nodrag nopan"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: '145px',
        zIndex: 9999,
      }}
      onMouseDown={stopToolbarNativeEvent}
      onPointerDown={stopToolbarNativeEvent}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="wf-popover-body">
        <div
          className={`wf-popover-item ${sortOrder === 'desc' ? 'wf-popover-item--selected' : ''}`}
          onClick={() => onSortChange('desc')}
        >
          <span className="wf-popover-item-label">{t('assets.popover.sortNewest') || '最新优先'}</span>
          {sortOrder === 'desc' && <Check size={14} className="wf-popover-item-check" />}
        </div>
        <div
          className={`wf-popover-item ${sortOrder === 'asc' ? 'wf-popover-item--selected' : ''}`}
          onClick={() => onSortChange('asc')}
        >
          <span className="wf-popover-item-label">{t('assets.popover.sortOldest') || '最旧优先'}</span>
          {sortOrder === 'asc' && <Check size={14} className="wf-popover-item-check" />}
        </div>
      </div>

      <div className="wf-popover-divider" />

      <div className="wf-popover-body">
        {[
          { id: 'all', label: '全部' },
          { id: 'today', label: '今天' },
          { id: '7d', label: '近 7 天' },
          { id: '30d', label: '近 30 天' },
          { id: 'custom', label: '自定义' },
        ].map((item) => {
          const isSelected = timeRange === item.id;
          return (
            <div
              key={item.id}
              className={`wf-popover-item ${isSelected ? 'wf-popover-item--selected' : ''}`}
              onClick={() => onRangeChange(item.id as typeof timeRange)}
            >
              <span className="wf-popover-item-label">{getRangeLabel(item.id, item.label)}</span>
              {isSelected && <Check size={14} className="wf-popover-item-check" />}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};
