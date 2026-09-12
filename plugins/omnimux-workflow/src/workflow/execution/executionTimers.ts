import { ExecutionStatus } from './ExecutionContext';
import { type DagState } from './ExecutionScheduler';
import {
  buildExecutionRecord,
  saveDagState,
  saveExecutionRecord,
} from './executionStore';
import {
  ALL_EVENT_NAMES,
  EVENT_LOG_LIMIT,
  EXECUTION_TIMEOUT_MS,
  RECORD_SYNC_INTERVAL_MS,
  type ExecutionEntry,
} from './executionTypes';
import { createWorkflowLogger } from './logger';

const logger = createWorkflowLogger('ExecutionTimers');

export function persistRecord(executionsDir: string, entry: ExecutionEntry): void {
  try {
    const record = buildExecutionRecord({
      context: entry.context.toJSON(),
      nodes: entry.nodes,
      edges: entry.edges,
      maxParallel: entry.maxParallel,
      createdAt: entry.createdAt,
      progress: entry.scheduler.getProgress(),
      eventLog: entry.eventLog,
    });
    saveExecutionRecord(executionsDir, record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('failed to persist execution record', {
      executionId: entry.context.id,
      error: message,
    });
  }
}

export function persistDagState(
  executionsDir: string,
  executionId: string,
  state: DagState,
): Promise<void> {
  saveDagState(executionsDir, executionId, state);
  return Promise.resolve();
}

export function stopSyncTimer(entry: ExecutionEntry): void {
  if (!entry.syncTimer) return;
  clearInterval(entry.syncTimer);
  entry.syncTimer = null;
}

export function stopTimeoutTimer(entry: ExecutionEntry): void {
  if (!entry.timeoutTimer) return;
  clearTimeout(entry.timeoutTimer);
  entry.timeoutTimer = null;
}

export function startTimeout(entry: ExecutionEntry, onTimeout: () => void): void {
  entry.timeoutTimer = setTimeout(onTimeout, EXECUTION_TIMEOUT_MS);
}

function appendReplayEvent(
  entry: ExecutionEntry,
  event: import('./ExecutionContext').ExecutionEventName,
  payload: unknown,
): void {
  entry.eventLog.push({ event, payload });
  if (entry.eventLog.length <= EVENT_LOG_LIMIT) return;
  const excess = entry.eventLog.length - EVENT_LOG_LIMIT;
  entry.eventLog.splice(0, excess);
}

export function setupExecutionListeners(
  executionsDir: string,
  entry: ExecutionEntry,
): void {
  const { context } = entry;

  const onStart = (): void => {
    persistRecord(executionsDir, entry);
    stopSyncTimer(entry);
    entry.syncTimer = setInterval(
      () => persistRecord(executionsDir, entry),
      RECORD_SYNC_INTERVAL_MS,
    );
  };
  const onStateChange = (): void => {
    persistRecord(executionsDir, entry);
  };
  const onTerminal = (): void => {
    stopSyncTimer(entry);
    persistRecord(executionsDir, entry);
  };

  context.events.on('execution_start', onStart);
  context.events.on('execution_paused', onStateChange);
  context.events.on('execution_resumed', onStateChange);
  context.events.on('execution_complete', onTerminal);
  context.events.on('execution_error', onTerminal);
  context.events.on('execution_cancelled', onTerminal);

  for (const event of ALL_EVENT_NAMES) {
    const recorder = (payload: unknown): void => {
      appendReplayEvent(entry, event, payload);
    };
    context.events.on(event, recorder);
    entry.disposers.push(() => context.events.off(event, recorder));
  }

  entry.disposers.push(
    () => context.events.off('execution_start', onStart),
    () => context.events.off('execution_paused', onStateChange),
    () => context.events.off('execution_resumed', onStateChange),
    () => context.events.off('execution_complete', onTerminal),
    () => context.events.off('execution_error', onTerminal),
    () => context.events.off('execution_cancelled', onTerminal),
  );
}

export function cleanupExecution(
  entries: Map<string, ExecutionEntry>,
  executionId: string,
): void {
  const entry = entries.get(executionId);
  if (!entry) return;

  const wasRunning = entry.context.status === ExecutionStatus.RUNNING;
  if (wasRunning) {
    entry.scheduler.cancel();
    entry.abortController.abort();
    // Timeout termination: converge the in-flight node states and persist the
    // terminal record before the entry leaves the in-memory table — after the
    // deletion only the persisted record can still be read by a client.
    // The scheduler loop's own cancel() is a no-op afterwards.
    entry.context.cancel();
  }
  stopSyncTimer(entry);
  stopTimeoutTimer(entry);
  entries.delete(executionId);
  logger.info('execution cleaned up', {
    executionId,
    wasRunning,
    finalStatus: entry.context.status,
  });
}

export function disposeAllExecutions(
  executionsDir: string,
  entries: Map<string, ExecutionEntry>,
): void {
  for (const entry of entries.values()) {
    stopSyncTimer(entry);
    stopTimeoutTimer(entry);
    for (const dispose of entry.disposers) dispose();
    entry.disposers.length = 0;
    entry.scheduler.dispose();
    persistRecord(executionsDir, entry);
  }
  entries.clear();
}
