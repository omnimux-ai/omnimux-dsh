/** Shared input/configuration guard for execution admission and final dispatch. */

import type { CapabilityCatalog, CatalogModelDto } from '../api.ts';
import { findDeclaredParameterFailure } from './declaredParameterValidation.ts';
import { buildEffectiveOpsUiState, buildUiUpstreamFingerprint } from './operationUi.ts';
import { readNodeInputSource } from '../graph/nodeInputSource.ts';
import type { UpstreamMediaSnapshot } from './operationUi.ts';
import { readExplicitTargetSlot } from './compatKernel.ts';
import { resolveNodeKind } from '../graph/materialNode.ts';
import { deriveSlotLayout, hydrateSlotBindings, slotBindingConflicts, type SlotBindings, type SlotConflict } from '../graph/feedSlot/index.ts';
import { effectiveSlotFingerprint, feedFromFingerprint } from '../graph/feedSlot/effectiveFingerprint.ts';
import { resolveSlotOperation } from '../graph/feedSlot/resolveSlotOperation.ts';
import {
  buildContractView,
  matchOperationInputs,
  resolveModelView,
} from './compatKernel.ts';

export interface ExecutionReadinessNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface ExecutionReadinessFailure {
  nodeId: string;
  reasonCode: string;
  message: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export interface ExecutionReadinessGraph {
  nodes: ExecutionReadinessNode[];
  edges: Array<{ id?: string; source: string; target: string; targetHandle?: string | null; data?: Record<string, unknown> }>;
  workspaceId?: string;
  resolvedInputs?: ReadonlyMap<string, UpstreamMediaSnapshot[]>;
  /** Only full/subset execution may defer generation dependencies in this set. */
  scheduledNodeIds?: ReadonlySet<string>;
}

function upstreamSnapshots(nodeId: string, graph?: ExecutionReadinessGraph): UpstreamMediaSnapshot[] {
  return (graph?.edges ?? []).filter((edge) => edge.target === nodeId).flatMap((edge, ordinal) => {
    const node = graph!.nodes.find((candidate) => candidate.id === edge.source);
    const source = readNodeInputSource(node ?? { id: edge.source }, graph?.workspaceId);
    const binding = edge.data?.slotBinding as { role?: string } | undefined;
    const inputs = graph?.resolvedInputs?.get(edge.source) ?? [{
      nodeId: edge.source, label: source.label, outputId: source.outputId, materialType: node ? source.materialType : String(edge.data?.feedType ?? source.materialType),
      availability: source.availability, availabilityMessage: source.message,
      textContent: source.output.text, url: source.output.mediaAssets?.[0]?.url,
      ...source.metadata,
    }];
    return inputs.map((input) => ({ ...input, edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`,
      role: typeof edge.data?.role === 'string' ? edge.data.role : binding?.role,
      targetSlot: readExplicitTargetSlot(edge.data ?? {}, edge.targetHandle),
    }));
  });
}

/**
 * Check current sources, roles, slots and declared model parameters. Scheduled
 * generation dependencies may wait until dispatch; imported sources must exist.
 */
export function findExecutionReadinessFailure(
  nodes: ExecutionReadinessNode[],
  catalog: CapabilityCatalog | null | undefined,
  graph?: ExecutionReadinessGraph,
): ExecutionReadinessFailure | null {
  const view = buildContractView(catalog);

  for (const node of nodes) {
    if (node.type !== 'material' || resolveNodeKind(node.data ?? {}) !== 'generate') continue;
    let upstreams = upstreamSnapshots(node.id, graph);
    const deferred = new Set(upstreams.filter((input) => {
      const source = graph?.nodes.find((candidate) => candidate.id === input.nodeId);
      return source?.type === 'material' && resolveNodeKind(source.data ?? {}) === 'generate'
        && graph?.scheduledNodeIds?.has(source.id);
    }).map((input) => input.nodeId));
    const waitingText = upstreams.find((input) => input.materialType === 'text' && input.availability !== 'ready' && !deferred.has(input.nodeId));
    if (waitingText) return { nodeId: node.id, reasonCode: waitingText.availability === 'unavailable' ? 'input_unavailable' : 'input_waiting',
      message: waitingText.availabilityMessage ?? `等待来源 ${waitingText.nodeId} 的内容` };
    if (!view.available) return { nodeId: node.id, reasonCode: 'catalog_unavailable', message: '模型目录不可用，请稍后重试' };
    // These sources will run again; their old result metadata is not this run's input.
    upstreams = upstreams.map((input) => deferred.has(input.nodeId)
      ? { nodeId: input.nodeId, label: input.label, materialType: input.materialType, edgeId: input.edgeId,
          role: input.role, targetSlot: input.targetSlot, availability: 'waiting' as const }
      : input);
    const data = node.data ?? {};
    const params = data.params && typeof data.params === 'object'
      ? data.params as Record<string, unknown>
      : {};
    const requestedModel = readString(params.model);
    const outputKind = typeof data.materialType === 'string' ? data.materialType : 'text';
    const defaultModel = catalog?.defaults?.[outputKind as keyof NonNullable<CapabilityCatalog['defaults']>];
    const model = resolveModelView(view, requestedModel ?? defaultModel);
    if (!model) return { nodeId: node.id, reasonCode: 'unknown_model', message: '当前模型不可用，请选择模型后重试' };
    const rawFingerprint = buildUiUpstreamFingerprint({
      materialType: typeof data.materialType === 'string' ? data.materialType : undefined,
      prompt: typeof data.prompt === 'string' ? data.prompt : '',
      content: typeof data.content === 'string' ? data.content : undefined,
      upstreams,
      nodeFields: params,
    });
    const outputType = typeof data.materialType === 'string' ? data.materialType : undefined;
    const chosenId = resolveSlotOperation(catalog, model.id, params.operation, outputType, rawFingerprint);
    const layout = deriveSlotLayout(catalog, model.id, chosenId);
    const hydrated = data.slotBindings === undefined ? hydrateSlotBindings(feedFromFingerprint(rawFingerprint), layout) : undefined;
    const bindings = (data.slotBindings ?? hydrated?.bindings ?? {}) as SlotBindings;
    const conflicts = [...(data.slotConflicts ?? hydrated?.conflicts ?? []) as SlotConflict[], ...slotBindingConflicts(layout, bindings, feedFromFingerprint(rawFingerprint))];
    if (conflicts.length) return { nodeId: node.id, reasonCode: 'role_conflict', message: '已指定素材的卡槽或用途不再合法，请重新绑定' };
    const fingerprint = effectiveSlotFingerprint(rawFingerprint, layout, bindings, conflicts);
    const unavailable = fingerprint.assets.find((asset) => asset.availability !== 'ready' && !deferred.has(asset.sourceNodeId));
    if (unavailable) return { nodeId: node.id, reasonCode: unavailable.availability === 'unavailable' ? 'input_unavailable' : 'input_waiting',
      message: unavailable.availabilityMessage ?? `等待来源 ${unavailable.sourceNodeId} 的内容` };
    const opsState = buildEffectiveOpsUiState({
      catalog,
      modelId: model.id,
      fingerprint,
      ...(outputType ? { outputType } : {}),
      ...(readString(params.operation) ? { preferredOperationId: readString(params.operation) } : {}),
    });
    const rawOperation = readString(params.operation);
    const selectedOperationId = rawOperation ?? chosenId ?? opsState.selectedOperationId ?? opsState.implicitOperationId;
    const operation = selectedOperationId
      ? model.operations.find((candidate) => candidate.id === selectedOperationId && candidate.listed)
      : undefined;
    const selectedIsEffective = Boolean(
      selectedOperationId && opsState.effectiveOps.some((candidate) => candidate.id === selectedOperationId),
    );
    // Raw persisted operation ids are never a soft preference: if no longer
    // listed/effective for this model and node shape, block before mock or hub
    // submission. For an omitted id, the kernel's implicit/chosen operation is
    // used so its parameters and node fields receive the same checks as UI.
    if (!operation || !selectedIsEffective) {
      return {
        nodeId: node.id,
        reasonCode: 'operation_incompatible',
        message: rawOperation
          ? `当前模型不支持已保存的生成方式 ${rawOperation}`
          : (opsState.reasonMessage ?? '当前模型没有可用的生成方式'),
      };
    }
    const catalogModel = (catalog?.models ?? []).find((candidate: CatalogModelDto) =>
      candidate.id === model.id || candidate.aliases?.includes(model.id),
    );
    const parameterFailure = findDeclaredParameterFailure(
      params,
      operation.parameters,
      catalogModel?.parameters as Record<string, unknown> | undefined,
    );
    if (parameterFailure) {
      return {
        nodeId: node.id,
        reasonCode: 'parameter_unsupported',
        message: parameterFailure.message,
      };
    }
    const match = matchOperationInputs(operation, fingerprint);
    const missing = [...match.rejections, ...match.pending].find((failure) => {
      if (deferred.size === 0) return true;
      // Missing dynamic content is checked again against completed scheduler outputs.
      if (['input_waiting', 'input_unavailable'].includes(failure.code)) {
        return !deferred.has(String(failure.meta?.sourceNodeId));
      }
      return !(failure.code === 'prompt_required'
        && upstreams.some((input) => deferred.has(input.nodeId) && input.materialType === 'text'));
    });
    if (missing) return { nodeId: node.id, reasonCode: missing.code, message: missing.message };
  }
  return null;
}
