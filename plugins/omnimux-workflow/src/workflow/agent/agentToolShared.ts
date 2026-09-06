/**
 * Shared types and helpers for workflow agent tools.
 * Tool names / schemas stay in the create* factories; this file is internals only.
 */

import { join } from 'node:path';
import type { WorkspaceStore } from '../workspace/WorkspaceStore';
import type { EnsureProjectBoundFn } from '../../projects/ensureProjectBound';
import type {
  ExecutionManager,
  ExecutionSnapshot,
} from '../execution/ExecutionManager';
import type { CanvasWorkspaceSnapshot } from '../../shared/canvasTypes';
import {
  MATERIAL_TOOLS,
  DEFAULT_MATERIAL_TOOL,
  type MaterialType,
  type MaterialTool,
} from '../../shared/graph/materialNode.ts';

export interface AgentToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render: (args: unknown, value: unknown) => Array<{ type: string; text: string }>;
  };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolsSeat {
  register: (tool: AgentToolSpec) => unknown;
}

export interface SystemPromptSeat {
  section: (spec: { name: string; order: number; text: string }) => unknown;
}

export interface AgentSeatContext {
  tools?: ToolsSeat;
  systemPrompt?: SystemPromptSeat;
  effect?: (fn: () => unknown, label?: string) => unknown;
  /** cordis get — used for optional hub seams like workbenchMailbox */
  get?: (name: string) => unknown;
}

/** Read-only workbench viewport seam from hub (optional). */
export interface WorkbenchMailboxSeat {
  getActiveView?: (sessionId?: string) => {
    ok?: boolean;
    stale?: boolean;
    sessionId?: string | null;
    uiContext?: {
      view?: {
        kind?: string;
        extra?: { workspaceId?: string };
      } | null;
      surface?: { tabId?: string | null } | null;
    } | null;
  };
}

export interface WorkflowAgentDeps {
  store: WorkspaceStore;
  executionManager: ExecutionManager;
  /** Plugin media root (absolute) — resolves media URLs to local paths. */
  mediaDir: string;
  resolveProjectFile?: import('../execution/executionMediaSource.ts').ResolveExecutionProjectFile;
  /** Same lazy-bind helper as POST /executions (media generate needs a project root). */
  ensureProjectBound?: EnsureProjectBoundFn;
  /**
   * Optional last-known UI viewport (hub workbenchMailbox).
   * When present, tools may default workspace_id from view.extra.workspaceId.
   */
  getActiveView?: WorkbenchMailboxSeat['getActiveView'];
  /**
   * Optional Catalog v1.1 provider (hub `modelCatalog` seam DTO). Read at
   * mutation time — the compat kernel fails closed when it returns null.
   */
  getCatalog?: () => unknown;
  getGenerationPreferences?: () => import('../../shared/generationPreferences').GenerationPreferences;
}

type FieldSpec = Record<string, unknown> & { required?: boolean | string[] };

/** Compile a flat field table into a JSON Schema object. */
export function objectParams(fields: Record<string, FieldSpec>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(fields)) {
    const { required: isRequired, ...rest } = spec;
    if (Array.isArray(isRequired)) {
      properties[key] = { ...rest, required: isRequired };
    } else {
      properties[key] = rest;
      // Only a boolean `true` marks the TOP-LEVEL field required; a string[]
      // belongs to a nested object schema and passes through untouched.
      if (isRequired === true) required.push(key);
    }
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

export const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args: unknown, value: unknown): Array<{ type: string; text: string }> => [
    { type: 'text', text: JSON.stringify(value, null, 2) },
  ],
};

export const TERMINAL_STATUSES = new Set<string>(['completed', 'error', 'cancelled']);

/** Poll interval for workflow_run wait mode. */
export const RUN_POLL_INTERVAL_MS = 250;
/** Default wait timeout (120s, per the M5 spec). */
export const DEFAULT_RUN_WAIT_TIMEOUT_MS = 120_000;
/** Text excerpt cap for node outputs in run summaries. */
export const TEXT_EXCERPT_CHARS = 240;
/** Executions overview cap for workflow_list. */
export const LIST_EXECUTIONS_LIMIT = 5;

export const MATERIAL_TYPE_ENUM = ['text', 'image', 'video', 'audio'];

export function errorBody(error: string, message: string): { error: string; message: string } {
  return { error, message };
}

