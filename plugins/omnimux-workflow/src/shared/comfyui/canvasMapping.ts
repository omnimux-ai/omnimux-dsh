/**
 * ComfyUI <-> canvas graph mapping.
 *
 * The two graph models are not semantically equivalent: ComfyUI is a typed
 * port graph executed by a Python backend, while this canvas is a Feed/Slot
 * material graph executed through the OmniMux seams. This module therefore
 * never guesses. It carries over only what the declared mapping table
 * supports and reports every other node, port, widget and field as an
 * explicit `unsupported` entry.
 *
 * The mapping table is deliberately small and lives in this file so the
 * coverage claim is auditable: anything absent from it is reported, never
 * silently dropped.
 */

import { DEFAULT_MATERIAL_TOOL_BY_TYPE } from '../specs/nodes/materialNodeSpec.ts';
import type { MaterialType } from '../canvasTypes.ts';
import { createEmptyV04 } from './schemaV04.ts';
import { createEmptyV1 } from './schemaV1.ts';
import type {
  ComfyCanvasEdge,
  ComfyCanvasEncodeResult,
  ComfyCanvasNode,
  ComfyCanvasProjection,
  ComfyGroup,
  ComfyNode,
  ComfySupportedEntry,
  ComfyUnsupportedEntry,
  ComfyWorkflowDocument,
  ComfyWorkflowFormat,
} from './types.ts';

/** Canvas group nodes use the same default colour as the editor (empty = theme default). */
const IMPORTED_GROUP_COLOR = '';
const IMPORTED_GROUP_PADDING = 32;
const IMPORTED_GROUP_MIN_WIDTH = 300;
const IMPORTED_GROUP_MIN_HEIGHT = 200;

/** ComfyUI node mode values: 0 normal, 2 muted, 4 bypassed. */
const MODE_NORMAL = 0;

/** One declared ComfyUI class_type -> canvas node mapping. */
export interface ComfyNodeMappingSpec {
  /** ComfyUI `type` (class_type). */
  comfyType: string;
  canvasType: string;
  materialType?: MaterialType;
  nodeKind?: 'generate' | 'import';
  /**
   * True when the structural mapping is sound but the node's semantics are
   * only partially preserved (the missing parts are reported per parameter).
   */
  lossy: boolean;
  /** `widgets_values` index -> canvas material data field. */
  widgets: Array<{ index: number; field: 'prompt' }>;
  /** ComfyUI input name -> canvas handle id, or null when not carryable. */
  inputs: Record<string, string | null>;
}

/**
 * Declared import mapping (ComfyUI class_type -> canvas node).
 *
 * `CLIPTextEncode` is a 1:1 prompt carrier. `KSampler` / `KSamplerAdvanced`
 * are sampling steps that this canvas has no execution counterpart for; they
 * are mapped onto an image material node so the graph keeps its generative
 * shape, and every sampler parameter is reported as unsupported (`lossy`).
 * `Load*` nodes map onto the canvas import node kind, whose local file
 * reference cannot be materialised and is reported.
 */
export const COMFY_TO_CANVAS_MAPPING: readonly ComfyNodeMappingSpec[] = [
  {
    comfyType: 'CLIPTextEncode',
    canvasType: 'material',
    materialType: 'text',
    nodeKind: 'generate',
    lossy: false,
    widgets: [{ index: 0, field: 'prompt' }],
    inputs: { clip: null },
  },
  {
    comfyType: 'KSampler',
    canvasType: 'material',
    materialType: 'image',
    nodeKind: 'generate',
    lossy: true,
    widgets: [],
    inputs: { model: null, positive: 'in', negative: null, latent_image: null },
  },
  {
    comfyType: 'KSamplerAdvanced',
    canvasType: 'material',
    materialType: 'image',
    nodeKind: 'generate',
    lossy: true,
    widgets: [],
    inputs: { model: null, positive: 'in', negative: null, latent_image: null },
  },
  {
    comfyType: 'LoadImage',
    canvasType: 'material',
    materialType: 'image',
    nodeKind: 'import',
    lossy: false,
    widgets: [],
    inputs: {},
  },
  {
    comfyType: 'LoadVideo',
    canvasType: 'material',
    materialType: 'video',
    nodeKind: 'import',
    lossy: false,
    widgets: [],
    inputs: {},
  },
  {
    comfyType: 'LoadAudio',
    canvasType: 'material',
    materialType: 'audio',
    nodeKind: 'import',
    lossy: false,
    widgets: [],
    inputs: {},
  },
];

