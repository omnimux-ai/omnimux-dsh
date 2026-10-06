import type { Edge } from '@xyflow/react';
import type { CanvasInputMutationState, CanvasMutationRuntimeContext, CanvasNode } from './canvasInputMutationGateway.ts';
import type { MaterialType } from '../canvasTypes.ts';
import { buildCanvasUpstreamFingerprint, readCanvasParams } from './canvasInputSources.ts';
import { buildContractView, buildUpstreamFingerprint, isMediaInputType, matchOperationInputs, planAutoAdaptation, resolveModelView } from '../validation/compatKernel.ts';
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
  const currentVersion = node.data.inputBindingVersion === 1;
  const raw = buildCanvasUpstreamFingerprint(node.id, graph.nodes, graph.edges);
  const view = buildContractView(catalog);
  if (!params.model && catalog) {
    const recommended = catalog.defaultOperations?.[outputType];
    const pick = planAutoAdaptation({ catalog, outputType, preferredModelId: context.preferredModels?.[outputType] ?? recommended?.modelId,
      currentOperationId: typeof params.operation === 'string' ? params.operation : undefined,
      fingerprint: buildUpstreamFingerprint({ ...raw, assets: raw.assets.filter((asset) => asset.type === 'text') }) });
    if (pick) { params.model = pick.modelId; params.operation ??= pick.operationId; }
  }
  const model = resolveModelView(view, typeof params.model === 'string' ? params.model : undefined);
  if (model) params.model = model.id;
  const savedOperation = typeof params.operation === 'string' && params.operation.trim() ? params.operation.trim() : undefined;
  const legacyChat = !currentVersion && outputType === 'text' && savedOperation === 'chat';
  const savedOp = savedOperation && model
    ? model.operations.find((op) => op.id === savedOperation && op.listed && op.output.type === outputType)
    : undefined;
  // 系统写入的生成方式不是用户的创作选择：节点数据 autoOperationId 记录来源（string = 系统推导，
  // null = 用户拍板，undefined = 历史节点来源未知，仅当模式恰好等于该产出类型的目录推荐值时才按系统写入对待）。
  const autoOperationId = node.data.autoOperationId;
  const systemChosen = autoOperationId === undefined
    ? Boolean(savedOperation && savedOperation === catalog?.defaultOperations?.[outputType]?.operationId)
    : autoOperationId === savedOperation;
  // 仅当已就绪的上游媒体当前模式吸收不了时才改写；用户拍板过的模式与无素材场景都不受影响。
  const strandedBySupply = Boolean(savedOp && !matchOperationInputs(savedOp, raw).accepts
    && raw.assets.some((asset) => isMediaInputType(asset.type) && asset.availability === 'ready'));
  let autoDerived: string | undefined;
  if ((!savedOperation || legacyChat || (systemChosen && strandedBySupply)) && model) {
    // A node without a saved mode starts in the catalog's recommended one — the mode that
    // consumes upstream media, so its slots exist from the first render. A saved mode, an
    // explicit connection or a user pick is never replaced here.
    const recommendedId = catalog?.defaultOperations?.[outputType]?.operationId;
    const recommended = recommendedId && model.operations.some((op) => op.id === recommendedId && op.listed && op.output.type === outputType)
      ? recommendedId : undefined;
    params.operation = resolveSlotOperation(catalog, model.id, systemChosen && strandedBySupply ? undefined : params.operation, outputType, raw) ?? recommended;
    if (typeof params.operation === 'string' && params.operation) autoDerived = params.operation;
  }
  const operation = model?.operations.find((op) => op.id === params.operation && op.listed && op.output.type === outputType);
  const policy = catalog?.generationPolicy?.[outputType];
  const permitted = !policy || policy.allowedModelIds.includes(String(model?.id ?? params.model));
  const layout = deriveSlotLayout(catalog, model?.id, operation?.id);
  const feed = feedFromFingerprint(raw, currentVersion ? 1 : undefined);
  const plainSpeech = !currentVersion && outputType === 'audio' && params.operation === 'text_to_speech';
  let explicit = plainSpeech ? {} : node.data.slotBindings as SlotBindings | undefined;
  if (!currentVersion && outputType === 'text' && explicit && Object.keys(explicit).length === 0 && (!node.data.slotStandbyEdgeIds || (node.data.slotStandbyEdgeIds as unknown[]).length === 0)) {
    explicit = undefined;
  }
  const priorParams = previous ? readCanvasParams(previous) : {};
  const modeChanged = previous && (priorParams.operation !== params.operation || priorParams.model !== params.model);
  if (explicit) {
    explicit = Object.fromEntries(Object.entries(explicit).map(([slot, occupants]) => [slot,
      occupants.filter((occupant) => currentVersion || !modeChanged || occupant.pinned).map((occupant) => ({ ...occupant }))]));
    for (const conflict of (plainSpeech ? [] : node.data.slotConflicts ?? []) as SlotConflict[]) {
      const occupants = explicit[conflict.slot] ??= [];
      if (!occupants.some((item) => item.edgeId === conflict.occupant.edgeId)) occupants.push({ ...conflict.occupant });
    }
    // Only new edges may carry a picker hint. Stale edge mirrors never override node slots.
    const newEdges = currentVersion ? [] : graph.edges.filter((edge) => edge.target === node.id && newEdgeIds.has(edge.id));
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
  const standbyIds = Array.isArray(node.data.slotStandbyEdgeIds) ? node.data.slotStandbyEdgeIds.filter((id): id is string => typeof id === 'string') : [];
  // A missing V1 `slotBindings` means "not initialized yet", not "the user cleared every slot": the display
  // side self-heals such a node by auto-filling, so the store must persist that same fill. Leaving `{}` behind
  // splits the two readers — the panel shows a filled slot while submission skips the fill and drops the asset
  // silently. An explicit `{}` (a user clear, or a parked edge) keeps its meaning, and a fill that binds
  // nothing keeps the previous empty shape so untouched nodes stay byte-identical.
  const selfHealed = explicit === undefined ? autoFillSlots(feed, layout, {}, standbyIds) : undefined;
  const filledAnything = selfHealed !== undefined && Object.values(selfHealed.bindings).some((occupants) => occupants.length > 0);
  const fill = currentVersion
    ? (filledAnything ? selfHealed! : { bindings: explicit ?? {}, conflicts: (node.data.slotConflicts ?? []) as SlotConflict[] })
    : explicit ? autoFillSlots(feed, layout, explicit, standbyIds) : hydrateSlotBindings(feed, layout, graph.edges.filter((edge) => edge.target === node.id));
  const fingerprint = effectiveSlotFingerprint(raw, layout, fill.bindings, fill.conflicts, currentVersion ? 1 : undefined);
  const match = operation && permitted ? matchOperationInputs(operation, fingerprint) : undefined;
  const reasonCodes = !view.available ? ['catalog_unavailable'] : !permitted ? ['not_listed'] : !model ? ['unknown_model']
    : !operation ? ['operation_incompatible'] : [...(match?.rejections ?? []), ...(match?.pending ?? [])].map((item) => item.code);
  if (fill.conflicts.length) reasonCodes.push('role_conflict');
  return { ...node, data: { ...node.data, params, ...(autoDerived ? { autoOperationId: autoDerived } : {}),
    slotBindings: fill.bindings, slotConflicts: fill.conflicts,
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
