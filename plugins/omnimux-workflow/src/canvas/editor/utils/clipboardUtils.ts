/**
 * Ported (narrowed) from Gxgen
 * `apps/web/src/pages/CanvasEditor/utils/clipboardUtils.ts`.
 *
 * In-island clipboard (a ref, not the system clipboard): copy keeps the
 * selected nodes plus the edges between them; paste clones with fresh ids
 * and a configurable offset. Used by the keyboard shortcut base set and
 * the context menu (M2).
 */

import { type Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasNode } from './canvasInputMutationGateway';

export interface ClipboardData {
  nodes: CanvasNode[];
  edges: Edge[];
}

export interface PasteResult {
  nodes: CanvasNode[];
  edges: Edge[];
  newPastePosition: { x: number; y: number };
}

/**
 * Build clipboard data from the currently selected nodes.
 * @param nodes all nodes
 * @param edges all edges
 * @returns clipboard data (selected nodes + edges between them only)
 */
export function copyNodesToClipboard(nodes: CanvasNode[], edges: Edge[]): ClipboardData {
  const selectedNodes = nodes.filter((n) => n.selected);
  if (selectedNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
  const connectedEdges = edges.filter(
    (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target),
  );

  return {
    nodes: selectedNodes,
    edges: connectedEdges,
  };
}

/** Bounding-box center of a node group (paste anchor). */
function calculateBoundingBoxCenter(nodes: CanvasNode[]): { x: number; y: number } {
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...nodes.map((n) => n.position.x));
  const maxY = Math.max(...nodes.map((n) => n.position.y));
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
}

/**
 * Clone clipboard nodes at a target position (or offset from origin).
 * @param clipboard clipboard data
 * @param targetPosition explicit paste position (context menu / drop point)
 * @param lastPastePosition previous paste anchor (sequential paste offsets)
 */
export function pasteFromClipboard(
  clipboard: ClipboardData,
  targetPosition?: { x: number; y: number },
  lastPastePosition?: { x: number; y: number } | null,
): PasteResult | null {
  const { nodes: copiedNodes, edges: copiedEdges } = clipboard;
  if (copiedNodes.length === 0) {
    return null;
  }

  const center = calculateBoundingBoxCenter(copiedNodes);

  let pasteX: number;
  let pasteY: number;
  if (targetPosition) {
    pasteX = targetPosition.x;
    pasteY = targetPosition.y;
  } else {
    // Offset from the last paste (cascade) or from the original position.
    const offset = lastPastePosition ? 50 : 30;
    pasteX = center.x + offset;
    pasteY = center.y + offset;
  }

  const idMapping = new Map<string, string>();
  const newNodes = copiedNodes.map((node) => {
    const newId = uuidv4();
    idMapping.set(node.id, newId);
    return {
      ...node,
      id: newId,
      position: {
        x: pasteX + (node.position.x - center.x),
        y: pasteY + (node.position.y - center.y),
      },
      selected: true,
    } as CanvasNode;
  });

  const edgeIdMapping = new Map<string, string>();
  const newEdges = copiedEdges.map((edge) => {
    const newEdgeId = uuidv4();
    edgeIdMapping.set(edge.id, newEdgeId);
    return {
      ...edge,
      id: newEdgeId,
      source: idMapping.get(edge.source) || edge.source,
      target: idMapping.get(edge.target) || edge.target,
      selected: false,
    };
  });

  // Cloned generate nodes carry slotBindings that reference the ORIGINAL node/edge ids.
  // Rewrite them to the freshly cloned identities, or the pasted copy loses its bindings
  // when the recompute prunes occupants that point at non-existent sources/edges.
  const remappedNodes = newNodes.map((node) => remapClonedBindings(node, idMapping, edgeIdMapping));

  return {
    nodes: remappedNodes,
    edges: newEdges,
    newPastePosition: { x: pasteX, y: pasteY },
  };
}

interface CloneSlotBindings {
  [slot: string]: Array<Record<string, unknown> & { sourceNodeId?: string; edgeId?: string }>;
}

/** Remap a cloned node's slot bindings onto the new node/edge ids produced by this paste. */
function remapClonedBindings(
  node: CanvasNode,
  nodeIdMapping: Map<string, string>,
  edgeIdMapping: Map<string, string>,
): CanvasNode {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const bindings = data.slotBindings as CloneSlotBindings | undefined;
  const standby = data.slotStandbyEdgeIds;
  const conflicts = data.slotConflicts;
  if (!bindings && !Array.isArray(standby) && !Array.isArray(conflicts)) return node;
  const next: Record<string, unknown> = { ...data };
  if (bindings) {
    const remapped: CloneSlotBindings = {};
    for (const [slot, occupants] of Object.entries(bindings)) {
      remapped[slot] = (occupants ?? []).flatMap((occupant) => {
        const mappedSource = occupant?.sourceNodeId ? nodeIdMapping.get(occupant.sourceNodeId) : undefined;
        const mappedEdge = occupant?.edgeId ? edgeIdMapping.get(occupant.edgeId) : undefined;
        // A binding survives only when both its source node and its edge were copied too.
        if (!mappedSource || !mappedEdge) return [];
        return [{ ...occupant, sourceNodeId: mappedSource, edgeId: mappedEdge }];
      });
    }
    next.slotBindings = remapped;
  }
  if (Array.isArray(standby)) {
    next.slotStandbyEdgeIds = standby
      .map((id) => (typeof id === 'string' ? edgeIdMapping.get(id) : undefined))
      .filter((id): id is string => Boolean(id));
  }
  // Conflicts are derived state; carrying pre-clone identities would resurrect ghosts.
  if (Array.isArray(conflicts)) next.slotConflicts = [];
  return { ...node, data: next as CanvasNode['data'] };
}
