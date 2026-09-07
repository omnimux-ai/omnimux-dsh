/**
 * MentionPopover — 联想推荐浮层组件 (Issue #714 / T04).
 *
 * 1. 键入 @ 时弹出，展示当前节点的 activeSlots 与 overflowPool 素材；
 * 2. 展示模态图标、缩略图、文件名、所属槽位状态（如 [槽位 1]、[候选池]）；
 * 3. 键盘上下箭头导航、Enter / Tab 确认插入、Escape 取消。
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ImageIcon, Video, Music, FileText } from 'lucide-react';
import type { MaterialType } from '../../../../shared/graph/materialNode.ts';
import type {
  NodeSlotEngineState,
  PromptReferenceToken,
} from '../../../../shared/graph/slotContractTypes.ts';

export interface MentionCandidate {
  nodeId: string;
  slotIndex: number;
  label: string;
  materialType: MaterialType;
  mediaUrl?: string;
  statusLabel: string;
  isOverflow?: boolean;
}

export interface MentionPopoverProps {
  open: boolean;
  position: { x: number; y: number } | null;
  slotState?: NodeSlotEngineState;
  onSelect: (token: PromptReferenceToken) => void;
  onClose: () => void;
}

function renderModalIcon(type: MaterialType) {
  switch (type) {
    case 'image':
      return <ImageIcon size={12} className="wf-mention-item__icon" />;
    case 'video':
      return <Video size={12} className="wf-mention-item__icon" />;
    case 'audio':
      return <Music size={12} className="wf-mention-item__icon" />;
    default:
      return <FileText size={12} className="wf-mention-item__icon" />;
  }
}

export const MentionPopover: React.FC<MentionPopoverProps> = ({
  open,
  position,
  slotState,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 构造推荐候选项列表：活跃卡槽 + 候选池素材
  const candidates = React.useMemo<MentionCandidate[]>(() => {
    if (!slotState) return [];
    const list: MentionCandidate[] = [];

    // 1. 活跃槽位项
    for (const slot of slotState.activeSlots) {
      list.push({
        nodeId: slot.sourceNodeId,
        slotIndex: slot.slotIndex,
        label: slot.label,
        materialType: slot.materialType,
        mediaUrl: slot.mediaUrl,
        statusLabel: `[槽位 ${slot.slotIndex + 1}]`,
        isOverflow: false,
      });
    }

    // 2. 候选池项
    slotState.overflowPool.forEach((item, idx) => {
      list.push({
        nodeId: item.sourceNodeId,
        slotIndex: slotState.activeSlots.length + idx,
        label: item.label,
        materialType: item.materialType,
        mediaUrl: item.mediaUrl,
        statusLabel: '[候选池]',
        isOverflow: true,
      });
    });

    return list;
  }, [slotState]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [candidates]);

  // 键盘快捷键监听
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (candidates.length === 0 ? 0 : (prev + 1) % candidates.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          candidates.length === 0 ? 0 : (prev - 1 + candidates.length) % candidates.length,
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (candidates.length > 0) {
          e.preventDefault();
          const target = candidates[selectedIndex];
          if (target) {
            onSelect({
              raw: `@ref[${target.nodeId}:${target.slotIndex}:${target.label}]`,
              nodeId: target.nodeId,
              slotIndex: target.slotIndex,
              label: target.label,
              materialType: target.materialType,
              mediaUrl: target.mediaUrl,
            });
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, candidates, selectedIndex, onSelect, onClose]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const style: React.CSSProperties = position
    ? {
        left: Math.max(0, position.x),
        top: position.y + 4,
      }
    : {
        left: 0,
        top: '100%',
      };

  return (
    <div
      ref={containerRef}
      className="wf-mention-popover nodrag nowheel"
      style={style}
      role="listbox"
      aria-label="引用素材"
    >
      <div className="wf-mention-popover__header">引用素材（上下键选择，回车插入）</div>

      {candidates.length === 0 ? (
        <div className="wf-mention-popover__empty">当前暂无连接的上游素材</div>
      ) : (
        candidates.map((cand, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={`${cand.nodeId}-${cand.slotIndex}`}
              type="button"
              className={`wf-mention-item ${isSelected ? 'wf-mention-item--highlighted' : ''}`}
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                onSelect({
                  raw: `@ref[${cand.nodeId}:${cand.slotIndex}:${cand.label}]`,
                  nodeId: cand.nodeId,
                  slotIndex: cand.slotIndex,
                  label: cand.label,
                  materialType: cand.materialType,
                  mediaUrl: cand.mediaUrl,
                });
              }}
            >
              {cand.mediaUrl && cand.materialType === 'image' ? (
                <img src={cand.mediaUrl} alt={cand.label} className="wf-mention-item__thumb" />
              ) : (
                renderModalIcon(cand.materialType)
              )}
              <span className="wf-mention-item__name">{cand.label}</span>
              <span className="wf-mention-item__badge">{cand.statusLabel}</span>
            </button>
          );
        })
      )}
    </div>
  );
};

export default MentionPopover;
