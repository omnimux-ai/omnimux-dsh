import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, GripVertical, X } from 'lucide-react';
import { useTableStore } from '../../../store/tableStore.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import { renderFieldTypeIcon } from './popovers/PopoverFieldConfig.tsx';
import ResourcePickerModal from '../../../editor/components/ResourcePickerModal/ResourcePickerModal.tsx';
import type { LocalFileDraft } from '../../../editor/utils/resourcePickerPolicy.ts';
import type { HTableCellValue, HTableAttachment } from '../../../../shared/types/htable.ts';

export const VirtualDataGrid: React.FC = () => {
  const {
    document: tableDoc,
    selectedRowIndices,
    activeTableId,
    toggleRowSelection,
    selectAllRows,
    clearRowSelection,
    reorderRows,
    renameColumn,
    updateCell,
    addRow,
    openColumnModal,
  } = useTableStore();

  const visibleColumns = tableDoc.columns.filter((c) => c.visible);
  const rowHeightMode = tableDoc.rowHeight || 'low';
  const rowHeightClass = `wf-grid-row--${rowHeightMode}`;

  // 表头全选/半选 Checkbox 状态管理
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const totalRows = tableDoc.rows.length;
  const selectedCount = selectedRowIndices.length;
  const isAllSelected = totalRows > 0 && selectedCount === totalRows;
  const isIndeterminate = selectedCount > 0 && selectedCount < totalRows;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const handleHeaderCheckboxChange = () => {
    if (isAllSelected || isIndeterminate) {
      clearRowSelection();
    } else {
      selectAllRows();
    }
  };

  // 双击列名就地重命名状态管理
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startEditingColumn = (colId: string, currentTitle: string) => {
    setEditingColId(colId);
    setEditingTitle(currentTitle);
  };

  const commitColumnRename = (colIdx: number) => {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      renameColumn(colIdx, trimmed);
    }
    setEditingColId(null);
    setEditingTitle('');
  };

  const cancelColumnRename = () => {
    setEditingColId(null);
    setEditingTitle('');
  };

  // 行原生 HTML5 拖拽重排状态管理
  const [draggedRowIdx, setDraggedRowIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | null>(null);

  const handleDragStart = (e: React.DragEvent, rowIdx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(rowIdx));
    setDraggedRowIdx(rowIdx);
  };

  const handleDragOver = (e: React.DragEvent, rowIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const tr = (e.target as HTMLElement).closest('tr');
    if (!tr) return;
    const rect = tr.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const pos = relY < rect.height / 2 ? 'top' : 'bottom';

    if (dropTargetIdx !== rowIdx || dropPosition !== pos) {
      setDropTargetIdx(rowIdx);
      setDropPosition(pos);
    }
  };

  const handleDragEnd = () => {
    setDraggedRowIdx(null);
    setDropTargetIdx(null);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetRowIdx: number) => {
    e.preventDefault();
    if (draggedRowIdx === null) {
      handleDragEnd();
      return;
    }

    if (draggedRowIdx !== targetRowIdx) {
      let insertIdx = dropPosition === 'bottom' ? targetRowIdx + 1 : targetRowIdx;
      if (draggedRowIdx < insertIdx) {
        insertIdx -= 1;
      }
      if (draggedRowIdx !== insertIdx) {
        reorderRows(draggedRowIdx, insertIdx);
      }
    }

    handleDragEnd();
  };

  // 附件“添加资源”窗口目标行与列
  const [pickerTarget, setPickerTarget] = useState<{ rowIdx: number; colId: string } | null>(null);

  // 附件悬停大图预览浮层状态（跟随鼠标坐标）
  const [hoveredAttachment, setHoveredAttachment] = useState<{
    name: string;
    previewUrl: string;
    top: number;
    left: number;
  } | null>(null);

  // 提取附件有效预览 URL / 路径
  const getAttachmentPreviewUrl = (att: HTableAttachment): string => {
    return att.thumbnailUrl || att.url || att.path || '';
  };

  // 鼠标悬停/移动实时计算居中对齐鼠标光标位置并展示预览大图
  const computePreviewPosition = (clientX: number, clientY: number) => {
    const cardWidth = 320;
    const cardHeight = 340;
    const margin = 12;

    // 水平方向：以鼠标所在水平点居中对齐，并限制在视口边界内
    let left = clientX - cardWidth / 2;
    if (left < margin) {
      left = margin;
    } else if (left + cardWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - cardWidth - margin);
    }

    // 垂直方向：默认展示在鼠标光标下方 14px 处；若视口下方空间不足则翻转展示在鼠标上方
    let top = clientY + 14;
    if (top + cardHeight > window.innerHeight - margin) {
      top = Math.max(margin, clientY - cardHeight - 14);
    }

    return { top, left };
  };

  const handleThumbMouseEnter = (att: HTableAttachment, e: React.MouseEvent) => {
    const previewUrl = getAttachmentPreviewUrl(att);
    const { top, left } = computePreviewPosition(e.clientX, e.clientY);
    setHoveredAttachment({
      name: att.name || '附件预览',
      previewUrl,
      top,
      left,
    });
  };

  const handleThumbMouseMove = (e: React.MouseEvent) => {
    if (!hoveredAttachment) return;
    const { top, left } = computePreviewPosition(e.clientX, e.clientY);
    setHoveredAttachment((prev) => (prev ? { ...prev, top, left } : null));
  };

  const handleThumbMouseLeave = () => {
    setHoveredAttachment(null);
  };

  // 移除附件
  const handleRemoveAttachment = (rowIdx: number, colId: string, attIdx: number) => {
    const row = tableDoc.rows[rowIdx];
    if (!row) return;
    const currentVal = row.cells[colId];
    if (!Array.isArray(currentVal)) return;
    const nextList = (currentVal as HTableAttachment[]).filter((_, idx) => idx !== attIdx);
    updateCell(rowIdx, colId, nextList);
    setHoveredAttachment(null);
  };

  // 提交选中的资源入单元格
  const handleCommitResource = useCallback(
    (payload: {
      selectedCanvasNodeIds: string[];
      localFiles: LocalFileDraft[];
    }) => {
      if (!pickerTarget) return false;

      const nodes = useCanvasStore.getState().nodes;
      const canvasAttachments: HTableAttachment[] = payload.selectedCanvasNodeIds
        .map((nodeId) => {
          const node = nodes.find((n) => n.id === nodeId);
          if (!node) return null;
          const nodeData = (node.data || {}) as Record<string, any>;
          const materialType = (nodeData.materialType as string) || '';
          const kind = materialType === 'video' ? 'video' : materialType === 'audio' ? 'audio' : 'image';
          const previewUrl =
            nodeData.previewUrl ||
            nodeData.imageUrl ||
            nodeData.thumbnailUrl ||
            nodeData.outputUrl ||
            nodeData.coverUrl ||
            nodeData.mediaUrl ||
            '';
          const name = nodeData.label || nodeData.title || nodeData.name || '画布资源';
          return {
            assetId: node.id,
            name: String(name),
            kind,
            thumbnailUrl: previewUrl ? String(previewUrl) : undefined,
            url: previewUrl ? String(previewUrl) : undefined,
            path: typeof nodeData.realPath === 'string' ? nodeData.realPath : typeof nodeData.mediaUrl === 'string' ? nodeData.mediaUrl : undefined,
          } as HTableAttachment;
        })
        .filter((x): x is HTableAttachment => Boolean(x));

      const localAttachments: HTableAttachment[] = (payload.localFiles || []).map((file) => ({
        assetId: file.id,
        name: file.name,
        kind: file.materialType === 'video' ? 'video' : file.materialType === 'audio' ? 'audio' : 'image',
        thumbnailUrl: file.previewUrl,
        url: file.previewUrl,
        path: file.realPath,
        size: file.size,
        mimeType: file.mime,
      }));

      const allNew = [...canvasAttachments, ...localAttachments];
      if (allNew.length === 0) {
        return false;
      }

      const row = tableDoc.rows[pickerTarget.rowIdx];
      if (row) {
        const currentVal = row.cells[pickerTarget.colId];
        const currentList = Array.isArray(currentVal) ? (currentVal as HTableAttachment[]) : [];
        const nextList = [...currentList, ...allNew];
        updateCell(pickerTarget.rowIdx, pickerTarget.colId, nextList);
      }

      setPickerTarget(null);
      return true;
    },
    [tableDoc.rows, pickerTarget, updateCell],
  );

  return (
    <div className="wf-grid-container">
      <div
        className="wf-grid-scroll-pane"
        onScroll={() => {
          if (hoveredAttachment) setHoveredAttachment(null);
        }}
      >
        <table className="wf-grid-table">
          <colgroup>
            {/* 首列：行号与多选 */}
            <col style={{ width: 56, minWidth: 56, maxWidth: 56 }} />

            {/* 动态字段列 */}
            {visibleColumns.map((col) => (
              <col
                key={col.id}
                style={{ width: col.width || 220, minWidth: 120 }}
              />
            ))}

            {/* 快捷加列列 */}
            <col style={{ width: 44, minWidth: 44, maxWidth: 44 }} />

            {/* 右侧空占位缓冲 */}
            <col style={{ width: 'auto' }} />
          </colgroup>

          <thead>
            <tr>
              {/* 首列：多选框 */}
              <th className="wf-grid-th wf-grid-th--select">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="wf-grid-checkbox"
                  checked={isAllSelected}
                  onChange={handleHeaderCheckboxChange}
                  title={isAllSelected ? '取消全选' : '全选'}
                />
              </th>

              {/* 动态字段列 */}
              {visibleColumns.map((col) => {
                const colIdx = tableDoc.columns.findIndex((c) => c.id === col.id);
                const isEditing = editingColId === col.id;

                return (
                  <th
                    key={col.id}
                    className="wf-grid-th"
                  >
                    <div className="wf-grid-th-content">
                      <span className="wf-grid-th-icon">{renderFieldTypeIcon(col.type)}</span>
                      {isEditing ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          className="wf-grid-th-rename-input"
                          value={editingTitle}
                          autoFocus
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={() => commitColumnRename(colIdx)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              commitColumnRename(colIdx);
                            } else if (e.key === 'Escape') {
                              cancelColumnRename();
                            }
                          }}
                        />
                      ) : (
                        <span
                          className="wf-grid-th-title"
                          title="双击就地重命名"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            startEditingColumn(col.id, col.title);
                          }}
                        >
                          {col.title}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              {/* 快捷加列列 */}
              <th
                className="wf-grid-th wf-grid-th--plus"
                title="添加列"
                onClick={() => openColumnModal('add')}
              >
                <div className="wf-grid-th-plus-btn">
                  <Plus size={15} />
                </div>
              </th>

              {/* 右侧空占位缓冲 */}
              <th className="wf-grid-th wf-grid-th--filler" />
            </tr>
          </thead>

          <tbody>
            {tableDoc.rows.map((row, rowIdx) => {
              const isSelected = selectedRowIndices.includes(rowIdx);
              const isDragging = draggedRowIdx === rowIdx;
              const isDropTarget = dropTargetIdx === rowIdx && draggedRowIdx !== rowIdx;
              const dropClass = isDropTarget && dropPosition ? `wf-grid-row--drop-${dropPosition}` : '';
              const rowClass = [
                rowHeightClass,
                isSelected ? 'wf-grid-row--selected' : '',
                isDragging ? 'wf-grid-row--dragging' : '',
                dropClass,
              ].filter(Boolean).join(' ');

              return (
                <tr
                  key={row.id || rowIdx}
                  className={rowClass}
                  onDragOver={(e) => handleDragOver(e, rowIdx)}
                  onDrop={(e) => handleDrop(e, rowIdx)}
                >
                  {/* 首列：复合单元格（等宽序号 + 拖拽手柄 + 勾选框） */}
                  <td className="wf-grid-td wf-grid-td--select">
                    <div className="wf-grid-row-head-cell">
                      <span className="wf-grid-row-index">{rowIdx + 1}</span>
                      <div className="wf-grid-row-controls">
                        <div
                          className="wf-grid-row-drag-handle"
                          draggable
                          title="拖拽重排行"
                          onDragStart={(e) => handleDragStart(e, rowIdx)}
                          onDragEnd={handleDragEnd}
                        >
                          <GripVertical size={14} />
                        </div>
                        <input
                          type="checkbox"
                          className="wf-grid-checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(rowIdx)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </td>

                  {/* 各字段单元格：通过 col.id 从 row.cells 字典读取与更新 */}
                  {visibleColumns.map((col) => {
                    const cellVal = row.cells[col.id];

                    const renderCellContent = () => {
                      if (col.type === 'attachment') {
                        const attachments: HTableAttachment[] = Array.isArray(cellVal)
                          ? (cellVal as HTableAttachment[])
                          : [];

                        return (
                          <div className="wf-grid-cell-attachment">
                            {attachments.map((att, attIdx) => {
                              const previewUrl = getAttachmentPreviewUrl(att);
                              const hasPreview = Boolean(previewUrl);

                              return (
                                <div
                                  key={att.assetId ? `${att.assetId}_${attIdx}` : attIdx}
                                  className="wf-grid-attachment-thumb-wrapper"
                                  onMouseEnter={(e) => handleThumbMouseEnter(att, e)}
                                  onMouseMove={handleThumbMouseMove}
                                  onMouseLeave={handleThumbMouseLeave}
                                >
                                  {hasPreview ? (
                                    <img
                                      src={previewUrl}
                                      alt={att.name || '缩略图'}
                                      className="wf-grid-attachment-thumb-img"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLElement).style.display = 'none';
                                        const fb = e.currentTarget.parentElement?.querySelector(
                                          '.wf-grid-attachment-thumb-fallback',
                                        ) as HTMLElement | null;
                                        if (fb) fb.style.display = 'flex';
                                      }}
                                    />
                                  ) : null}

                                  <div
                                    className="wf-grid-attachment-thumb-fallback"
                                    style={{ display: hasPreview ? 'none' : 'flex' }}
                                  >
                                    {att.kind === 'video' ? '视' : att.kind === 'audio' ? '音' : '📎'}
                                  </div>

                                  {/* 删除按钮 (对齐图二右上角 x) */}
                                  <button
                                    type="button"
                                    className="wf-grid-attachment-remove-btn"
                                    title="删除附件"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveAttachment(rowIdx, col.id, attIdx);
                                    }}
                                  >
                                    <X size={10} strokeWidth={2.5} />
                                  </button>
                                </div>
                              );
                            })}

                            {/* 手动扩充加号按钮 (对齐图一与图二的右侧 + 按钮) */}
                            <button
                              type="button"
                              className="wf-grid-attachment-append-btn"
                              title="添加资源"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPickerTarget({ rowIdx, colId: col.id });
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        );
                      }

                      const strVal = typeof cellVal === 'string' || typeof cellVal === 'number' ? String(cellVal) : '';
                      return (
                        <input
                          type="text"
                          className="wf-grid-cell-input"
                          value={strVal}
                          placeholder="点击输入..."
                          onChange={(e) => updateCell(rowIdx, col.id, e.target.value as HTableCellValue)}
                        />
                      );
                    };

                    return (
                      <td key={col.id} className="wf-grid-td">
                        {renderCellContent()}
                      </td>
                    );
                  })}

                  {/* 快捷列与右侧占位 */}
                  <td className="wf-grid-td wf-grid-td--plus-col" />
                  <td className="wf-grid-td wf-grid-td--filler" />
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 底部添加行操作条 */}
        <div className="wf-grid-add-row-bar">
          <button
            type="button"
            className="wf-grid-row-append-btn"
            onClick={() => addRow()}
          >
            <Plus size={14} />
            <span>添加行</span>
          </button>
        </div>
      </div>

      {/* 附件放大预览悬浮卡片 (经 createPortal 传送至 globalThis.document.body，彻底杜绝父容器 transform/containing block 错位) */}
      {hoveredAttachment &&
        typeof globalThis.document !== 'undefined' &&
        globalThis.document.body &&
        createPortal(
          <div
            className="wf-attachment-preview-card"
            style={{
              position: 'fixed',
              top: hoveredAttachment.top,
              left: hoveredAttachment.left,
              zIndex: 99999,
              pointerEvents: 'none',
            }}
          >
            <div className="wf-attachment-preview-header" title={hoveredAttachment.name}>
              {hoveredAttachment.name}
            </div>
            <div className="wf-attachment-preview-body">
              {hoveredAttachment.previewUrl ? (
                <img
                  src={hoveredAttachment.previewUrl}
                  alt={hoveredAttachment.name}
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    const fb = e.currentTarget.parentElement?.querySelector(
                      '.wf-attachment-preview-error',
                    ) as HTMLElement | null;
                    if (fb) fb.style.display = 'flex';
                  }}
                />
              ) : (
                <div style={{ color: 'var(--wb-text-muted)', fontSize: 12 }}>暂无图片预览</div>
              )}
              <div
                className="wf-attachment-preview-error"
                style={{
                  display: 'none',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: 'var(--wb-text-muted)',
                  fontSize: 12,
                  padding: '32px 16px',
                }}
              >
                <span>图片加载失败</span>
              </div>
            </div>
          </div>,
          globalThis.document.body,
        )}

      {/* 调出“添加资源”窗口，可以在里面附加附件 */}
      {pickerTarget && (
        <ResourcePickerModal
          open={Boolean(pickerTarget)}
          nodeId={activeTableId || 'table-node'}
          title="添加资源"
          slotTarget={{
            slot: 'attachment',
            acceptedTypes: ['image', 'video', 'audio'],
            max: null,
          }}
          onCancel={() => setPickerTarget(null)}
          onCommit={handleCommitResource}
        />
      )}
    </div>
  );
};
