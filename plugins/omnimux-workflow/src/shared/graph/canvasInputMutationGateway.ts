/**
 * Ported (narrowed) from Gxgen
 * `apps/web/src/pages/CanvasEditor/utils/canvasInputMutationGateway.ts`
 * (validated by the extraction spike): every structural nodes/edges change
 * (connect, disconnect, node patches) funnels through
 * planCanvasInputMutation for unified validation. The model-eligibility
 * rewrite loop is cut (preset-service coupling).
 *
 * Issue #466 (W1): the planner optionally takes a runtime context carrying
 * the Catalog v1.1 DTO and then runs the contract-driven compat pass as part
 * of the SAME plan — pending-edge simulation, compatibility evaluation, edge
 * slot bindings and necessary model/operation patches all land in ONE
 * nodes/edges result, so callers commit them with a single store set (no
 * useEffect fix-up window). Zero candidates / missing catalog fail closed:
 * the mutation is rejected and nodes/edges are returned untouched.
 */

import type { Edge, Node } from '@xyflow/react';
// 显式 .ts 扩展名：node --test 的 type-stripping 不做 TS 扩展名解析
import { normalizeCanvasEdge, type CanvasConnectionLike } from './canvasConnectionUtils.ts';
import { validateCanvasConnectionStructure } from './canvasConnectionStructure.ts';
import { resolveNodeKind } from './materialNode.ts';
import type { CapabilityCatalog } from '../api.ts';
import type { MaterialType } from '../canvasTypes.ts';
import { resolveGenerationPrompt } from './generationPrompt.ts';
import { readNodeInputSource } from './nodeInputSource.ts';
import {
  buildContractView,
  buildUpstreamFingerprint,
  evaluateCatalogCompat,
  planAutoAdaptation,
  primaryRejectionCode,
  readExplicitTargetSlot,
  resolveModelView,
  type AutoAdaptationPick,
  type CompatReasonCode,
  type SlotBinding,
  type UpstreamAssetFingerprint,
} from '../validation/compatKernel.ts';

export type CanvasNode = Node<Record<string, unknown>>;

export interface CanvasInputMutationState {
  nodes: CanvasNode[];
  edges: Edge[];
}

export interface CanvasInputNodePatch {
  nodeId: string;
  data: Record<string, unknown>;
  node?: Partial<CanvasNode>;
}

export interface CanvasInputMutation {
  addNodes?: CanvasNode[];
  addEdges?: CanvasConnectionLike[];
  removeNodeIds?: string[];
  removeEdgeIds?: string[];
  nodePatches?: CanvasInputNodePatch[];
}

/**
 * Runtime context for the compat pass. NOT persisted into the graph — the
 * catalog arrives via the modelCatalog seam / HTTP DTO at planning time.
 * When `context` is undefined the planner keeps legacy structure-only
 * behavior (tests / callers that have no catalog yet).
 */
export interface CanvasMutationRuntimeContext {
  catalog?: CapabilityCatalog | null;
  preferredModels?: Partial<Record<MaterialType, string>>;
}

export interface CanvasInputMutationPlan extends CanvasInputMutationState {
  status: 'allowed' | 'rejected' | 'configuration_error';
  reasonCode?: string;
  reasonMeta?: Record<string, unknown>;
}

function rejectMutation(
  current: CanvasInputMutationState,
  status: CanvasInputMutationPlan['status'],
  reasonCode: string,
  reasonMeta?: Record<string, unknown>,
): CanvasInputMutationPlan {
  return {
    nodes: current.nodes,
    edges: current.edges,
    status,
    reasonCode,
    ...(reasonMeta ? { reasonMeta } : {}),
  };
}

function applyNodePatches(nodes: CanvasNode[], patches: CanvasInputNodePatch[]): CanvasNode[] | null {
  const patchById = new Map<string, CanvasInputNodePatch>();
  for (const patch of patches) {
    if (patchById.has(patch.nodeId)) return null;
    patchById.set(patch.nodeId, patch);
  }
  return nodes.map((node) => {
    const patch = patchById.get(node.id);
    if (!patch) return node;
    return {
      ...node,
      ...(patch.node ?? {}),
      data: { ...(node.data as Record<string, unknown>), ...patch.data },
    } as CanvasNode;
  });
}

// ============================================================================
// Compat pass (Issue #466)
// ============================================================================

function isGenerateMaterialNode(node: CanvasNode | undefined): boolean {
  if (!node || node.type !== 'material') return false;
  return resolveNodeKind((node.data ?? {}) as Record<string, unknown>) === 'generate';
}

