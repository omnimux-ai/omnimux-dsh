/**
 * Execution persistence (fs): execution records + DAG state under
 * $DSH_HOME/omnimux/workflow/executions/<executionId>/.
 *
 * Layout (mirrors the Gxgen canvas_executions DB row, file-based):
 *   executions/<id>/execution.json  — context snapshot + nodes/edges snapshot
 *   executions/<id>/dag-state.json   — { pendingNodes, completedNodes, runningNodes }
 *
 * All writes are atomic (tmp + rename), same discipline as WorkspaceStore.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  ExecutionStatus,
  type NodeStateSnapshot,
  type SerializedContext,
} from './ExecutionContext';
import type { DagState, ExecutableEdge, ExecutableNode } from './ExecutionScheduler';

/** Replay log entry persisted with the record (late SSE subscribers). */
export interface PersistedEventLogEntry {
  event: string;
  payload: unknown;
}

export interface PersistedExecutionRecord {
  /**
   * Record schema discriminator (migration hook).
   *
   * Still `1` after #1382: `nodeStates[].upstreamTask` is an additive optional
   * field, so a record without it is simply a record with no in-flight upstream
   * task (resubmit, the behavior before that change) and nothing branches on the
   * version. Bumping it would imply a migration step that nobody performs.
   */
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  status: SerializedContext['status'];
  createdAt: string;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  totalNodes: number;
  completedNodes: number;
  variables: Record<string, unknown>;
  nodeStates: Record<string, NodeStateSnapshot>;
  nodeOutputs: Record<string, unknown>;
  mediaAssets: Record<string, Array<Record<string, unknown>>>;
  breakpoints: string[];
  maxParallel: number;
  /** Graph snapshot taken at creation time (recovery input). */
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  /** Progress captured at the last persist (for list views). */
  progress: { total: number; completed: number; percentage: number };
  /** SSE replay log (recovered runs re-emit it to late subscribers). */
  eventLog: PersistedEventLogEntry[];
}

const RECORD_FILE = 'execution.json';
const DAG_STATE_FILE = 'dag-state.json';

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export class ExecutionStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionStoreError';
  }
}

export function executionDir(executionsDir: string, executionId: string): string {
  return join(executionsDir, executionId);
}

export function saveExecutionRecord(
  executionsDir: string,
  record: PersistedExecutionRecord,
): void {
  atomicWriteJson(join(executionDir(executionsDir, record.id), RECORD_FILE), record);
}

export function loadExecutionRecord(
  executionsDir: string,
  executionId: string,
): PersistedExecutionRecord | null {
  const raw = readJsonFile<PersistedExecutionRecord>(
    join(executionDir(executionsDir, executionId), RECORD_FILE),
  );
  if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.nodes)) return null;
  return {
    schemaVersion: 1,
    id: raw.id,
    workspaceId: raw.workspaceId ?? '',
    status: raw.status ?? ExecutionStatus.PENDING,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
    error: raw.error ?? null,
    totalNodes: raw.totalNodes ?? raw.nodes.length,
    completedNodes: raw.completedNodes ?? 0,
    variables: raw.variables ?? {},
    nodeStates: raw.nodeStates ?? {},
    nodeOutputs: raw.nodeOutputs ?? {},
    mediaAssets: raw.mediaAssets ?? {},
    breakpoints: raw.breakpoints ?? [],
    maxParallel: raw.maxParallel ?? 3,
    nodes: raw.nodes,
    edges: raw.edges ?? [],
    progress: raw.progress ?? { total: raw.nodes.length, completed: 0, percentage: 0 },
    eventLog: Array.isArray(raw.eventLog) ? raw.eventLog : [],
  };
}

export function saveDagState(
  executionsDir: string,
  executionId: string,
  dagState: DagState,
): void {
  atomicWriteJson(join(executionDir(executionsDir, executionId), DAG_STATE_FILE), dagState);
}

export function loadDagState(
  executionsDir: string,
  executionId: string,
): Partial<DagState> | null {
  return readJsonFile<Partial<DagState>>(
    join(executionDir(executionsDir, executionId), DAG_STATE_FILE),
  );
}

/** All execution ids that have a record on disk (newest first). */
export function listPersistedExecutionIds(executionsDir: string): string[] {
  if (!existsSync(executionsDir)) return [];
  const ids: Array<{ id: string; createdAt: string }> = [];
  for (const entry of readdirSync(executionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const record = loadExecutionRecord(executionsDir, entry.name);
    if (record) ids.push({ id: record.id, createdAt: record.createdAt });
  }
  ids.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return ids.map((row) => row.id);
}

export function removeExecution(executionsDir: string, executionId: string): void {
  const dir = executionDir(executionsDir, executionId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

/** Record shape for a live context + graph snapshot. */
export function buildExecutionRecord(input: {
  context: SerializedContext;
  nodes: ExecutableNode[];
  edges: ExecutableEdge[];
  maxParallel: number;
  createdAt: string;
  progress: { total: number; completed: number; percentage: number };
  eventLog: PersistedEventLogEntry[];
}): PersistedExecutionRecord {
  return {
    schemaVersion: 1,
    id: input.context.id,
    workspaceId: input.context.workflowId,
    status: input.context.status,
    createdAt: input.createdAt,
    startedAt: input.context.startedAt,
    completedAt: input.context.completedAt,
    error: input.context.error,
    totalNodes: input.context.totalNodes,
    completedNodes: input.context.completedNodes,
    variables: input.context.variables,
    nodeStates: input.context.nodeStates,
    nodeOutputs: input.context.nodeOutputs,
    mediaAssets: input.context.mediaAssets,
    breakpoints: input.context.breakpoints,
    maxParallel: input.maxParallel,
    nodes: input.nodes,
    edges: input.edges,
    progress: input.progress,
    eventLog: input.eventLog,
  };
}
