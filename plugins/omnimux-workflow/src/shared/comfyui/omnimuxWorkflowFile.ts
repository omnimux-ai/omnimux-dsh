/**
 * OmniMux canvas workflow file (`.json`) — the repository's own portable
 * workflow format.
 *
 * Layout:
 *   { kind: 'omnimux-workflow', schemaVersion: 1, name, exportedAt,
 *     app: { plugin, formatVersion }, nodes[], edges[], settings,
 *     metadata: { nodeCount, edgeCount, embeddedTableDocuments: false } }
 *
 * `nodes`/`edges` are the same JSON-safe shape the workspace snapshot uses
 * (`shared/canvasTypes.ts`), so an exported file can be re-imported without a
 * translation step. Table documents are stored per workspace
 * (`tablePath`/`tableId`), not embedded — the file states that explicitly
 * instead of pretending the export is self-contained.
 *
 * Pure functions: no DOM, no filesystem, no network. The UI layer owns the
 * download / file-picker plumbing.
 */

import { cloneJson, isFiniteNumber, isPlainObject } from './structure.ts';

export const OMNIMUX_WORKFLOW_FILE_KIND = 'omnimux-workflow' as const;
export const OMNIMUX_WORKFLOW_FILE_VERSION = 1 as const;

/** Minimal node shape carried by the file (structurally an xyflow node). */
export interface WorkflowFileNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number;
  height?: number;
  parentId?: string;
  extent?: 'parent';
  zIndex?: number;
  style?: Record<string, unknown>;
  draggable?: boolean;
  selectable?: boolean;
  deletable?: boolean;
  selected?: boolean;
}

/** Minimal edge shape carried by the file. */
export interface WorkflowFileEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  animated?: boolean;
  data?: Record<string, unknown>;
  style?: Record<string, unknown>;
}

export interface WorkflowFileSettings {
  maxParallel: number;
  failStrategy: 'fail-fast' | 'continue';
}

export interface OmnimuxWorkflowFile {
  kind: typeof OMNIMUX_WORKFLOW_FILE_KIND;
  schemaVersion: typeof OMNIMUX_WORKFLOW_FILE_VERSION;
  name: string;
  exportedAt: string;
  app: { plugin: 'omnimux-workflow'; formatVersion: number };
  nodes: WorkflowFileNode[];
  edges: WorkflowFileEdge[];
  settings: WorkflowFileSettings;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    /** Table documents live in the workspace store; the file never embeds them. */
    embeddedTableDocuments: false;
  };
}

export type WorkflowFileErrorCode =
  | 'invalid-json'
  | 'invalid-root'
  | 'not-a-workflow-file'
  | 'unsupported-schema-version'
  | 'invalid-structure';

export interface WorkflowFileError {
  code: WorkflowFileErrorCode;
  path: string;
  message: string;
}

export type WorkflowFileParseResult =
  | { ok: true; file: OmnimuxWorkflowFile }
  | { ok: false; error: WorkflowFileError };

const DEFAULT_SETTINGS: WorkflowFileSettings = { maxParallel: 3, failStrategy: 'fail-fast' };

const RUNTIME_NODE_KEYS = [
  'selected', 'dragging', 'resizing', 'measured', 'handles', 'internals',
  'positionAbsolute', 'computedPosition', '__catalog', '__workspaceId',
] as const;

const NODE_KEYS = [
  'id', 'type', 'position', 'data', 'width', 'height', 'parentId', 'extent',
  'zIndex', 'style', 'draggable', 'selectable', 'deletable', 'selected',
] as const;

const EDGE_KEYS = [
  'id', 'source', 'target', 'sourceHandle', 'targetHandle', 'type', 'animated', 'data', 'style',
] as const;

interface JsonConversion {
  value: unknown;
  dropped: string[];
}

/**
 * Convert a runtime value to its JSON-safe form.
 *
 * Values that cannot be represented (functions, symbols, bigint, cycles) are
 * recorded in `dropped` so the caller can surface them; they are never
 * silently discarded.
 */
function toJsonValue(value: unknown, path: string, seen: WeakSet<object>): JsonConversion {
  if (value === null || value === undefined) return { value: null, dropped: [] };
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return { value, dropped: [] };
  if (type === 'number') {
    if (!Number.isFinite(value as number)) return { value: null, dropped: [`${path} (non-finite number)`] };
    return { value, dropped: [] };
  }
  if (type === 'bigint') return { value: String(value), dropped: [`${path} (bigint)`] };
  if (type === 'function' || type === 'symbol') return { value: null, dropped: [`${path} (${type})`] };
  if (type !== 'object') return { value: null, dropped: [`${path} (${type})`] };

  const object = value as object;
  if (seen.has(object)) return { value: null, dropped: [`${path} (circular reference)`] };
  seen.add(object);
  const dropped: string[] = [];
  if (Array.isArray(object)) {
    const out: unknown[] = [];
    for (let index = 0; index < object.length; index += 1) {
      const converted = toJsonValue(object[index], `${path}[${index}]`, seen);
      out.push(converted.value);
      dropped.push(...converted.dropped);
    }
    seen.delete(object);
    return { value: out, dropped };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(object as Record<string, unknown>)) {
    if (item === undefined) {
      dropped.push(`${path}.${key} (undefined)`);
      continue;
    }
    const converted = toJsonValue(item, `${path}.${key}`, seen);
    out[key] = converted.value;
    dropped.push(...converted.dropped);
  }
  seen.delete(object);
  return { value: out, dropped };
}