/** Ensure an agent tool output is 100% strictly lossless JSON (strips undefined fields). */
export function sanitizeLosslessJson(val: unknown): unknown {
  if (val === undefined) return null;
  return JSON.parse(JSON.stringify(val));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function readBoolean(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

/** Media URL (public route) -> absolute local path under the media root, or imported realPath. */
export function mediaUrlToPath(url: unknown, mediaDir: string): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    if (parsed.pathname.endsWith('/api/local-file')) {
      const imported = parsed.searchParams.get('path');
      return imported && imported.length > 0 ? imported : null;
    }
    if (parsed.pathname.endsWith('/file') || parsed.pathname.includes('/file')) {
      const rel = parsed.searchParams.get('rel');
      if (rel && rel.length > 0) return rel;
    }
  } catch {
    // fall through to executions media mapping
  }
  const marker = '/media/';
  const index = url.indexOf(marker);
  if (index === -1 || !url.startsWith('/')) return null;
  return join(mediaDir, url.slice(index + marker.length));
}

export interface NodeRunSummary {
  nodeId: string;
  label: string;
  type: string;
  status: string;
  error?: string;
  textExcerpt?: string;
  mediaAssets?: Array<{ type: unknown; url: unknown; path: string | null }>;
}

const MEDIA_KIND: Record<string, 'video' | 'audio' | 'image'> = {
  video: 'video',
  audio: 'audio',
};

export function mediaKindFromMaterial(materialType: string | undefined): 'video' | 'audio' | 'image' {
  return MEDIA_KIND[materialType ?? ''] ?? 'image';
}

function excerptText(text: string): string {
  return text.length > TEXT_EXCERPT_CHARS
    ? `${text.slice(0, TEXT_EXCERPT_CHARS)}…`
    : text;
}

function nodeLabel(data: Record<string, unknown>, fallback: string): string {
  return typeof data.label === 'string' && data.label ? data.label : fallback;
}

