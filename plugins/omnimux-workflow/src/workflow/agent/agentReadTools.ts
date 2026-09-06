/**
 * Read/run agent tools: workflow_list / workflow_run / workflow_snapshot.
 * Names, descriptions and JSON schemas are unchanged from the monolith.
 */

import { buildInitialOutputs } from '../execution/executionInputs.ts';
import type { CapabilityCatalog } from '../../shared/api.ts';
import { findExecutionReadinessFailure } from '../../shared/validation/executionReadiness.ts';
import {
  normalizeNodeIds,
  resolveExecutionSubgraph,
  subgraphContainsMediaGenerate,
  toExecutionMode,
} from '../execution/subgraph.ts';
import {
  type AgentToolSpec,
  type WorkflowAgentDeps,
  objectParams,
  jsonOut,
  DEFAULT_RUN_WAIT_TIMEOUT_MS,
  LIST_EXECUTIONS_LIMIT,
  errorBody,
  readString,
  readBoolean,
  resolveWorkspace,
  withWorkspace,
  waitForTerminal,
  summarizeNodes,
  WORKSPACE_ID_PARAM_DESC,
} from './agentToolShared.ts';

export function createWorkflowListTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, executionManager } = deps;
  return {
    name: 'workflow_list',
    description:
      'List the workflow infinite-canvas workspaces of the omnimux-workflow plugin (id, name, version, nodeCount, updatedAt), newest first. Set includeExecutions=true to also get the 5 most recent executions (current process) with status and progress. Read-only. Use workflow_snapshot to inspect one workspace and workflow_run to execute it.',
    parameters: objectParams({
      include_executions: {
        type: 'boolean',
        description: 'Also include the 5 most recent executions (status + progress overview)',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const workspaces = store.list();
      if (!readBoolean(args, 'include_executions')) {
        return { workspaces };
      }
      const executions = executionManager
        .listExecutions()
        .slice(0, LIST_EXECUTIONS_LIMIT);
      return { workspaces, executions };
    },
  };
}

export function createWorkflowRunTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, executionManager, mediaDir, getActiveView } = deps;
  return {
    name: 'workflow_run',
    description:
      'Run a workflow canvas (node DAG) on the omnimux-workflow execution engine. Prefer the current canvas from ui_context when workspace_id is omitted. mode "full" runs every node; mode "subset" runs only the given nodeIds plus their transitive upstream closure; mode "single" runs only the given nodeIds directly (inheriting existing upstream outputs). wait=false (default) returns the executionId immediately — the user can watch live progress on the canvas (per-node badges + SSE). wait=true polls until a terminal status (completed/error/cancelled) or the timeout (default 120s) and returns per-node statuses, text excerpts and media file paths. The canvas performs generation through the OmniMux gateway (real hub seams when available, mock otherwise).',
    parameters: objectParams({
      workspace_id: {
        type: 'string',
        description: WORKSPACE_ID_PARAM_DESC,
      },
      workspace_name: {
        type: 'string',
        description: 'Exact workspace name (fallback when the id is unknown; must be unique)',
      },
      mode: {
        type: 'string',
        enum: ['full', 'subset', 'single'],
        description: 'Execution scope: full (default), subset (nodeIds + upstream closure), or single (target nodeIds only)',
      },
      node_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Required for subset and single modes: node ids to execute',
      },
      wait: {
        type: 'boolean',
        description: 'Wait for a terminal status (bounded by timeout_ms) and return the result summary',
      },
      timeout_ms: {
        type: 'number',
        description: 'wait=true polling budget in milliseconds (default 120000)',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const workspaceId = readString(args, 'workspace_id');
      const workspaceName = readString(args, 'workspace_name');
      const resolved = resolveWorkspace(store, workspaceId, workspaceName, { getActiveView });
      if ('error' in resolved) return resolved;
      const workspace = resolved.snapshot;

      let mode: 'full' | 'subset' | 'single';
      try {
        mode = toExecutionMode(args.mode);
      } catch (error) {
        return errorBody(
          'invalid-args',
          error instanceof Error ? error.message : String(error),
        );
      }

      const nodeIds = normalizeNodeIds(args.node_ids);
      let subgraph;
      try {
        subgraph = resolveExecutionSubgraph({
          nodes: workspace.nodes as Array<{ id: string; [key: string]: unknown }>,
          edges: workspace.edges as Array<{ source: string; target: string; [key: string]: unknown }>,
          executionMode: mode,
          nodeIds,
        });
      } catch (error) {
        return errorBody(
          'invalid-subgraph',
          error instanceof Error ? error.message : String(error),
        );
      }
      if (subgraph.nodes.length === 0) {
        return errorBody('empty-graph', `workspace ${workspace.id} has no nodes to execute`);
      }
      const readiness = findExecutionReadinessFailure(
        subgraph.nodes as Array<{ id: string; type: string; data?: Record<string, unknown> }>,
        (typeof deps.getCatalog === 'function' ? deps.getCatalog() : null) as CapabilityCatalog | null,
      );
      if (readiness) {
        return {
          error: 'configuration_error',
          reasonCode: readiness.reasonCode,
          nodeId: readiness.nodeId,
          message: readiness.message,
        };
      }
      if (
        subgraphContainsMediaGenerate(subgraph.nodes as Array<{ type?: string; data?: Record<string, unknown> }>)
        && !store.resolveProjectRoot(workspace.id)
      ) {
        if (deps.ensureProjectBound) {
          await deps.ensureProjectBound(workspace.id, workspace.name);
        }
        if (!store.resolveProjectRoot(workspace.id)) {
          return errorBody(
            'project-required',
            `workspace ${workspace.id} is not bound to a local project`,
          );
        }
      }

      if (store.get(workspace.id).version !== workspace.version) {
        return errorBody('version_conflict', '输入已更新，请确认当前内容后重新生成');
      }
      const initialOutputs = buildInitialOutputs(workspace, subgraph.nodeIdSet);

      const entry = executionManager.createExecution({
        workspaceId: workspace.id,
        nodes: subgraph.nodes as unknown as Array<{ id: string; type: string; data?: Record<string, unknown> }>,
        edges: subgraph.edges as unknown as Array<{ source: string; target: string }>,
        maxParallel: workspace.settings.maxParallel,
        initialOutputs,
      });
      const executionId = entry.context.id;

      if (!readBoolean(args, 'wait')) {
        return {
          executionId,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          mode,
          totalNodes: subgraph.nodes.length,
          maxParallel: workspace.settings.maxParallel,
          status: entry.context.status,
          hint:
            'Execution started in the background — the user can watch live per-node progress on the canvas. Call workflow_snapshot / workflow_list(include_executions=true) or re-run with wait=true to fetch the outcome.',
        };
      }

      const timeoutMs =
        typeof args.timeout_ms === 'number' && args.timeout_ms > 0
          ? Math.floor(args.timeout_ms)
          : DEFAULT_RUN_WAIT_TIMEOUT_MS;
      const { snapshot: final, timedOut } = await waitForTerminal(
        executionManager,
        executionId,
        timeoutMs,
      );
      if (!final) {
        return errorBody('execution-not-found', `execution ${executionId} disappeared`);
      }

      const durationMs =
        final.completedAt !== null && final.startedAt !== null
          ? final.completedAt - final.startedAt
          : null;
      return {
        executionId,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        mode,
        totalNodes: subgraph.nodes.length,
        status: final.status,
        timedOut,
        error: final.error,
        progress: final.progress,
        ...(durationMs !== null ? { durationMs } : {}),
        nodes: summarizeNodes(workspace, subgraph.nodeIdSet, final, mediaDir),
        ...(timedOut
          ? { hint: `Still not terminal after ${String(timeoutMs)}ms — the run continues in the background; retry workflow_run or check the canvas.` }
          : {}),
      };
    },
  };
}