export interface BuildOmnimuxWorkflowFileInput {
  name: string;
  nodes: readonly Record<string, unknown>[];
  edges: readonly Record<string, unknown>[];
  settings?: Partial<WorkflowFileSettings>;
  exportedAt?: string;
}

export interface BuildOmnimuxWorkflowFileResult {
  file: OmnimuxWorkflowFile;
  /** Paths of runtime values that could not be represented in the file. */
  dropped: string[];
}

function pickKeys(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Build the portable workflow file from the current canvas graph. */
export function buildOmnimuxWorkflowFile(
  input: BuildOmnimuxWorkflowFileInput,
): BuildOmnimuxWorkflowFileResult {
  const dropped: string[] = [];
  const seen = new WeakSet<object>();

  const nodes: WorkflowFileNode[] = [];
  for (let index = 0; index < input.nodes.length; index += 1) {
    const source = input.nodes[index];
    if (!source) continue;
    const picked = pickKeys(source, NODE_KEYS);
    // Runtime-only keys are dropped by construction (not copied), then the
    // remaining payload is converted to its JSON-safe form.
    for (const key of RUNTIME_NODE_KEYS) {
      if (key in source && key !== 'selected') {
        dropped.push(`nodes[${index}].${key} (runtime-only)`);
      }
    }
    picked.selected = false;
    const converted = toJsonValue(picked, `nodes[${index}]`, seen);
    dropped.push(...converted.dropped);
    const node = converted.value as WorkflowFileNode;
    if (isPlainObject(node.data) && typeof node.data === 'object') {
      delete (node.data as Record<string, unknown>).__catalog;
      delete (node.data as Record<string, unknown>).__workspaceId;
    }
    nodes.push(node);
  }

  const edges: WorkflowFileEdge[] = [];
  for (let index = 0; index < input.edges.length; index += 1) {
    const source = input.edges[index];
    if (!source) continue;
    const converted = toJsonValue(pickKeys(source, EDGE_KEYS), `edges[${index}]`, seen);
    dropped.push(...converted.dropped);
    edges.push(converted.value as WorkflowFileEdge);
  }

  const file: OmnimuxWorkflowFile = {
    kind: OMNIMUX_WORKFLOW_FILE_KIND,
    schemaVersion: OMNIMUX_WORKFLOW_FILE_VERSION,
    name: input.name,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    app: { plugin: 'omnimux-workflow', formatVersion: 1 },
    nodes,
    edges,
    settings: {
      maxParallel: input.settings?.maxParallel ?? DEFAULT_SETTINGS.maxParallel,
      failStrategy: input.settings?.failStrategy ?? DEFAULT_SETTINGS.failStrategy,
    },
    metadata: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      embeddedTableDocuments: false,
    },
  };
  return { file, dropped };
}

/** Serialise the file with a stable 2-space indentation. */
export function serializeOmnimuxWorkflowFile(file: OmnimuxWorkflowFile): string {
  return JSON.stringify(file, null, 2);
}

function fileFailure(
  code: WorkflowFileErrorCode,
  path: string,
  message: string,
): WorkflowFileParseResult {
  return { ok: false, error: { code, path, message } };
}

function validateNode(raw: unknown, path: string): WorkflowFileNode {
  if (!isPlainObject(raw)) {
    throw Object.assign(new Error('expected a node object'), { path });
  }
  const id = raw.id;
  const type = raw.type;
  const position = raw.position;
  if (typeof id !== 'string' || id.length === 0) {
    throw Object.assign(new Error('node id must be a non-empty string'), { path: `${path}.id` });
  }
  if (typeof type !== 'string' || type.length === 0) {
    throw Object.assign(new Error('node type must be a non-empty string'), { path: `${path}.type` });
  }
  if (!isPlainObject(position) || !isFiniteNumber(position.x) || !isFiniteNumber(position.y)) {
    throw Object.assign(new Error('node position must be an { x, y } number pair'), { path: `${path}.position` });
  }
  const data = raw.data === undefined ? {} : raw.data;
  if (!isPlainObject(data)) {
    throw Object.assign(new Error('node data must be an object'), { path: `${path}.data` });
  }
  return {
    id,
    type,
    position: { x: position.x, y: position.y },
    data: cloneJson(data),
    ...(isFiniteNumber(raw.width) ? { width: raw.width } : {}),
    ...(isFiniteNumber(raw.height) ? { height: raw.height } : {}),
    ...(typeof raw.parentId === 'string' ? { parentId: raw.parentId } : {}),
    ...(raw.extent === 'parent' ? { extent: 'parent' as const } : {}),
    ...(isFiniteNumber(raw.zIndex) ? { zIndex: raw.zIndex } : {}),
    ...(isPlainObject(raw.style) ? { style: cloneJson(raw.style) } : {}),
    ...(typeof raw.draggable === 'boolean' ? { draggable: raw.draggable } : {}),
    ...(typeof raw.selectable === 'boolean' ? { selectable: raw.selectable } : {}),
    ...(typeof raw.deletable === 'boolean' ? { deletable: raw.deletable } : {}),
    selected: false,
  };
}

