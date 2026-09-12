/**
 * ExecutionContext — M3 port of Gxgen
 * `server/src/services/canvas/ExecutionContext.ts` (strict TypeScript).
 *
 * Runtime state container for one workflow execution: the execution state
 * machine (pending/running/paused/completed/error/cancelled), the node
 * state machine (pending/running/completed/error/skipped), the node output
 * cache, media assets, breakpoints and the 11-event protocol emitter the
 * SSE publisher forwards to the canvas island.
 *
 * Port notes (algorithm semantics unchanged):
 * - Gxgen extends Node's EventEmitter (any-typed); here the emitter is a
 *   small typed emitter so strict mode holds without `any`.
 * - `workflowId` keeps the Gxgen property name for wire compatibility;
 *   the plugin passes the workspace id into it.
 */

import { randomUUID } from 'node:crypto';
import { createWorkflowLogger } from './logger';
import type { UpstreamTaskRef } from '../seam/gateway';
import { readUpstreamTaskRef } from './upstreamTask';

const LOG_TAG = 'ExecutionContext';

/** Skip reason recorded on nodes converged by a cancelled execution. */
const CANCELLED_SKIP_REASON = '执行已取消';

// ============================================================================
// Status enums (Gxgen ExecutionStatus / NodeStatus, string-valued)
// ============================================================================

export const ExecutionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
} as const;

export type ExecutionStatusValue = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const NodeStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
  SKIPPED: 'skipped',
} as const;

export type NodeStatusValue = (typeof NodeStatus)[keyof typeof NodeStatus];

// ============================================================================
// Typed event protocol (11 events, aligned with Gxgen useExecutionSSE)
// ============================================================================

export interface ExecutionEventPayloads {
  execution_start: {
    executionId: string;
    workflowId: string;
    totalNodes: number;
    startedAt: number;
  };
  node_start: {
    executionId: string;
    nodeId: string;
    label?: string;
    type?: string;
    startedAt: number;
  };
  node_progress: {
    executionId: string;
    nodeId: string;
    progress: number;
    message: string;
  };
  node_complete: {
    executionId: string;
    nodeId: string;
    output: unknown;
    duration: number;
    progress: number;
  };
  node_error: {
    executionId: string;
    nodeId: string;
    error: string;
    duration: number;
  };
  node_skipped: {
    executionId: string;
    nodeId: string;
    reason: string;
  };
  execution_paused: {
    executionId: string;
    pausedAt: number;
    pausedAtNode: string | null;
  };
  execution_resumed: {
    executionId: string;
    resumedAt: number;
  };
  execution_complete: {
    executionId: string;
    workflowId: string;
    duration: number;
    completedNodes: number;
    totalNodes: number;
  };
  execution_error: {
    executionId: string;
    workflowId: string;
    error: string;
    failedNode: string | null;
    duration: number;
  };
  execution_cancelled: {
    executionId: string;
    cancelledAt: number;
  };
}

export type ExecutionEventName = keyof ExecutionEventPayloads;

type Handler<K extends ExecutionEventName> = (payload: ExecutionEventPayloads[K]) => void;

/** Storage-level handler: accepts any protocol payload. */
type StoredHandler = (payload: never) => void;

/** Minimal typed event emitter (zero-dep, strict). */
class TypedEventEmitter {
  private readonly handlers = new Map<ExecutionEventName, Set<StoredHandler>>();

