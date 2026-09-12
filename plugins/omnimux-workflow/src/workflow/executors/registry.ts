/**
 * ★ Extension point: node executor registry (host side).
 *
 * Maps canvas node types to executors. The execution engine (M3
 * ExecutionScheduler) never hard-codes node behavior — it dispatches every
 * node through this registry (see docs/contracts/canvas-http-api.md +
 * ARCHITECTURE.md). The gateway-backed material executor is registered at
 * host mount time (src/workflow/execution/nodeExecutors.ts).
 */

import type { CapabilityCatalog } from '../../shared/api.ts';
import type { UpstreamTaskRef } from '../seam/gateway.ts';

/** Upstream-resolved inputs handed to each executor. */
export interface ExecutionContext {
  /** Catalog captured alongside dispatch validation for the current request. */
  catalog?: CapabilityCatalog;
  /** Node outputs keyed by upstream node id. */
  upstreamOutputs: Map<string, NodeOutput>;
  /** Inbound edges in canvas order, including semantic slot metadata. */
  upstreamBindings?: Array<{
    edgeId?: string;
    sourceNodeId: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    role?: string;
    targetSlot?: string;
    output: NodeOutput;
  }>;
  /** Cooperative cancellation (aborted when the execution is cancelled). */
  signal: AbortSignal;
  /** Destination dir for artifacts of this execution (absolute path). */
  mediaDir: string;
  /** Canvas workspace id — used to build project-file URLs. */
  workspaceId?: string;
  /** Maps an absolute artifact path under mediaDir to a servable URL. */
  toPublicUrl?: (absolutePath: string) => string;
  /**
   * After a media generate tmp lands, move it into project artifacts/
   * and return the public project-file URL. Text generate may skip this.
   */
  persistGenerated?: (input: {
    nodeId: string;
    nodeType: string;
    tmpAbs: string;
    materialType: 'image' | 'video' | 'audio';
    prompt?: string;
    modelId?: string;
  }) => Promise<{
      url: string;
      relativePath: string;
      assetId: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
      durationSec?: number | null;
    }>;
  /** Progress reporter wired to node_progress SSE events (0-100). */
  reportProgress?: (progress: number, message?: string) => void;
  /**
   * #1382: record the upstream task this node is now waiting on. Mirrors
   * `persistGenerated` — an execution-time fact written back into the workflow
   * state — and lands in `nodeStates[<nodeId>].upstreamTask`, which the record
   * already persists.
   */
  recordUpstreamTask?: (ref: UpstreamTaskRef) => void;
  /**
   * #1382: the reference a recovered node was re-pended with, if any. Present
   * means "the hub already has this task" — reconcile instead of submitting.
   */
  readUpstreamTask?: () => UpstreamTaskRef | undefined;
  /** #1382: drop the reference (node terminal, or reconciling is impossible). */
  clearUpstreamTask?: () => void;
}

export interface NodeOutput {
  mediaAssets?: Array<{
    type: 'image' | 'video' | 'audio';
    url: string;
    path?: string;
    thumbnail?: string;
    relativePath?: string;
    assetId?: string;
    mimeType?: string;
    sizeBytes?: number;
    durationSec?: number;
  }>;
  text?: string;
  realPath?: string;
  relativePath?: string;
  assetId?: string;
  /** True only when this node's artifact came from the offline mock gateway. */
  simulated?: boolean;
}

export interface NodeExecutor {
  /** Stable key matching NodeDefinition.executorKey on the client side. */
  key: string;
  execute(
    node: { id: string; type: string; data: Record<string, unknown> },
    ctx: ExecutionContext,
  ): Promise<NodeOutput>;
}

const executors = new Map<string, NodeExecutor>();

export function registerExecutor(executor: NodeExecutor): void {
  executors.set(executor.key, executor);
}

export function getExecutor(key: string): NodeExecutor | undefined {
  return executors.get(key);
}

export function listExecutorKeys(): string[] {
  return [...executors.keys()];
}