const MAPPING_BY_TYPE: ReadonlyMap<string, ComfyNodeMappingSpec> = new Map(
  COMFY_TO_CANVAS_MAPPING.map((spec) => [spec.comfyType, spec]),
);

/** ComfyUI node types whose inertness makes them unmappable by definition. */
const INERT_NODE_REASONS: ReadonlyMap<string, string> = new Map([
  ['Note', 'annotation-has-no-canvas-counterpart'],
  ['Reroute', 'reroute-has-no-canvas-counterpart'],
  ['PrimitiveNode', 'primitive-has-no-canvas-counterpart'],
]);

export function lookupComfyNodeMapping(comfyType: string): ComfyNodeMappingSpec | undefined {
  return MAPPING_BY_TYPE.get(comfyType);
}

/** Canvas node id for an imported ComfyUI node. */
export function canvasNodeIdFor(comfyNodeId: number): string {
  return `comfy-${comfyNodeId}`;
}

/** Canvas edge id for an imported ComfyUI link. */
export function canvasEdgeIdFor(linkId: number): string {
  return `comfy-link-${linkId}`;
}

interface ProjectionBuilder {
  supported: ComfySupportedEntry[];
  unsupported: ComfyUnsupportedEntry[];
}

function report(builder: ProjectionBuilder, entry: ComfyUnsupportedEntry): void {
  builder.unsupported.push(entry);
}

function buildImportedMaterialData(
  spec: ComfyNodeMappingSpec,
  node: ComfyNode,
): Record<string, unknown> {
  const materialType = spec.materialType ?? 'text';
  const nodeKind = spec.nodeKind ?? 'generate';
  return {
    label: node.title ?? '',
    materialType,
    nodeKind,
    status: 'empty',
    selectedTool: nodeKind === 'import' ? 'import' : DEFAULT_MATERIAL_TOOL_BY_TYPE[materialType],
    params: {},
    failStrategy: 'abort',
    inputBindingVersion: 1,
    slotBindings: {},
  };
}

/** Apply the declared widget mapping and report everything else. */
function applyWidgets(
  builder: ProjectionBuilder,
  spec: ComfyNodeMappingSpec,
  node: ComfyNode,
  data: Record<string, unknown>,
): void {
  const values = node.widgetsValues ?? [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const mapped = spec.widgets.find((entry) => entry.index === index);
    if (mapped) {
      if (typeof value === 'string') {
        data[mapped.field] = value;
      } else if (value !== null && value !== undefined) {
        report(builder, {
          kind: 'widget',
          id: `${node.id}:widgets_values[${index}]`,
          reason: 'widget-value-not-a-string',
          detail: `${spec.comfyType} widget ${index}`,
        });
      }
      continue;
    }
    if (value === null || value === undefined) continue;
    report(builder, {
      kind: 'widget',
      id: `${node.id}:widgets_values[${index}]`,
      reason: 'widget-not-mapped',
      detail: `${spec.comfyType} widget ${index}`,
    });
  }
}