function validateEdge(raw: unknown, path: string): WorkflowFileEdge {
  if (!isPlainObject(raw)) {
    throw Object.assign(new Error('expected an edge object'), { path });
  }
  const id = raw.id;
  const source = raw.source;
  const target = raw.target;
  if (typeof id !== 'string' || id.length === 0) {
    throw Object.assign(new Error('edge id must be a non-empty string'), { path: `${path}.id` });
  }
  if (typeof source !== 'string' || source.length === 0) {
    throw Object.assign(new Error('edge source must be a non-empty node id'), { path: `${path}.source` });
  }
  if (typeof target !== 'string' || target.length === 0) {
    throw Object.assign(new Error('edge target must be a non-empty node id'), { path: `${path}.target` });
  }
  return {
    id,
    source,
    target,
    ...(typeof raw.sourceHandle === 'string' ? { sourceHandle: raw.sourceHandle } : {}),
    ...(typeof raw.targetHandle === 'string' ? { targetHandle: raw.targetHandle } : {}),
    ...(typeof raw.type === 'string' ? { type: raw.type } : {}),
    ...(typeof raw.animated === 'boolean' ? { animated: raw.animated } : {}),
    ...(isPlainObject(raw.data) ? { data: cloneJson(raw.data) } : {}),
    ...(isPlainObject(raw.style) ? { style: cloneJson(raw.style) } : {}),
  };
}

/**
 * Parse a workflow file. Never throws: every failure mode (bad JSON, a
 * ComfyUI file, a newer schema, a broken node) returns a readable error.
 */
export function parseOmnimuxWorkflowFile(text: string): WorkflowFileParseResult {
  if (typeof text !== 'string') {
    return fileFailure('invalid-json', '', 'expected workflow JSON text');
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return fileFailure(
      'invalid-json',
      '',
      error instanceof Error ? error.message : 'the file is not valid JSON',
    );
  }
  if (!isPlainObject(value)) {
    return fileFailure('invalid-root', '', 'expected a workflow object at the file root');
  }
  if (value.kind !== OMNIMUX_WORKFLOW_FILE_KIND) {
    return fileFailure(
      'not-a-workflow-file',
      'kind',
      'this file is not an OmniMux workflow file',
    );
  }
  const schemaVersion = value.schemaVersion;
  if (!isFiniteNumber(schemaVersion)) {
    return fileFailure('unsupported-schema-version', 'schemaVersion', 'missing schemaVersion field');
  }
  if (schemaVersion !== OMNIMUX_WORKFLOW_FILE_VERSION) {
    return fileFailure(
      'unsupported-schema-version',
      'schemaVersion',
      schemaVersion > OMNIMUX_WORKFLOW_FILE_VERSION
        ? `this workflow file was created by a newer OmniMux version (schemaVersion ${schemaVersion})`
        : `unsupported workflow schemaVersion ${schemaVersion}`,
    );
  }
  if (!Array.isArray(value.nodes)) {
    return fileFailure('invalid-structure', 'nodes', 'expected the nodes field to be an array');
  }
  if (!Array.isArray(value.edges)) {
    return fileFailure('invalid-structure', 'edges', 'expected the edges field to be an array');
  }

  try {
    const nodes = value.nodes.map((raw, index) => validateNode(raw, `nodes[${index}]`));
    const edges = value.edges.map((raw, index) => validateEdge(raw, `edges[${index}]`));
    const settingsRaw = isPlainObject(value.settings) ? value.settings : {};
    const failStrategy = settingsRaw.failStrategy === 'continue' ? 'continue' : 'fail-fast';
    const file: OmnimuxWorkflowFile = {
      kind: OMNIMUX_WORKFLOW_FILE_KIND,
      schemaVersion: OMNIMUX_WORKFLOW_FILE_VERSION,
      name: typeof value.name === 'string' && value.name.length > 0 ? value.name : 'workflow',
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
      app: { plugin: 'omnimux-workflow', formatVersion: 1 },
      nodes,
      edges,
      settings: {
        maxParallel: isFiniteNumber(settingsRaw.maxParallel) ? settingsRaw.maxParallel : DEFAULT_SETTINGS.maxParallel,
        failStrategy,
      },
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        embeddedTableDocuments: false,
      },
    };
    return { ok: true, file };
  } catch (error) {
    const path = typeof (error as { path?: unknown }).path === 'string'
      ? (error as { path: string }).path
      : '';
    return fileFailure(
      'invalid-structure',
      path,
      error instanceof Error ? error.message : String(error),
    );
  }
}
