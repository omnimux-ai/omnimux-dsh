import { ExecutionContext, ExecutionStatus, type ExecutionEventName, type ExecutionStatusValue } from './ExecutionContext';
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

export const TERMINAL_STATUSES = new Set<string>([
  ExecutionStatus.COMPLETED,
  ExecutionStatus.ERROR,
  ExecutionStatus.CANCELLED,
]);

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
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  loopRunning: boolean;
  isRecovered: boolean;
  /** Replay buffer for late SSE subscribers (create-then-subscribe race). */
  eventLog: ExecutionEventLogEntry[];
  /** Event-listener disposers (detached on dispose so a dying loop cannot
   *  clobber the persisted record of a recovered run). */
  disposers: Array<() => void>;
}
