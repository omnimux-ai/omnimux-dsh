/** Atomic structural mutation plus soft Feed-Slot recompute. No supply is rejected by capacity. */
import type { Edge, Node } from '@xyflow/react';
import { normalizeCanvasEdge, type CanvasConnectionLike } from './canvasConnectionUtils.ts';
import { validateCanvasConnectionStructure } from './canvasConnectionStructure.ts';
import { resolveNodeKind } from './materialNode.ts';
import type { CapabilityCatalog } from '../api.ts';
import type { MaterialType } from '../canvasTypes.ts';
import { buildContractView, matchOperationInputs, resolveModelView, type OperationMatch } from '../validation/compatKernel.ts';
import { buildCanvasUpstreamFingerprint, readCanvasParams } from './canvasInputSources.ts';
import { deriveSlotLayout } from './feedSlot/deriveSlotLayout.ts';
import { effectiveInputDisplay } from './feedSlot/effectiveInputDisplay.ts';
import { effectiveSlotFingerprint, feedFromFingerprint } from './feedSlot/effectiveFingerprint.ts';
import type { SlotSelection } from './feedSlot/assembleEffectiveInputs.ts';
import type { SlotBindings, SlotConflict } from './feedSlot/types.ts';
import { findDeclaredParameterFailure } from '../validation/declaredParameterValidation.ts';
import { narrowCatalogByRouting } from '../validation/lineConstraints.ts';
import { readNodeInputSource } from './nodeInputSource.ts';
import type { SlotOccupant } from './feedSlot/types.ts';
import { mirrorCanvasSlots, recomputeCanvasSlots } from './canvasSlotRecompute.ts';
export { buildCanvasUpstreamFingerprint } from './canvasInputSources.ts';

