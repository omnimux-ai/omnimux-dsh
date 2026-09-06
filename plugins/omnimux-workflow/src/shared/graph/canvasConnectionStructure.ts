/**
 * Ported verbatim from Gxgen
 * `apps/web/src/pages/CanvasEditor/utils/canvasConnectionStructure.ts`
 * (validated by the extraction spike): self-connection / duplicate /
 * missing-node / type-contract / cycle checks — the heart of the wiring
 * rules.
 */

import { getOutgoers, type Edge, type Node, type Connection } from '@xyflow/react';
// 显式 .ts 扩展名：node --test 的 type-stripping 不做 TS 扩展名解析
import { isNodeConnectionValid } from './connectionConfig.ts';
import { readExplicitTargetSlot } from '../validation/compatKernel.ts';

export interface CanvasConnectionStructureValidation {
  valid: boolean;
  reasonCode?: 'self_connection' | 'duplicate_edge' | 'missing_node' | 'cycle' | 'type_contract';
}

type ConnectionLike = Pick<Connection, 'source' | 'target'> & Partial<Pick<Edge, 'sourceHandle' | 'targetHandle' | 'data'>>;

export function validateCanvasConnectionStructure(
  connection: ConnectionLike,
  nodes: Array<Node<Record<string, unknown>>>,
  edges: Edge[],
): CanvasConnectionStructureValidation {
  if (connection.source === connection.target) {
    return { valid: false, reasonCode: 'self_connection' };
  }
  const bindingKey = (edge: ConnectionLike): string => {
    const data = edge.data ?? {};
    const slot = readExplicitTargetSlot(data, edge.targetHandle);
    const assigned = data.slotBinding && typeof data.slotBinding === 'object' ? data.slotBinding as { role?: unknown } : {};
    const role = typeof data.role === 'string' ? data.role.trim() : typeof assigned.role === 'string' ? assigned.role.trim() : '';
    return JSON.stringify([slot ?? '', role]);
  };
  if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target
    && bindingKey(edge) === bindingKey(connection))) {
    return { valid: false, reasonCode: 'duplicate_edge' };
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) {
    return { valid: false, reasonCode: 'missing_node' };
  }
  if (!isNodeConnectionValid(sourceNode, targetNode)) {
    return { valid: false, reasonCode: 'type_contract' };
  }

  const visited = new Set<string>();
  const queue = [targetNode];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    for (const outgoer of getOutgoers(current, nodes, edges)) {
      if (outgoer.id === connection.source) {
        return { valid: false, reasonCode: 'cycle' };
      }
      queue.push(outgoer);
    }
  }

  return { valid: true };
}
