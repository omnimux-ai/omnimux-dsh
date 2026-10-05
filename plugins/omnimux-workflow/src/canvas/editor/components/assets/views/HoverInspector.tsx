import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import type { AssetItem, CanvasNodeItem, HoverInspectorAnchorRect } from '../types';
import { MediaThumb } from '../MediaThumb';

export interface HoverInspectorProps {
  isOpen: boolean;
  x?: number;
  y?: number;
  anchorRect?: HoverInspectorAnchorRect | null;
  drawerLeft?: number;
  item: AssetItem | CanvasNodeItem | null;
}

export const HoverInspector: React.FC<HoverInspectorProps> = ({
  isOpen,
  x = 0,
  y = 0,
  anchorRect,
  drawerLeft,
  item,
}) => {
  const inspectorRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !item) return null;

  const cardWidth = 260;
  // 卡片只剩缩略图区域（140px）+ 上下各 1px 边框；首帧测量前的兜底值须与之对齐。
  const cardHeight = inspectorRef.current?.offsetHeight || 142;

  // 定位计算：始终固定在侧边栏外侧左侧，垂直方向对齐素材条目
  let left: number;
  let top: number;

  if (anchorRect) {
    // 侧边栏外侧左侧：使用侧边栏左边缘（或条目左边缘）减去卡片宽度与间隙
    const sidebarLeft = drawerLeft ?? anchorRect.left;
    left = sidebarLeft - cardWidth - 8;
    top = anchorRect.top;
  } else {
    // 降级兜底：基于鼠标位置
    left = x - cardWidth - 15;
    top = y - 20;
  }

  // 边界保护：确保不超出视口
  if (left < 10) {
    left = 10;
  }

  const maxTop = window.innerHeight - cardHeight - 12;
  if (top > maxTop) {
    top = maxTop;
  }
  if (top < 12) {
    top = 12;
  }

  const node = 'nodeKind' in item ? (item as CanvasNodeItem) : null;
  const asset = node ? null : (item as AssetItem);

  return createPortal(
    <div
      ref={inspectorRef}
      className="wf-hover-inspector-portal nodrag nopan"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
        zIndex: 10001,
        pointerEvents: 'none',
      }}
    >
      {/* 缩略图大图展示 */}
      <div className="wf-hover-inspector-preview">
        <MediaThumb
          kind={node ? node.type : asset?.type}
          url={item.previewUrl}
          alt={item.name}
          className="wf-hover-inspector-img"
          fallback={
            <div className="wf-hover-inspector-placeholder">
              <Sparkles size={28} className="wf-hover-inspector-placeholder-icon" />
            </div>
          }
        />
        {asset?.duration && (
          <span className="wf-hover-inspector-duration">{asset.duration}</span>
        )}
      </div>
    </div>,
    document.body
  );
};