/** Build the per-node result summary from a terminal (or timed-out) snapshot. */
export function summarizeNodes(
  workspace: CanvasWorkspaceSnapshot,
  nodeIds: ReadonlySet<string>,
  snapshot: ExecutionSnapshot,
  mediaDir: string,
): NodeRunSummary[] {
  const rows: NodeRunSummary[] = [];
  for (const node of workspace.nodes) {
    if (!nodeIds.has(node.id)) continue;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const state = (snapshot.nodeStates[node.id] ?? {}) as Record<string, unknown>;
    const output = (snapshot.nodeOutputs[node.id] ?? {}) as Record<string, unknown>;
    const assets = Array.isArray(snapshot.mediaAssets[node.id])
      ? (snapshot.mediaAssets[node.id] as Array<Record<string, unknown>>)
      : [];

    const row: NodeRunSummary = {
      nodeId: node.id,
      label: nodeLabel(data, node.id),
      type: typeof node.type === 'string' ? node.type : 'unknown',
      status: typeof state.status === 'string' ? state.status : 'pending',
    };
    if (typeof state.error === 'string' && state.error) row.error = state.error;
    if (typeof output.text === 'string' && output.text) row.textExcerpt = excerptText(output.text);
    if (assets.length > 0) {
      row.mediaAssets = assets.map((asset) => ({
        type: asset.type,
        url: asset.url,
        path: mediaUrlToPath(asset.url, mediaDir),
      }));
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Execute a callback on a resolved workspace snapshot, or return a workspace-not-found error envelope.
 */
export function withWorkspace<T>(
  store: WorkspaceStore,
  workspaceId: string,
  fn: (snapshot: CanvasWorkspaceSnapshot) => T,
): T | { error: string; message: string } {
  let snapshot: CanvasWorkspaceSnapshot;
  try {
    snapshot = store.get(workspaceId);
  } catch {
    return errorBody('workspace-not-found', `workspace ${workspaceId} not found`);
  }
  return fn(snapshot);
}

/** Extract current canvas workspaceId from workbench viewport envelope. */
export function readUiContextWorkspaceId(
  getActiveView?: WorkbenchMailboxSeat['getActiveView'],
): string | undefined {
  if (typeof getActiveView !== 'function') return undefined;
  try {
    const active = getActiveView();
    const view = active?.uiContext?.view;
    if (!view || typeof view !== 'object') return undefined;
    // Prefer canvas kind; still accept workspaceId when tab is workflow canvas without kind.
    const extra = view.extra;
    const id = extra && typeof extra === 'object' ? extra.workspaceId : undefined;
    if (typeof id !== 'string' || id.trim().length === 0) return undefined;
    const trimmed = id.trim();
    if (view.kind && view.kind !== 'canvas') return undefined;
    // Reject path-like values (same rule as compact serializer).
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(trimmed)) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

export type WorkspaceResolutionSource =
  | 'explicit'
  | 'ui-context'
  | 'name';

/**
 * Resolve a workspace target with UI-context-aware defaults.
 * Priority: explicit workspace_id > ui_context workspace > unique workspace_name.
 * Never falls back to "latest" or "only workspace in store".
 */
export function resolveWorkspace(
  store: WorkspaceStore,
  workspaceId: string | undefined,
  workspaceName: string | undefined,
  options?: { getActiveView?: WorkbenchMailboxSeat['getActiveView'] },
): {
  snapshot: CanvasWorkspaceSnapshot;
  source: WorkspaceResolutionSource;
} | { error: string; message: string } {
  if (workspaceId) {
    const hit = withWorkspace(store, workspaceId, (snapshot) => ({
      snapshot,
      source: 'explicit' as const,
    }));
    return hit;
  }

  const fromUi = readUiContextWorkspaceId(options?.getActiveView);
  if (fromUi) {
    const hit = withWorkspace(store, fromUi, (snapshot) => ({
      snapshot,
      source: 'ui-context' as const,
    }));
    if (!('error' in hit)) return hit;
    // UI context pointed at a deleted workspace — surface that, do not invent another.
    return hit;
  }

  if (workspaceName) {
    const matches = store.list().filter((row) => row.name === workspaceName);
    const first = matches[0];
    if (matches.length === 0 || !first) {
      return errorBody('workspace-not-found', `no workspace named "${workspaceName}"`);
    }
    if (matches.length > 1) {
      return errorBody(
        'ambiguous-workspace-name',
        `multiple workspaces named "${workspaceName}" — pass workspace_id instead`,
      );
    }
    return withWorkspace(store, first.id, (snapshot) => ({
      snapshot,
      source: 'name' as const,
    }));
  }

  return errorBody(
    'no-current-workspace',
    'no workspace_id and no current canvas in ui_context — open a canvas tab, pass workspace_id, or call workflow_list only when the user must choose',
  );
}

/**
 * Resolve target workspace id for write tools.
 * Same priority as resolveWorkspace; returns only the id for mutate paths.
 */
export function resolveTargetWorkspaceId(
  store: WorkspaceStore,
  args: Record<string, unknown>,
  options?: { getActiveView?: WorkbenchMailboxSeat['getActiveView'] },
): { workspaceId: string; source: WorkspaceResolutionSource } | { error: string; message: string } {
  const resolved = resolveWorkspace(
    store,
    readString(args, 'workspace_id'),
    readString(args, 'workspace_name'),
    options,
  );
  if ('error' in resolved) return resolved;
  return { workspaceId: resolved.snapshot.id, source: resolved.source };
}

/** Shared parameter description for optional workspace_id on write/read tools. */
export const WORKSPACE_ID_PARAM_DESC =
  'Workspace id. Prefer the current canvas workspace from <ui_context> (workspace: ws_…); omit to use that default. Use workflow_list only when no current canvas is available or the user must choose another workspace.';

export async function waitForTerminal(
  executionManager: ExecutionManager,
  executionId: string,
  timeoutMs: number,
): Promise<{ snapshot: ExecutionSnapshot | null; timedOut: boolean }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snapshot = executionManager.getSnapshot(executionId);
    if (!snapshot) return { snapshot: null, timedOut: false };
    if (TERMINAL_STATUSES.has(snapshot.status)) return { snapshot, timedOut: false };
    if (Date.now() >= deadline) return { snapshot, timedOut: true };
    await sleep(RUN_POLL_INTERVAL_MS);
  }
}

export function workspaceSummary(workspace: CanvasWorkspaceSnapshot): Record<string, unknown> {
  return {
    id: workspace.id,
    name: workspace.name,
    version: workspace.version,
    nodeCount: workspace.nodes.length,
    edgeCount: workspace.edges.length,
  };
}

/**
 * Validate a tool for a material type. Returns the tool string on success
 * (default when omitted) or an error envelope.
 */
export function resolveTool(
  materialType: MaterialType,
  tool: unknown,
): { tool: MaterialTool } | { error: string; message: string } {
  if (tool === undefined) return { tool: DEFAULT_MATERIAL_TOOL[materialType] };
  const valid = MATERIAL_TOOLS[materialType] as readonly string[];
  if (typeof tool !== 'string' || !valid.includes(tool)) {
    return errorBody(
      'invalid-args',
      `tool must be one of ${valid.join(', ')} for material_type ${materialType} (got ${JSON.stringify(tool)})`,
    );
  }
  return { tool: tool as MaterialTool };
}

export function readPosition(args: Record<string, unknown>): { x: number; y: number } | undefined {
  const raw = args.position;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const pos = raw as Record<string, unknown>;
  if (typeof pos.x !== 'number' || typeof pos.y !== 'number') return undefined;
  return { x: pos.x, y: pos.y };
}

/** Default placement: right of the rightmost node, same row cadence as the user flow. */
export function defaultNodePosition(snapshot: CanvasWorkspaceSnapshot): { x: number; y: number } {
  if (snapshot.nodes.length === 0) return { x: 120, y: 120 };
  const maxX = Math.max(...snapshot.nodes.map((node) => node.position.x));
  return { x: maxX + 420, y: 120 };
}
