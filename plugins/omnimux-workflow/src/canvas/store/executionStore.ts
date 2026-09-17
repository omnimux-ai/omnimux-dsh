/**
 * Execution UI store (island): ephemeral execution state for the control
 * bar + node badges. Result data (media/text) is written into canvasStore
 * node.data by the controller hook (Gxgen pattern: per-node updates, no
 * global re-render); this store only carries the light-weight control view.
 *
 * #2255 — the canvas holds **many** concurrent runs, not one. Every manual
 * submit gets its own run (own execution id, own SSE stream, own node
 * statuses); the previous single-slot model silently dropped the second
 * submit. `runs` is the source of truth and the flat fields (`executionId` /
 * `status` / `error` / `progress` / `nodeStatuses`) are projections over it,
 * so control-bar and badge consumers keep reading one value while per-run
 * detail stays available through `runs`.
 */

import { create } from 'zustand';
import type { NodeExecutionApiStatus } from '../../shared/api';

export type ExecutionUiStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface ExecutionProgressState {
  total: number;
  completed: number;
  running: number;
  pending: number;
  percentage: number;
}

/** Statuses owned by a live run (still producing events). */
export const LIVE_EXECUTION_STATUSES: readonly ExecutionUiStatus[] = ['pending', 'running', 'paused'];

const LIVE_STATUS_SET = new Set<ExecutionUiStatus>(LIVE_EXECUTION_STATUSES);

/** Run id used when a caller writes run-scoped state without naming a run. */
export const LOCAL_RUN_ID = '__local__';

/** Terminal runs retained for the control bar / badge history. */
export const MAX_TERMINAL_RUNS = 12;

const EMPTY_PROGRESS: ExecutionProgressState = {
  total: 0,
  completed: 0,
  running: 0,
  pending: 0,
  percentage: 0,
};

function emptyProgress(): ExecutionProgressState {
  return { ...EMPTY_PROGRESS };
}

export interface ExecutionRun {
  executionId: string;
  status: ExecutionUiStatus;
  error: string | null;
  progress: ExecutionProgressState;
  nodeStatuses: Record<string, NodeExecutionApiStatus>;
}

function createRun(executionId: string, status: ExecutionUiStatus = 'idle'): ExecutionRun {
  return {
    executionId,
    status,
    error: null,
    progress: emptyProgress(),
    nodeStatuses: {},
  };
}

/**
 * Aggregate status precedence: an in-flight run outranks a finished one, and
 * among in-flight states `running` > `pending` > `paused`, so the bar shows
 * the most active thing happening on the canvas.
 */
const AGGREGATE_PRECEDENCE: readonly ExecutionUiStatus[] = [
  'running',
  'pending',
  'paused',
  'error',
  'completed',
  'cancelled',
];

function aggregateStatus(runs: readonly ExecutionRun[]): ExecutionUiStatus {
  for (const status of AGGREGATE_PRECEDENCE) {
    if (runs.some((run) => run.status === status)) return status;
  }
  return 'idle';
}

