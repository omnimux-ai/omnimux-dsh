/**
 * Structural write / control agent tools.
 * Names, descriptions and JSON schemas are unchanged from the monolith.
 */

import { resolveTableAbsPath, TablePathError } from '../storage/tablePath.ts';
import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';
import { createMaterialNode } from '../../shared/graph/nodeFactory.ts';
import type { MaterialType, MaterialTool } from '../../shared/graph/materialNode.ts';
import type { CanvasInputMutation } from '../../shared/graph/canvasInputMutationGateway.ts';
import { mutationContext } from './agentMutationContext.ts';
import { normalizeNodeIds } from '../execution/subgraph.ts';
import { TableStorageService } from '../storage/TableStorageService.ts';
import {
  type AgentToolSpec,
  type WorkflowAgentDeps,
  objectParams,
  jsonOut,
  MATERIAL_TYPE_ENUM,
  errorBody,
  readString,
  workspaceSummary,
  resolveTool,
  readPosition,
  defaultNodePosition,
  withWorkspace,
  resolveTargetWorkspaceId,
  WORKSPACE_ID_PARAM_DESC,
} from './agentToolShared.ts';

/**
 * Validate and parse patch payload for workflow_node_update.
 */
function parseNodePatch(
  nodeId: string,
  node: { data?: Record<string, unknown> },
  spec: Record<string, unknown>,
): { data: Record<string, unknown>; position?: { x: number; y: number } } | { error: string; message: string } {
  const position = spec.position;
  if (position !== undefined) {
    if (
      !position || typeof position !== 'object' || Array.isArray(position)
      || typeof (position as Record<string, unknown>).x !== 'number'
      || typeof (position as Record<string, unknown>).y !== 'number'
    ) {
      return errorBody('invalid-args', 'patch.position must be {x: number, y: number}');
    }
  }

  if (spec.params !== undefined) {
    if (!spec.params || typeof spec.params !== 'object' || Array.isArray(spec.params)) {
      return errorBody('invalid-args', 'patch.params must be an object');
    }
  }

  const materialType = (node.data as Record<string, unknown>)?.materialType as MaterialType | undefined;
  const isText = materialType === 'text';
  let selectedTool: MaterialTool | undefined;
  if (spec.tool !== undefined) {
    if (!materialType) return errorBody('invalid-args', `node ${nodeId} has no material_type; cannot set tool`);
    const toolResolved = resolveTool(materialType, spec.tool);
    if ('error' in toolResolved) return toolResolved;
    selectedTool = toolResolved.tool;
  }

  const data: Record<string, unknown> = {};
  if (spec.label !== undefined) data.label = spec.label;
  if (spec.params !== undefined) data.params = spec.params;
  if (selectedTool !== undefined) data.selectedTool = selectedTool;

  if (spec.content !== undefined) {
    if (typeof spec.content !== 'string') {
      return errorBody('invalid-args', 'patch.content must be a string');
    }
    if (isText) {
      const trimmed = spec.content.trim();
      if (trimmed) {
        data.content = spec.content;
        data.status = 'ready';
        data.nodeKind = 'import';
        data.selectedTool = 'text-editor';
        data.prompt = undefined; // 激活手动编辑，关闭模型生成
        data.generatedContent = undefined;
      } else {
        data.content = '';
        data.status = 'empty';
        data.nodeKind = 'generate';
        data.generatedContent = undefined;
      }
    } else {
      data.content = spec.content;
    }
  }

  if (spec.prompt !== undefined) {
    if (typeof spec.prompt !== 'string') {
      return errorBody('invalid-args', 'patch.prompt must be a string');
    }
    data.prompt = spec.prompt;
    if (isText && spec.prompt.trim()) {
      data.nodeKind = 'generate';
      data.selectedTool = 'text-to-text';
      data.content = undefined; // 激活模型生成，关闭手动编辑
      data.generatedContent = undefined;
      data.status = 'empty';
    }
  }

  if (Object.keys(data).length === 0 && position === undefined) {
    return errorBody('invalid-args', 'patch must contain at least one of label / prompt / content / tool / params / position');
  }

  return {
    data,
    ...(position !== undefined ? { position: position as { x: number; y: number } } : {}),
  };
}