function readParams(node: CanvasNode): Record<string, unknown> {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return (data.params && typeof data.params === 'object' ? data.params : {}) as Record<string, unknown>;
}

/**
 * Read the canonical operation id from params. Empty means no preference.
 */
function readCurrentOperationId(params: Record<string, unknown>): string | undefined {
  return typeof params.operation === 'string' && params.operation.trim()
    ? params.operation.trim()
    : undefined;
}

function assetFromEdge(edge: Edge, nodes: CanvasNode[]): UpstreamAssetFingerprint | null {
  const source = nodes.find((node) => node.id === edge.source);
  if (!source) return null;
  const data = (source.data ?? {}) as Record<string, unknown>;
  const type = (typeof data.materialType === 'string' ? data.materialType : source.type) ?? 'text';
  const edgeData = (edge.data ?? {}) as Record<string, unknown>;
  // Explicit semantic edge metadata wins over inferred defaults.
  const role =
    (typeof edgeData.role === 'string' && edgeData.role.trim() ? edgeData.role.trim() : undefined)
    ?? (typeof edgeData.slotBinding === 'object'
      && edgeData.slotBinding
      && typeof (edgeData.slotBinding as { role?: unknown }).role === 'string'
      ? String((edgeData.slotBinding as { role: string }).role)
      : undefined);
  const targetSlot = readExplicitTargetSlot(edgeData, edge.targetHandle);
  const current = readNodeInputSource(source);
  const { mimeType, sizeBytes, durationSec } = current.metadata ?? {};
  return {
    edgeId: edge.id,
    sourceNodeId: source.id,
    sourceLabel: current.label,
    availability: current.availability,
    availabilityMessage: current.message,
    outputId: current.outputId,
    url: current.output.mediaAssets?.[0]?.url,
    textContent: current.output.text,
    type,
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(role ? { role } : {}),
    ...(targetSlot ? { targetSlot } : {}),
  };
}

/** Upstream fingerprint of one generate node inside a working graph state. */
function fingerprintForNode(
  node: CanvasNode,
  nodes: CanvasNode[],
  edges: Edge[],
): ReturnType<typeof buildUpstreamFingerprint> {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const assets = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => assetFromEdge(edge, nodes))
    .filter((asset): asset is UpstreamAssetFingerprint => asset !== null);
  return buildUpstreamFingerprint({
    prompt: resolveGenerationPrompt(data, edges.filter((edge) => edge.target === node.id)
      .flatMap((edge) => { const source = nodes.find((candidate) => candidate.id === edge.source); return source?.data.materialType === 'text' ? [readNodeInputSource(source).output.text] : []; })),
    localText: resolveGenerationPrompt(data),
    nodeFields: readParams(node),
    assets,
  });
}

/**
 * Shared helper (canvas isValidConnection + planner): upstream fingerprint
 * of `targetId`, optionally adding not-yet-committed pending source nodes.
 * The pending sources are appended after existing in-edges — the same order
 * the planner sees after normalizing the pending edge.
 */
export function buildCanvasUpstreamFingerprint(
  targetId: string,
  nodes: CanvasNode[],
  edges: Edge[],
  pendingSourceIds: string[] = [],
): ReturnType<typeof buildUpstreamFingerprint> {
  const target = nodes.find((node) => node.id === targetId);
  const data = (target?.data ?? {}) as Record<string, unknown>;
  const assets = edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => assetFromEdge(edge, nodes))
    .filter((asset): asset is UpstreamAssetFingerprint => asset !== null);
  for (const sourceId of pendingSourceIds) {
    const asset = assetFromEdge(
      { id: `pending-${sourceId}-${targetId}`, source: sourceId, target: targetId } as Edge,
      nodes,
    );
    if (asset) assets.push(asset);
  }
  return buildUpstreamFingerprint({
    prompt: resolveGenerationPrompt(data, [...edges.filter((edge) => edge.target === targetId).map((edge) => edge.source), ...pendingSourceIds]
      .flatMap((sourceId) => { const source = nodes.find((candidate) => candidate.id === sourceId); return source?.data.materialType === 'text' ? [readNodeInputSource(source).output.text] : []; })),
    localText: resolveGenerationPrompt(data),
    nodeFields: target ? readParams(target) : {},
    assets,
  });
}

