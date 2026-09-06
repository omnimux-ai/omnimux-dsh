/**
 * ExecutionManager — M3 port of Gxgen
 * `server/src/services/canvas/ExecutionManager.ts` +
 * `ExecutionRecoveryService.ts` (file-based, strict TypeScript).
 *
 * Tracks in-memory execution instances (context + scheduler), persists each
 * run under $DSH_HOME/omnimux/workflow/executions/<id>/ (execution.json +
 * dag-state.json), exposes pause/resume/cancel/status, and recovers live
 * executions after a host restart (fromPersistedState + continue).
 */

import { ExecutionContext } from './ExecutionContext';
import { ExecutionScheduler } from './ExecutionScheduler';
import { loadExecutionRecord, type PersistedExecutionRecord } from './executionStore';
import { createDispatchingNodeExecutor } from './nodeExecutors';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor';
import { createImportExecutor } from './importExecutor';
import { createVideoCompositionExecutor } from './videoCompositionExecutor';
import { registerExecutor } from '../executors/registry';
import { createWorkflowLogger } from './logger';
import {
  type ExecutionManagerDeps,
  type CreateExecutionOptions,
  type ExecutionSummary,
  type ExecutionSnapshot,
  type ControlResult,
  type ExecutionEventLogEntry,
  type ExecutionEntry,
  EXECUTION_TIMEOUT_MS,
} from './executionTypes';
import {
  persistRecord,
  persistDagState,
  setupExecutionListeners,
  startTimeout,
  cleanupExecution,
  disposeAllExecutions,
} from './executionTimers';
import { recoverExecution, recoverAll } from './executionRecovery';
import {
  pauseExecution,
  resumeExecution,
  cancelExecution,
  openEventStream,
} from './executionControl';

export {
  type ExecutionManagerDeps,
  type CreateExecutionOptions,
  type ExecutionSummary,
  type ExecutionSnapshot,
  type ControlResult,
  type ExecutionEventLogEntry,
  EXECUTION_TIMEOUT_MS,
};

const LOG_TAG = 'ExecutionManager';
const logger = createWorkflowLogger(LOG_TAG);

function buildNewExecutionEntry(
  opts: CreateExecutionOptions,
  context: ExecutionContext,
  scheduler: ExecutionScheduler,
  abortController: AbortController,
): ExecutionEntry {
  let maxParallel = 3;
  if (typeof opts.maxParallel === 'number') {
    maxParallel = opts.maxParallel;
  }
  return {
    context,
    scheduler,
    abortController,
    nodes: opts.nodes,
    edges: opts.edges,
    maxParallel,
    createdAt: new Date().toISOString(),
    syncTimer: null,
    timeoutTimer: null,
    loopRunning: false,
    isRecovered: false,
    eventLog: [],
    disposers: [],
  };
}

function snapshotOfEntry(entry: ExecutionEntry): ExecutionSnapshot {
  const json = entry.context.toJSON();
  const progress = entry.scheduler.getProgress();
  return {
    id: json.id,
    workspaceId: json.workflowId,
    status: json.status,
    createdAt: entry.createdAt,
    startedAt: json.startedAt,
    completedAt: json.completedAt,
    error: json.error,
    totalNodes: json.totalNodes,
    completedNodes: json.completedNodes,
    progress,
    nodeStates: json.nodeStates,
    nodeOutputs: json.nodeOutputs,
    mediaAssets: json.mediaAssets,
    breakpoints: json.breakpoints,
  };
}

function snapshotOfRecord(record: PersistedExecutionRecord): ExecutionSnapshot {
  const remaining = Math.max(0, record.progress.total - record.progress.completed);
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    status: record.status,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    error: record.error,
    totalNodes: record.totalNodes,
    completedNodes: record.completedNodes,
    progress: {
      total: record.progress.total,
      completed: record.progress.completed,
      running: 0,
      pending: remaining,
      percentage: record.progress.percentage,
    },
    nodeStates: record.nodeStates,
    nodeOutputs: record.nodeOutputs,
    mediaAssets: record.mediaAssets,
    breakpoints: record.breakpoints,
  };
}

function continueExecutionLoop(
  entry: ExecutionEntry,
  opts: { isRecovery?: boolean } = {},
): void {
  if (entry.loopRunning) return;
  entry.loopRunning = true;
  let isRecovery = true;
  if (typeof opts.isRecovery === 'boolean') {
    isRecovery = opts.isRecovery;
  }
  void entry.scheduler.execute({ isRecovery }).finally(() => {
    entry.loopRunning = false;
  });
}

function setupAndRunExecution(
  executionsDir: string,
  entries: Map<string, ExecutionEntry>,
  entry: ExecutionEntry,
): void {
  entries.set(entry.context.id, entry);
  persistRecord(executionsDir, entry);
  setupExecutionListeners(executionsDir, entry);
  startTimeout(entry, () => cleanupExecution(entries, entry.context.id));
  continueExecutionLoop(entry, { isRecovery: false });
}

