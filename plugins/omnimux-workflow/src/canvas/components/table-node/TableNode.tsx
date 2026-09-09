import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  Table,
  Plus,
  Maximize2,
  FileSpreadsheet,
  MessageSquarePlus,
} from 'lucide-react';
import { useTableStore, useTableSession } from '../../store/tableStore.ts';
import { useIsMultiSelected, useCanvasStore } from '../../store/canvasStore.ts';
import { tableDocumentCache } from '../../store/tableDocumentCache.ts';
import { formatRowPreview } from '../../../shared/types/htable.ts';
import NodeHeader from '../../editor/components/MaterialNode/NodeHeader.tsx';
import CanvasNodeHandle from '../../editor/components/CanvasNodeHandle.tsx';
import FloatingTopPill, { type FloatingPillAction } from '../../editor/components/FloatingTopPill.tsx';
import { useAddToConversation } from '../../hooks/useAddToConversation';
import { useT } from '../../i18n';
import {
  buildConversationPayloadFromNode,
  hasNodeMaterial,
  pillMaxWidthForNode,
  shouldShowNodeToolbar,
} from '../../editor/utils/nodeToolbarLogic.ts';

const DEFAULT_TABLE_NODE_WIDTH = 380;
const DEFAULT_TABLE_NODE_HEIGHT = 280;

