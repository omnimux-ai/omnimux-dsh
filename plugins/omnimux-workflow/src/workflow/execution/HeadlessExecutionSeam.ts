/**
 * plugins/omnimux-workflow/src/workflow/execution/HeadlessExecutionSeam.ts
 *
 * Canvas Headless Execution Seam
 * Contract: docs/contracts/workflow-app-boundary.md (Section 4, 5, 6)
 *
 * Implements "Execution Authority = Canvas Workflow".
 * Executes workflow graphs in background headlessly (without DOM or React Flow).
 * Enforces strict Fail-Closed invariant:
 * - Reuses prepareExecutionSlotGraph, resolveExecutionSubgraph, and findExecutionReadinessFailure.
 * - Forbids mock success fallback or empty graph execution.
 * - Flattens multi-node multi-artifact arrays accurately.
 */

import type { ExecutionManager } from './ExecutionManager.ts';
// #1390: `ExecutionStatusValue` — the engine's execution-state union — is the
// source of truth for the mapping below, and typing the table against it is what
// makes the mapping total. Type-only on purpose: the seam needs those *states*,
// not the state machine, so it must not pull `ExecutionContext` (and with it
// `node:crypto`) into its runtime graph.
import type { ExecutionStatusValue } from './ExecutionContext.ts';
import { prepareExecutionSlotGraph } from '../../shared/graph/feedSlot/prepareExecutionSlotGraph.ts';
import {
  resolveExecutionSubgraph,
  toExecutionMode,
  normalizeNodeIds,
  subgraphContainsMediaGenerate,
  type ExecutionMode,
} from './subgraph.ts';
import { findExecutionReadinessFailure } from '../../shared/validation/executionReadiness.ts';
import { buildInitialOutputs } from './executionInputs.ts';
import type { ResolveExecutionProjectFile } from './executionMediaSource.ts';
import type { CapabilityCatalog } from '../../shared/api.ts';
import { createWorkflowLogger } from './logger.ts';

const logger = createWorkflowLogger('HeadlessExecutionSeam');

export class HeadlessExecutionError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(`[HeadlessExecutionSeam] ${code}: ${message}`);
    this.name = 'HeadlessExecutionError';
    this.code = code;
    this.details = details;
  }
}

export type TaskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED';

/**
 * Engine execution state → task status reported to polling callers (#1390).
 *
 * `TaskStatus` answers one question for every one of its consumers: *is this
 * run over, and if so how did it end?* The Apps execution bridge is the only
 * one — `queryExecutionStatus` (`plugins/omnimux-apps/src/host/executionBridge.ts`)
 * feeding the polling loop in `AppWorkspaceView.tsx` — and it stops on
 * COMPLETED/FAILED/CANCELED while it keeps polling on QUEUED/RUNNING until its
 * own attempt budget runs out. (The workflow Agent tools and the execution HTTP
 * routes read the record's raw status instead, so they never went through this
 * mapping.)
 *
 * Before #1390 that question was answered by an if/else chain over four
 * hard-coded strings with a silent `QUEUED` default, and one of the four —
 * `'failed'` — is not an engine state at all: the failure terminal is `error`.
 * So every failed *and every timed-out* run fell through to the default and was
 * reported as `QUEUED`, leaving a caller unable to tell it should stop waiting,
 * while `paused` and `pending` were equally indistinguishable from a queued run.
 *
 * Declared `satisfies Record<ExecutionStatusValue, TaskStatus>`, so stating a
 * new engine state without deciding its task-level meaning is a compile error
 * instead of another silent default.
 *
 * Per-state reasoning:
 * - `pending`   → `QUEUED`   has not started; "not yet running" is literal.
 * - `running`   → `RUNNING`  executing.
 * - `paused`    → `RUNNING`  the truest non-terminal answer available. The run
 *                            was admitted, it is resumable, and it is still
 *                            deadline-bound: #1386 F4 made `cleanupExecution`
 *                            treat PAUSED as in flight, and the canvas keeps it
 *                            in `LIVE_STATUSES`. `QUEUED` would instead claim it
 *                            had not started — and would read as the run moving
 *                            *backwards*, since `executeHeadless` reports
 *                            `RUNNING` at creation and `pauseExecution` only
 *                            accepts an already-running run. Callers that need
 *                            the exact state read `rawStatus` (`'paused'`).
 * - `completed` → `COMPLETED` finished, artifacts available.
 * - `error`     → `FAILED`   terminal failure, including the #1386 timeout that
 *                            records `error` plus `EXECUTION_TIMEOUT_MESSAGE`.
 * - `cancelled` → `CANCELED` an explicit user cancel stays distinct from a
 *                            failure so a timeout can never be read as "the
 *                            cancel succeeded".
 */
