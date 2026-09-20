import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { stopToolbarNativeEvent } from '../../toolbarPointerGuard';
import { useT } from '../../../../i18n';

interface TypeFilterPopoverProps {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  selectedTypes: string[];
  onChange: (types: string[]) => void;
  onClose: () => void;
}

export const SUB_TYPE_IDS = ['image', 'video', 'audio', 'text', 'other'] as const;

export const TYPE_OPTIONS = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: 'text', label: '文本' },
  { id: 'other', label: '其他' },
] as const;

export const TypeFilterPopover: React.FC<TypeFilterPopoverProps> = ({
  isOpen,
  anchorRect,
  selectedTypes,
  onChange,
  onClose,
}) => {
  const t = useT();
  const popoverRef = useRef<HTMLDivElement>(null);

  const getOptionLabel = (id: string, defaultLabel: string) => {
    switch (id) {
      case 'all': return t('assets.popover.all') || defaultLabel;
      case 'image': return t('assets.popover.image') || defaultLabel;
      case 'video': return t('assets.popover.video') || defaultLabel;
      case 'audio': return t('assets.popover.audio') || defaultLabel;
      case 'text': return t('assets.popover.text') || defaultLabel;
      case 'other': return t('assets.popover.other') || defaultLabel;
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

  // 默认全选状态：selectedTypes 为空数组，或者包含了全部 5 种子类型
  const isAllSelected =
    selectedTypes.length === 0 ||
    SUB_TYPE_IDS.every((t) => selectedTypes.includes(t));

  const isOptionChecked = (id: string): boolean => {
    if (id === 'all') return isAllSelected;
    if (isAllSelected) return true;
    return selectedTypes.includes(id);
  };

  const toggleType = (id: string) => {
    if (id === 'all') {
      // 点击「全部」：如果当前已经是全选，则全清空（都不选）；否则直接回到全选
      if (isAllSelected) {
        onChange(['__none__']); // 传特殊哨兵或空选择
      } else {
        onChange([]); // 回到默认全选
      }
      return;
    }

    if (isAllSelected) {
      // 默认全选时，任意点击一个类型取消：把「全部」和该类型一起取消，保留其余类型
      const remaining = SUB_TYPE_IDS.filter((t) => t !== id);
      onChange(remaining);
      return;
    }

    // 非全选状态下做常规多选切换
    let next: string[];
    if (selectedTypes.includes('__none__')) {
      next = [id];
    } else if (selectedTypes.includes(id)) {
      next = selectedTypes.filter((t) => t !== id);
      if (next.length === 0) {
        next = ['__none__'];
      }
    } else {
      next = [...selectedTypes.filter((t) => t !== '__none__'), id];
    }

    // 如果所有子类型都被勾选齐了，自动升为全选（清空哨兵归一）
    if (SUB_TYPE_IDS.every((t) => next.includes(t))) {
      onChange([]);
    } else {
      onChange(next);
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
        width: '140px',
        zIndex: 9999,
      }}
      onMouseDown={stopToolbarNativeEvent}
      onPointerDown={stopToolbarNativeEvent}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="wf-popover-body">
        {TYPE_OPTIONS.map((opt) => {
          const checked = isOptionChecked(opt.id);
          return (
            <div
              key={opt.id}
              className={`wf-popover-item ${checked ? 'wf-popover-item--selected' : ''}`}
              onClick={() => toggleType(opt.id)}
            >
              <div className="wf-popover-item-left">
                <div className={`wf-popover-check-circle ${checked ? 'wf-popover-check-circle--checked' : ''}`}>
                  {checked && <Check size={10} strokeWidth={3} />}
                </div>
                <span className="wf-popover-item-label">{getOptionLabel(opt.id, opt.label)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};
