/** Atomic structural mutation plus soft Feed-Slot recompute. No supply is rejected by capacity. */
import type { Edge, Node } from '@xyflow/react';
import { normalizeCanvasEdge, type CanvasConnectionLike } from './canvasConnectionUtils.ts';
import { validateCanvasConnectionStructure } from './canvasConnectionStructure.ts';
import { resolveNodeKind } from './materialNode.ts';
import type { CapabilityCatalog } from '../api.ts';
import type { MaterialType } from '../canvasTypes.ts';
import { buildContractView, resolveModelView } from '../validation/compatKernel.ts';
import { mirrorCanvasSlots, recomputeCanvasSlots } from './canvasSlotRecompute.ts';
export { buildCanvasUpstreamFingerprint } from './canvasInputSources.ts';

export type CanvasNode = Node<Record<string, unknown>>;
export interface CanvasInputMutationState { nodes: CanvasNode[]; edges: Edge[] }
export interface CanvasInputNodePatch { nodeId: string; data: Record<string, unknown>; node?: Partial<CanvasNode> }
export interface CanvasInputMutation {
  addNodes?: CanvasNode[];
  addEdges?: CanvasConnectionLike[];
  removeNodeIds?: string[];
  removeEdgeIds?: string[];
  nodePatches?: CanvasInputNodePatch[];
}
export interface CanvasMutationRuntimeContext {
  catalog?: CapabilityCatalog | null;
  preferredModels?: Partial<Record<MaterialType, string>>;
}
export interface CanvasInputMutationPlan extends CanvasInputMutationState {
  status: 'allowed' | 'rejected' | 'configuration_error';
  reasonCode?: string;
  reasonMeta?: Record<string, unknown>;
}

function rejectMutation(current: CanvasInputMutationState, reasonCode: string, reasonMeta?: Record<string, unknown>): CanvasInputMutationPlan {
  return { ...current, status: 'rejected', reasonCode, ...(reasonMeta ? { reasonMeta } : {}) };
}
function isGenerate(node: CanvasNode | undefined): node is CanvasNode {
  return node?.type === 'material' && resolveNodeKind(node.data) === 'generate';
}

/** Manual selection remains fail-closed; incompatibility of standby supply is not a model error. */
function validateModelPatches(current: CanvasInputMutationState, nodes: CanvasNode[], mutation: CanvasInputMutation, context: CanvasMutationRuntimeContext): CanvasInputMutationPlan | undefined {
  const view = buildContractView(context.catalog);
  for (const patch of mutation.nodePatches ?? []) {
    const node = nodes.find((item) => item.id === patch.nodeId);
    const params = patch.data.params as Record<string, unknown> | undefined;
    if (!isGenerate(node) || !params || !('model' in params)) continue;
    const modelId = typeof params.model === 'string' ? params.model.trim() : '';
    const model = resolveModelView(view, modelId);
    const policy = context.catalog?.generationPolicy?.[node.data.materialType as MaterialType];
    const reasonCode = !view.available ? 'catalog_unavailable' : !model ? 'unknown_model'
      : !model.operations.some((op) => op.listed && op.output.type === node.data.materialType)
        || (policy && !policy.allowedModelIds.includes(model.id)) ? 'not_listed' : undefined;
    if (reasonCode) return rejectMutation(current, reasonCode, { nodeId: node.id, modelId });
  }
}

export function planCanvasInputMutation(current: CanvasInputMutationState, mutation: CanvasInputMutation, context?: CanvasMutationRuntimeContext): CanvasInputMutationPlan {
  const ids = new Set(current.nodes.map((node) => node.id));
  for (const node of mutation.addNodes ?? []) {
    if (ids.has(node.id)) return rejectMutation(current, 'duplicate_node');
    ids.add(node.id);
  }
  const patches = new Map<string, CanvasInputNodePatch>();
  for (const patch of mutation.nodePatches ?? []) {
    if (patches.has(patch.nodeId)) return rejectMutation(current, 'duplicate_node_patch');
    if (!ids.has(patch.nodeId)) return rejectMutation(current, 'missing_node');
    patches.set(patch.nodeId, patch);
  }
  const removedNodes = new Set(mutation.removeNodeIds ?? []);
  const removedEdges = new Set(mutation.removeEdgeIds ?? []);
  let nodes = [...current.nodes, ...(mutation.addNodes ?? [])].filter((node) => !removedNodes.has(node.id)).map((node) => {
    const patch = patches.get(node.id);
    return patch ? { ...node, ...patch.node, data: { ...node.data, ...patch.data,
      ...('slotBindings' in patch.data && !('slotConflicts' in patch.data) ? { slotConflicts: [] } : {}),
    } } as CanvasNode : node;
  });
  let edges = current.edges.filter((edge) => !removedEdges.has(edge.id) && !removedNodes.has(edge.source) && !removedNodes.has(edge.target));
  const newEdgeIds = new Set<string>();
  for (const edge of mutation.addEdges ?? []) {
    const normalized = normalizeCanvasEdge(edge);
    const structure = validateCanvasConnectionStructure(normalized, nodes, edges);
    if (!structure.valid) return rejectMutation(current, structure.reasonCode ?? 'invalid_connection');
    edges.push(normalized);
    newEdgeIds.add(normalized.id);
  }
  if (!context) return { nodes, edges, status: 'allowed' };
  const invalidPatch = validateModelPatches(current, nodes, mutation, context);
  if (invalidPatch) return invalidPatch;
  const targets = new Set((mutation.addNodes ?? []).map((node) => node.id));
  for (const patch of mutation.nodePatches ?? []) targets.add(patch.nodeId);
  for (const edge of current.edges) if (removedEdges.has(edge.id) || removedNodes.has(edge.source)) targets.add(edge.target);
  for (const edge of edges) if (newEdgeIds.has(edge.id) || patches.has(edge.source)) targets.add(edge.target);
  for (const id of targets) {
    const node = nodes.find((item) => item.id === id);
    if (!isGenerate(node)) continue;
    const next = recomputeCanvasSlots(node, { nodes, edges }, context, current.nodes.find((item) => item.id === id), newEdgeIds);
    nodes = nodes.map((item) => item.id === id ? next : item);
    edges = mirrorCanvasSlots(next, edges, context);
  }
  return { nodes, edges, status: 'allowed' };
}

export function dispatchSuccessfulConnectionEvents(edges: Edge[]): void {
  const host = globalThis as { dispatchEvent?: (event: Event) => boolean };
  if (typeof host.dispatchEvent !== 'function') return;
  for (const edge of edges) queueMicrotask(() => host.dispatchEvent!(new CustomEvent('canvas:connection', {
    detail: { source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle },
  })));
}
