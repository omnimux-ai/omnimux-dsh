/** Structure is the only connection gate; Feed-Slot capacity is advisory. */
import { type Node, type Edge, type Connection } from '@xyflow/react';
import { validateCanvasConnectionStructure } from './canvasConnectionStructure.ts';
import { resolveNodeKind } from '../../../shared/graph/materialNode.ts';
import { buildCanvasUpstreamFingerprint } from '../../../shared/graph/canvasInputSources.ts';
import { autoFillSlots, deriveSlotLayout, type SlotBindings } from '../../../shared/graph/feedSlot/index.ts';
import { feedFromFingerprint } from '../../../shared/graph/feedSlot/effectiveFingerprint.ts';
import { resolveSlotOperation } from '../../../shared/graph/feedSlot/resolveSlotOperation.ts';
import { buildContractView, resolveModelView, type CompatReasonCode } from '../../../shared/validation/compatKernel.ts';
import type { CapabilityCatalog } from '../../../shared/api.ts';

export type ConnectionRejectReasonCode = 'self_connection' | 'duplicate_edge' | 'missing_node' | 'cycle' | 'type_contract' | CompatReasonCode | 'capacity_exceeded';
export interface CompatAdvisory {
  reasonCode?: CompatReasonCode | 'capacity_exceeded';
  unusedWouldRemain?: boolean;
  emptyRequiredSlots?: string[];
}
export interface DetailedConnectionValidation {
  valid: boolean;
  blockedBy?: 'structure' | 'type-contract';
  reasonCode?: ConnectionRejectReasonCode;
  advisory?: CompatAdvisory;
}

/** Only structural reasons can be surfaced as edge rejection messages. */
export function rejectReasonKey(reasonCode: string | undefined | null): string {
  switch (reasonCode) {
    case 'self_connection': return 'edge.reject.selfConnection';
    case 'duplicate_edge': return 'edge.reject.duplicateEdge';
    case 'missing_node': return 'edge.reject.missingNode';
    case 'cycle': return 'edge.reject.cycle';
    case 'type_contract': return 'edge.reject.typeContract';
    default: return 'edge.reject.invalid';
  }
}

export function validateDynamicModelCapacity(
  connection: Pick<Connection, 'source' | 'target'> & Partial<Pick<Edge, 'data' | 'sourceHandle' | 'targetHandle'>>,
  nodes: Array<Node<Record<string, unknown>>>, edges: Edge[], catalog?: CapabilityCatalog | null,
): DetailedConnectionValidation {
  const target = nodes.find((node) => node.id === connection.target);
  if (target?.type !== 'material' || resolveNodeKind(target.data) !== 'generate') return { valid: true };
  const fingerprint = buildCanvasUpstreamFingerprint(connection.target, nodes, [...edges, { ...connection, id: 'pending-connection' }]);
  if (!fingerprint.mediaAssets.length) return { valid: true };
  const params = (target.data.params ?? {}) as Record<string, unknown>;
  const model = resolveModelView(buildContractView(catalog), params.model as string | undefined);
  const op = resolveSlotOperation(catalog, model?.id, params.operation, target.data.materialType as string | undefined, fingerprint);
  const layout = deriveSlotLayout(catalog, model?.id, op);
  const fill = autoFillSlots(feedFromFingerprint(fingerprint), layout, (target.data.slotBindings ?? {}) as SlotBindings);
  return { valid: true, advisory: {
    ...(!catalog ? { reasonCode: 'catalog_unavailable' as const }
      : !model ? { reasonCode: 'unknown_model' as const }
      : fill.unusedFeed.length ? { reasonCode: 'capacity_exceeded' as const } : {}),
    unusedWouldRemain: fill.unusedFeed.length > 0,
    emptyRequiredSlots: layout.slots.filter((slot) => (fill.bindings[slot.slot]?.length ?? 0) < slot.min).map((slot) => slot.slot),
  } };
}

export function validateConnection(connection: Edge | Connection, nodes: Node[], edges: Edge[], catalog?: CapabilityCatalog | null): boolean {
  return validateConnectionDetailed(connection, nodes, edges, catalog).valid;
}
export function validateConnectionDetailed(connection: Edge | Connection, nodes: Node[], edges: Edge[], catalog?: CapabilityCatalog | null): DetailedConnectionValidation {
  const structure = validateCanvasConnectionStructure(connection, nodes as Node<Record<string, unknown>>[], edges);
  if (!structure.valid) return {
    valid: false, blockedBy: structure.reasonCode === 'type_contract' ? 'type-contract' : 'structure', reasonCode: structure.reasonCode,
  };
  const stage2 = validateDynamicModelCapacity(connection, nodes as Node<Record<string, unknown>>[], edges, catalog);
  return { valid: structure.valid, ...(stage2.advisory ? { advisory: stage2.advisory } : {}) };
}
