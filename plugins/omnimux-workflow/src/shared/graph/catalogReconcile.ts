/**
 * Catalog fingerprint reconcile (Issue 467 / W2).
 *
 * When the hub catalog fingerprint changes while a canvas is open, every
 * generate node is re-evaluated through the W1 mutation gateway so
 * slot bindings stay in sync without replacing saved model / operation choices.
 * Unavailable configurations retain their supply edges and report configuration_error.
 *
 * Oscillation guard: reconcile is a no-op when the fingerprint is unchanged
 * or the graph has no generate nodes that still carry a stale fingerprint.
 */

import type { Edge, Node } from '@xyflow/react';
import type { CapabilityCatalog } from '../api.ts';
import { resolveNodeKind } from './materialNode.ts';
import {
  planCanvasInputMutation,
  type CanvasInputMutationPlan,
  type CanvasNode,
} from './canvasInputMutationGateway.ts';

export interface CatalogReconcileInput {
  nodes: CanvasNode[];
  edges: Edge[];
  catalog: CapabilityCatalog | null | undefined;
  preferredModels?: import('./canvasInputMutationGateway.ts').CanvasMutationRuntimeContext['preferredModels'];
  /** Previously applied catalog fingerprint (store / node.compat). */
  previousFingerprint?: string | null;
}

export interface CatalogReconcileResult {
  nodes: CanvasNode[];
  edges: Edge[];
  /** True when nodes/edges changed. */
  changed: boolean;
  /** True when reconcile was skipped (same fingerprint / empty graph). */
  skipped: boolean;
  /** Fingerprint that is now in effect (empty string when catalog missing). */
  fingerprint: string;
  /** Node ids that entered or left configuration_error. */
  touchedNodeIds: string[];
}

function isGenerateMaterialNode(node: CanvasNode | undefined): boolean {
  if (!node || node.type !== 'material') return false;
  return resolveNodeKind((node.data ?? {}) as Record<string, unknown>) === 'generate';
}

function readCompatFingerprint(node: CanvasNode): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const compat = (data.compat && typeof data.compat === 'object'
    ? data.compat
    : null) as Record<string, unknown> | null;
  return typeof compat?.catalogFingerprint === 'string' ? compat.catalogFingerprint : '';
}

/**
 * Decide whether a catalog update should trigger a full-graph reconcile.
 * Same fingerprint → skip (oscillation guard). Missing next fingerprint with
 * a previously-known one still reconciles (fail closed to the new catalog).
 */
export function shouldReconcileCatalog(args: {
  previousFingerprint?: string | null;
  nextFingerprint?: string | null;
  force?: boolean;
}): boolean {
  if (args.force) return true;
  const prev = typeof args.previousFingerprint === 'string' ? args.previousFingerprint : '';
  const next = typeof args.nextFingerprint === 'string' ? args.nextFingerprint : '';
  if (!next && !prev) return false;
  return prev !== next;
}

/**
 * Reconcile every generate node against the new catalog.
 *
 * Implementation: issue a no-op structural plan that still runs the soft
 * recompute path by patching each generate node with its current prompt
 * (identity patch). The gateway recomputes Feed-Slot consumption and stamps
 * `data.compat.catalogFingerprint`; supply edges remain intact.
 */
export function reconcileCanvasForCatalog(
  input: CatalogReconcileInput,
): CatalogReconcileResult {
  const catalog = input.catalog ?? null;
  const nextFingerprint = typeof catalog?.fingerprint === 'string' ? catalog.fingerprint : '';
  const prevFingerprint =
    typeof input.previousFingerprint === 'string' ? input.previousFingerprint : '';

  if (!shouldReconcileCatalog({
    previousFingerprint: prevFingerprint,
    nextFingerprint,
  })) {
    return {
      nodes: input.nodes,
      edges: input.edges,
      changed: false,
      skipped: true,
      fingerprint: nextFingerprint || prevFingerprint,
      touchedNodeIds: [],
    };
  }

  const generateNodes = input.nodes.filter(isGenerateMaterialNode);
  if (generateNodes.length === 0) {
    return {
      nodes: input.nodes,
      edges: input.edges,
      changed: false,
      skipped: true,
      fingerprint: nextFingerprint,
      touchedNodeIds: [],
    };
  }

  // Soft recompute trigger: identity prompt patch on every generate node.
  // The gateway treats prompt patches as soft recomputes (never rejects the
  // whole mutation), so historical zero-candidate graphs keep their edges.
  const nodePatches = generateNodes.map((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    return {
      nodeId: node.id,
      data: {
        // Re-state prompt so the gateway's soft path fires even when the
        // value is unchanged; empty string is a valid prompt.
        prompt: typeof data.prompt === 'string' ? data.prompt : '',
      },
    };
  });

  const plan: CanvasInputMutationPlan = planCanvasInputMutation(
    { nodes: input.nodes as CanvasNode[], edges: input.edges },
    { nodePatches },
    { catalog, preferredModels: input.preferredModels },
  );

  // Soft recompute never rejects; if it somehow did, keep the graph intact.
  if (plan.status !== 'allowed') {
    return {
      nodes: input.nodes,
      edges: input.edges,
      changed: false,
      skipped: false,
      fingerprint: nextFingerprint,
      touchedNodeIds: [],
    };
  }

  const touchedNodeIds: string[] = [];
  for (const node of plan.nodes) {
    if (!isGenerateMaterialNode(node)) continue;
    const before = input.nodes.find((candidate) => candidate.id === node.id);
    if (!before) continue;
    const beforeFp = readCompatFingerprint(before);
    const afterFp = readCompatFingerprint(node);
    const beforeCompat = ((before.data ?? {}) as Record<string, unknown>).compat;
    const afterCompat = ((node.data ?? {}) as Record<string, unknown>).compat;
    if (beforeFp !== afterFp || beforeCompat !== afterCompat) {
      touchedNodeIds.push(node.id);
    }
  }

  const changed =
    plan.nodes !== input.nodes
    || plan.edges !== input.edges
    || touchedNodeIds.length > 0;

  return {
    nodes: plan.nodes,
    edges: plan.edges,
    changed,
    skipped: false,
    fingerprint: nextFingerprint,
    touchedNodeIds,
  };
}

/**
 * Convenience: read the catalog fingerprint currently stamped on the graph
 * (first generate node wins; empty when none).
 */
export function readGraphCatalogFingerprint(
  nodes: Array<Node<Record<string, unknown>> | CanvasNode>,
): string {
  for (const node of nodes) {
    if (!isGenerateMaterialNode(node as CanvasNode)) continue;
    const fp = readCompatFingerprint(node as CanvasNode);
    if (fp) return fp;
  }
  return '';
}