export const TableNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const effectiveTableId = (data as any)?.tableId || id;
  const nodeTitle = (data as any)?.label || (data as any)?.title || '表格';
  const tableRelPath = (data as any)?.tablePath || (data as any)?.path || `.omnimux/tables/${effectiveTableId}.htable`;
  const l1RowCount = typeof (data as any)?.rowCount === 'number' ? (data as any)?.rowCount : 0;
  const l1PreviewRows = (data as any)?.previewRows as string[] | undefined;

  const workspaceId =
    (typeof (data as any)?.__workspaceId === 'string' && (data as any).__workspaceId) ||
    (typeof (data as any)?.workspaceId === 'string' && (data as any).workspaceId) ||
    (useCanvasStore.getState().nodes.find((n) => n.id === id)?.data as any)?.__workspaceId ||
    '';

  const { openStage } = useTableStore();
  const session = useTableSession(effectiveTableId, {
    title: nodeTitle,
    contentRev: (data as any)?.contentRev ?? 0,
  });
  const { document, addRow } = session;

  useEffect(() => {
    if (effectiveTableId && workspaceId) {
      void tableDocumentCache.ensure(workspaceId, effectiveTableId, { forceReload: false });
    }
  }, [effectiveTableId, workspaceId]);

  const [isHovered, setIsHovered] = useState(false);

  const rows = document.rows || [];
  const effectiveRowCount = rows.length > 0 ? rows.length : l1RowCount;

  const isMultiSelected = useIsMultiSelected();
  const t = useT();
  const hasMaterial = hasNodeMaterial({ nodeType: 'table', tableRowCount: effectiveRowCount });
  const showFloatingPill = shouldShowNodeToolbar({
    hasMaterial,
    hovered: isHovered,
    selected,
    isMultiSelected,
  });

  const { addToConversation } = useAddToConversation();

  const handleOpenFullscreen = useCallback(async () => {
    if (effectiveTableId && workspaceId && session.loadState !== 'ready') {
      try {
        await tableDocumentCache.ensure(workspaceId, effectiveTableId, { forceReload: false });
      } catch (err) {
        console.warn('[TableNode] ensure table document error:', err);
      }
    }
    const latestDoc = tableDocumentCache.getSession(effectiveTableId)?.document || session.document;
    openStage(effectiveTableId, latestDoc || session.document);
  }, [effectiveTableId, openStage, session.document, session.loadState, workspaceId]);

  const handleAddToConversation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const payload = buildConversationPayloadFromNode({
      nodeType: 'table',
      nodeId: id,
      label: nodeTitle,
      tablePath: tableRelPath,
    });
    if (payload) addToConversation(payload);
  }, [addToConversation, id, nodeTitle, tableRelPath]);

  const pillActions: FloatingPillAction[] = useMemo(() => [
    {
      key: 'fullscreen-edit',
      label: t('pill.fullscreen'),
      icon: Maximize2,
      section: 'primary',
      title: t('pill.fullscreen'),
      onClick: (e) => {
        e.stopPropagation();
        handleOpenFullscreen();
      },
    },
    {
      key: 'add-to-conversation',
      icon: MessageSquarePlus,
      section: 'secondary',
      title: t('pill.addToConversation'),
      onClick: handleAddToConversation,
    },
  ], [handleAddToConversation, handleOpenFullscreen, t]);

  // 构建预览记录列表：优先从内存 rows 智能格式化，次选 L1 previewRows
  const previewItems: string[] = useMemo(() => {
    if (rows.length > 0) {
      return rows.slice(0, 3).map((r) => formatRowPreview(r, document.columns));
    }
    if (l1PreviewRows && l1PreviewRows.length > 0) {
      return l1PreviewRows.slice(0, 3);
    }
    return [];
  }, [document.columns, l1PreviewRows, rows]);

  // 查找代表列标题用于卡片表头展示
  const displayColumnTitle = useMemo(() => {
    if (!document.columns || document.columns.length === 0) return '文本';
    const descKeywordRegex = /描述|画面|视觉|动作|脚本|台词|旁白|内容|镜头语言|Prompt/i;
    const descCol = document.columns.find((c) => descKeywordRegex.test(c.title));
    if (descCol) return descCol.title;
    return document.columns[0]?.title || '文本';
  }, [document.columns]);

  return (
    <div
      className={`wf-material-node ${selected ? 'wf-material-node--selected' : ''}`}
      style={{ width: DEFAULT_TABLE_NODE_WIDTH }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 顶部悬浮胶囊栏 (100% 复用全仓通用 FloatingTopPill 标准组件) */}
      {showFloatingPill && (
        <FloatingTopPill actions={pillActions} maxWidth={pillMaxWidthForNode(DEFAULT_TABLE_NODE_WIDTH)} />
      )}

      {/* 左侧输入 Handle */}
      <CanvasNodeHandle side="left" nodeHovered={isHovered} />

      {/* 统一节点标题栏 */}
      <NodeHeader
        label={nodeTitle}
        materialType="table"
      />

      {/* 统一材质主卡片 */}
      <div
        className="wf-material-node__card"
        style={{
          width: DEFAULT_TABLE_NODE_WIDTH,
          height: DEFAULT_TABLE_NODE_HEIGHT,
        }}
        onDoubleClick={handleOpenFullscreen}
      >
        {/* 四角缩放定位点 (统一风格) */}
        {selected && (
          <>
            <span className="wf-node-corner wf-node-corner--tl" />
            <span className="wf-node-corner wf-node-corner--tr" />
            <span className="wf-node-corner wf-node-corner--bl" />
            <span className="wf-node-corner wf-node-corner--br" />
          </>
        )}

        {/* 空态或内容展示 */}
        {effectiveRowCount === 0 ? (
          <div className="wf-node-empty wf-node-empty--text" style={{ padding: '24px 16px', height: '100%', boxSizing: 'border-box' }}>
            <div className="wf-node-empty__icon-box">
              <Table size={32} strokeWidth={1.75} className="wf-node-empty__icon" />
            </div>
            <div className="wf-node-empty__try-label">试试:</div>
            <div
              className="wf-node-empty__actions nodrag"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="wf-node-empty__pill-btn"
                onClick={() => addRow()}
              >
                <Plus size={14} className="wf-node-empty__pill-icon" />
                <span>添加首行数据</span>
              </button>
              <button
                type="button"
                className="wf-node-empty__pill-btn"
                onClick={handleOpenFullscreen}
              >
                <Maximize2 size={13} className="wf-node-empty__pill-icon" />
                <span>双击全屏编辑表格</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 卡片表头 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: '1px solid var(--wb-border)',
                background: 'color-mix(in srgb, var(--wb-surface) 60%, transparent)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--wb-text-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileSpreadsheet size={14} />
                <span>{displayColumnTitle}</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--wb-text-muted)', fontFamily: 'monospace' }}>
                共 {effectiveRowCount} 行
              </span>
            </div>

            {/* 记录预览列表 */}
            <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
              {previewItems.map((previewText, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    background: 'color-mix(in srgb, var(--wb-surface) 40%, transparent)',
                    border: '1px solid var(--wb-border)',
                    borderRadius: 8,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: 'var(--wb-text-primary)',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                    {previewText}
                  </span>
                  <span style={{ color: 'var(--wb-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                    #{idx + 1}
                  </span>
                </div>
              ))}

              {effectiveRowCount > 3 && (
                <div style={{ fontSize: 11, color: 'var(--wb-text-muted)', textAlign: 'center', marginTop: 2 }}>
                  ... 更多记录双击卡片查看
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 右侧输出 Handle (统一端口，支持 DAG 批处理衍生) */}
      <CanvasNodeHandle side="right" nodeHovered={isHovered} />
    </div>
  );
});