export function createWorkflowCreateTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store } = deps;
  return {
    name: 'workflow_create',
    description:
      'Create a new empty workflow canvas workspace and return it (id, name, version). Follow up with workflow_node_add / workflow_connect to build the graph, and workflow_run to execute it.',
    parameters: objectParams({
      name: {
        type: 'string',
        description: 'Workspace name (max 200 chars; default 未命名工作流)',
      },
    }),
    output: jsonOut,
    async execute(args) {
      try {
        const workspace = store.create(readString(args, 'name'));
        return { workspace };
      } catch (error) {
        return errorBody(
          'invalid-args',
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
}

export function createWorkflowNodeAddTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, getActiveView } = deps;
  return {
    name: 'workflow_node_add',
    description:
      'Add a material node to the current or specified workflow canvas. When the user is on a canvas tab, omit workspace_id to use the ui_context workspace. material_type picks the node kind; tool picks what the node does and must be valid for that type — text: text-editor|text-to-text|link-extract|audio-transcription, image: import|text-to-image|image-to-image, video: import|video-generation|motion-mimicry|subtitle-render|digital-human, audio: import|text-to-audio|text-to-music|video-to-audio|voice-clone|audio-extract (defaults to dedicated generative tools: text-editor for text, text-to-image for image, video-generation for video, text-to-audio for audio; pass import for static assets). position is optional (auto-placed right of the existing nodes). Node ids come from the returned node — use them for workflow_connect / workflow_run. Read workflow_snapshot first when editing an existing canvas.',
    parameters: objectParams({
      workspace_id: { type: 'string', description: WORKSPACE_ID_PARAM_DESC },
      material_type: { type: 'string', enum: MATERIAL_TYPE_ENUM, required: true, description: 'Node material type' },
      tool: { type: 'string', description: 'Node tool; must belong to material_type (see description). Default: generative tool for material_type (or import for static assets)' },
      position: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
        additionalProperties: false,
        description: 'Canvas coordinates; default auto-placed right of the rightmost node',
      },
      label: { type: 'string', description: 'Display label (empty = localized type name)' },
      prompt: { type: 'string', description: 'Generation prompt for generative tools' },
      content: {
        type: 'string',
        description: 'Direct text content for manual edit (material_type="text"). Setting non-empty text puts the node in manual edit mode (static text input) and disables model generation.',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const materialType = readString(args, 'material_type') as MaterialType | undefined;
      if (!materialType || !MATERIAL_TYPE_ENUM.includes(materialType)) {
        return errorBody('invalid-args', `material_type must be one of ${MATERIAL_TYPE_ENUM.join(', ')}`);
      }

      const toolResolved = resolveTool(materialType, args.tool);
      if ('error' in toolResolved) return toolResolved;

      const target = resolveTargetWorkspaceId(store, args, { getActiveView });
      if ('error' in target) return target;
      const { workspaceId } = target;

      return withWorkspace(store, workspaceId, (snapshot) => {
        const label = readString(args, 'label');
        const prompt = readString(args, 'prompt');
        const content = readString(args, 'content');

        const overrides: Record<string, unknown> = {
          selectedTool: toolResolved.tool,
          ...(label !== undefined ? { label } : {}),
        };

        if (materialType === 'text') {
          if (content !== undefined && content.trim()) {
            overrides.content = content;
            overrides.status = 'ready';
            overrides.nodeKind = 'import';
            overrides.selectedTool = 'text-editor';
          } else if (prompt !== undefined && prompt.trim()) {
            overrides.prompt = prompt;
            overrides.status = 'empty';
            overrides.nodeKind = 'generate';
            overrides.selectedTool = toolResolved.tool === 'text-editor' ? 'text-to-text' : toolResolved.tool;
          }
        } else {
          if (prompt !== undefined) overrides.prompt = prompt;
        }

        const node = createMaterialNode(materialType, readPosition(args) ?? defaultNodePosition(snapshot), overrides);

        const result = mutateWorkspaceGraph(store, workspaceId, { addNodes: [node] }, mutationContext(deps));
        if (!result.ok) return errorBody(result.error, result.message);
        return { workspace: workspaceSummary(result.snapshot), node: result.snapshot.nodes.find((row) => row.id === node.id), workspaceSource: target.source };
      });
    },
  };
}

export function createWorkflowNodeUpdateTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, getActiveView } = deps;
  return {
    name: 'workflow_node_update',
    description:
      'Patch one node on the current or specified workflow canvas: label / prompt / content / tool / params / position (all optional, shallow-merged into the node). For text nodes, content can be set to directly edit manual text content. Omit workspace_id to use the ui_context current canvas. tool must be valid for the node\'s material_type. Changing tool never invalidates existing edges (edge validation uses the union of all tools of the material type), but it changes what the node does on the next workflow_run. material_type and media output content fields cannot be changed — remove and re-add the node instead.',
    parameters: objectParams({
      workspace_id: { type: 'string', description: WORKSPACE_ID_PARAM_DESC },
      node_id: { type: 'string', required: true, description: 'Node id (from workflow_snapshot include_nodes=true)' },
      patch: {
        type: 'object',
        required: true,
        properties: {
          label: { type: 'string' },
          prompt: { type: 'string' },
          content: {
            type: 'string',
            description: 'Direct text content for manual edit (text nodes only). Setting non-empty text puts the node in manual edit mode as static text input and disables model generation; clearing content restores empty state and re-enables model generation.',
          },
          tool: { type: 'string', description: 'New selectedTool; must belong to the node material_type' },
          params: { type: 'object', additionalProperties: true, description: 'Tool params (e.g. aspectRatio 1:1|4:3|16:9|9:16, duration) — replaces the whole params object' },
          position: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        additionalProperties: false,
        description: 'Fields to patch; at least one required',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const nodeId = readString(args, 'node_id');
      if (!nodeId) return errorBody('invalid-args', 'node_id is required');

      const patch = args.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return errorBody('invalid-args', 'patch object is required');
      }

      const target = resolveTargetWorkspaceId(store, args, { getActiveView });
      if ('error' in target) return target;
      const { workspaceId } = target;

      return withWorkspace(store, workspaceId, (snapshot) => {
        const node = snapshot.nodes.find((row) => row.id === nodeId);
        if (!node) return errorBody('node-not-found', `node ${nodeId} not found in workspace ${workspaceId}`);

        const parsed = parseNodePatch(nodeId, node, patch as Record<string, unknown>);
        if ('error' in parsed) return parsed;

        const mutation: CanvasInputMutation = {
          nodePatches: [{
            nodeId,
            data: parsed.data,
            ...(parsed.position !== undefined ? { node: { position: parsed.position } } : {}),
          }],
        };
        const result = mutateWorkspaceGraph(store, workspaceId, mutation, mutationContext(deps));
        if (!result.ok) return errorBody(result.error, result.message);
        return {
          workspace: workspaceSummary(result.snapshot),
          node: result.snapshot.nodes.find((row) => row.id === nodeId),
        };
      });
    },
  };
}

export function createWorkflowNodeRemoveTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store, getActiveView } = deps;
  return {
    name: 'workflow_node_remove',
    description:
      'Remove nodes from the current or specified workflow canvas. Omit workspace_id to use the ui_context current canvas. Edges connected to removed nodes are deleted automatically (same cascade as the Delete key on the canvas). Returns the removed node/edge counts.',
    parameters: objectParams({
      workspace_id: { type: 'string', description: WORKSPACE_ID_PARAM_DESC },
      node_ids: { type: 'array', required: true, items: { type: 'string' }, description: 'Node ids to remove' },
    }),
    output: jsonOut,
    async execute(args) {
      const nodeIds = normalizeNodeIds(args.node_ids);
      if (nodeIds.length === 0) return errorBody('invalid-args', 'node_ids must be a non-empty array');

      const target = resolveTargetWorkspaceId(store, args, { getActiveView });
      if ('error' in target) return target;
      const { workspaceId } = target;

      return await withWorkspace(store, workspaceId, async (snapshot) => {
        const existing = new Set(snapshot.nodes.map((node) => node.id));
        const toRemove = nodeIds.filter((id) => existing.has(id));
        if (toRemove.length === 0) {
          return errorBody('node-not-found', `none of ${nodeIds.join(', ')} exists in workspace ${workspaceId}`);
        }

        let tablePaths: string[];
        try {
          tablePaths = snapshot.nodes
            .filter((node) => toRemove.includes(node.id) && node.type === 'table')
            .map((node) => resolveTableAbsPath(store, workspaceId, node.id));
        } catch (err) {
          return errorBody(err instanceof TablePathError ? 'invalid-args' : 'table-delete-failed',
            err instanceof Error ? err.message : 'Failed to resolve table path');
        }
        const result = mutateWorkspaceGraph(store, workspaceId, { removeNodeIds: toRemove }, mutationContext(deps));
        if (!result.ok) return errorBody(result.error, result.message);

        // Canonical table cleanup does not remove legacy .hilo files.
        for (const tablePath of tablePaths) {
          try {
            await TableStorageService.deleteTable(tablePath);
          } catch {
            // Keep node removal successful when best-effort file cleanup fails.
          }
        }

        return {
          workspace: workspaceSummary(result.snapshot),
          removedNodes: toRemove.length,
          removedEdges: snapshot.edges.length - result.snapshot.edges.length,
        };
      });
    },
  };
}