interface CompatNodeState {
  status: 'ok' | 'configuration_error';
  acceptsCurrentInputs: boolean;
  readyToSubmit: boolean;
  operation?: string;
  reasonCodes: string[];
  fingerprint: string;
  catalogFingerprint: string;
  adaptation?: { fromModelId: string; toModelId: string; toModelLabel: string; inputTypes: string[] };
}

function buildCompatState(
  pick: AutoAdaptationPick | null,
  fingerprintSignature: string,
  catalog: CapabilityCatalog | null | undefined,
  reasonCodes: string[],
): CompatNodeState {
  return {
    status: pick ? 'ok' : 'configuration_error',
    acceptsCurrentInputs: pick !== null,
    readyToSubmit: pick?.readyToSubmit ?? false,
    ...(pick ? { operation: pick.operationId } : {}),
    reasonCodes,
    fingerprint: fingerprintSignature,
    catalogFingerprint: typeof catalog?.fingerprint === 'string' ? catalog.fingerprint : '',
  };
}

/** Apply the auto-adaptation pick + compat state to one node (immutable). */
function applyPickToNode(
  node: CanvasNode,
  pick: AutoAdaptationPick | null,
  compatState: CompatNodeState,
): CanvasNode {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const params = { ...readParams(node) };
  if (pick) {
    params.model = pick.modelId;
    params.operation = pick.operationId;
  }
  return {
    ...node,
    data: {
      ...data,
      params,
      compat: compatState,
    },
  } as CanvasNode;
}

/** Write slot bindings onto the edges entering `targetId` (immutable). */
function applyBindingsToEdges(
  edges: Edge[],
  targetId: string,
  bindings: SlotBinding[],
): Edge[] {
  return edges.map((edge) => {
    if (edge.target !== targetId) return edge;
    const binding =
      bindings.find((candidate) => candidate.edgeId === edge.id)
      ?? bindings.find((candidate) => candidate.sourceNodeId === edge.source);
    const data = { ...((edge.data ?? {}) as Record<string, unknown>) };
    if (binding) {
      data.slotBinding = { slot: binding.slot, role: binding.role, type: binding.type };
    } else {
      delete data.slotBinding;
    }
    return { ...edge, data };
  });
}

interface CompatPassResult {
  nodes: CanvasNode[];
  edges: Edge[];
  rejected?: { reasonCode: CompatReasonCode | 'catalog_unavailable'; reasonMeta?: Record<string, unknown> };
}

/**
 * Contract-driven compat pass over the post-structural working state.
 *
 * Strict gate (rejects the whole mutation, nodes/edges untouched):
 *   - a NEW edge brings media (image/video/audio) upstream into a generate
 *     node and zero LISTED operations can absorb it, or the catalog is
 *     unavailable (`catalog_unavailable`);
 *   - a node patch explicitly sets params.model to an unknown model
 *     (`unknown_model`) or to one that cannot absorb current inputs
 *     (`model_incompatible`), or the catalog is unavailable.
 *
 * Soft recompute (never rejects): edge removals, prompt/operation patches —
 * the affected node is re-evaluated, auto-adapted when possible, or flagged
 * `configuration_error` (edges are NEVER auto-deleted).
 */
