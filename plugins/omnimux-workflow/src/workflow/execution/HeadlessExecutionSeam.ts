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

      let status: TaskStatus = 'QUEUED';
      if (snap.status === 'running') status = 'RUNNING';
      else if (snap.status === 'completed') status = 'COMPLETED';
      else if (snap.status === 'failed') status = 'FAILED';
      else if (snap.status === 'cancelled') status = 'CANCELED';

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