export type CanvasNode = Node<Record<string, unknown>>;
export interface CanvasInputMutationState { nodes: CanvasNode[]; edges: Edge[] }
export interface CanvasInputNodePatch { nodeId: string; data: Record<string, unknown>; node?: Partial<CanvasNode> }
export interface CanvasStrictConsumptionIntent {
  targetNodeId: string;
  chosenOperationId: string;
  /** V1 cannot confirm a different route; V3 supplies qualified route plans. */
  chosenRouteId?: string;
}
export interface CanvasInputSelectionVerdict {
  accepts: boolean;
  ready: boolean;
  operationId: string;
  records: SlotSelection[];
  bindings: SlotBindings;
  pending: OperationMatch['pending'];
  rejections: OperationMatch['rejections'];
  reasonCode?: string;
  contractFingerprint: string;
  fingerprint: string;
}
export interface CanvasInputMutation {
  strictConsumption?: CanvasStrictConsumptionIntent;
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

export interface CanvasInputSelectionRequest extends CanvasStrictConsumptionIntent {
  selections?: Array<{ sourceNodeId: string; outputId: string; targetSlot?: string; role?: string }>;
  replaceEdgeId?: string;
  /** Saved binding identity; edge-only requests remain valid only for a unique occurrence. */
  replaceSlot?: string;
  replaceRole?: string;
  replaceSourceNodeId?: string;
  replaceOutputId?: string;
  setUse?: { slot: string; edgeId: string; use: 'active' | 'inactive' };
}

/** Picker/preview callback planner. The caller applies an allowed plan as one history transaction. */
export function planCanvasInputSelection(current: CanvasInputMutationState, request: CanvasInputSelectionRequest, context: CanvasMutationRuntimeContext): CanvasInputMutationPlan {
  const target = current.nodes.find(node => node.id === request.targetNodeId);
  if (!isGenerate(target)) return rejectMutation(current, 'missing_node');
  if (target.data.inputBindingVersion !== 1) return rejectMutation(current, 'input_migration_required');
  const params = readCanvasParams(target);
  if (request.chosenOperationId !== params.operation || request.chosenRouteId !== undefined) return rejectMutation(current, 'route_plan_required');
  if (request.setUse && ((request.selections?.length ?? 0) > 0 || request.replaceEdgeId)) return rejectMutation(current, 'invalid_selection');
  const bindings: SlotBindings = Object.fromEntries(Object.entries((target.data.slotBindings ?? {}) as SlotBindings)
    .map(([slot, values]) => [slot, values.map(value => ({ ...value }))]));
  if (request.setUse) {
    if (request.setUse.use !== 'active' && request.setUse.use !== 'inactive') return rejectMutation(current, 'invalid_selection');
    const matches = bindings[request.setUse.slot]?.filter(item => item.edgeId === request.setUse!.edgeId) ?? [];
    if (matches.length !== 1) return rejectMutation(current, 'input_unavailable');
    matches[0]!.use = request.setUse.use;
    // Only this endpoint's existing-binding reduction may retain other invalid intent.
    if (request.setUse.use === 'inactive') return planCanvasInputMutation(current,
      { nodePatches: [{ nodeId: target.id, data: { slotBindings: bindings } }] }, context);
  }
  const layout = deriveSlotLayout(context.catalog, typeof params.model === 'string' ? params.model : undefined, request.chosenOperationId);
  const addEdges: CanvasConnectionLike[] = [];
  const all = Object.entries(bindings).flatMap(([slot, values]) => values.map(occupant => ({ slot, occupant })));
  const replacements = request.replaceEdgeId ? all.filter(item => item.occupant.edgeId === request.replaceEdgeId
    && (request.replaceSlot === undefined || item.slot === request.replaceSlot)
    && (request.replaceRole === undefined || item.occupant.role === request.replaceRole)
    && (request.replaceSourceNodeId === undefined || item.occupant.sourceNodeId === request.replaceSourceNodeId)
    && (request.replaceOutputId === undefined || item.occupant.outputId === request.replaceOutputId)) : [];
  if (replacements.length > 1) return rejectMutation(current, 'role_required');
  const replacing = replacements[0];
  const previousReplacingEdgeId = replacing?.occupant.edgeId;
  if (request.replaceEdgeId && (!replacing || request.selections?.length !== 1)) return rejectMutation(current, 'invalid_selection');
  let ordinal = all.reduce((max, item) => Math.max(max, item.occupant.ordinal ?? -1), -1) + 1;
  for (const selection of request.selections ?? []) {
    const sourceNode = current.nodes.find(node => node.id === selection.sourceNodeId);
    if (!sourceNode) return rejectMutation(current, 'input_unavailable');
    const source = readNodeInputSource(sourceNode);
    if (source.outputId !== selection.outputId) return rejectMutation(current, 'input_changed');
    const slots = layout.slots.filter(slot => slot.type === source.materialType
      && (!selection.targetSlot || slot.slot === selection.targetSlot) && (!selection.role || slot.role === selection.role));
    if (slots.length !== 1) return rejectMutation(current, slots.length ? 'role_required' : 'role_conflict');
    const spec = slots[0]!;
    if (replacing && (replacing.slot !== spec.slot || replacing.occupant.role !== undefined && replacing.occupant.role !== spec.role)) return rejectMutation(current, 'role_conflict');
    const sameIntent = all.filter(item => item !== replacing && item.slot === spec.slot
      && item.occupant.sourceNodeId === source.nodeId && (item.occupant.role ?? spec.role) === spec.role);
    if (sameIntent.length > 1) return rejectMutation(current, 'role_required');
    if (sameIntent.some(item => item.occupant.use !== 'inactive')) return rejectMutation(current, 'input_already_bound');
    const updating = replacing ?? sameIntent[0];
    const existing = current.edges.find(edge => edge.id === updating?.occupant.edgeId && edge.source === source.nodeId && edge.target === target.id)
      ?? current.edges.find(edge => edge.source === source.nodeId && edge.target === target.id);
    let edgeId = existing?.id ?? `input-${source.nodeId}-${target.id}`;
    let suffix = 0;
    while (!existing && [...current.edges, ...addEdges].some(edge => edge.id === edgeId)) edgeId = `input-${source.nodeId}-${target.id}-${++suffix}`;
    if (!existing) addEdges.push({ id: edgeId, source: source.nodeId, target: target.id });
    const next: SlotOccupant = { sourceNodeId: source.nodeId, edgeId, outputId: source.outputId, pinned: true,
      ordinal: updating?.occupant.ordinal ?? ordinal++, role: spec.role, use: 'active' };
    if (updating) {
      bindings[updating.slot] = bindings[updating.slot]!.map(item => item === updating.occupant ? next : item);
      updating.occupant = next;
    } else {
      (bindings[spec.slot] ??= []).push(next);
      all.push({ slot: spec.slot, occupant: next });
    }
  }
  const removeEdgeIds: string[] = [];
  if (previousReplacingEdgeId) {
    const stillReferenced = Object.values(bindings).flat().some(item => item.edgeId === previousReplacingEdgeId);
    if (!stillReferenced && current.edges.some(edge => edge.id === previousReplacingEdgeId)) {
      removeEdgeIds.push(previousReplacingEdgeId);
    }
  }
  return planCanvasInputMutation(current, { addEdges, removeEdgeIds: removeEdgeIds.length ? removeEdgeIds : undefined,
    nodePatches: [{ nodeId: target.id, data: { slotBindings: bindings } }],
    strictConsumption: request }, context);
}

/** Evaluate a complete saved V1 selection in the current operation context; no route search. */
export function validateCanvasInputSelection(graph: CanvasInputMutationState, intent: CanvasStrictConsumptionIntent, context: CanvasMutationRuntimeContext): CanvasInputSelectionVerdict {
  const node = graph.nodes.find(item => item.id === intent.targetNodeId);
  const base: CanvasInputSelectionVerdict = { accepts: false, ready: false, operationId: intent.chosenOperationId,
    records: [], bindings: {}, pending: [], rejections: [], contractFingerprint: context.catalog?.fingerprint ?? '', fingerprint: '' };
  const fail = (reasonCode: string): CanvasInputSelectionVerdict => ({ ...base, reasonCode });
  if (!isGenerate(node)) return fail('missing_node');
  if (node.data.inputBindingVersion !== 1) return fail('input_migration_required');
  const params = readCanvasParams(node);
  if (params.operation !== intent.chosenOperationId) return fail('operation_confirmation_required');
  // A route stamp must not masquerade as V1 qualified routing evidence.
  if (intent.chosenRouteId !== undefined) return fail('route_plan_required');
  const catalog = narrowCatalogByRouting(context.catalog, params.model, params.routing);
  const view = buildContractView(catalog);
  if (!view.available) return fail('catalog_unavailable');
  const model = resolveModelView(view, typeof params.model === 'string' ? params.model : undefined);
  if (!model) return fail('unknown_model');
  const policy = catalog?.generationPolicy?.[node.data.materialType as MaterialType];
  if (policy && !policy.allowedModelIds.includes(model.id)) return fail('not_listed');
  const operation = model.operations.find(op => op.listed && op.id === intent.chosenOperationId && op.output.type === node.data.materialType);
  if (!operation) return fail('operation_incompatible');
  const layout = deriveSlotLayout(catalog, model.id, operation.id);
  const raw = buildCanvasUpstreamFingerprint(node.id, graph.nodes, graph.edges);
  const loaded = effectiveInputDisplay(layout, feedFromFingerprint(raw, 1), node.data.slotBindings as SlotBindings | undefined,
    (node.data.slotConflicts ?? []) as SlotConflict[], [], [], 1);
  const fingerprint = effectiveSlotFingerprint(raw, layout, loaded.bindings, loaded.conflicts, 1);
  const match = matchOperationInputs(operation, fingerprint);
  const invalid = loaded.records.find(record => record.state === 'invalid');
  const parameterFailure = findDeclaredParameterFailure(params, operation.parameters, catalog?.models?.find(item => item.id === model.id)?.parameters as Record<string, unknown> | undefined);
  const accepts = !invalid && !parameterFailure && match.accepts;
  const reasonCode = invalid?.reasonCode ?? (parameterFailure ? 'parameter_unsupported' : match.rejections[0]?.code ?? match.pending[0]?.code);
  return { accepts, ready: accepts && match.ready && !loaded.records.some(record => record.state === 'pending'), operationId: operation.id,
    records: loaded.records, bindings: loaded.bindings, pending: match.pending, rejections: match.rejections,
    ...(reasonCode ? { reasonCode } : {}), contractFingerprint: catalog?.fingerprint ?? '', fingerprint: fingerprint.signature };
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
  if (mutation.strictConsumption) {
    if (!context) return rejectMutation(current, 'catalog_unavailable');
    const verdict = validateCanvasInputSelection({ nodes, edges }, mutation.strictConsumption, context);
    if (!verdict.accepts) return rejectMutation(current, verdict.reasonCode ?? 'operation_incompatible', { verdict });
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
