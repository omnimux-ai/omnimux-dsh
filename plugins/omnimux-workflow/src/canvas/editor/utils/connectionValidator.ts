/**
 * Ported (narrowed) from Gxgen
 * `apps/web/src/pages/CanvasEditor/utils/connectionValidator.ts`
 * (validated by the extraction spike). Two-stage validation:
 * Stage 1: Structural & type contract validation
 * Stage 2: Contract-driven model compatibility validation (Issue #466)
 *
 * Stage 2 uses the SAME compat kernel + catalog injection as the mutation
 * gateway: a connection is valid iff at least one LISTED operation in the
 * catalog can absorb the simulated upstream fingerprint. Unknown models,
 * a missing catalog and zero candidates fail closed (typed reason codes).
 */

import { type Node, type Edge, type Connection } from '@xyflow/react';
// 显式 .ts 扩展名：node --test 的 type-stripping 不做 TS 扩展名解析
import { validateCanvasConnectionStructure } from './canvasConnectionStructure.ts';
import { resolveNodeKind } from '../../../shared/graph/materialNode.ts';
import { buildCanvasUpstreamFingerprint } from '../../../shared/graph/canvasInputMutationGateway.ts';
import {
  evaluateCatalogCompat,
  primaryRejectionCode,
  type CompatReasonCode,
} from '../../../shared/validation/compatKernel.ts';
import type { CapabilityCatalog } from '../../../shared/api.ts';

/** 结构与能力校验拒绝码（文案由 UI 层经 i18n 字典 edge.reject.* 解析，见 rejectReasonKey）。 */
export type ConnectionRejectReasonCode =
  | 'self_connection'
  | 'duplicate_edge'
  | 'missing_node'
  | 'cycle'
  | 'type_contract'
  | 'capacity_exceeded'
  | 'model_incompatible'
  | CompatReasonCode;

export interface DetailedConnectionValidation {
  valid: boolean;
  blockedBy?: 'structure' | 'type-contract' | 'mode-contract' | 'capability' | 'model-capability';
  reasonCode?: ConnectionRejectReasonCode;
  meta?: {
    modelId?: string;
    maxAllowed?: number;
    currentCount?: number;
    [key: string]: unknown;
  };
}

/** reasonCode（含 mutation gateway 的 'invalid_connection' 等未知码）→ i18n key。 */
export function rejectReasonKey(reasonCode: string | undefined | null): string {
  switch (reasonCode) {
    case 'self_connection':
      return 'edge.reject.selfConnection';
    case 'duplicate_edge':
      return 'edge.reject.duplicateEdge';
    case 'missing_node':
      return 'edge.reject.missingNode';
    case 'cycle':
      return 'edge.reject.cycle';
    case 'type_contract':
      return 'edge.reject.typeContract';
    case 'capacity_exceeded':
    case 'slot_capacity':
      return 'edge.reject.capacityExceeded';
    case 'model_incompatible':
      return 'edge.reject.modelIncompatible';
    case 'mime_unsupported':
      return 'edge.reject.mimeUnsupported';
    case 'size_exceeded':
      return 'edge.reject.sizeExceeded';
    case 'duration_exceeded':
      return 'edge.reject.durationExceeded';
    case 'role_conflict':
      return 'edge.reject.roleConflict';
    case 'no_compatible_model':
      return 'edge.reject.noCompatibleModel';
    case 'unknown_model':
      return 'edge.reject.unknownModel';
    case 'contract_missing':
      return 'edge.reject.contractMissing';
    case 'catalog_unavailable':
      return 'edge.reject.catalogUnavailable';
    case 'operation_incompatible':
      return 'edge.reject.operationIncompatible';
    case 'min_unsatisfied':
      return 'edge.reject.minUnsatisfied';
    case 'prompt_required':
      return 'edge.reject.promptRequired';
    default:
      return 'edge.reject.invalid';
  }
}

/**
 * Stage 2 契约驱动模型兼容性校验（Issue #466）
 *
 * 能连上 ⟺ 模拟后目录中至少一个 listed operation 能吸收当前输入。
 * 文本-only 指纹不触发硬闸（prompt 政策由 node_field 槽与 readyToSubmit 管）。
 */
export function validateDynamicModelCapacity(
  connection: Pick<Connection, 'source' | 'target'> & Partial<Pick<Edge, 'data' | 'sourceHandle' | 'targetHandle'>>,
  nodes: Array<Node<Record<string, unknown>>>,
  edges: Edge[],
  catalog?: CapabilityCatalog | null,
): DetailedConnectionValidation {
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!targetNode || targetNode.type !== 'material') {
    return { valid: true };
  }

  const targetData = (targetNode.data || {}) as Record<string, unknown>;
  if (resolveNodeKind(targetData as any) !== 'generate') {
    return { valid: true };
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  if (!sourceNode) {
    return { valid: true };
  }

  const params = (targetData.params || {}) as Record<string, unknown>;
  const modelId = typeof params.model === 'string' ? params.model.trim() : '';

  const fingerprint = buildCanvasUpstreamFingerprint(
    connection.target,
    nodes,
    [...edges, { ...connection, id: 'pending-connection' }],
  );

  // 纯文本指纹：软输入，不触发媒体硬闸。
  if (fingerprint.mediaAssets.length === 0) {
    return { valid: true };
  }

  if (!catalog) {
    return {
      valid: false,
      blockedBy: 'model-capability',
      reasonCode: 'catalog_unavailable',
      meta: { modelId: modelId || undefined },
    };
  }

  const outputType = typeof targetData.materialType === 'string' ? targetData.materialType : undefined;
  const evaluation = evaluateCatalogCompat(catalog, fingerprint, {
    ...(outputType ? { outputType } : {}),
  });
  if (!evaluation.catalogAvailable) {
    return {
      valid: false,
      blockedBy: 'model-capability',
      reasonCode: 'catalog_unavailable',
      meta: { modelId: modelId || undefined },
    };
  }
  if (evaluation.zeroCandidates) {
    return {
      valid: false,
      blockedBy: 'model-capability',
      reasonCode: primaryRejectionCode(evaluation),
      meta: { modelId: modelId || undefined },
    };
  }

  return { valid: true };
}

/** 验证连接是否有效（原样保留入口签名） */
export function validateConnection(
  connection: Edge | Connection,
  nodes: Node[],
  edges: Edge[],
  catalog?: CapabilityCatalog | null,
): boolean {
  return validateConnectionDetailed(connection, nodes, edges, catalog).valid;
}

export function validateConnectionDetailed(
  connection: Edge | Connection,
  nodes: Node[],
  edges: Edge[],
  catalog?: CapabilityCatalog | null,
): DetailedConnectionValidation {
  // Stage 1: 结构与类型合同校验
  const structure = validateCanvasConnectionStructure(
    connection,
    nodes as Node<Record<string, unknown>>[],
    edges,
  );
  if (!structure.valid) {
    return {
      valid: false,
      blockedBy: structure.reasonCode === 'type_contract' ? 'type-contract' : 'structure',
      reasonCode: structure.reasonCode,
    };
  }

  // Stage 2: 契约驱动模型兼容性校验
  const stage2 = validateDynamicModelCapacity(
    connection,
    nodes as Node<Record<string, unknown>>[],
    edges,
    catalog,
  );
  if (!stage2.valid) {
    return stage2;
  }

  return { valid: true };
}
