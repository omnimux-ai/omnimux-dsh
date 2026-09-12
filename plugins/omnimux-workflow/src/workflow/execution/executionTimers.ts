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
  EXECUTION_TIMEOUT_MESSAGE,
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

export function stopRetentionTimer(entry: ExecutionEntry): void {
  if (!entry.retentionTimer) return;
  clearTimeout(entry.retentionTimer);
  entry.retentionTimer = null;
}

export function startTimeout(entry: ExecutionEntry, onTimeout: () => void): void {
  entry.timeoutTimer = setTimeout(onTimeout, EXECUTION_TIMEOUT_MS);
}

/**
 * #1386 P4: arm the reap of a *finished* entry.
 *
 * The {@link EXECUTION_TIMEOUT_MS} deadline timer used to double as the reaper:
 * for a run that had already gone terminal its only remaining effect was the
 * `entries.delete` inside {@link cleanupExecution}. Stopping that timer at the
 * terminal event (which is what P4 asks for) must not leave finished runs in
 * the in-memory table forever, so the reaping moves here, into a timer that
 * starts when the run ends rather than when it began.
 *
 * @param onRetire Called once the retention window has passed.
 */
export function startTerminalRetention(entry: ExecutionEntry, onRetire: () => void): void {
  stopRetentionTimer(entry);
  entry.retentionTimer = setTimeout(onRetire, EXECUTION_TIMEOUT_MS);
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

/**
 * Subscribe the record-keeping listeners for one execution.
 *
 * @param retire #1386 P4: invoked once a finished entry's retention window has
 *   passed, so the caller can reap it from the in-memory table (see
 *   {@link startTerminalRetention}). Optional: a caller that owns no table
 *   simply leaves finished entries where they are.
 */
export function setupExecutionListeners(
  executionsDir: string,
  entry: ExecutionEntry,
  retire?: () => void,
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
    // #1386 P4: the deadline is over the moment the run is terminal; leaving it
    // armed kept a 30-minute timer (and its closure) on a finished entry.
    stopTimeoutTimer(entry);
    if (retire) startTerminalRetention(entry, retire);
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

/** Why an entry is being torn down; decides the terminal state it records. */
export type CleanupReason =
  /** Explicit user (or API) cancel: the run's terminal state is `cancelled`. */
  | 'cancelled'
  /**
   * The {@link EXECUTION_TIMEOUT_MS} deadline fired: nobody cancelled this run,
   * it ran out of time, so the terminal state is `error` with a readable
   * message — the same one recovery records for the same deadline after a
   * restart.
   */
  | 'timed-out'
  /**
   * #1386 P4: the retention window of a run that was *already* terminal has
   * passed ({@link startTerminalRetention}). Such an entry has nothing left to
   * tear down — `wasRunning` is false and no state is restamped — so the only
   * effect is dropping it from the in-memory table; the reason exists so the
   * teardown log does not read as a fresh timeout.
   */
  | 'retired';

/**
 * Tear down an entry and record its terminal state.
 *
 * @param reason Defaults to `'cancelled'` so the manager's public
 *   `cleanupExecution(id)` API keeps meaning "cancel this run". The two
 *   timeout callbacks pass `'timed-out'` instead; that is the only difference
 *   between the two paths, which is what keeps "user cancelled" and "ran out of
 *   time" from sharing one wording (#1386).
 */
export function cleanupExecution(
  entries: Map<string, ExecutionEntry>,
  executionId: string,
  reason: CleanupReason = 'cancelled',
): void {
  const entry = entries.get(executionId);
  if (!entry) return;

  // #1386: PAUSED counts as active. A paused run still owns its scheduler, its
  // in-flight executors and its node states — the timeout used to skip all of
  // this for PAUSED, leaving a record stuck at `paused` with nodes at `running`
  // and nothing aborted. Only a terminal entry has nothing left to tear down.
  const wasRunning =
    entry.context.status === ExecutionStatus.RUNNING
    || entry.context.status === ExecutionStatus.PAUSED;
  if (wasRunning) {
    entry.scheduler.cancel();
    entry.abortController.abort();
    // Converge the in-flight node states and persist the terminal record before
    // the entry leaves the in-memory table — after the deletion only the
    // persisted record can still be read by a client.
    // The scheduler loop's own cancel() is a no-op afterwards.
    if (reason === 'timed-out') {
      entry.context.fail(new Error(EXECUTION_TIMEOUT_MESSAGE));
    } else {
      entry.context.cancel();
    }
  }
  stopSyncTimer(entry);
  stopTimeoutTimer(entry);
  stopRetentionTimer(entry);
  entries.delete(executionId);
  logger.info('execution cleaned up', {
    executionId,
    reason,
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
    stopRetentionTimer(entry);
    for (const dispose of entry.disposers) dispose();
    entry.disposers.length = 0;
    entry.scheduler.dispose();
    persistRecord(executionsDir, entry);
  }
  entries.clear();
}