function createExecutionInstance(
  deps: ExecutionManagerDeps,
  entries: Map<string, ExecutionEntry>,
  opts: CreateExecutionOptions,
): ExecutionEntry {
  opts = {
    ...opts,
    nodes: structuredClone(opts.nodes),
    edges: structuredClone(opts.edges),
    initialOutputs: structuredClone(opts.initialOutputs),
  };
  const breakpointsList = opts.breakpoints || [];
  const breakpoints = new Set(breakpointsList);
  const context = new ExecutionContext({
    workflowId: opts.workspaceId,
    breakpoints,
    initialOutputs: opts.initialOutputs,
  });
  const abortController = new AbortController();
  const persistGenerated = deps.persistGenerated
    ? (input: {
        nodeId: string;
        nodeType: string;
        tmpAbs: string;
        materialType: 'image' | 'video' | 'audio';
        prompt?: string;
        modelId?: string;
      }) => deps.persistGenerated!({ workspaceId: opts.workspaceId, ...input })
    : undefined;
  const { executor } = createDispatchingNodeExecutor({
    gateway: deps.gateway,
    mediaRoot: deps.mediaDir,
    executionId: context.id,
    workspaceId: opts.workspaceId,
    edges: opts.edges,
    abortController,
    persistGenerated,
  });
  const scheduler = new ExecutionScheduler({
    nodes: opts.nodes,
    edges: opts.edges,
    context,
    nodeExecutor: executor,
    maxParallel: opts.maxParallel,
    persistDagState: (state) => persistDagState(deps.executionsDir, context.id, state),
  });

  const entry = buildNewExecutionEntry(opts, context, scheduler, abortController);
  logger.info('execution created', {
    executionId: context.id,
    workspaceId: opts.workspaceId,
    nodeCount: opts.nodes.length,
    edgeCount: opts.edges.length,
    maxParallel: entry.maxParallel,
  });

  setupAndRunExecution(deps.executionsDir, entries, entry);
  return entry;
}

function listExecutionSummaries(
  entries: Map<string, ExecutionEntry>,
  workspaceId?: string,
): ExecutionSummary[] {
  const rows: ExecutionSummary[] = [];
  for (const entry of entries.values()) {
    if (workspaceId && entry.context.workflowId !== workspaceId) continue;
    rows.push({
      id: entry.context.id,
      workspaceId: entry.context.workflowId,
      status: entry.context.status,
      createdAt: entry.createdAt,
      progress: entry.scheduler.getProgress(),
    });
  }
  rows.sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1;
    return -1;
  });
  return rows;
}

function readExecutionSnapshot(
  executionsDir: string,
  entries: Map<string, ExecutionEntry>,
  executionId: string,
): ExecutionSnapshot | null {
  const entry = entries.get(executionId);
  if (entry) return snapshotOfEntry(entry);
  const record = loadExecutionRecord(executionsDir, executionId);
  if (!record) return null;
  return snapshotOfRecord(record);
}

function lookupEntryById(
  entries: Map<string, ExecutionEntry>,
  executionId: string,
): ExecutionEntry | null {
  const found = entries.get(executionId);
  if (!found) return null;
  return found;
}

export function createExecutionManager(deps: ExecutionManagerDeps) {
  const { executionsDir, gateway, mediaDir } = deps;
  const entries = new Map<string, ExecutionEntry>();

  registerExecutor(createMaterialGatewayExecutor({ gateway, resolveProjectFile: deps.resolveProjectFile }));
  registerExecutor(createImportExecutor());
  registerExecutor(createVideoCompositionExecutor());

  const handleEntrySetup = (entry: ExecutionEntry): void => {
    setupExecutionListeners(executionsDir, entry);
    startTimeout(entry, () => cleanupExecution(entries, entry.context.id));
  };

  const recoveryDeps = {
    executionsDir,
    gateway,
    mediaDir,
    entries,
    onSetupEntry: handleEntrySetup,
    persistGenerated: deps.persistGenerated,
  };

  const doRecoverExecution = (executionId: string): Promise<ExecutionEntry | null> =>
    recoverExecution(recoveryDeps, executionId);

  const controlDeps = {
    entries,
    recoverExecution: doRecoverExecution,
    continueLoop: continueExecutionLoop,
  };

  return {
    createExecution: (opts: CreateExecutionOptions) => createExecutionInstance(deps, entries, opts),
    getEntry: (executionId: string) => lookupEntryById(entries, executionId),
    listExecutions: (workspaceId?: string) => listExecutionSummaries(entries, workspaceId),
    getSnapshot: (executionId: string) => readExecutionSnapshot(executionsDir, entries, executionId),
    pauseExecution: (executionId: string) => pauseExecution(entries, executionId),
    resumeExecution: (executionId: string) => resumeExecution(controlDeps, executionId),
    cancelExecution: (executionId: string) => cancelExecution(entries, executionId),
    openEventStream: (executionId: string) => openEventStream(controlDeps, executionId),
    recoverExecution: doRecoverExecution,
    recoverAll: () =>
      recoverAll({
        executionsDir,
        recoverOne: doRecoverExecution,
        continueLoop: continueExecutionLoop,
      }),
    cleanupExecution: (executionId: string) => cleanupExecution(entries, executionId),
    disposeAll: () => disposeAllExecutions(executionsDir, entries),
  };
}

export type ExecutionManager = ReturnType<typeof createExecutionManager>;
