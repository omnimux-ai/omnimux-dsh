import type { Edge } from '@xyflow/react';
import type { CanvasInputMutationState, CanvasMutationRuntimeContext, CanvasNode } from './canvasInputMutationGateway.ts';
import type { MaterialType } from '../canvasTypes.ts';
import { buildCanvasUpstreamFingerprint, readCanvasParams } from './canvasInputSources.ts';
import { buildContractView, buildUpstreamFingerprint, matchOperationInputs, planAutoAdaptation, resolveModelView } from '../validation/compatKernel.ts';
import { autoFillSlots, deriveSlotLayout, hydrateSlotBindings, type SlotBindings, type SlotConflict } from './feedSlot/index.ts';
import { effectiveSlotFingerprint, feedFromFingerprint } from './feedSlot/effectiveFingerprint.ts';
import { resolveSlotOperation } from './feedSlot/resolveSlotOperation.ts';
import { narrowCatalogByRouting } from '../validation/lineConstraints.ts';

/** Initialize unspecified choices only; supply changes cannot replace a saved creative choice. */
export function recomputeCanvasSlots(node: CanvasNode, graph: CanvasInputMutationState, context: CanvasMutationRuntimeContext, previous?: CanvasNode, newEdgeIds = new Set<string>()): CanvasNode {
  const params = { ...readCanvasParams(node) };
  // A narrow line accepts far less than the contract publishes; narrowing the routed model
  // once here keeps the slot layout, the operation list and the parameter view aligned.
  const catalog = narrowCatalogByRouting(context.catalog, params.model, params.routing);
  const outputType = node.data.materialType as MaterialType;
  const raw = buildCanvasUpstreamFingerprint(node.id, graph.nodes, graph.edges);
  const view = buildContractView(catalog);
  if (!params.model && catalog) {
    const pick = planAutoAdaptation({ catalog, outputType, preferredModelId: context.preferredModels?.[outputType],
      currentOperationId: typeof params.operation === 'string' ? params.operation : undefined,
      fingerprint: buildUpstreamFingerprint({ ...raw, assets: raw.assets.filter((asset) => asset.type === 'text') }) });
    if (pick) { params.model = pick.modelId; params.operation ??= pick.operationId; }
  }
  const model = resolveModelView(view, typeof params.model === 'string' ? params.model : undefined);
  if (model) params.model = model.id;
  if ((!params.operation || (outputType === 'text' && params.operation === 'chat')) && model) {
    params.operation = resolveSlotOperation(catalog, model.id, params.operation, outputType, raw);
  }
  const operation = model?.operations.find((op) => op.id === params.operation && op.listed && op.output.type === outputType);
  const policy = catalog?.generationPolicy?.[outputType];
  const permitted = !policy || policy.allowedModelIds.includes(String(model?.id ?? params.model));
  const layout = deriveSlotLayout(catalog, model?.id, operation?.id);
  const feed = feedFromFingerprint(raw);
  const plainSpeech = outputType === 'audio' && params.operation === 'text_to_speech';
  let explicit = plainSpeech ? {} : node.data.slotBindings as SlotBindings | undefined;
  if (outputType === 'text' && explicit && Object.keys(explicit).length === 0 && (!node.data.slotStandbyEdgeIds || (node.data.slotStandbyEdgeIds as unknown[]).length === 0)) {
    explicit = undefined;
  }
  const priorParams = previous ? readCanvasParams(previous) : {};
  const modeChanged = previous && (priorParams.operation !== params.operation || priorParams.model !== params.model);
  if (explicit) {
    explicit = Object.fromEntries(Object.entries(explicit).map(([slot, occupants]) => [slot,
      occupants.filter((occupant) => !modeChanged || occupant.pinned).map((occupant) => ({ ...occupant }))]));
    for (const conflict of (plainSpeech ? [] : node.data.slotConflicts ?? []) as SlotConflict[]) {
      const occupants = explicit[conflict.slot] ??= [];
      if (!occupants.some((item) => item.edgeId === conflict.occupant.edgeId)) occupants.push({ ...conflict.occupant });
    }
    // Only new edges may carry a picker hint. Stale edge mirrors never override node slots.
    const newEdges = graph.edges.filter((edge) => edge.target === node.id && newEdgeIds.has(edge.id));
    for (const edge of newEdges) {
      const asset = feed.find((item) => item.edgeId === edge.id);
      if (!asset?.targetSlot && !asset?.role) continue;
      const slot = asset.targetSlot ? layout.slots.find((item) => item.slot === asset.targetSlot)
        : layout.slots.find((item) => item.role === asset.role && item.type === asset.type);
      const hint = slot?.slot ?? asset.targetSlot ?? `role:${asset.role}`;
      const occupant = { sourceNodeId: asset.sourceNodeId, edgeId: asset.edgeId, outputId: asset.outputId, pinned: true };
      explicit[hint] = slot?.max === 1 ? [occupant] : [...(explicit[hint] ?? []), occupant];
    }
  }
  const fill = explicit ? autoFillSlots(feed, layout, explicit, Array.isArray(node.data.slotStandbyEdgeIds) ? node.data.slotStandbyEdgeIds.filter((id): id is string => typeof id === 'string') : []) : hydrateSlotBindings(feed, layout, graph.edges.filter((edge) => edge.target === node.id));
  const fingerprint = effectiveSlotFingerprint(raw, layout, fill.bindings, fill.conflicts);
  const match = operation && permitted ? matchOperationInputs(operation, fingerprint) : undefined;
  const reasonCodes = !view.available ? ['catalog_unavailable'] : !permitted ? ['not_listed'] : !model ? ['unknown_model']
    : !operation ? ['operation_incompatible'] : [...(match?.rejections ?? []), ...(match?.pending ?? [])].map((item) => item.code);
  if (fill.conflicts.length) reasonCodes.push('role_conflict');
  return { ...node, data: { ...node.data, params, slotBindings: fill.bindings, slotConflicts: fill.conflicts,
    compat: { status: operation && permitted ? 'ok' : 'configuration_error', acceptsCurrentInputs: match?.accepts ?? false,
      readyToSubmit: Boolean(match?.ready), operation: operation?.id, reasonCodes,
      fingerprint: fingerprint.signature, catalogFingerprint: catalog?.fingerprint ?? '' } } };
}

/** Best-effort mirror for old readers; a single edge cannot express two roles. */
export function mirrorCanvasSlots(node: CanvasNode, edges: Edge[], context: CanvasMutationRuntimeContext): Edge[] {
  const params = readCanvasParams(node);
  const catalog = narrowCatalogByRouting(context.catalog, params.model, params.routing);
  const layout = deriveSlotLayout(catalog, params.model as string | undefined, params.operation as string | undefined);
  const bindings = (node.data.slotBindings ?? {}) as SlotBindings;
  return edges.map((edge) => {
    if (edge.target !== node.id) return edge;
    const slot = layout.slots.find((item) => bindings[item.slot]?.some((occupant) => occupant.edgeId === edge.id));
    const data = { ...edge.data };
    delete data.slotBinding;
    delete data.targetSlot;
    if (slot) data.slotBinding = { slot: slot.slot, role: slot.role, type: slot.type };
    return { ...edge, data };
  });
}