function aggregateProgress(runs: readonly ExecutionRun[]): ExecutionProgressState {
  if (runs.length === 0) return emptyProgress();
  let total = 0;
  let completed = 0;
  let running = 0;
  let pending = 0;
  for (const run of runs) {
    total += run.progress.total;
    completed += run.progress.completed;
    running += run.progress.running;
    pending += run.progress.pending;
  }
  return {
    total,
    completed,
    running,
    pending,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Merge node statuses across runs. Runs are in creation order, so a later run
 * wins for a node it also touched — the one the user is watching.
 */
function aggregateNodeStatuses(runs: readonly ExecutionRun[]): Record<string, NodeExecutionApiStatus> {
  const merged: Record<string, NodeExecutionApiStatus> = {};
  for (const run of runs) {
    for (const [nodeId, status] of Object.entries(run.nodeStatuses)) {
      merged[nodeId] = status;
    }
  }
  return merged;
}

export interface ExecutionProjection {
  executionId: string | null;
  status: ExecutionUiStatus;
  error: string | null;
  progress: ExecutionProgressState;
  nodeStatuses: Record<string, NodeExecutionApiStatus>;
  /** Runs still producing events — the canvas-level "N 条执行中" count. */
  activeRunCount: number;
}

export function projectRuns(
  runs: readonly ExecutionRun[],
  focusExecutionId: string | null,
): ExecutionProjection {
  const focus = runs.find((run) => run.executionId === focusExecutionId) ?? null;
  return {
    executionId: focus?.executionId ?? null,
    status: aggregateStatus(runs),
    error: focus?.error ?? runs.find((run) => run.status === 'error')?.error ?? null,
    progress: aggregateProgress(runs),
    nodeStatuses: aggregateNodeStatuses(runs),
    activeRunCount: runs.filter((run) => LIVE_STATUS_SET.has(run.status)).length,
  };
}

/** Terminal runs are pruned oldest-first so a long session stays bounded. */
function pruneRuns(runs: readonly ExecutionRun[]): ExecutionRun[] {
  const terminal = runs.filter((run) => !LIVE_STATUS_SET.has(run.status));
  if (terminal.length <= MAX_TERMINAL_RUNS) return [...runs];
  const dropped = new Set(
    terminal.slice(0, terminal.length - MAX_TERMINAL_RUNS).map((run) => run.executionId),
  );
  return runs.filter((run) => !dropped.has(run.executionId));
}

function patchRunIn(
  runs: ExecutionRun[],
  executionId: string,
  patch: Partial<Omit<ExecutionRun, 'executionId'>>,
): void {
  const index = runs.findIndex((run) => run.executionId === executionId);
  if (index === -1) {
    runs.push({ ...createRun(executionId), ...patch });
    return;
  }
  runs[index] = { ...runs[index]!, ...patch };
}

export interface ExecutionState extends ExecutionProjection {
  /** Live and recently finished runs, oldest first. */
  runs: ExecutionRun[];
  /** Run the control bar acts on: the most recently created one. */
  focusExecutionId: string | null;

  /** Bridge set by the controller hook: single-node (subset) execution. */
  startNodeExecution: ((nodeId: string) => void) | null;

  setStartNodeExecution: (fn: ((nodeId: string) => void) | null) => void;

  /** Create the run if absent and focus it. */
  ensureRun: (executionId: string) => void;
  /** Patch one run, creating it when absent; a patch cannot rename the id. */
  patchRun: (executionId: string, patch: Partial<Omit<ExecutionRun, 'executionId'>>) => void;
  /** Write one node's status inside a run (creating the run when absent). */
  setRunNodeStatus: (executionId: string, nodeId: string, status: NodeExecutionApiStatus) => void;
  /** Drop one run; its node statuses stop contributing to the projection. */
  dropRun: (executionId: string) => void;

  /**
   * Run-scoped write without naming a run: targets the focused run, creating
   * the local placeholder when the canvas has none (mock/demo harnesses and
   * headless tests drive the store this way).
   */
  setExecution: (patch: Partial<ExecutionProjection>) => void;
  setNodeStatus: (nodeId: string, status: NodeExecutionApiStatus) => void;
  resetExecution: () => void;
}

export const useExecutionStore = create<ExecutionState>()((set, get) => {
  /** Commit a run-list mutation and refresh the flat projection in one set. */
  const commit = (runs: ExecutionRun[], focusExecutionId: string | null): void => {
    const next = pruneRuns(runs);
    set({ runs: next, focusExecutionId, ...projectRuns(next, focusExecutionId) });
  };

  /** Mutate a copy of the run list, then commit. */
  const mutate = (
    fn: (runs: ExecutionRun[], focusExecutionId: string | null) => [ExecutionRun[], string | null],
  ): void => {
    const state = get();
    const [runs, focusExecutionId] = fn([...state.runs], state.focusExecutionId);
    commit(runs, focusExecutionId);
  };

  const writeNodeStatus = (runs: ExecutionRun[], executionId: string, nodeId: string, status: NodeExecutionApiStatus): void => {
    patchRunIn(runs, executionId, {});
    const index = runs.findIndex((run) => run.executionId === executionId);
    const run = runs[index]!;
    runs[index] = { ...run, nodeStatuses: { ...run.nodeStatuses, [nodeId]: status } };
  };

  return {
    runs: [],
    focusExecutionId: null,
    ...projectRuns([], null),

    startNodeExecution: null,

    setStartNodeExecution: (fn) => set({ startNodeExecution: fn }),

    ensureRun: (executionId) =>
      mutate((runs) => {
        if (!runs.some((run) => run.executionId === executionId)) {
          // A registered run is one the server accepted and has not started yet.
          runs.push(createRun(executionId, 'pending'));
        }
        return [runs, executionId];
      }),

    patchRun: (executionId, patch) =>
      mutate((runs, focus) => {
        patchRunIn(runs, executionId, patch);
        return [runs, focus];
      }),

    setRunNodeStatus: (executionId, nodeId, status) =>
      mutate((runs, focus) => {
        writeNodeStatus(runs, executionId, nodeId, status);
        return [runs, focus];
      }),

    dropRun: (executionId) =>
      mutate((runs, focus) => [
        runs.filter((run) => run.executionId !== executionId),
        focus === executionId ? null : focus,
      ]),

    setExecution: (patch) =>
      mutate((runs, focus) => {
        const target = patch.executionId ?? focus ?? LOCAL_RUN_ID;
        const { executionId: _ignored, ...rest } = patch;
        patchRunIn(runs, target, rest);
        return [runs, target];
      }),

    setNodeStatus: (nodeId, status) =>
      mutate((runs, focus) => {
        const target = focus ?? LOCAL_RUN_ID;
        writeNodeStatus(runs, target, nodeId, status);
        return [runs, target];
      }),

    resetExecution: () => commit([], null),
  };
});

/** True when the run is still producing events. */
export function isLiveExecutionStatus(status: ExecutionUiStatus): boolean {
  return LIVE_STATUS_SET.has(status);
}