export const TASK_STATUS_BY_EXECUTION_STATUS = {
  pending: 'QUEUED',
  running: 'RUNNING',
  paused: 'RUNNING',
  completed: 'COMPLETED',
  error: 'FAILED',
  cancelled: 'CANCELED',
} satisfies Record<ExecutionStatusValue, TaskStatus>;

/**
 * Translate a persisted execution status into the task status of a job report.
 *
 * An unrecognized status reports `QUEUED`, the only claim the seam can still
 * defend: the value is not one of the engine's states, so no terminal outcome
 * may be asserted. Reporting a live run as FAILED/COMPLETED/CANCELED makes the
 * caller stop waiting on a run that is still producing and cannot be recovered
 * by the caller, whereas an over-cautious `QUEUED` only keeps waiting a caller
 * that has its own deadline anyway (`workflow_run`'s `timeout_ms`, the Apps
 * bridge's `maxAttempts`). `rawStatus` carries the value verbatim and this
 * warning keeps it diagnosable.
 *
 * `'failed'` is deliberately not special-cased: no engine path, store, or
 * fixture in this repository produces it (the failure terminal is `error`), and
 * that dead branch is exactly what let the real terminal fall through to the
 * default (#1390). A foreign record carrying it lands here, with a warning,
 * instead of being blessed as a second spelling of "failed".
 */
export function toTaskStatus(rawStatus: string): TaskStatus {
  const mapped = (TASK_STATUS_BY_EXECUTION_STATUS as Record<string, TaskStatus | undefined>)[rawStatus];
  if (mapped !== undefined) return mapped;
  logger.warn('execution status has no task-level mapping; reporting QUEUED', { rawStatus });
  return 'QUEUED';
}

export interface WorkflowExecutionParams {
  workspaceId: string;
  workflowVersion?: string | number;
  expectedVersion?: number;
  snapshot?: {
    nodes: Array<{ id: string; type?: string; data?: Record<string, unknown>; [key: string]: unknown }>;
    edges: Array<{ id?: string; source: string; target: string; data?: Record<string, unknown>; targetHandle?: string | null; [key: string]: unknown }>;
    settings?: { maxParallel?: number; [key: string]: unknown };
  };
  inputs?: Record<string, unknown>;
  nodeIds?: string[];
  mode?: ExecutionMode;
  caller?: {
    pluginId?: string;
    appId?: string;
    submittedAt?: string;
  };
}

export interface WorkflowJobDescriptor {
  executionId: string;
  jobId: string; // Alias for executionId
  workspaceId: string;
  status: TaskStatus;
  rawStatus: string;
  totalNodes: number;
  createdAt: string;
  streamUrl: string;
  eventsUrl: string;
  pollUrl: string;
}

export interface WorkflowJobArtifact {
  nodeId: string;
  id?: string;
  type?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
}

export interface WorkflowJobStatus {
  executionId: string;
  jobId: string;
  workspaceId?: string;
  status: TaskStatus;
  rawStatus: string;
  error?: string;
  progress?: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    percentage: number;
  };
  artifacts: WorkflowJobArtifact[];
  nodeOutputs?: Record<string, unknown>;
}

export interface HeadlessWorkspaceProvider {
  get?: (id: string) => any;
  getWorkspace?: (id: string) => any;
  resolveProjectRoot?: (id: string) => string | null | undefined;
}

export interface HeadlessExecutionSeamDeps {
  executionManager: ExecutionManager;
  workspaceStore?: HeadlessWorkspaceProvider;
  ensureProjectBound?: (workspaceId: string, name?: string) => Promise<void>;
  getCatalog?: () => Promise<CapabilityCatalog | null>;
  mediaDir?: string;
  resolveProjectFile?: ResolveExecutionProjectFile;
}

export interface HeadlessExecutionSeam {
  executeHeadless(params: WorkflowExecutionParams): Promise<WorkflowJobDescriptor>;
  cancelJob(jobId: string): Promise<{ success: boolean; canceledAt: string; message?: string }>;
  getJobStatus(jobId: string): Promise<WorkflowJobStatus | null>;
}