  on<K extends ExecutionEventName>(event: K, handler: Handler<K>): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as unknown as StoredHandler);
  }

  off<K extends ExecutionEventName>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as unknown as StoredHandler);
  }

  emit<K extends ExecutionEventName>(event: K, payload: ExecutionEventPayloads[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<K>)(payload);
      } catch (error) {
        // A broken listener must never break the execution engine.
        logger.warn('event handler threw', {
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  listenerCount(): number {
    let total = 0;
    for (const set of this.handlers.values()) total += set.size;
    return total;
  }
}

const logger = createWorkflowLogger(LOG_TAG);

// ============================================================================
// Persisted state shapes
// ============================================================================

export interface NodeStateSnapshot {
  status: NodeStatusValue;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  skipReason?: string;
  /**
   * #1382: the upstream task this node is currently waiting on, cleared once the
   * node reaches a terminal state or the reference proves unusable.
   *
   * Optional and additive: it rides the existing `nodeStates` plumbing through
   * `toJSON` / `fromJSON` / `buildExecutionRecord` / `loadExecutionRecord`, so
   * the record `schemaVersion` stays `1` — a record without the field is simply
   * a record with no reference (resubmit, the pre-#1382 behavior).
   */
  upstreamTask?: UpstreamTaskRef;
}

export interface SerializedContext {
  id: string;
  workflowId: string;
  status: ExecutionStatusValue;
  variables: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  nodeStates: Record<string, NodeStateSnapshot>;
  mediaAssets: Record<string, Array<Record<string, unknown>>>;
  breakpoints: string[];
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  totalNodes: number;
  completedNodes: number;
}

export interface ExecutionContextOptions {
  workflowId: string;
  /** Execution id override (recovery keeps the persisted id). */
  id?: string;
  initialVariables?: Record<string, unknown>;
  /** Pre-seeded upstream outputs (used in single-node execution mode). */
  initialOutputs?: Record<string, unknown>;
  breakpoints?: Set<string>;
}

/**
 * Converge one non-terminal node state snapshot into a terminal one, in place.
 *
 * Termination paths (cancel / timeout / abort / failure) emit no per-node event
 * for the nodes they interrupt, so a state left at `running` (or at `pending`,
 * written when recovery re-pends an in-flight node) would live on as a
 * permanently in-flight node in `toJSON()` snapshots, in the persisted record
 * and in recovery input. Shared with `executionRecovery`, which converges the
 * persisted record of a run that timed out across a restart.
 *
 * @param status Terminal node status (`error` on failure, `skipped` on cancel).
 * @param error Error message recorded on the converged state (null on cancel).
 * @param skipReason Skip reason recorded with a skip convergence.
 * @param completedAt Settle timestamp (one shared stamp per convergence pass).
 * @returns true when the state was non-terminal and got converged.
 */
export function settleNodeState(
  state: NodeStateSnapshot,
  status: typeof NodeStatus.ERROR | typeof NodeStatus.SKIPPED,
  error: string | null,
  skipReason?: string,
  completedAt: number = Date.now(),
): boolean {
  if (state.status !== NodeStatus.RUNNING && state.status !== NodeStatus.PENDING) return false;
  state.status = status;
  state.completedAt = completedAt;
  state.error = error;
  if (skipReason !== undefined) state.skipReason = skipReason;
  return true;
}

export class ExecutionContext {
  readonly id: string;
  readonly workflowId: string;
  readonly events = new TypedEventEmitter();

  status: ExecutionStatusValue = ExecutionStatus.PENDING;

  readonly variables = new Map<string, unknown>();
  /** nodeId -> node output (unknown: executor-defined shape). */
  readonly nodeOutputs = new Map<string, unknown>();
  /** nodeId -> node state snapshot. */
  readonly nodeStates = new Map<string, NodeStateSnapshot>();
  /** nodeId -> media assets produced by the node. */
  readonly mediaAssets = new Map<string, Array<Record<string, unknown>>>();
  /** Breakpoint node ids (debug pause-before-node). */
  readonly breakpoints: Set<string>;

  startedAt: number | null = null;
  completedAt: number | null = null;
  error: string | null = null;
  totalNodes = 0;
  completedNodes = 0;

  /**
   * #1382: persistence hook, set by whoever owns the record file
   * (`ExecutionManager` / `executionRecovery`).
   *
   * An upstream task reference is written the moment it exists rather than at
   * the next periodic sync: the gap between "the hub accepted the submit" and
   * "the record mentions it" is exactly the window in which a crash would force
   * a resubmit of a task that is already running (and billable) upstream.
   */
  onPersistRequested: (() => void) | null = null;

  constructor(opts: ExecutionContextOptions) {
    this.id = opts.id ?? randomUUID();
    this.workflowId = opts.workflowId;
    this.breakpoints = opts.breakpoints ?? new Set<string>();
    for (const [key, value] of Object.entries(opts.initialVariables ?? {})) {
      this.variables.set(key, value);
    }
    for (const [key, value] of Object.entries(opts.initialOutputs ?? {})) {
      if (value !== undefined) {
        this.nodeOutputs.set(key, value);
      }
    }
  }

  // ========================================================================
  // Execution state machine
  // ========================================================================

  start(totalNodes: number): void {
    this.status = ExecutionStatus.RUNNING;
    this.startedAt = Date.now();
    this.totalNodes = totalNodes;
    this.completedNodes = 0;

    logger.info('execution started', {
      executionId: this.id,
      workflowId: this.workflowId,
      totalNodes,
    });

    this.events.emit('execution_start', {
      executionId: this.id,
      workflowId: this.workflowId,
      totalNodes,
      startedAt: this.startedAt,
    });
  }

  pause(nodeId: string | null = null): void {
    this.status = ExecutionStatus.PAUSED;

    logger.info('execution paused', {
      executionId: this.id,
      pausedAtNode: nodeId,
      progress: `${this.completedNodes}/${this.totalNodes}`,
    });

    this.events.emit('execution_paused', {
      executionId: this.id,
      pausedAt: Date.now(),
      pausedAtNode: nodeId,
    });
  }

  resume(): void {
    if (this.status !== ExecutionStatus.PAUSED) return;
    this.status = ExecutionStatus.RUNNING;

    logger.info('execution resumed', {
      executionId: this.id,
      progress: `${this.completedNodes}/${this.totalNodes}`,
    });

    this.events.emit('execution_resumed', {
      executionId: this.id,
      resumedAt: Date.now(),
    });
  }

  complete(): void {
    this.status = ExecutionStatus.COMPLETED;
    this.completedAt = Date.now();
    const durationMs = this.completedAt - (this.startedAt ?? this.completedAt);

    logger.info('execution completed', {
      executionId: this.id,
      durationMs,
      completedNodes: this.completedNodes,
      totalNodes: this.totalNodes,
    });

    this.events.emit('execution_complete', {
      executionId: this.id,
      workflowId: this.workflowId,
      duration: durationMs,
      completedNodes: this.completedNodes,
      totalNodes: this.totalNodes,
    });
  }

  fail(error: unknown, nodeId: string | null = null): void {
    this.status = ExecutionStatus.ERROR;
    this.completedAt = Date.now();
    this.error = error instanceof Error ? error.message : String(error);
    const durationMs = this.completedAt - (this.startedAt ?? this.completedAt);
    // In-flight siblings (maxParallel > 1) get no node_error of their own.
    const settled = this.settleInFlightNodes(NodeStatus.ERROR, this.error);

    logger.error('execution failed', {
      executionId: this.id,
      error: this.error,
      failedNodeId: nodeId,
      durationMs,
      settledNodes: settled,
    });

    this.events.emit('execution_error', {
      executionId: this.id,
      workflowId: this.workflowId,
      error: this.error,
      failedNode: nodeId,
      duration: durationMs,
    });
  }

  cancel(): void {
    // Idempotent: a timeout cleanup cancels the run before the scheduler loop
    // observes the abort, and only the first caller may stamp the terminal state.
    if (this.status === ExecutionStatus.CANCELLED) return;

    this.status = ExecutionStatus.CANCELLED;
    this.completedAt = Date.now();
    const durationMs = this.startedAt !== null ? this.completedAt - this.startedAt : 0;
    const settled = this.settleInFlightNodes(NodeStatus.SKIPPED, null, CANCELLED_SKIP_REASON);

    logger.info('execution cancelled', {
      executionId: this.id,
      durationMs,
      completedNodes: this.completedNodes,
      totalNodes: this.totalNodes,
      settledNodes: settled,
    });

    this.events.emit('execution_cancelled', {
      executionId: this.id,
      cancelledAt: this.completedAt,
    });
  }

  // ========================================================================
  // Node state machine
  // ========================================================================

  startNode(nodeId: string, nodeInfo: { label?: string; type?: string } = {}): void {
    const startedAt = Date.now();
    // #1382: a node re-entering `running` after a restart must keep the upstream
    // task reference it was recovered with. The scheduler marks a recovered node
    // running before the executor can read that reference, so replacing the
    // whole state here would silently discard the only evidence the task exists.
    const previous = this.nodeStates.get(nodeId);
    this.nodeStates.set(nodeId, {
      status: NodeStatus.RUNNING,
      startedAt,
      completedAt: null,
      error: null,
      ...(previous?.upstreamTask ? { upstreamTask: previous.upstreamTask } : {}),
    });

    this.events.emit('node_start', {
      executionId: this.id,
      nodeId,
      label: nodeInfo.label,
      type: nodeInfo.type,
      startedAt,
    });
  }

  reportProgress(nodeId: string, progress: number, message = ''): void {
    this.events.emit('node_progress', {
      executionId: this.id,
      nodeId,
      progress,
      message,
    });
  }

  completeNode(nodeId: string, output: unknown): void {
    const state: NodeStateSnapshot = this.nodeStates.get(nodeId) ?? {
      status: NodeStatus.PENDING,
      startedAt: null,
      completedAt: null,
      error: null,
    };
    state.status = NodeStatus.COMPLETED;
    state.completedAt = Date.now();
    this.nodeStates.set(nodeId, state);

    this.nodeOutputs.set(nodeId, output);
    this.completedNodes += 1;

    const durationMs = state.completedAt - (state.startedAt ?? state.completedAt);
    const progressPercent = this.totalNodes > 0
      ? Math.round((this.completedNodes / this.totalNodes) * 100)
      : 0;

    this.events.emit('node_complete', {
      executionId: this.id,
      nodeId,
      output,
      duration: durationMs,
      progress: progressPercent,
    });
  }

  failNode(nodeId: string, error: unknown): void {
    const state: NodeStateSnapshot = this.nodeStates.get(nodeId) ?? {
      status: NodeStatus.PENDING,
      startedAt: null,
      completedAt: null,
      error: null,
    };
    state.status = NodeStatus.ERROR;
    state.completedAt = Date.now();
    state.error = error instanceof Error ? error.message : String(error);
    this.nodeStates.set(nodeId, state);

    const durationMs = state.completedAt - (state.startedAt ?? state.completedAt);

    logger.error('node failed', {
      executionId: this.id,
      nodeId,
      error: state.error,
      durationMs,
    });

    this.events.emit('node_error', {
      executionId: this.id,
      nodeId,
      error: state.error,
      duration: durationMs,
    });
  }

  skipNode(nodeId: string, reason = ''): void {
    this.nodeStates.set(nodeId, {
      status: NodeStatus.SKIPPED,
      startedAt: null,
      completedAt: null,
      error: null,
      skipReason: reason,
    });

    this.events.emit('node_skipped', {
      executionId: this.id,
      nodeId,
      reason,
    });
  }

  /**
   * Converge every non-terminal node state of this context (see
   * `settleNodeState` for the rationale).
   *
   * @param status Terminal node status (`error` for a failed run, `skipped`
   *   for a cancelled one).
   * @param error Error message recorded on the converged states (null on cancel).
   * @param skipReason Optional skip reason recorded with a skip convergence.
   * @returns The converged node ids (logging / assertions).
   */
  private settleInFlightNodes(
    status: typeof NodeStatus.ERROR | typeof NodeStatus.SKIPPED,
    error: string | null,
    skipReason?: string,
  ): string[] {
    const settled: string[] = [];
    const completedAt = Date.now();
    for (const [nodeId, state] of this.nodeStates) {
      if (settleNodeState(state, status, error, skipReason, completedAt)) settled.push(nodeId);
    }
    return settled;
  }

  // ========================================================================
  // Upstream task references (#1382)
  // ========================================================================

  /**
   * Record the upstream task this node is now waiting on.
   *
   * Called by the material executor immediately after a successful submit, then
   * persisted before the call returns. `clearNodeUpstreamTask` is the mirror
   * image: a terminal node (or one that turned out to be unreconcilable) must
   * not leave a stale reference behind for the next recovery to chase.
   */
  setNodeUpstreamTask(nodeId: string, ref: UpstreamTaskRef): void {
    const state = this.nodeStates.get(nodeId);
    if (!state) {
      // Bookkeeping only: with no node state there is nothing to attach the
      // reference to, and the node will simply be resubmitted as before.
      logger.warn('cannot record upstream task without a node state', { executionId: this.id, nodeId });
      return;
    }
    state.upstreamTask = ref;
    this.onPersistRequested?.();
  }

  /** Drop the reference (node terminal, or reconciling proved impossible). */
  clearNodeUpstreamTask(nodeId: string): void {
    const state = this.nodeStates.get(nodeId);
    if (!state?.upstreamTask) return;
    delete state.upstreamTask;
    this.onPersistRequested?.();
  }

  /** The reference this node is waiting on, if any (recovery reads this). */
  readNodeUpstreamTask(nodeId: string): UpstreamTaskRef | undefined {
    return this.nodeStates.get(nodeId)?.upstreamTask;
  }

  // ========================================================================
  // Variables / outputs
  // ========================================================================

  set(key: string, value: unknown): void {
    this.variables.set(key, value);
  }

  get(key: string, defaultValue?: unknown): unknown {
    return this.variables.has(key) ? this.variables.get(key) : defaultValue;
  }

  getNodeOutput(nodeId: string): unknown {
    return this.nodeOutputs.get(nodeId);
  }

  // ========================================================================
  // Media assets
  // ========================================================================

  addMediaAsset(nodeId: string, asset: Record<string, unknown>): void {
    const list = this.mediaAssets.get(nodeId) ?? [];
    list.push({ ...asset, createdAt: Date.now() });
    this.mediaAssets.set(nodeId, list);
  }

  getMediaAssets(nodeId: string): Array<Record<string, unknown>> {
    return this.mediaAssets.get(nodeId) ?? [];
  }

  // ========================================================================
  // Breakpoints
  // ========================================================================

  hasBreakpoint(nodeId: string): boolean {
    return this.breakpoints.has(nodeId);
  }

  addBreakpoint(nodeId: string): void {
    this.breakpoints.add(nodeId);
  }

  removeBreakpoint(nodeId: string): void {
    this.breakpoints.delete(nodeId);
  }

  // ========================================================================
  // Serialization (persistence + HTTP snapshots)
  // ========================================================================

  toJSON(): SerializedContext {
    return {
      id: this.id,
      workflowId: this.workflowId,
      status: this.status,
      variables: Object.fromEntries(this.variables),
      nodeOutputs: Object.fromEntries(this.nodeOutputs),
      nodeStates: Object.fromEntries(this.nodeStates),
      mediaAssets: Object.fromEntries(this.mediaAssets),
      breakpoints: [...this.breakpoints],
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
      totalNodes: this.totalNodes,
      completedNodes: this.completedNodes,
    };
  }

  static fromJSON(data: SerializedContext): ExecutionContext {
    const ctx = new ExecutionContext({
      workflowId: data.workflowId,
      id: data.id,
      initialVariables: data.variables,
      breakpoints: new Set(data.breakpoints),
    });
    ctx.status = data.status;
    for (const [nodeId, output] of Object.entries(data.nodeOutputs)) {
      ctx.nodeOutputs.set(nodeId, output);
    }
    for (const [nodeId, state] of Object.entries(data.nodeStates)) {
      // #1382: a persisted reference is unchecked JSON — normalize it on the way
      // in so a malformed value reads as "no reference" instead of steering a
      // reconcile at something unusable.
      const upstreamTask = readUpstreamTaskRef(state.upstreamTask);
      const normalized: NodeStateSnapshot = { ...state };
      if (upstreamTask) normalized.upstreamTask = upstreamTask;
      else delete normalized.upstreamTask;
      ctx.nodeStates.set(nodeId, normalized);
    }
    for (const [nodeId, assets] of Object.entries(data.mediaAssets)) {
      ctx.mediaAssets.set(nodeId, assets);
    }
    ctx.startedAt = data.startedAt;
    ctx.completedAt = data.completedAt;
    ctx.error = data.error;
    ctx.totalNodes = data.totalNodes;
    ctx.completedNodes = data.completedNodes;
    return ctx;
  }
}
