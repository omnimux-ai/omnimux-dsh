/**
 * ExecutionScheduler — M3 port of Gxgen
 * `server/src/services/canvas/ExecutionScheduler.ts` (strict TypeScript).
 *
 * Topological-layer DAG scheduling with maxParallel throttling, pause /
 * resume (promise suspension), cancel, single-step debug mode, and debounced
 * (500ms) DAG state persistence for breakpoint recovery.
 *
 * Port notes (algorithm semantics unchanged):
 * - Gxgen persists dag_state to Postgres via canvasExecutionService; here
 *   persistence is injected (`persistDagState`) and the manager wires it to
 *   $DSH_HOME/omnimux/workflow/executions/<id>/dag-state.json.
 * - Gxgen's 'compensate' fail strategy (task-system compensation) is out of
 *   plugin scope: it degrades to 'abort'. 'abort'/'skip' behave as in Gxgen.
 */

import { ExecutionContext, type ExecutionStatusValue } from './ExecutionContext';
import { createWorkflowLogger } from './logger';

const LOG_TAG = 'ExecutionScheduler';

/** Default max parallel node executions (workspace settings may override). */
export const DEFAULT_MAX_PARALLEL = 3;

/** DAG state persistence debounce window (ms). */
export const DAG_STATE_DEBOUNCE_MS = 500;

/** Poll interval used while waiting for a running node slot (ms). */
const COMPLETION_POLL_MS = 100;

/** Thrown when a node fails with the 'abort' strategy, carrying the node id. */
export class NodeExecutionError extends Error {
  readonly failedNodeId: string;

  constructor(cause: Error, nodeId: string) {
    super(cause.message);
    this.name = 'NodeExecutionError';
    this.failedNodeId = nodeId;
    this.stack = cause.stack;
    this.cause = cause;
  }
}

export interface ExecutableNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface ExecutableEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}

export interface DagState {
  pendingNodes: string[];
  completedNodes: string[];
  runningNodes: string[];
}

export type NodeExecutorFn = (
  node: ExecutableNode,
  context: ExecutionContext,
) => Promise<unknown>;

export interface ExecutionSchedulerOptions {
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  context: ExecutionContext;
  nodeExecutor: NodeExecutorFn;
  maxParallel?: number;
  /** Injected persistence (fs write in production; no-op default). */
  persistDagState?: (state: DagState) => Promise<void>;
}

export interface SchedulerProgress {
  total: number;
  completed: number;
  running: number;
  pending: number;
  percentage: number;
}

const logger = createWorkflowLogger(LOG_TAG);

export class ExecutionScheduler {
  readonly nodes: ExecutableNode[];
  readonly edges: ExecutableEdge[];
  readonly context: ExecutionContext;
  readonly maxParallel: number;

  private readonly nodeExecutor: NodeExecutorFn;
  private readonly persistDagState: (state: DagState) => Promise<void>;
  private readonly dependencyGraph: Map<string, Set<string>>;

  private runningNodes = new Set<string>();
  private pendingNodes = new Set<string>();
  private completedNodes = new Set<string>();

  private isPaused = false;
  private isCancelled = false;
  private stepMode = false;
  private stepCount = 0;

  private resumePromise: Promise<void> | null = null;
  private resumeResolve: (() => void) | null = null;

