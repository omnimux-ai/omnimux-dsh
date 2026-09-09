/**
 * Agent tool seats (M5): registers the workflow canvas tools on the cordis
 * `tools` seat plus the `workflow:ops` systemPrompt section, following the
 * proven omnimux-assets plugin pattern (ctx.tools.register + JSON-Schema
 * params + {error, message} error envelopes).
 *
 * Read/run tools, all host-side against the already assembled store /
 * executionManager (no extra HTTP calls, no hub imports):
 *   - workflow_list:     workspaces (+ optional recent executions overview)
 *   - workflow_run:      create an execution (full/subset); optional wait to
 *                        a terminal state with a bounded timeout
 *   - workflow_snapshot: workspace summary or the full node/edge structure
 *
 * PR2 structural write tools (same patterns, all mutations through the
 * shared graph core + GraphMutator optimistic-lock replay):
 *   - workflow_create:        new empty workspace
 *   - workflow_node_add:      add a material node (type/tool/position/prompt)
 *   - workflow_node_update:   patch node label/prompt/tool/params/position
 *   - workflow_node_remove:   remove nodes (cascading edges)
 *   - workflow_connect:       add a validated edge
 *   - workflow_disconnect:    remove edges by id or by endpoint pair
 *
 * Expected failures are RETURNED as { error, message } objects (never thrown)
 * so the wire shape is deterministic regardless of how the host surfaces
 * tool exceptions.
 */

import {
  createCanvasWriteTableNodeTool,
  createCanvasGetTableNodeTool,
} from './tableTools.ts';
import {
  createWorkflowListTool,
  createWorkflowRunTool,
  createWorkflowSnapshotTool,
} from './agentReadTools.ts';
import {
  createWorkflowCreateTool,
  createWorkflowNodeAddTool,
  createWorkflowNodeUpdateTool,
  createWorkflowNodeRemoveTool,
} from './agentWriteTools.ts';
import {
  createWorkflowConnectTool,
  createWorkflowDisconnectTool,
  createWorkflowExecutionControlTool,
} from './agentControlTools.ts';
import {
  type AgentSeatContext,
  type AgentToolSpec,
  sanitizeLosslessJson,
} from './agentToolShared.ts';
import type { WorkflowAgentDeps } from './agentToolShared.ts';

export type {
  AgentToolSpec,
  ToolsSeat,
  SystemPromptSeat,
  AgentSeatContext,
  WorkflowAgentDeps,
} from './agentToolShared.ts';
export { DEFAULT_RUN_WAIT_TIMEOUT_MS } from './agentToolShared.ts';

const WORKFLOW_PROMPT = `This workspace may mount the OmniMux workflow canvas (omnimux-workflow): an infinite canvas where the user builds node DAGs (text/image/video/audio material nodes) and executes them through the OmniMux generation gateway.

Workspace targeting (CRITICAL):
1. If the latest user message <ui_context> includes view: canvas and workspace: <id>, that id IS the current canvas. Pass it as workspace_id, or omit workspace_id and the tool will use the same default.
2. An explicit workspace_id in the user request overrides ui_context.
3. Do NOT call workflow_list merely to rediscover the current canvas. Do NOT ask the user which canvas/workspace to use when a valid current workspace is available.
4. workflow_list is only for: user asks to browse/list workspaces; no usable current workspace; or the user names another workspace that needs lookup/disambiguation.
5. Never invent node/edge ids — read workflow_snapshot (include_nodes=true) before editing an existing graph.

Reading: workflow_snapshot returns one workspace's structure; workflow_run starts an execution (full or subset with node_ids) and with wait=true returns per-node statuses, text excerpts and generated media file paths.
Editing: workflow_create makes a new empty canvas; workflow_node_add adds a material node (returns its id; for text, content sets manual text while prompt sets model generation); workflow_node_update patches label/prompt/content/tool/params/position; workflow_node_remove deletes nodes (edges cascade); workflow_connect / workflow_disconnect wire and unwire edges. Write tools fail with a structured error (invalid-args / no-current-workspace / node-not-found / mutation-rejected with reasonCode like cycle or type_contract) — fix the arguments and retry, do not work around the validation. After each edit the response carries the new workspace version; the open canvas refreshes itself within a few seconds.
Control: workflow_execution_control pauses / resumes / cancels a live execution by executionId (from workflow_run).
When the user mentions a canvas, a workflow, nodes, or asks to run/analyze/modify their graph, use these tools instead of guessing. Executions stream live progress on the canvas (SSE, pause/resume/cancel available there). Generation goes through the OmniMux hub seams when available (mock gateway offline) — never invent results: report what the tools return, including per-node errors like [omnimux:<code>].`;

/**
 * Register the three workflow tools and the workflow:ops systemPrompt
 * section on the provided seats. Returns a disposer that undoes whatever
 * the seats allowed to be undone.
 */
export function registerWorkflowAgentSeats(
  ctx: AgentSeatContext,
  deps: WorkflowAgentDeps,
): () => void {
  const disposers: Array<() => void> = [];

  const tools = ctx.tools;
  if (tools && typeof tools.register === 'function') {
    const specs = [
      createWorkflowListTool(deps),
      createWorkflowRunTool(deps),
      createWorkflowSnapshotTool(deps),
      createWorkflowCreateTool(deps),
      createWorkflowNodeAddTool(deps),
      createWorkflowNodeUpdateTool(deps),
      createWorkflowNodeRemoveTool(deps),
      createWorkflowConnectTool(deps),
      createWorkflowDisconnectTool(deps),
      createWorkflowExecutionControlTool(deps),
      createCanvasWriteTableNodeTool(deps),
      createCanvasGetTableNodeTool(deps),
    ];
    for (const spec of specs) {
      const origExecute = spec.execute;
      const wrappedSpec: AgentToolSpec = {
        ...spec,
        async execute(args: Record<string, unknown>) {
          const result = await origExecute(args);
          return sanitizeLosslessJson(result);
        },
      };
      const dispose = tools.register(wrappedSpec);
      if (typeof dispose === 'function') disposers.push(dispose as () => void);
    }
  }

  const systemPrompt = ctx.systemPrompt;
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    // order 60: after the assets plugin's assets:ops (50) — canvas tools
    // complement, never collide with, the assets seats.
    const dispose = systemPrompt.section({
      name: 'workflow:ops',
      order: 60,
      text: WORKFLOW_PROMPT,
    });
    if (typeof dispose === 'function') disposers.push(dispose as () => void);
  }

  return () => {
    for (const dispose of disposers) dispose();
  };
}

/** Exposed for tests: the prompt section name/order (assertion targets). */
export const WORKFLOW_PROMPT_SECTION = { name: 'workflow:ops', order: 60 } as const;