function reportNodeFields(
  builder: ProjectionBuilder,
  node: ComfyNode,
): void {
  if (node.flags && Object.keys(node.flags).length > 0) {
    report(builder, {
      kind: 'parameter',
      id: `${node.id}.flags`,
      reason: 'node-flags-not-carried',
      detail: Object.keys(node.flags).join(','),
    });
  }
  if (node.order !== undefined) {
    report(builder, {
      kind: 'parameter',
      id: `${node.id}.order`,
      reason: 'order-recomputed-by-canvas',
    });
  }
  if (node.properties && Object.keys(node.properties).length > 0) {
    report(builder, {
      kind: 'parameter',
      id: `${node.id}.properties`,
      reason: 'node-properties-not-carried',
      detail: Object.keys(node.properties).join(','),
    });
  }
  if (node.color !== undefined) {
    report(builder, { kind: 'parameter', id: `${node.id}.color`, reason: 'visual-style-not-carried' });
  }
  if (node.bgcolor !== undefined) {
    report(builder, { kind: 'parameter', id: `${node.id}.bgcolor`, reason: 'visual-style-not-carried' });
  }
}

function projectGroup(
  builder: ProjectionBuilder,
  group: ComfyGroup,
  index: number,
): ComfyCanvasNode | null {
  const id = `comfy-group-${group.id ?? index}`;
  if (!group.bounding) {
    report(builder, {
      kind: 'group',
      id,
      reason: 'group-bounding-missing',
    });
    return null;
  }
  const [x, y, width, height] = group.bounding;
  if (group.color !== undefined) {
    report(builder, { kind: 'parameter', id: `${id}.color`, reason: 'visual-style-not-carried' });
  }
  if (group.fontSize !== undefined) {
    report(builder, { kind: 'parameter', id: `${id}.fontSize`, reason: 'visual-style-not-carried' });
  }
  if (group.flags && Object.keys(group.flags).length > 0) {
    report(builder, {
      kind: 'parameter',
      id: `${id}.flags`,
      reason: 'node-flags-not-carried',
      detail: Object.keys(group.flags).join(','),
    });
  }
  builder.supported.push({ kind: 'group', id, targetType: 'group' });
  return {
    id,
    type: 'group',
    position: { x, y },
    width,
    height,
    data: {
      title: group.title ?? '',
      color: IMPORTED_GROUP_COLOR,
      padding: IMPORTED_GROUP_PADDING,
      minWidth: IMPORTED_GROUP_MIN_WIDTH,
      minHeight: IMPORTED_GROUP_MIN_HEIGHT,
      nodeIds: [],
    },
  };
}

function projectDocumentLevelFields(
  builder: ProjectionBuilder,
  document: ComfyWorkflowDocument,
): void {
  if (document.format === 'v0.4') {
    if (Object.keys(document.config).length > 0) {
      report(builder, {
        kind: 'document-field',
        id: 'config',
        reason: 'config-not-carried',
        detail: Object.keys(document.config).join(','),
      });
    }
    if (document.extra.ds !== undefined) {
      report(builder, {
        kind: 'document-field',
        id: 'extra.ds',
        reason: 'viewport-not-carried',
      });
    }
    for (const key of Object.keys(document.extra.unknown)) {
      report(builder, {
        kind: 'document-field',
        id: `extra.${key}`,
        reason: 'unknown-document-field',
      });
    }
    return;
  }

  if (document.definitions !== undefined) {
    report(builder, {
      kind: 'document-field',
      id: 'definitions',
      reason: 'subgraph-definitions-not-materialized',
    });
  }
  for (let index = 0; index < document.floatingLinks.length; index += 1) {
    report(builder, {
      kind: 'floating-link',
      id: `floatingLinks[${index}]`,
      reason: 'floating-link-not-representable',
    });
  }
  for (const reroute of document.reroutes) {
    report(builder, {
      kind: 'reroute',
      id: String(reroute.id),
      reason: 'reroute-not-representable',
    });
  }
  for (const key of Object.keys(document.extra)) {
    report(builder, {
      kind: 'document-field',
      id: `extra.${key}`,
      reason: 'unknown-document-field',
    });
  }
}

