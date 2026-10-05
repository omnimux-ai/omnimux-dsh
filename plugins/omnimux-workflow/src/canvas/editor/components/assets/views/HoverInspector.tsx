import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Calendar, HardDrive, Maximize2, Tag } from 'lucide-react';
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
  const cardHeight = inspectorRef.current?.offsetHeight || 290;

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

  const formattedDate = item.updatedAt
    ? new Date(item.updatedAt).toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '2026-08-28 14:30';

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

      {/* 详细属性信息 */}
      <div className="wf-hover-inspector-content">
        <div className="wf-hover-inspector-title" title={item.name}>
          {item.name}
          {node?.nodeKind ? (
            <span className={`wf-node-kind-badge wf-node-kind-badge--${node.nodeKind}`}>
              {node.nodeKind === 'import' ? '导入' : '生成'}
            </span>
          ) : null}
        </div>

        <div className="wf-hover-inspector-grid">
          <div className="wf-hover-inspector-row">
            <span className="wf-hover-inspector-label">
              <Calendar size={12} /> 更新时间
            </span>
            <span className="wf-hover-inspector-value">{formattedDate}</span>
          </div>

          {asset?.resolution && (
            <div className="wf-hover-inspector-row">
              <span className="wf-hover-inspector-label">
                <Maximize2 size={12} /> 分辨率
              </span>
              <span className="wf-hover-inspector-value">{asset.resolution}</span>
            </div>
          )}

          {asset?.size && (
            <div className="wf-hover-inspector-row">
              <span className="wf-hover-inspector-label">
                <HardDrive size={12} /> 文件大小
              </span>
              <span className="wf-hover-inspector-value">{asset.size}</span>
            </div>
          )}

          {node?.nodeKind === 'import' && node.real_path ? (
            <div className="wf-hover-inspector-row wf-hover-inspector-row--full">
              <span className="wf-hover-inspector-label">本地路径</span>
              <span className="wf-hover-inspector-value wf-hover-inspector-value--prompt" title={node.real_path}>
                {node.real_path}
              </span>
            </div>
          ) : null}
          {node?.nodeKind !== 'import' && node?.prompt ? (
            <div className="wf-hover-inspector-row wf-hover-inspector-row--full">
              <span className="wf-hover-inspector-label">Prompt</span>
              <span className="wf-hover-inspector-value wf-hover-inspector-value--prompt">
                {node.prompt}
              </span>
            </div>
          ) : null}
        </div>

        {asset?.tags && asset.tags.length > 0 && (
          <div className="wf-hover-inspector-tags">
            {asset.tags.map((t, idx) => (
              <span key={idx} className="wf-hover-inspector-tag">
                <Tag size={10} /> {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