export function createWorkflowSnapshotTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, getActiveView } = deps;
  return {
    name: 'workflow_snapshot',
    description:
      'Read the current state of one workflow canvas workspace (defaults to the ui_context current canvas when workspace_id is omitted). Default: a compact summary (name, version, node/edge counts, node type/material breakdown, execution settings). includeNodes=true returns the FULL node and edge structure (positions, prompts, tools, models, connections) so the graph can be analyzed or modification advice given. Read-only. Unbound canvases live under $DSH_HOME/omnimux/workflow/workspaces/<id>/canvas.json; bound canvases live under <ProjectRoot>/.omnimux/canvases/<id>.json.',
    parameters: objectParams({
      workspace_id: {
        type: 'string',
        description: WORKSPACE_ID_PARAM_DESC,
      },
      include_nodes: {
        type: 'boolean',
        description: 'Return the full nodes/edges structure instead of the compact summary',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const resolved = resolveWorkspace(
        store,
        readString(args, 'workspace_id'),
        readString(args, 'workspace_name'),
        { getActiveView },
      );
      if ('error' in resolved) return resolved;
      const workspaceId = resolved.snapshot.id;

      return withWorkspace(store, workspaceId, (workspace) => {
        if (readBoolean(args, 'include_nodes')) {
          return { workspace };
        }

        const nodeTypeCounts: Record<string, number> = {};
        const materialCounts: Record<string, number> = {};
        for (const node of workspace.nodes) {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const type = typeof node.type === 'string' ? node.type : 'unknown';
          nodeTypeCounts[type] = (nodeTypeCounts[type] ?? 0) + 1;
          const material = typeof data.materialType === 'string' ? data.materialType : 'unknown';
          materialCounts[material] = (materialCounts[material] ?? 0) + 1;
        }
        return {
          summary: {
            id: workspace.id,
            name: workspace.name,
            version: workspace.version,
            nodeCount: workspace.nodes.length,
            edgeCount: workspace.edges.length,
            nodeTypeCounts,
            materialCounts,
            settings: workspace.settings,
            metadata: workspace.metadata,
          },
          hint: 'Pass include_nodes=true for the full node/edge structure.',
        };
      });
    },
  };
}