/**
 * Project a parsed ComfyUI document onto the canvas graph model.
 *
 * Returns the created nodes/edges plus the explicit inventory of what could
 * not be carried over.
 */
export function projectComfyToCanvas(document: ComfyWorkflowDocument): ComfyCanvasProjection {
  const builder: ProjectionBuilder = { supported: [], unsupported: [] };
  const nodes: ComfyCanvasNode[] = [];
  const edges: ComfyCanvasEdge[] = [];
  const projectedNodeIds = new Set<number>();
  const mappingByNodeId = new Map<number, ComfyNodeMappingSpec>();

  for (const node of document.nodes) {
    if (node.mode !== undefined && node.mode !== MODE_NORMAL) {
      report(builder, {
        kind: 'node',
        id: String(node.id),
        reason: 'node-muted-or-bypassed',
        detail: `${node.type} mode=${node.mode}`,
      });
      continue;
    }
    const spec = lookupComfyNodeMapping(node.type);
    if (!spec) {
      const inertReason = INERT_NODE_REASONS.get(node.type);
      report(builder, {
        kind: 'node',
        id: String(node.id),
        reason: inertReason ?? 'unmapped-node-type',
        detail: node.type,
      });
      continue;
    }

    const data = buildImportedMaterialData(spec, node);
    applyWidgets(builder, spec, node, data);
    reportNodeFields(builder, node);

    const canvasNode: ComfyCanvasNode = {
      id: canvasNodeIdFor(node.id),
      type: spec.canvasType,
      position: { x: node.pos[0], y: node.pos[1] },
      data,
      ...(node.size ? { width: node.size[0], height: node.size[1] } : {}),
    };
    nodes.push(canvasNode);
    projectedNodeIds.add(node.id);
    mappingByNodeId.set(node.id, spec);
    builder.supported.push({
      kind: 'node',
      id: String(node.id),
      targetType: spec.canvasType,
      ...(spec.lossy ? { lossy: true } : {}),
    });

    for (const input of node.inputs ?? []) {
      if (input.link === null) continue;
      const handle = spec.inputs[input.name];
      if (handle === null || handle === undefined) {
        report(builder, {
          kind: 'parameter',
          id: `${node.id}.inputs.${input.name}`,
          reason: 'input-not-carried',
          detail: `${node.type} input "${input.name}"`,
        });
      }
    }
  }

  for (const link of document.links) {
    const originSpec = mappingByNodeId.get(link.originId);
    if (!originSpec || !projectedNodeIds.has(link.originId)) {
      report(builder, {
        kind: 'link',
        id: String(link.id),
        reason: 'link-origin-unmapped',
        detail: `${link.originId} -> ${link.targetId}`,
      });
      continue;
    }
    const targetSpec = mappingByNodeId.get(link.targetId);
    if (!targetSpec || !projectedNodeIds.has(link.targetId)) {
      report(builder, {
        kind: 'link',
        id: String(link.id),
        reason: 'link-target-unmapped',
        detail: `${link.originId} -> ${link.targetId}`,
      });
      continue;
    }
    const targetNode = document.nodes.find((node) => node.id === link.targetId);
    const inputName = targetNode?.inputs?.[link.targetSlot]?.name;
    if (inputName === undefined) {
      report(builder, {
        kind: 'link',
        id: String(link.id),
        reason: 'link-target-slot-unresolved',
        detail: `${link.targetId} slot ${link.targetSlot}`,
      });
      continue;
    }
    const handle = targetSpec.inputs[inputName];
    if (handle === null || handle === undefined) {
      report(builder, {
        kind: 'link',
        id: String(link.id),
        reason: 'link-target-input-not-carried',
        detail: `${link.targetId} input "${inputName}"`,
      });
      continue;
    }
    edges.push({
      id: canvasEdgeIdFor(link.id),
      source: canvasNodeIdFor(link.originId),
      target: canvasNodeIdFor(link.targetId),
      sourceHandle: 'out',
      targetHandle: handle,
    });
    builder.supported.push({ kind: 'link', id: String(link.id) });
  }

  for (let index = 0; index < document.groups.length; index += 1) {
    const group = document.groups[index];
    if (!group) continue;
    const projected = projectGroup(builder, group, index);
    if (projected) nodes.push(projected);
  }

  projectDocumentLevelFields(builder, document);

  return {
    format: document.format,
    nodes,
    edges,
    supported: builder.supported,
    unsupported: builder.unsupported,
  };
}

