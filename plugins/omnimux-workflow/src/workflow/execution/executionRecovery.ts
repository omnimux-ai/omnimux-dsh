import { ExecutionContext, ExecutionStatus, NodeStatus, settleNodeState } from './ExecutionContext';
import {
  ExecutionScheduler,
  type DagState,
  type NodeExecutorFn,
} from './ExecutionScheduler';
import {
  listPersistedExecutionIds,
  loadDagState,
  loadExecutionRecord,
  saveExecutionRecord,
  type PersistedEventLogEntry,
  type PersistedExecutionRecord,
} from './executionStore';
import {
  ALL_EVENT_NAMES,
  EXECUTION_TIMEOUT_MESSAGE,
  EXECUTION_TIMEOUT_MS,
  TERMINAL_STATUSES,
  type ExecutionEntry,
  type ExecutionEventLogEntry,
} from './executionTypes';
import { createDispatchingNodeExecutor } from './nodeExecutors';
import { persistDagState, persistRecord } from './executionTimers';
import type { GenerationGateway } from '../seam/gateway';
import { createWorkflowLogger } from './logger';

const logger = createWorkflowLogger('ExecutionRecovery');

export interface RecoverExecutionDeps {
  executionsDir: string;
  gateway: GenerationGateway;
  mediaDir: string;
  entries: Map<string, ExecutionEntry>;
  onSetupEntry: (entry: ExecutionEntry) => void;
  persistGenerated?: (input: {
    workspaceId: string;
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
}

function handleTimedOutExecution(
  executionsDir: string,
  record: PersistedExecutionRecord,
): null {
  // #1386: one wording with the in-process timeout path, which records the same
  // deadline (`EXECUTION_TIMEOUT_MESSAGE`). Before this, the same event read as
  // an English `error` after a restart but as a message-less `cancelled` while
  // the host stayed alive.
  const error = EXECUTION_TIMEOUT_MESSAGE;
  // The crashed run's in-flight nodes must not survive as running in the record
  // a client reads back through the snapshot endpoint.
  const settled = Object.values(record.nodeStates).filter((state) =>
    settleNodeState(state, NodeStatus.ERROR, error),
  ).length;
  logger.warn('recovered execution timed out, marking failed', {
    executionId: record.id,
    settledNodes: settled,
  });
  saveExecutionRecord(executionsDir, {
    ...record,
    status: ExecutionStatus.ERROR,
    error,
    completedAt: Date.now(),
  });
  return null;
}

/**
 * Re-pend the nodes that were in flight when the process died.
 *
 * `#1379` established this semantic: a restart must not leave a node stuck at
 * `running` forever, so it goes back to `pending` and the scheduler picks it up
 * again. `#1382` keeps that exactly as it is and only refuses to throw away the
 * upstream task reference while doing it — replacing the whole snapshot would
 * erase the one piece of evidence that the hub is already working on this node,
 * so the recovered run would resubmit (and rebill) it.
 *
 * @returns How many re-pended nodes carry a reference, i.e. how many will
 *   reconcile instead of submitting. Reported, not outcome-asserted: whether a
 *   reconcile finishes or falls back is the executor's call.
 */
function resetInFlightNodeStates(
  context: ExecutionContext,
  dagState: Partial<DagState>,
): { reconcilable: number } {
  let reconcilable = 0;
  for (const nodeId of dagState.runningNodes || []) {
    const state = context.nodeStates.get(nodeId);
    if (!state || state.status !== 'running') continue;
    if (state.upstreamTask) reconcilable += 1;
    context.nodeStates.set(nodeId, {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      error: null,
      ...(state.upstreamTask ? { upstreamTask: state.upstreamTask } : {}),
    });
  }
  return { reconcilable };
}

function filterValidReplayLog(eventLog: PersistedEventLogEntry[]): ExecutionEventLogEntry[] {
  const allowedNames = ALL_EVENT_NAMES as readonly string[];
  const result: ExecutionEventLogEntry[] = [];
  for (const row of eventLog) {
    if (allowedNames.includes(row.event)) {
      result.push(row as ExecutionEventLogEntry);
    }
  }
  return result;
}

function buildRecoveredContext(record: PersistedExecutionRecord): ExecutionContext {
  return ExecutionContext.fromJSON({
    id: record.id,
    workflowId: record.workspaceId,
    status: record.status,
    variables: record.variables,
    nodeOutputs: record.nodeOutputs,
    nodeStates: record.nodeStates,
    mediaAssets: record.mediaAssets,
    breakpoints: record.breakpoints,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    error: record.error,
    totalNodes: record.totalNodes,
    completedNodes: record.completedNodes,
  });
}

function createSchedulerForRecovery(params: {
  dagState: Partial<DagState>;
  record: PersistedExecutionRecord;
  context: ExecutionContext;
  executor: NodeExecutorFn;
  executionsDir: string;
}): ExecutionScheduler {
  return ExecutionScheduler.fromPersistedState({
    dagState: params.dagState,
    nodes: params.record.nodes,
    edges: params.record.edges,
    context: params.context,
    nodeExecutor: params.executor,
    maxParallel: params.record.maxParallel,
    persistDagState: (state) => persistDagState(params.executionsDir, params.record.id, state),
  });
}

function assembleRecoveredEntry(
  record: PersistedExecutionRecord,
  context: ExecutionContext,
  scheduler: ExecutionScheduler,
  abortController: AbortController,
): ExecutionEntry {
  return {
    context,
    scheduler,
    abortController,
    nodes: record.nodes,
    edges: record.edges,
    maxParallel: record.maxParallel,
    createdAt: record.createdAt,
    syncTimer: null,
    timeoutTimer: null,
    retentionTimer: null,
    loopRunning: false,
    isRecovered: true,
    eventLog: filterValidReplayLog(record.eventLog),
    disposers: [],
  };
}

export async function recoverExecution(
  deps: RecoverExecutionDeps,
  executionId: string,
): Promise<ExecutionEntry | null> {
  const existing = deps.entries.get(executionId);
  if (existing) return existing;

  const record = loadExecutionRecord(deps.executionsDir, executionId);
  if (!record || TERMINAL_STATUSES.has(record.status)) return null;

  if (record.startedAt !== null && Date.now() - record.startedAt > EXECUTION_TIMEOUT_MS) {
    return handleTimedOutExecution(deps.executionsDir, record);
  }

  const dagState = loadDagState(deps.executionsDir, executionId) || {};
  const context = buildRecoveredContext(record);
  const abortController = new AbortController();

  const persistGenerated = deps.persistGenerated
    ? (input: {
        nodeId: string;
        nodeType: string;
        tmpAbs: string;
        materialType: 'image' | 'video' | 'audio';
        prompt?: string;
        modelId?: string;
      }) => deps.persistGenerated!({ workspaceId: record.workspaceId, ...input })
    : undefined;
  const { executor } = createDispatchingNodeExecutor({
    gateway: deps.gateway,
    mediaRoot: deps.mediaDir,
    executionId: record.id,
    workspaceId: record.workspaceId,
    edges: record.edges,
    abortController,
    persistGenerated,
  });

  const scheduler = createSchedulerForRecovery({
    dagState,
    record,
    context,
    executor,
    executionsDir: deps.executionsDir,
  });

  const { reconcilable } = resetInFlightNodeStates(context, dagState);

  const entry = assembleRecoveredEntry(record, context, scheduler, abortController);
  // #1382: write a reference change immediately rather than at the next sync.
  entry.context.onPersistRequested = () => persistRecord(deps.executionsDir, entry);
  deps.entries.set(record.id, entry);
  deps.onSetupEntry(entry);

  logger.info('execution recovered', {
    executionId: record.id,
    status: record.status,
    pending: scheduler.getProgress().pending,
    completed: scheduler.getProgress().completed,
    // #1382: nodes that came back with an upstream task reference and will
    // therefore reconcile instead of resubmitting.
    reconcilable,
  });
  return entry;
}

interface RecoverAllDeps {
  executionsDir: string;
  recoverOne: (executionId: string) => Promise<ExecutionEntry | null>;
  continueLoop: (entry: ExecutionEntry, opts?: { isRecovery?: boolean }) => void;
}

interface RecoveryStats {
  recovered: number;
  resumed: number;
}

async function tryRecoverSingleId(
  executionId: string,
  params: RecoverAllDeps,
  stats: RecoveryStats,
): Promise<void> {
  try {
    const entry = await params.recoverOne(executionId);
    if (!entry) return;

    stats.recovered += 1;
    if (entry.context.status === ExecutionStatus.RUNNING) {
      params.continueLoop(entry, { isRecovery: true });
      stats.resumed += 1;
    }
  } catch (error) {
    let errorMsg = String(error);
    if (error instanceof Error) {
      errorMsg = error.message;
    }
    logger.error('recovery failed', {
      executionId,
      error: errorMsg,
    });
  }
}

export async function recoverAll(params: RecoverAllDeps): Promise<RecoveryStats> {
  const stats: RecoveryStats = { recovered: 0, resumed: 0 };
  const ids = listPersistedExecutionIds(params.executionsDir);

  for (const executionId of ids) {
    await tryRecoverSingleId(executionId, params, stats);
  }

  if (stats.recovered > 0) {
    logger.info('recovery complete', {
      recovered: stats.recovered,
      resumed: stats.resumed,
    });
  }
  return stats;
}
