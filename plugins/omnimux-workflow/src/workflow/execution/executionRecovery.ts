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
  EXECUTION_TIMEOUT_MS,
  TERMINAL_STATUSES,
  type ExecutionEntry,
  type ExecutionEventLogEntry,
} from './executionTypes';
import { createDispatchingNodeExecutor } from './nodeExecutors';
import { persistDagState } from './executionTimers';
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
  const error = `Execution timed out after restart (>${Math.round(EXECUTION_TIMEOUT_MS / 60000)}min)`;
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

function resetInFlightNodeStates(
  context: ExecutionContext,
  dagState: Partial<DagState>,
): void {
  for (const nodeId of dagState.runningNodes || []) {
    const state = context.nodeStates.get(nodeId);
    if (!state || state.status !== 'running') continue;
    context.nodeStates.set(nodeId, {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      error: null,
    });
  }
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

  resetInFlightNodeStates(context, dagState);

  const entry = assembleRecoveredEntry(record, context, scheduler, abortController);
  deps.entries.set(record.id, entry);
  deps.onSetupEntry(entry);

  logger.info('execution recovered', {
    executionId: record.id,
    status: record.status,
    pending: scheduler.getProgress().pending,
    completed: scheduler.getProgress().completed,
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