function runCompatPass(
  current: CanvasInputMutationState,
  working: CanvasInputMutationState,
  mutation: CanvasInputMutation,
  context: CanvasMutationRuntimeContext,
): CompatPassResult {
  const catalog = context.catalog ?? null;
  let nodes = working.nodes;
  let edges = working.edges;

  const nodeById = (id: string) => nodes.find((node) => node.id === id);
  const addedIds = new Set((mutation.addNodes ?? []).map((node) => node.id));
  const manualModelIds = new Set((mutation.nodePatches ?? []).filter((patch) => {
    const next = (patch.data.params as Record<string, unknown> | undefined)?.model;
    const before = current.nodes.find((node) => node.id === patch.nodeId);
    return typeof next === 'string' && next !== (before ? readParams(before).model : undefined);
  }).map((patch) => patch.nodeId));
  const excludedSavedModel = (node: CanvasNode): boolean => {
    const kind = node.data.materialType as MaterialType;
    const policy = catalog?.generationPolicy?.[kind];
    const model = readParams(node).model;
    return Boolean(policy && typeof model === 'string' && model && !policy.allowedModelIds.includes(model));
  };
  const preferredModel = (node: CanvasNode): string | undefined => {
    if (readParams(node).model) return undefined;
    return context.preferredModels?.[node.data.materialType as MaterialType];
  };
  const nodeCompatState = (node: CanvasNode, pick: AutoAdaptationPick | null,
    fingerprint: ReturnType<typeof buildUpstreamFingerprint>, reasonCodes: string[] = []): CompatNodeState => {
    const state = buildCompatState(pick, fingerprint.signature, catalog, reasonCodes);
    const previous = readParams(node).model;
    if (pick && typeof previous === 'string' && previous && previous !== pick.modelId
      && !addedIds.has(node.id) && !manualModelIds.has(node.id)) {
      state.adaptation = {
        fromModelId: previous,
        toModelId: pick.modelId,
        toModelLabel: resolveModelView(buildContractView(catalog), pick.modelId)?.label ?? pick.modelId,
        inputTypes: [...new Set(fingerprint.mediaAssets.map((asset) => asset.type))],
      };
    }
    return state;
  };


  /** Strict gate for one generate node (new media edges). */
  const gateNode = (nodeId: string): CompatPassResult['rejected'] | undefined => {
    const node = nodeById(nodeId);
    if (!isGenerateMaterialNode(node)) return undefined;
    const fingerprint = fingerprintForNode(node!, nodes, edges);
    if (fingerprint.mediaAssets.length === 0) return undefined;
    if (excludedSavedModel(node!)) return { reasonCode: 'not_listed', reasonMeta: { nodeId, modelId: readParams(node!).model } };

    if (!catalog) {
      return { reasonCode: 'catalog_unavailable', reasonMeta: { nodeId } };
    }
    const data = (node!.data ?? {}) as Record<string, unknown>;
    const outputType = typeof data.materialType === 'string' ? data.materialType : undefined;
    const params = readParams(node!);
    const evaluation = evaluateCatalogCompat(catalog, fingerprint, {
      ...(outputType ? { outputType } : {}),
    });
    if (!evaluation.catalogAvailable) {
      return { reasonCode: 'catalog_unavailable', reasonMeta: { nodeId } };
    }
    if (evaluation.zeroCandidates) {
      return {
        reasonCode: primaryRejectionCode(evaluation),
        reasonMeta: { nodeId, modelId: params.model },
      };
    }
    const currentOperationId = readCurrentOperationId(params);
    const pick = planAutoAdaptation({
      catalog,
      fingerprint,
      ...(outputType ? { outputType } : {}),
      ...(typeof params.model === 'string' && params.model ? { currentModelId: params.model } : {}),
      ...(currentOperationId ? { currentOperationId } : {}),
      preferredModelId: preferredModel(node!),
    });
    if (!pick) {
      return { reasonCode: 'no_compatible_model', reasonMeta: { nodeId, modelId: params.model } };
    }
    const compatState = nodeCompatState(node!, pick, fingerprint);
    nodes = nodes.map((candidate) => (candidate.id === nodeId ? applyPickToNode(candidate, pick, compatState) : candidate));
    edges = applyBindingsToEdges(edges, nodeId, pick.bindings);
    return undefined;
  };

  /** Soft recompute for one generate node (removals / non-strict patches). */
  const recomputeNode = (nodeId: string): void => {
    const node = nodeById(nodeId);
    if (!isGenerateMaterialNode(node) || !catalog) return;
    const fingerprint = fingerprintForNode(node!, nodes, edges);
    const data = (node!.data ?? {}) as Record<string, unknown>;
    const outputType = typeof data.materialType === 'string' ? data.materialType : undefined;
    const params = readParams(node!);
    if (excludedSavedModel(node!)) {
      const state = nodeCompatState(node!, null, fingerprint, ['not_listed']);
      nodes = nodes.map((candidate) => candidate.id === nodeId ? applyPickToNode(candidate, null, state) : candidate);
      return;
    }
    const evaluation = evaluateCatalogCompat(catalog, fingerprint, {
      ...(outputType ? { outputType } : {}),
    });
    if (!evaluation.catalogAvailable) return;
    if (evaluation.zeroCandidates) {
      // 旧图 / 竞态零候选：不删边，节点进入 configuration_error。
      const reasonCode = primaryRejectionCode(evaluation);
      const compatState = buildCompatState(null, fingerprint.signature, catalog, [reasonCode]);
      nodes = nodes.map((candidate) =>
        candidate.id === nodeId ? applyPickToNode(candidate, null, compatState) : candidate,
      );
      edges = applyBindingsToEdges(edges, nodeId, []);
      return;
    }
    const currentOperationId = readCurrentOperationId(params);
    const pick = planAutoAdaptation({
      catalog,
      fingerprint,
      ...(outputType ? { outputType } : {}),
      ...(typeof params.model === 'string' && params.model ? { currentModelId: params.model } : {}),
      ...(currentOperationId ? { currentOperationId } : {}),
      preferredModelId: preferredModel(node!),
    });
    const compatState = nodeCompatState(node!, pick, fingerprint, pick ? [] : ['no_compatible_model']);
    nodes = nodes.map((candidate) =>
      candidate.id === nodeId ? applyPickToNode(candidate, pick, compatState) : candidate,
    );
    edges = applyBindingsToEdges(edges, nodeId, pick?.bindings ?? []);
  };

  // ---- 1. Strict gate: newly added edges into generate nodes ----
  const gatedNodeIds: string[] = [];
  for (const edgeLike of mutation.addEdges ?? []) {
    const target = nodeById(edgeLike.target);
    if (!isGenerateMaterialNode(target)) continue;
    if (gatedNodeIds.includes(edgeLike.target)) continue;
    // Only a media-bearing edge has passed strict adaptation. Text-only edges
    // must still reach the soft pass so a just-created target receives its
    // catalog-derived model and operation.
    if (fingerprintForNode(target!, nodes, edges).mediaAssets.length === 0) continue;
    gatedNodeIds.push(edgeLike.target);
    const rejected = gateNode(edgeLike.target);
    if (rejected) {
      return { nodes: current.nodes, edges: current.edges, rejected };
    }
  }

  // ---- 2. Explicit model patches (strict fail-closed) ----
  const patchedModelNodeIds: string[] = [];
  for (const patch of mutation.nodePatches ?? []) {
    const node = nodeById(patch.nodeId);
    if (!isGenerateMaterialNode(node)) continue;
    const patchParams = (patch.data.params ?? {}) as Record<string, unknown>;
    const previousNode = current.nodes.find((candidate) => candidate.id === patch.nodeId);
    const hasModelPatch = typeof patchParams.model === 'string' && patchParams.model.trim().length > 0
      && (!previousNode || readParams(previousNode).model !== patchParams.model);
    if (!hasModelPatch) continue;
    patchedModelNodeIds.push(patch.nodeId);
    const fingerprint = fingerprintForNode(node!, nodes, edges);
    if (!catalog) {
      return { nodes: current.nodes, edges: current.edges, rejected: { reasonCode: 'catalog_unavailable', reasonMeta: { nodeId: patch.nodeId } } };
    }
    const data = (node!.data ?? {}) as Record<string, unknown>;
    const outputType = typeof data.materialType === 'string' ? data.materialType : undefined;
    const evaluation = evaluateCatalogCompat(catalog, fingerprint, {
      ...(outputType ? { outputType } : {}),
    });
    if (!evaluation.catalogAvailable) {
      return { nodes: current.nodes, edges: current.edges, rejected: { reasonCode: 'catalog_unavailable', reasonMeta: { nodeId: patch.nodeId } } };
    }
    const modelId = (patchParams.model as string).trim();
    const view = buildContractView(catalog);
    const resolved = resolveModelView(view, modelId);
    if (!resolved) {
      return {
        nodes: current.nodes,
        edges: current.edges,
        rejected: { reasonCode: 'unknown_model', reasonMeta: { nodeId: patch.nodeId, modelId } },
      };
    }
    const verdict = evaluation.models.find((candidate) => candidate.modelId === resolved.id);
    if (fingerprint.mediaAssets.length > 0 && (!verdict || !verdict.acceptsCurrentInputs)) {
      const code = evaluation.zeroCandidates ? primaryRejectionCode(evaluation) : 'model_incompatible';
      return {
        nodes: current.nodes,
        edges: current.edges,
        rejected: { reasonCode: code, reasonMeta: { nodeId: patch.nodeId, modelId } },
      };
    }
  }

  // ---- 3. Soft recompute: newly added nodes / removed edges / prompt·operation patches ----
  const removedEdgeIds = new Set(mutation.removeEdgeIds ?? []);
  const removedNodeIds = new Set(mutation.removeNodeIds ?? []);
  const recomputeTargets = new Set<string>();
  for (const node of mutation.addNodes ?? []) {
    if (isGenerateMaterialNode(node)) recomputeTargets.add(node.id);
  }
  for (const edge of current.edges) {
    const removed =
      removedEdgeIds.has(edge.id) || removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target);
    if (removed && !removedNodeIds.has(edge.target)) recomputeTargets.add(edge.target);
  }
  for (const patch of mutation.nodePatches ?? []) {
    if (patchedModelNodeIds.includes(patch.nodeId)) recomputeTargets.add(patch.nodeId);
    const patchData = patch.data ?? {};
    const patchParams = (patchData.params ?? {}) as Record<string, unknown>;
    if ('prompt' in patchData || 'operation' in patchParams || 'model' in patchParams) {
      recomputeTargets.add(patch.nodeId);
    }
  }
  for (const edge of mutation.addEdges ?? []) recomputeTargets.add(edge.target);
  const changedSources = new Set((mutation.nodePatches ?? []).filter((patch) =>
    ['content', 'generatedContent', 'materialType', 'mimeType', 'sizeBytes', 'fileSize', 'durationSec', 'duration', 'mediaAssets', 'mediaUrl', 'relativePath', 'realPath', 'path', 'taskId', 'status', 'executionStatus', 'probeStatus', 'isMissing', 'fileMissing', 'isOffline'].some((key) => key in patch.data),
  ).map((patch) => patch.nodeId));
  for (const edge of edges) if (changedSources.has(edge.source)) recomputeTargets.add(edge.target);

  // Nodes patched (any content patch) into generate nodes also get a state refresh
  // when the catalog is present — keeps data.compat in sync with prompt edits.
  for (const targetId of recomputeTargets) {
    if (gatedNodeIds.includes(targetId) && !patchedModelNodeIds.includes(targetId)) continue;
    recomputeNode(targetId);
  }

  return { nodes, edges };
}