export function createHeadlessExecutionSeam(deps: HeadlessExecutionSeamDeps): HeadlessExecutionSeam {
  if (!deps || !deps.executionManager) {
    throw new HeadlessExecutionError('invalid_deps', 'ExecutionManager is required to instantiate HeadlessExecutionSeam');
  }

  return {
    async executeHeadless(params: WorkflowExecutionParams): Promise<WorkflowJobDescriptor> {
      if (!params || typeof params !== 'object') {
        throw new HeadlessExecutionError('invalid_params', 'Execution parameters must be a valid object');
      }

      const { workspaceId } = params;
      if (!workspaceId || typeof workspaceId !== 'string' || !workspaceId.trim()) {
        throw new HeadlessExecutionError('workspace_required', 'workspaceId is required and must be a non-empty string');
      }

      logger.info('executeHeadless invoked', {
        workspaceId,
        caller: params.caller,
        hasSnapshot: !!params.snapshot,
      });

      // 1. Resolve workflow graph (Fail-Closed: Never fallback to empty graph or mock data!)
      let rawNodes: Array<{ id: string; type?: string; data?: Record<string, unknown>; [key: string]: unknown }> = [];
      let rawEdges: Array<{ id?: string; source: string; target: string; data?: Record<string, unknown>; targetHandle?: string | null; [key: string]: unknown }> = [];
      let maxParallel = 3;

      if (params.snapshot && Array.isArray(params.snapshot.nodes)) {
        rawNodes = structuredClone(params.snapshot.nodes);
        rawEdges = structuredClone(params.snapshot.edges || []);
        if (typeof params.snapshot.settings?.maxParallel === 'number') {
          maxParallel = params.snapshot.settings.maxParallel;
        }
      } else if (deps.workspaceStore) {
        const fetcher = deps.workspaceStore.get || deps.workspaceStore.getWorkspace;
        if (typeof fetcher === 'function') {
          try {
            const fetched = await fetcher.call(deps.workspaceStore, workspaceId);
            if (fetched && Array.isArray(fetched.nodes)) {
              rawNodes = structuredClone(fetched.nodes);
              rawEdges = structuredClone(fetched.edges || []);
              if (typeof fetched.settings?.maxParallel === 'number') {
                maxParallel = fetched.settings.maxParallel;
              }
              if (
                params.expectedVersion !== undefined &&
                fetched.version !== undefined &&
                fetched.version !== params.expectedVersion
              ) {
                throw new HeadlessExecutionError(
                  'version_conflict',
                  `Workflow version ${fetched.version} does not match expectedVersion ${params.expectedVersion}`,
                );
              }
            }
          } catch (err: any) {
            if (err instanceof HeadlessExecutionError) throw err;
            throw new HeadlessExecutionError('workspace_load_error', `Failed to load workspace graph: ${err.message}`);
          }
        }
      }

      // Hard check: Fail-Closed invariant
      if (!rawNodes || rawNodes.length === 0) {
        throw new HeadlessExecutionError(
          'empty_graph',
          `Cannot execute empty workflow graph for workspace "${workspaceId}". Refusing to fallback to empty mock (Fail-Closed).`,
        );
      }

      // 2. Fetch capability catalog
      const catalog = deps.getCatalog ? await deps.getCatalog() : null;

      // 3. Prepare slot bindings and freeze hydration (reusing shared Canvas preparation logic)
      const slotGraph = prepareExecutionSlotGraph(rawNodes, rawEdges, catalog);

      // 4. Resolve execution mode and subgraph
      const mode = toExecutionMode(params.mode);
      const subgraph = resolveExecutionSubgraph({
        nodes: slotGraph.nodes,
        edges: slotGraph.edges,
        executionMode: mode,
        nodeIds: normalizeNodeIds(params.nodeIds),
      });

      if (!subgraph.nodes || subgraph.nodes.length === 0) {
        throw new HeadlessExecutionError('empty_subgraph', 'Resolved execution subgraph contains no executable nodes');
      }

      // 5. Readiness verification (Fail-Closed invariant: check all input sources, parameters, model slots)
      const readinessFailure = findExecutionReadinessFailure(
        subgraph.nodes as Array<{ id: string; type: string; data?: Record<string, unknown> }>,
        catalog,
        {
          nodes: slotGraph.nodes,
          edges: slotGraph.edges,
          workspaceId,
          scheduledNodeIds: mode === 'single' ? undefined : subgraph.nodeIdSet,
        },
      );

      if (readinessFailure) {
        throw new HeadlessExecutionError(
          'readiness_failure',
          `Execution readiness check failed for node "${readinessFailure.nodeId}" [${readinessFailure.reasonCode}]: ${readinessFailure.message}`,
          readinessFailure,
        );
      }

      // 6. Project binding requirement for media generation
      if (
        subgraphContainsMediaGenerate(subgraph.nodes as Array<{ type?: string; data?: Record<string, unknown> }>) &&
        deps.workspaceStore &&
        typeof deps.workspaceStore.resolveProjectRoot === 'function' &&
        !deps.workspaceStore.resolveProjectRoot(workspaceId)
      ) {
        if (deps.ensureProjectBound) {
          await deps.ensureProjectBound(workspaceId, workspaceId);
        }
        if (!deps.workspaceStore.resolveProjectRoot(workspaceId)) {
          throw new HeadlessExecutionError(
            'project_required',
            `Workspace "${workspaceId}" contains media generation nodes but is not bound to a local project.`,
          );
        }
      }

      // 7. Calculate initial outputs for single/subgraph mode if applicable
      let initialOutputs: Record<string, unknown> | undefined;
      try {
        initialOutputs = buildInitialOutputs(
          { nodes: slotGraph.nodes, edges: slotGraph.edges } as any,
          subgraph.nodeIdSet,
          {
            mediaDir: deps.mediaDir ?? '',
            resolveProjectFile: deps.resolveProjectFile,
          },
        );
      } catch {
        // Non-fatal if initialOutputs cannot be resolved
      }

      // 8. Launch real execution via ExecutionManager
      const entry = deps.executionManager.createExecution({
        workspaceId,
        nodes: subgraph.nodes as any,
        edges: subgraph.edges as any,
        maxParallel,
        initialOutputs,
      });

      const executionId = entry.context.id;
      const createdAt = entry.createdAt;

      logger.info('executeHeadless successfully started', {
        executionId,
        workspaceId,
        nodeCount: subgraph.nodes.length,
      });

      return {
        executionId,
        jobId: executionId,
        workspaceId,
        status: 'RUNNING',
        rawStatus: entry.context.status,
        totalNodes: subgraph.nodes.length,
        createdAt,
        streamUrl: `/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}/executions/${encodeURIComponent(executionId)}/events`,
        eventsUrl: `/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}/executions/${encodeURIComponent(executionId)}/events`,
        pollUrl: `/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}/executions/${encodeURIComponent(executionId)}`,
      };
    },

    async cancelJob(jobId: string): Promise<{ success: boolean; canceledAt: string; message?: string }> {
      if (!jobId || typeof jobId !== 'string') {
        throw new HeadlessExecutionError('invalid_job_id', 'jobId is required to cancel execution');
      }

      const result = await deps.executionManager.cancelExecution(jobId);
      return {
        success: result.ok,
        canceledAt: new Date().toISOString(),
        message: result.message,
      };
    },

    async getJobStatus(jobId: string): Promise<WorkflowJobStatus | null> {
      if (!jobId || typeof jobId !== 'string') {
        return null;
      }

      const snap = await deps.executionManager.getSnapshot(jobId);
      if (!snap) {
        return null;
      }

      const status = toTaskStatus(snap.status);

      // Accurately unpack multi-node multi-artifact arrays from ExecutionContext
      // Contract: snap.mediaAssets is Record<string, Array<MediaAsset>>
      const artifacts: WorkflowJobArtifact[] = [];
      if (snap.mediaAssets && typeof snap.mediaAssets === 'object') {
        for (const [nodeId, assetList] of Object.entries(snap.mediaAssets)) {
          if (Array.isArray(assetList)) {
            for (const asset of assetList) {
              if (asset && typeof asset === 'object') {
                artifacts.push({
                  nodeId,
                  id: (asset as any).id || (asset as any).assetId,
                  type: (asset as any).type || (asset as any).materialType || (asset as any).kind,
                  url: (asset as any).url || (asset as any).pathOrUrl || (asset as any).path,
                  mimeType: (asset as any).mimeType,
                  sizeBytes: (asset as any).sizeBytes,
                  durationSec: (asset as any).durationSec,
                });
              }
            }
          } else if (assetList && typeof assetList === 'object') {
            artifacts.push({
              nodeId,
              id: (assetList as any).id || (assetList as any).assetId,
              type: (assetList as any).type || (assetList as any).materialType || (assetList as any).kind,
              url: (assetList as any).url || (assetList as any).pathOrUrl || (assetList as any).path,
              mimeType: (assetList as any).mimeType,
              sizeBytes: (assetList as any).sizeBytes,
              durationSec: (assetList as any).durationSec,
            });
          }
        }
      }

      return {
        executionId: snap.id,
        jobId: snap.id,
        workspaceId: snap.workspaceId,
        status,
        rawStatus: snap.status,
        error: snap.error || undefined,
        progress: snap.progress,
        artifacts,
        nodeOutputs: snap.nodeOutputs,
      };
    },
  };
}