  private dagStateDirty = false;
  private dagStateFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: ExecutionSchedulerOptions) {
    this.nodes = opts.nodes;
    this.edges = opts.edges;
    this.context = opts.context;
    this.nodeExecutor = opts.nodeExecutor;
    this.maxParallel = opts.maxParallel ?? DEFAULT_MAX_PARALLEL;
    this.persistDagState = opts.persistDagState ?? (async () => undefined);

    this.dependencyGraph = ExecutionScheduler.buildDependencyGraph(this.nodes, this.edges);
    this.pendingNodes = new Set(this.nodes.map((node) => node.id));
    this.completedNodes = new Set<string>();
    this.runningNodes = new Set<string>();
  }

  /**
   * Rebuild a scheduler from persisted DAG state (post-restart recovery).
   * `runningNodes` are NOT trusted: the in-flight executors died with the old
   * process, so they are re-pended (mirrors the Gxgen recovery rule for nodes
   * without a resolvable external task).
   */
  static fromPersistedState(opts: {
    dagState: Partial<DagState>;
    nodes: ExecutableNode[];
    edges: ExecutableEdge[];
    context: ExecutionContext;
    nodeExecutor: NodeExecutorFn;
    maxParallel?: number;
    persistDagState?: (state: DagState) => Promise<void>;
  }): ExecutionScheduler {
    const scheduler = new ExecutionScheduler({
      nodes: opts.nodes,
      edges: opts.edges,
      context: opts.context,
      nodeExecutor: opts.nodeExecutor,
      maxParallel: opts.maxParallel,
      persistDagState: opts.persistDagState,
    });

    const completed = new Set(opts.dagState.completedNodes ?? []);
    const running = (opts.dagState.runningNodes ?? []).filter((id) => !completed.has(id));
    const pending = new Set(opts.dagState.pendingNodes ?? []);

    scheduler.completedNodes = completed;
    // Crash recovery: nodes that were in-flight go back to pending.
    for (const nodeId of running) {
      if (!pending.has(nodeId)) pending.add(nodeId);
    }
    scheduler.pendingNodes = pending;
    scheduler.runningNodes = new Set<string>();

    if (opts.context.status === 'paused') {
      scheduler.isPaused = true;
      scheduler.resumePromise = new Promise<void>((resolve) => {
        scheduler.resumeResolve = resolve;
      });
    }

    logger.info('scheduler restored from persisted state', {
      executionId: opts.context.id,
      pending: scheduler.pendingNodes.size,
      completed: scheduler.completedNodes.size,
      rePendedRunning: running.length,
    });

    return scheduler;
  }

  private static buildDependencyGraph(
    nodes: ExecutableNode[],
    edges: ExecutableEdge[],
  ): Map<string, Set<string>> {
    const nodeSet = new Set(nodes.map((n) => n.id));
    const graph = new Map<string, Set<string>>();
    for (const node of nodes) {
      graph.set(node.id, new Set<string>());
    }
    for (const edge of edges) {
      // Only an edge whose source is also being executed creates a dependency to await.
      // External upstream edges (e.g. in single-node mode) are consumed via context.nodeOutputs.
      if (nodeSet.has(edge.source)) {
        graph.get(edge.target)?.add(edge.source);
      }
    }
    return graph;
  }

  // ========================================================================
  // Topology
  // ========================================================================

  /**
   * Topological layering (Kahn BFS): each returned group can run in parallel.
   */
  getTopologicalGroups(): string[][] {
    const groups: string[][] = [];
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    const nodeSet = new Set(this.nodes.map((n) => n.id));

    for (const node of this.nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }

    for (const edge of this.edges) {
      if (!nodeSet.has(edge.source)) continue;
      const current = inDegree.get(edge.target);
      if (current !== undefined) inDegree.set(edge.target, current + 1);
      adjList.get(edge.source)?.push(edge.target);
    }

    let currentLayer: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) currentLayer.push(nodeId);
    }

    while (currentLayer.length > 0) {
      groups.push([...currentLayer]);
      const nextLayer: string[] = [];
      for (const nodeId of currentLayer) {
        for (const neighbor of adjList.get(nodeId) ?? []) {
          const degree = inDegree.get(neighbor);
          if (degree === undefined) continue;
          const next = degree - 1;
          inDegree.set(neighbor, next);
          if (next === 0) nextLayer.push(neighbor);
        }
      }
      currentLayer = nextLayer;
    }

    return groups;
  }

  /** True when every dependency of the node has completed. */
  canExecute(nodeId: string): boolean {
    const dependencies = this.dependencyGraph.get(nodeId) ?? new Set<string>();
    for (const depId of dependencies) {
      if (!this.completedNodes.has(depId)) return false;
    }
    return true;
  }

  /** Nodes executable right now, capped by the concurrency limit. */
  getExecutableNodes(): string[] {
    const available: string[] = [];
    const slots = this.maxParallel - this.runningNodes.size;
    if (slots <= 0) return available;
    for (const nodeId of this.pendingNodes) {
      if (this.canExecute(nodeId)) {
        available.push(nodeId);
        if (available.length >= slots) break;
      }
    }
    return available;
  }

  // ========================================================================
  // Main entry
  // ========================================================================

  async execute(opts: { isRecovery?: boolean } = {}): Promise<void> {
    const isRecovery = opts.isRecovery === true;
    const totalNodes = this.nodes.length;
    const topologicalGroups = this.getTopologicalGroups();

    if (totalNodes === 0) {
      logger.warn('no nodes to execute', { executionId: this.context.id });
      this.context.complete();
      return;
    }

    logger.info(`${isRecovery ? 'resuming' : 'starting'} execution`, {
      executionId: this.context.id,
      workflowId: this.context.workflowId,
      totalNodes,
      maxParallel: this.maxParallel,
      topologicalLayers: topologicalGroups.length,
      layerSizes: topologicalGroups.map((group) => group.length),
      isRecovery,
    });

    if (!isRecovery) {
      this.context.start(totalNodes);
    }
    // Flush the initial dag state so a pause/restart before any node
    // completion still leaves a recoverable record.
    this.markDagStateDirty();
    this.scheduleDagStateFlush();

    try {
      await this.executeLoop();

      this.cancelDagStateFlush();
      await this.flushDagState();

      if (this.completedNodes.size === totalNodes) {
        this.context.complete();
      } else if (this.isCancelled) {
        this.context.cancel();
      } else {
        // Loop exited with unfinished nodes: cycle or node failure.
        const unfinished = [...this.pendingNodes];
        const failedCount = totalNodes - this.completedNodes.size - unfinished.length;
        const parts: string[] = [];
        if (failedCount > 0) parts.push(`${failedCount} 个节点执行失败`);
        if (unfinished.length > 0) parts.push(`${unfinished.length} 个节点未执行`);
        const message = `执行不完整，${parts.join('，') || '存在未完成节点'}`;
        logger.error('execution incomplete', {
          executionId: this.context.id,
          unfinishedNodes: unfinished,
          failedCount,
          completedCount: this.completedNodes.size,
          totalNodes,
        });
        this.context.fail(new Error(message));
      }
    } catch (error) {
      this.cancelDagStateFlush();
      await this.flushDagState();

      const failedNodeId = error instanceof NodeExecutionError ? error.failedNodeId : null;
      logger.error('execution failed', {
        executionId: this.context.id,
        error: error instanceof Error ? error.message : String(error),
        failedNodeId,
      });
      this.context.fail(error, failedNodeId);
    }
  }

  private async executeLoop(): Promise<void> {
    let iteration = 0;

    while (this.pendingNodes.size > 0 || this.runningNodes.size > 0) {
      iteration += 1;

      if (this.isCancelled) {
        logger.info('execution loop cancelled', {
          executionId: this.context.id,
          iteration,
          pendingNodes: this.pendingNodes.size,
          runningNodes: this.runningNodes.size,
        });
        break;
      }

      if (this.isPaused) {
        await this.waitForResume();
        if (this.isCancelled) break;
        continue;
      }

      const executableNodes = this.getExecutableNodes();

      if (executableNodes.length === 0 && this.runningNodes.size === 0) {
        // Deadlock: cycle or all remaining nodes failed.
        logger.warn('execution loop deadlock detected', {
          executionId: this.context.id,
          iteration,
          pendingNodes: [...this.pendingNodes],
          completedNodes: this.completedNodes.size,
        });
        break;
      }

      const execPromises = executableNodes.map((nodeId) => this.executeNode(nodeId));

      if (execPromises.length > 0 || this.runningNodes.size > 0) {
        await Promise.race([
          ...execPromises,
          this.waitForAnyCompletion(),
        ]);
      }
    }

    logger.debug('execution loop finished', {
      executionId: this.context.id,
      totalIterations: iteration,
      completedNodes: this.completedNodes.size,
      totalNodes: this.nodes.length,
    });
  }

  private async executeNode(nodeId: string): Promise<void> {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      logger.error('node not found', { executionId: this.context.id, nodeId });
      return;
    }

    // Breakpoint: pause before the node runs and wait for resume.
    if (this.context.hasBreakpoint(nodeId)) {
      logger.info('breakpoint hit', {
        executionId: this.context.id,
        nodeId,
        nodeType: node.type,
      });
      this.pause(nodeId);
      await this.waitForResume();
      if (this.isCancelled) return;
    }

    this.pendingNodes.delete(nodeId);
    this.runningNodes.add(nodeId);
    this.scheduleDagStateFlush();

    this.context.startNode(nodeId, {
      label: typeof node.data?.label === 'string' ? node.data.label : undefined,
      type: node.type,
    });

    const nodeStartTime = Date.now();

    try {
      const output = await this.nodeExecutor(node, this.context);

      // #1386: a cancel that lands while this executor is in flight must not be
      // overwritten by its success. `cancel()` already converged the node to
      // `skipped` on disk, so completing it here left the persisted record
      // saying `cancelled/skipped` while the in-memory context said `completed`
      // — two writers, two answers. Release the slot and let the loop observe
      // the cancel, exactly as the catch branch below does.
      if (this.isCancelled) {
        this.runningNodes.delete(nodeId);
        return;
      }

      this.context.completeNode(nodeId, output);
      this.runningNodes.delete(nodeId);
      this.completedNodes.add(nodeId);
      this.scheduleDagStateFlush();

      logger.debug('node execution finished', {
        executionId: this.context.id,
        nodeId,
        nodeType: node.type,
        durationMs: Date.now() - nodeStartTime,
      });

      // Single-step mode: auto-pause once the step budget is exhausted.
      if (this.stepMode && this.stepCount > 0) {
        this.stepCount -= 1;
        if (this.stepCount === 0) {
          logger.info('stepOver: auto-pausing after node completion', {
            executionId: this.context.id,
            nodeId,
          });
          this.pause(nodeId);
        }
      }
    } catch (error) {
      // Cancellation aborts in-flight executors: that rejection is not a
      // node failure — release the slot and let the loop observe the cancel.
      if (this.isCancelled) {
        this.runningNodes.delete(nodeId);
        return;
      }

      logger.error('node execution error', {
        executionId: this.context.id,
        nodeId,
        nodeType: node.type,
        durationMs: Date.now() - nodeStartTime,
        error: error instanceof Error ? error.message : String(error),
      });

      this.context.failNode(nodeId, error);
      this.runningNodes.delete(nodeId);

      // Immediate flush so a failure is never lost by the debounce.
      this.markDagStateDirty();
      this.cancelDagStateFlush();
      await this.flushDagState();

      const failStrategy = node.data?.failStrategy;
      if (failStrategy === 'skip') {
        // Failed but continue with downstream nodes.
        this.completedNodes.add(nodeId);
        logger.warn('node failed with skip strategy, continuing', {
          executionId: this.context.id,
          nodeId,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      // 'abort' (and Gxgen 'compensate', out of scope) both stop the run.
      throw new NodeExecutionError(
        error instanceof Error ? error : new Error(String(error)),
        nodeId,
      );
    }
  }

  // ========================================================================
  // Control: pause / resume / cancel / single-step
  // ========================================================================

  pause(pausedAtNode: string | null = null): void {
    if (this.isPaused) return;

    this.isPaused = true;
    this.resumePromise = new Promise<void>((resolve) => {
      this.resumeResolve = resolve;
    });

    logger.debug('scheduler paused', {
      executionId: this.context.id,
      pausedAtNode,
      runningNodes: [...this.runningNodes],
      pendingNodes: this.pendingNodes.size,
    });

    // Pause flushes immediately (Gxgen behavior): the persisted dag state
    // must reflect the pause point for restart recovery.
    this.markDagStateDirty();
    this.cancelDagStateFlush();
    void this.flushDagState().catch((error) => {
      logger.warn('dag state flush on pause failed', {
        executionId: this.context.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    this.context.pause(pausedAtNode);
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;

    logger.debug('scheduler resumed', {
      executionId: this.context.id,
      pendingNodes: this.pendingNodes.size,
      completedNodes: this.completedNodes.size,
    });

    const resolve = this.resumeResolve;
    this.resumeResolve = null;
    this.resumePromise = null;
    resolve?.();

    this.context.resume();
  }

  cancel(): void {
    logger.info('scheduler cancel requested', {
      executionId: this.context.id,
      runningNodes: [...this.runningNodes],
      pendingNodes: this.pendingNodes.size,
      completedNodes: this.completedNodes.size,
    });

    this.isCancelled = true;
    // A paused scheduler must be released so the loop can observe the cancel.
    if (this.isPaused) {
      this.resume();
    }
  }

  setStepMode(enabled: boolean): void {
    this.stepMode = enabled;
  }

  /** Execute one node after the current pause, then auto-pause again. */
  stepOver(): void {
    this.stepMode = true;
    this.stepCount = 1;
    this.resume();
  }

  /** Execute `count` nodes after the current pause, then auto-pause. */
  stepN(count: number): void {
    this.stepMode = true;
    this.stepCount = Math.max(1, count);
    this.resume();
  }

  private async waitForResume(): Promise<void> {
    if (this.resumePromise) {
      await this.resumePromise;
    }
  }

  private async waitForAnyCompletion(): Promise<void> {
    if (this.runningNodes.size === 0) return;
    // Gxgen semantics: poll briefly so in-flight nodes can free slots.
    await new Promise<void>((resolve) => setTimeout(resolve, COMPLETION_POLL_MS));
  }

  // ========================================================================
  // DAG state persistence (debounced)
  // ========================================================================

  getDagState(): DagState {
    return {
      pendingNodes: [...this.pendingNodes],
      completedNodes: [...this.completedNodes],
      runningNodes: [...this.runningNodes],
    };
  }

  private scheduleDagStateFlush(): void {
    this.dagStateDirty = true;
    if (this.dagStateFlushTimer) return;

    this.dagStateFlushTimer = setTimeout(() => {
      this.dagStateFlushTimer = null;
      void this.flushDagState().catch((error) => {
        logger.warn('dag state debounced flush failed', {
          executionId: this.context.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, DAG_STATE_DEBOUNCE_MS);
  }

  private cancelDagStateFlush(): void {
    if (this.dagStateFlushTimer) {
      clearTimeout(this.dagStateFlushTimer);
      this.dagStateFlushTimer = null;
    }
  }

  private markDagStateDirty(): void {
    this.dagStateDirty = true;
  }

  private async flushDagState(): Promise<void> {
    if (!this.dagStateDirty) return;
    this.dagStateDirty = false;
    await this.persistDagState(this.getDagState());
  }

  /** Drop pending debounce timers (plugin unmount; state stays on disk). */
  dispose(): void {
    this.cancelDagStateFlush();
    void this.flushDagState().catch(() => undefined);
  }

  getProgress(): SchedulerProgress {
    const total = this.nodes.length;
    return {
      total,
      completed: this.completedNodes.size,
      running: this.runningNodes.size,
      pending: this.pendingNodes.size,
      percentage: total > 0 ? Math.round((this.completedNodes.size / total) * 100) : 0,
    };
  }

  get status(): ExecutionStatusValue {
    return this.context.status;
  }
}
