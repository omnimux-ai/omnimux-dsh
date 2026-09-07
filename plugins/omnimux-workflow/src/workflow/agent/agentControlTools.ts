import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';
import { normalizeNodeIds } from '../execution/subgraph.ts';
import { mutationContext } from './agentMutationContext.ts';
import {
  type AgentToolSpec,
  type WorkflowAgentDeps,
  objectParams,
  jsonOut,
  errorBody,
  readString,
  workspaceSummary,
  withWorkspace,
  resolveTargetWorkspaceId,
  WORKSPACE_ID_PARAM_DESC,
} from './agentToolShared.ts';

export function createWorkflowConnectTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, getActiveView } = deps;
  return {
    name: 'workflow_connect',
    description:
      'Connect two nodes on the current or specified workflow canvas (source output → target input). Omit workspace_id to use the ui_context current canvas. Validated exactly like a manual drag connection: no self-connection, no duplicates, no cycles, and the source material type must be accepted by the target (edge validation uses the union of all tools of the target material type). On rejection the error message carries the reason code (self_connection / duplicate_edge / missing_node / cycle / type_contract).',
    parameters: objectParams({
      workspace_id: { type: 'string', description: WORKSPACE_ID_PARAM_DESC },
      source: { type: 'string', required: true, description: 'Source (upstream) node id' },
      target: { type: 'string', required: true, description: 'Target (downstream) node id' },
      source_handle: { type: 'string', description: 'Source handle (default out)' },
      target_handle: { type: 'string', description: 'Target handle (default in)' },
    }),
    output: jsonOut,
    async execute(args) {
      const source = readString(args, 'source');
      const target = readString(args, 'target');
      if (!source || !target) {
        return errorBody('invalid-args', 'source and target are required');
      }

      const resolved = resolveTargetWorkspaceId(store, args, { getActiveView });
      if ('error' in resolved) return resolved;
      const { workspaceId } = resolved;

      return withWorkspace(store, workspaceId, (_snapshot) => {
        const result = mutateWorkspaceGraph(store, workspaceId, {
          addEdges: [{
            source,
            target,
            sourceHandle: readString(args, 'source_handle'),
            targetHandle: readString(args, 'target_handle'),
          }],
        }, mutationContext(deps));
        if (!result.ok) return errorBody(result.error, result.message);
        const edge = result.snapshot.edges.find(
          (row) => row.source === source && row.target === target,
        );
        return { workspace: workspaceSummary(result.snapshot), edge };
      });
    },
  };
}

export function createWorkflowDisconnectTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, getActiveView } = deps;
  return {
    name: 'workflow_disconnect',
    description:
      'Remove edges from the current or specified workflow canvas, either by edge ids (from workflow_snapshot include_nodes=true) or by a source+target node pair. Omit workspace_id to use the ui_context current canvas. Returns the removed edge count.',
    parameters: objectParams({
      workspace_id: { type: 'string', description: WORKSPACE_ID_PARAM_DESC },
      edge_ids: { type: 'array', items: { type: 'string' }, description: 'Edge ids to remove' },
      source: { type: 'string', description: 'With target: remove the edge between these nodes' },
      target: { type: 'string', description: 'With source: remove the edge between these nodes' },
    }),
    output: jsonOut,
    async execute(args) {
      const edgeIds = normalizeNodeIds(args.edge_ids);
      const source = readString(args, 'source');
      const target = readString(args, 'target');
      if (edgeIds.length === 0 && !(source && target)) {
        return errorBody('invalid-args', 'pass edge_ids or source+target');
      }

      const resolved = resolveTargetWorkspaceId(store, args, { getActiveView });
      if ('error' in resolved) return resolved;
      const { workspaceId } = resolved;

      return withWorkspace(store, workspaceId, (snapshot) => {
        const resolved = new Set(edgeIds);
        if (source && target) {
          for (const edge of snapshot.edges) {
            if (edge.source === source && edge.target === target) resolved.add(edge.id);
          }
        }
        const existing = new Set(snapshot.edges.map((edge) => edge.id));
        const toRemove = [...resolved].filter((id) => existing.has(id));
        if (toRemove.length === 0) {
          return errorBody('edge-not-found', 'no matching edges in this workspace');
        }

        const result = mutateWorkspaceGraph(store, workspaceId, { removeEdgeIds: toRemove }, mutationContext(deps));
        if (!result.ok) return errorBody(result.error, result.message);
        return { workspace: workspaceSummary(result.snapshot), removedEdges: toRemove.length };
      });
    },
  };
}

export function createWorkflowExecutionControlTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { executionManager } = deps;
  return {
    name: 'workflow_execution_control',
    description:
      'Control a running workflow execution: pause (halts scheduling, in-flight node finishes), resume (continues; also recovers a persisted paused execution after a restart), or cancel (aborts cooperatively). Use the executionId returned by workflow_run. The open canvas reflects the new state live via SSE. Returns the resulting execution status.',
    parameters: objectParams({
      execution_id: {
        type: 'string',
        required: true,
        description: 'Execution id (from workflow_run or workflow_list include_executions=true)',
      },
      action: {
        type: 'string',
        enum: ['pause', 'resume', 'cancel'],
        required: true,
        description: 'Control action',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const executionId = readString(args, 'execution_id');
      if (!executionId) return errorBody('invalid-args', 'execution_id is required');

      const action = readString(args, 'action');
      if (action !== 'pause' && action !== 'resume' && action !== 'cancel') {
        return errorBody('invalid-args', 'action must be pause | resume | cancel');
      }

      const controlByAction = {
        pause: executionManager.pauseExecution,
        resume: executionManager.resumeExecution,
        cancel: executionManager.cancelExecution,
      } as const;
      const control = controlByAction[action];
      const result = await control(executionId);
      if (!result.ok) {
        return errorBody('execution-control-failed', result.message ?? `cannot ${action} execution ${executionId}`);
      }
      const snapshot = executionManager.getSnapshot(executionId);
      return {
        executionId,
        action,
        ok: true,
        status: snapshot?.status ?? null,
        progress: snapshot?.progress ?? null,
      };
    },
  };
}