// ============================================================================
// Planner
// ============================================================================

export function planCanvasInputMutation(
  current: CanvasInputMutationState,
  mutation: CanvasInputMutation,
  context?: CanvasMutationRuntimeContext,
): CanvasInputMutationPlan {
  const addedNodeIds = new Set<string>();
  for (const node of mutation.addNodes ?? []) {
    if (addedNodeIds.has(node.id) || current.nodes.some((existing) => existing.id === node.id)) {
      return rejectMutation(current, 'rejected', 'duplicate_node');
    }
    addedNodeIds.add(node.id);
  }

  const patchedNodes = applyNodePatches(
    [...current.nodes, ...(mutation.addNodes ?? [])],
    mutation.nodePatches ?? [],
  );
  if (!patchedNodes) return rejectMutation(current, 'rejected', 'duplicate_node_patch');
  const nodeById = new Set(patchedNodes.map((node) => node.id));
  if ((mutation.nodePatches ?? []).some((patch) => !nodeById.has(patch.nodeId))) {
    return rejectMutation(current, 'rejected', 'missing_node');
  }

  const removeEdgeIds = new Set(mutation.removeEdgeIds ?? []);
  const removeNodeIds = new Set(mutation.removeNodeIds ?? []);
  const retainedNodes = patchedNodes.filter((node) => !removeNodeIds.has(node.id));
  const retainedEdges = current.edges.filter((edge) => (
    !removeEdgeIds.has(edge.id)
    && !removeNodeIds.has(edge.source)
    && !removeNodeIds.has(edge.target)
  ));
  const workingEdges = [...retainedEdges];
  for (const edge of mutation.addEdges ?? []) {
    const normalizedEdge = normalizeCanvasEdge(edge);
    const structure = validateCanvasConnectionStructure(normalizedEdge, retainedNodes, workingEdges);
    if (!structure.valid) return rejectMutation(current, 'rejected', structure.reasonCode ?? 'invalid_connection');
    workingEdges.push(normalizedEdge);
  }

  // Issue #466: catalog-aware compat pass — same plan, one atomic commit.
  if (context !== undefined) {
    const compat = runCompatPass(
      current,
      { nodes: retainedNodes, edges: workingEdges },
      mutation,
      context,
    );
    if (compat.rejected) {
      return rejectMutation(current, 'rejected', compat.rejected.reasonCode, compat.rejected.reasonMeta);
    }
    return {
      nodes: compat.nodes,
      edges: compat.edges,
      status: 'allowed',
    };
  }

  return {
    nodes: retainedNodes,
    edges: workingEdges,
    status: 'allowed',
  };
}

export function dispatchSuccessfulConnectionEvents(edges: Edge[]): void {
  // globalThis (not window): this module is shared with the host bundle,
  // whose tsconfig has no DOM lib. The guard keeps the host path a no-op.
  const host = globalThis as { dispatchEvent?: (event: Event) => boolean };
  if (typeof host.dispatchEvent !== 'function') return;
  for (const edge of edges) {
    queueMicrotask(() => {
      host.dispatchEvent!(new CustomEvent('canvas:connection', {
        detail: {
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        },
      }));
    });
  }
}
