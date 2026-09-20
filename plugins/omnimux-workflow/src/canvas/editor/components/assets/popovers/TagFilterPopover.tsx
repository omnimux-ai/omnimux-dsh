import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { stopToolbarNativeEvent } from '../../toolbarPointerGuard';
import type { TagInfo } from '../types';
import { useT } from '../../../../i18n';

interface TagFilterPopoverProps {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
}

export const TAG_OPTIONS: TagInfo[] = [
  { id: 'person', name: '人物', color: '#f87171' },
  { id: 'scene', name: '场景', color: '#fb923c' },
  { id: 'draft', name: '待定版', color: '#facc15' },
  { id: 'final', name: '最终版', color: '#4ade80' },
  { id: 'prop', name: '道具', color: '#38bdf8' },
  { id: 'voice', name: '音色', color: '#c084fc' },
  { id: 'costume', name: '服装', color: '#818cf8' },
];

export const TagFilterPopover: React.FC<TagFilterPopoverProps> = ({
  isOpen,
  anchorRect,
  selectedTags,
  onChange,
  onClose,
}) => {
  const t = useT();
  const popoverRef = useRef<HTMLDivElement>(null);

  const getTagName = (id: string, defaultName: string) => {
    switch (id) {
      case 'person': return t('assets.tag.character') || defaultName;
      case 'scene': return t('assets.tag.scene') || defaultName;
      case 'draft': return t('assets.tag.draft') || defaultName;
      case 'final': return t('assets.tag.final') || defaultName;
      case 'prop': return t('assets.tag.prop') || defaultName;
      case 'voice': return t('assets.tag.voice') || defaultName;
      case 'costume': return t('assets.tag.costume') || defaultName;
      default: return defaultName;
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
  const left = Math.min(anchorRect.left, window.innerWidth - 150);

  const toggleTag = (id: string) => {
    if (selectedTags.includes(id)) {
      onChange(selectedTags.filter((t) => t !== id));
    } else {
      onChange([...selectedTags, id]);
    }
  };

  return createPortal(
    <div
      ref={popoverRef}
      className="wf-popover-portal nodrag nopan"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: '136px',
        zIndex: 9999,
      }}
      onMouseDown={stopToolbarNativeEvent}
      onPointerDown={stopToolbarNativeEvent}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="wf-popover-body">
        {TAG_OPTIONS.map((tag) => {
          const isSelected = selectedTags.includes(tag.id);
          return (
            <div
              key={tag.id}
              className={`wf-popover-item ${isSelected ? 'wf-popover-item--selected' : ''}`}
              onClick={() => toggleTag(tag.id)}
            >
              <div className="wf-popover-item-left">
                <span className="wf-popover-tag-dot" style={{ backgroundColor: tag.color }} />
                <span className="wf-popover-item-label">{getTagName(tag.id, tag.name)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};