// ============================================================================
// Canvas -> ComfyUI
// ============================================================================

/** Resolve a canvas material node's kind without importing canvas-only code. */
function resolveCanvasNodeKind(data: Record<string, unknown>): 'generate' | 'import' {
  if (data.nodeKind === 'generate' || data.nodeKind === 'import') return data.nodeKind;
  if (data.selectedTool === 'import') return 'import';
  return 'generate';
}

interface CanvasEncoding {
  comfyType: string;
  widgetsValues: unknown[];
  lossy: boolean;
  /** Canvas handle id -> ComfyUI input name; empty means no carryable input. */
  inputHandles: Record<string, string>;
}

/**
 * Declared canvas -> ComfyUI mapping.
 *
 * Only nodes whose canvas semantics have a direct ComfyUI counterpart are
 * encoded. Generation nodes that depend on OmniMux model routing (image,
 * video, audio) have no ComfyUI counterpart and are reported unsupported
 * instead of being emitted as a fabricated sampler node.
 */
function resolveCanvasNodeEncoding(node: ComfyCanvasNode): CanvasEncoding | null {
  if (node.type !== 'material') return null;
  const data = node.data;
  const materialType = data.materialType;
  const kind = resolveCanvasNodeKind(data);

  if (materialType === 'text' && kind === 'generate') {
    const prompt = typeof data.prompt === 'string' ? data.prompt : '';
    return {
      comfyType: 'CLIPTextEncode',
      widgetsValues: [prompt],
      lossy: false,
      inputHandles: {},
    };
  }
  if (kind === 'import' && (materialType === 'image' || materialType === 'video' || materialType === 'audio')) {
    const reference = typeof data.relativePath === 'string' && data.relativePath.length > 0
      ? data.relativePath
      : typeof data.originalName === 'string' ? data.originalName : '';
    const comfyType = materialType === 'image'
      ? 'LoadImage'
      : materialType === 'video' ? 'LoadVideo' : 'LoadAudio';
    return {
      comfyType,
      widgetsValues: [reference],
      lossy: false,
      inputHandles: {},
    };
  }
  return null;
}

export interface CanvasToComfyInput {
  nodes: ComfyCanvasNode[];
  edges: ComfyCanvasEdge[];
  format: ComfyWorkflowFormat;
  viewport?: { offset: [number, number]; scale: number };
}

/**
 * Encode a canvas graph into a ComfyUI document.
 *
 * The result is structurally valid for the requested schema version and
 * carries an explicit inventory of everything that could not be encoded
 * (non-material node types, model-routed generation nodes, edges whose typed
 * ports have no ComfyUI counterpart).
 */
