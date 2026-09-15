import React, { memo, useCallback, useMemo } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '../../../store/canvasStore';
import type { GroupNodeData } from '../../../../shared/canvasTypes';
import { useT } from '../../../i18n';
import { childIdsOfGroup, resolveGroupAccentStyle } from '../../utils/nodeVisualMath';
import { GroupTopBar } from './GroupTopBar';
import { GroupResizeHandles } from './GroupResizeHandles';
import { GroupHeader } from './GroupHeader';

export const GroupNode: React.FC<NodeProps> = memo(({
  id,
  data,
  selected,
  width: rawWidth,
  height: rawHeight,
}) => {
  const t = useT();
  const groupData = data as unknown as GroupNodeData;
  const title = groupData.title || t('group.defaultTitle');
  const color = typeof groupData.color === 'string' ? groupData.color : '';
  const isCollapsed = Boolean(groupData.isCollapsed);
  const minWidth = groupData.minWidth || 220;
  const minHeight = groupData.minHeight || 44;
  const accentStyle = useMemo(() => resolveGroupAccentStyle(color), [color]);

  const width = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : 400;
  const height = typeof rawHeight === 'number' && rawHeight > 0 ? rawHeight : 300;

  const ungroup = useCanvasStore((state) => state.ungroup);
  const toggleGroupCollapse = useCanvasStore((state) => state.toggleGroupCollapse);
  const resizeGroup = useCanvasStore((state) => state.resizeGroup);
  const setNodes = useCanvasStore((state) => state.setNodes);
  const setSelectedElement = useCanvasStore((state) => state.setSelectedElement);
  const liveNodes = useCanvasStore((state) => state.nodes);
  const groupPosition = useCanvasStore(
    (state) => state.nodes.find((n) => n.id === id)?.position || { x: 0, y: 0 },
  );
  const { getViewport } = useReactFlow();
  const zoom = getViewport()?.zoom || 1;

  const handleRename = useCallback((newTitle: string) => {
    const cleanTitle = newTitle.trim() || t('group.defaultTitle');
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...(node.data as Record<string, unknown>), title: cleanTitle } }
          : node,
      ),
    );
  }, [id, setNodes, t]);

  const handleSelectGroup = useCallback(() => {
    setSelectedElement('node', id);
    setNodes((nodes) =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === id,
      })),
    );
  }, [id, setSelectedElement, setNodes]);

  const handleColorChange = useCallback(
    (newColor: string) => {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...(node.data as Record<string, unknown>), color: newColor } }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  const handleResize = useCallback(
    (newBounds: { x: number; y: number; width: number; height: number }) => {
      resizeGroup(id, newBounds);
    },
    [id, resizeGroup],
  );

  const handleExecuteGroup = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('omnimux:workflow:execute-group', {
        detail: { groupId: id, nodeIds: childIdsOfGroup(liveNodes, id) },
      }),
    );
  }, [id, liveNodes]);

  const handleCreateWorkflow = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('omnimux:workflow:create-subworkflow', {
        detail: { groupId: id, groupTitle: title, nodeIds: childIdsOfGroup(liveNodes, id) },
      }),
    );
  }, [id, title, liveNodes]);

  const handlePublishApp = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('omnimux:workflow:publish-app', {
        detail: { groupId: id, groupTitle: title, nodeIds: childIdsOfGroup(liveNodes, id) },
      }),
    );
  }, [id, title, liveNodes]);

  const handleDeleteWorkflow = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('omnimux:workflow:delete-group', {
        detail: { groupId: id, groupTitle: title },
      }),
    );
  }, [id, title]);

  const handleUngroup = useCallback(() => {
    ungroup(id);
  }, [id, ungroup]);

  const handleLayout = useCallback(
    (layoutType: 'horizontal' | 'vertical' | 'grid') => {
      window.dispatchEvent(
        new CustomEvent('omnimux:workflow:layout-group', {
          detail: { groupId: id, layoutType },
        }),
      );
    },
    [id],
  );

  const inverseScale = useMemo(() => inverseScaleForZoom(zoom), [zoom]);

  return (
    <div
      className={`wf-group-node ${selected ? 'wf-group-node--selected' : ''} ${isCollapsed ? 'wf-group-node--collapsed' : ''}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        ...accentStyle,
      }}
    >
      {/* 顶部标题与工具栏弹性行：名称在左，工具栏排在其右侧，彻底消除重叠 */}
      <div
        className="wf-group-top-row nodrag nopan"
        style={{
          position: 'absolute',
          top: isCollapsed ? 10 : -(28 + 10 * inverseScale),
          left: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 10,
          transform: `scale(${inverseScale})`,
          transformOrigin: 'bottom left',
          pointerEvents: 'none',
        }}
      >
        <GroupHeader
          groupId={id}
          title={title}
          isCollapsed={isCollapsed}
          selected={selected}
          color={color}
          onToggleCollapse={() => toggleGroupCollapse(id)}
          onRename={handleRename}
          onSelect={handleSelectGroup}
        />
        {selected && (
          <GroupTopBar
            groupId={id}
            groupColor={color}
            isCollapsed={isCollapsed}
            onExecuteGroup={handleExecuteGroup}
            onCreateWorkflow={handleCreateWorkflow}
            onPublishApp={handlePublishApp}
            onUngroup={handleUngroup}
            onDeleteWorkflow={handleDeleteWorkflow}
            onColorChange={handleColorChange}
          />
        )}
      </div>

      {selected && !isCollapsed && (
        <GroupResizeHandles
          bounds={{ x: groupPosition.x, y: groupPosition.y, width, height }}
          minAllowed={{ minWidth, minHeight }}
          color={color}
          zoom={zoom}
          onResize={handleResize}
        />
      )}
    </div>
  );
});

GroupNode.displayName = 'GroupNode';
