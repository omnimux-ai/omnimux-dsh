/**
 * MaterialNodeHandles — 素材节点左右两端连接桩与连线输出菜单收敛组件
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { MaterialType } from '../../../../types/materialNode';
import CanvasNodeHandle, { type CanvasNodeHandleSelectMeta } from '../../CanvasNodeHandle';
import { getOutputOptionSpecs, parseOutputOptionKey } from '../../../utils/connectionMenuOptions';
import { createMaterialNode } from '../../../utils/nodeFactory';
import { useCanvasStore } from '../../../../store/canvasStore';
import { useT } from '../../../../i18n';

export interface MaterialNodeHandlesProps {
  nodeId: string;
  materialType: MaterialType;
  nodeHovered: boolean;
}

export const MaterialNodeHandles: React.FC<MaterialNodeHandlesProps> = memo(({
  nodeId,
  materialType,
  nodeHovered,
}) => {
  const t = useT();
  const applyCanvasInputMutation = useCanvasStore((state) => state.applyCanvasInputMutation);

  const outputMenuOptions = useMemo(
    () =>
      getOutputOptionSpecs(materialType).map((spec) => ({
        key: spec.key,
        label: t(spec.labelKey),
        description: t(spec.descKey),
        icon: spec.icon,
      })),
    [materialType, t],
  );

  const handleOutputMenuSelect = useCallback(
    (key: string, meta?: CanvasNodeHandleSelectMeta) => {
      const parsed = parseOutputOptionKey(key);
      const position = meta?.flowPosition;
      if (!parsed || !position) return;
      const result = createMaterialNode(parsed.targetMaterialType, position);
      const newNode = result.nodes[0];
      if (!newNode) return;
      applyCanvasInputMutation({
        addNodes: result.nodes,
        addEdges: [
          { source: nodeId, sourceHandle: 'out', target: newNode.id, targetHandle: 'in' },
        ],
      });
    },
    [applyCanvasInputMutation, nodeId],
  );

  return (
    <>
      <CanvasNodeHandle side="left" nodeHovered={nodeHovered} />
      <CanvasNodeHandle
        side="right"
        nodeHovered={nodeHovered}
        options={outputMenuOptions}
        onSelect={handleOutputMenuSelect}
      />
    </>
  );
});

MaterialNodeHandles.displayName = 'MaterialNodeHandles';
