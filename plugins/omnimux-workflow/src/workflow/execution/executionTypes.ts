import {
  ExecutionContext,
  ExecutionStatus,
  TERMINAL_STATUSES,
  type ExecutionEventName,
  type ExecutionStatusValue,
} from './ExecutionContext';
import {
  ExecutionScheduler,
  type ExecutableEdge,
  type ExecutableNode,
} from './ExecutionScheduler';
import type { GenerationGateway } from '../seam/gateway';

/** Periodic record sync interval while running (Gxgen: 5s DB sync). */
export const RECORD_SYNC_INTERVAL_MS = 5_000;

/** In-memory execution retention / auto-cancel timeout (Gxgen: 30min). */
export const EXECUTION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * #1386: the one wording for "this run hit {@link EXECUTION_TIMEOUT_MS}".
 *
 * Two code paths terminate a run at that deadline — the in-process timer
 * (`executionTimers.cleanupExecution`) and post-restart recovery
 * (`executionRecovery.handleTimedOutExecution`) — and before #1386 they
 * disagreed: the live path recorded the run as `cancelled` with no message at
 * all, the recovered one as `error` with an English message. The same event thus
 * read differently depending on whether the host happened to be alive, and the
 * `cancelled` spelling told the user their run had been cancelled when nobody
 * had cancelled it. Timeout is a failure with a cause, so both paths now record
 * `error` with this message; only an explicit user cancel stays `cancelled`.
 *
 * The wording is Chinese because that is what the canvas shows the user.
 */
export const EXECUTION_TIMEOUT_MESSAGE = `执行超时（超过 ${Math.round(EXECUTION_TIMEOUT_MS / 60000)} 分钟）`;

export { TERMINAL_STATUSES };

export const CANCELABLE_STATUSES = new Set<ExecutionStatusValue>([
  ExecutionStatus.PENDING,
  ExecutionStatus.RUNNING,
  ExecutionStatus.PAUSED,
]);

export interface ExecutionManagerDeps {
  resolveProjectFile?: (workspaceId: string, relativePath: string) => string;
  executionsDir: string;
  gateway: GenerationGateway;
  /** Plugin media root (absolute). */
  mediaDir: string;
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

export interface CreateExecutionOptions {
  workspaceId: string;
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  maxParallel?: number;
  breakpoints?: string[];
  /** Pre-seeded upstream outputs (e.g. for single-node execution). */
  initialOutputs?: Record<string, unknown>;
}

export interface ExecutionSummary {
  id: string;
  workspaceId: string;
  status: string;
  createdAt: string;
  progress: { total: number; completed: number; percentage: number };
}

export interface ExecutionSnapshot {
  id: string;
  workspaceId: string;
  status: string;
  createdAt: string;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  totalNodes: number;
  completedNodes: number;
  progress: { total: number; completed: number; running: number; pending: number; percentage: number };
  nodeStates: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  mediaAssets: Record<string, unknown>;
  breakpoints: string[];
}

export interface ControlResult {
  ok: boolean;
  message?: string;
}

/** Replay buffer entry: late SSE subscribers get the full event sequence. */
export interface ExecutionEventLogEntry {
  event: ExecutionEventName;
  payload: unknown;
}

/** Max replay events kept per execution (covers a full run + control ops). */
export const EVENT_LOG_LIMIT = 500;

export const ALL_EVENT_NAMES: ReadonlyArray<ExecutionEventName> = [
  'execution_start',
  'node_start',
  'node_progress',
  'node_complete',
  'node_error',
  'node_skipped',
  'execution_paused',
  'execution_resumed',
  'execution_complete',
  'execution_error',
  'execution_cancelled',
];

export interface ExecutionEntry {
  context: ExecutionContext;
  scheduler: ExecutionScheduler;
  abortController: AbortController;
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  maxParallel: number;
  createdAt: string;
  syncTimer: ReturnType<typeof setInterval> | null;
  /**
   * Deadline timer for this run: fires `cleanupExecution(…, 'timed-out')` at
   * {@link EXECUTION_TIMEOUT_MS}. Stopped as soon as the run reaches a terminal
   * state (#1386 P4) — a finished run has no deadline left to enforce.
   */
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  /**
   * #1386 P4: timer that reaps a *finished* entry from the in-memory table once
   * its replay buffer is no longer worth keeping.
   *
   * Before #1386 the {@link timeoutTimer} did this job as a side effect: it was
   * armed at creation and, for a run that had already gone terminal, its only
   * remaining effect 30 minutes later was the `entries.delete` inside
   * `cleanupExecution`. Stopping that timer at terminal (the P4 fix) would
   * have left every finished run in the table for the lifetime of the host, so
   * the reaping is kept explicitly here, measured from termination instead of
   * from creation.
   */
  retentionTimer: ReturnType<typeof setTimeout> | null;
  loopRunning: boolean;
  isRecovered: boolean;
  /** Replay buffer for late SSE subscribers (create-then-subscribe race). */
  eventLog: ExecutionEventLogEntry[];
  /** Event-listener disposers (detached on dispose so a dying loop cannot
   *  clobber the persisted record of a recovered run). */
  disposers: Array<() => void>;
}