export function projectCanvasToComfy(input: CanvasToComfyInput): ComfyCanvasEncodeResult {
  const builder: ProjectionBuilder = { supported: [], unsupported: [] };
  const comfyNodes: ComfyNode[] = [];
  const comfyGroups: ComfyGroup[] = [];
  const idByCanvasId = new Map<string, number>();
  let nextNodeId = 1;
  let nextGroupId = 1;

  for (const node of input.nodes) {
    if (node.type === 'group') {
      const groupId = nextGroupId;
      nextGroupId += 1;
      const width = node.width ?? IMPORTED_GROUP_MIN_WIDTH;
      const height = node.height ?? IMPORTED_GROUP_MIN_HEIGHT;
      comfyGroups.push({
        id: groupId,
        title: typeof node.data.title === 'string' ? node.data.title : '',
        bounding: [node.position.x, node.position.y, width, height],
        unknown: {},
      });
      builder.supported.push({ kind: 'group', id: node.id, targetType: 'group' });
      continue;
    }

    const encoding = resolveCanvasNodeEncoding(node);
    if (!encoding) {
      report(builder, {
        kind: 'node',
        id: node.id,
        reason: 'no-comfyui-counterpart',
        detail: node.type,
      });
      continue;
    }

    const id = nextNodeId;
    nextNodeId += 1;
    idByCanvasId.set(node.id, id);
    comfyNodes.push({
      id,
      type: encoding.comfyType,
      pos: [node.position.x, node.position.y],
      ...(node.width !== undefined && node.height !== undefined
        ? { size: [node.width, node.height] as [number, number] }
        : {}),
      ...(typeof node.data.label === 'string' && node.data.label.length > 0
        ? { title: node.data.label }
        : {}),
      widgetsValues: encoding.widgetsValues,
      inputs: [],
      outputs: [],
      unknown: {},
    });
    builder.supported.push({
      kind: 'node',
      id: node.id,
      targetType: encoding.comfyType,
      ...(encoding.lossy ? { lossy: true } : {}),
    });

    if (encoding.comfyType === 'LoadImage' || encoding.comfyType === 'LoadVideo' || encoding.comfyType === 'LoadAudio') {
      const reference = encoding.widgetsValues[0];
      if (typeof reference !== 'string' || reference.length === 0) {
        report(builder, {
          kind: 'parameter',
          id: `${node.id}.reference`,
          reason: 'local-asset-reference-not-materialized',
        });
      } else {
        report(builder, {
          kind: 'parameter',
          id: `${node.id}.reference`,
          reason: 'local-asset-reference-exported-as-filename',
          detail: reference,
        });
      }
    }
    for (const field of ['status', 'content', 'mediaUrl', 'assetId', 'taskId', 'errorMessage']) {
      const value = node.data[field];
      if (value === undefined || value === null || value === '') continue;
      report(builder, {
        kind: 'parameter',
        id: `${node.id}.${field}`,
        reason: 'canvas-runtime-field-not-carried',
      });
    }
  }

  for (const edge of input.edges) {
    const sourceId = idByCanvasId.get(edge.source);
    const targetId = idByCanvasId.get(edge.target);
    if (sourceId === undefined || targetId === undefined) {
      report(builder, {
        kind: 'link',
        id: edge.id,
        reason: 'link-endpoint-not-encodable',
        detail: `${edge.source} -> ${edge.target}`,
      });
      continue;
    }
    report(builder, {
      kind: 'link',
      id: edge.id,
      reason: 'typed-port-not-declared',
      detail: `${edge.source} -> ${edge.target}`,
    });
  }

  const lastNodeId = comfyNodes.reduce((max, node) => Math.max(max, node.id), 0);
  const lastGroupId = comfyGroups.reduce((max, group) => Math.max(max, group.id ?? 0), 0);

  const document: ComfyWorkflowDocument = input.format === 'v1'
    ? {
        ...createEmptyV1(),
        state: {
          lastGroupId,
          lastNodeId,
          lastLinkId: 0,
          lastRerouteId: 0,
          unknown: {},
        },
        groups: comfyGroups,
        nodes: comfyNodes,
      }
    : {
        ...createEmptyV04(),
        lastNodeId,
        lastLinkId: 0,
        nodes: comfyNodes,
        groups: comfyGroups,
        ...(input.viewport
          ? { extra: { ds: { offset: input.viewport.offset, scale: input.viewport.scale, unknown: {} }, unknown: {} } }
          : {}),
      };

  return {
    document,
    supported: builder.supported,
    unsupported: builder.unsupported,
  };
}
