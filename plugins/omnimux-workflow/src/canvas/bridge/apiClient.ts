/**
 * Island-side fetch wrapper over the host /omnimux-workflow/api/* routes.
 *
 * Plain fetch (same origin — the island is served by the same webServer);
 * no axios, no custom HTTP client (plugin red line). Route paths come from
 * src/shared/api.ts — the single source of truth shared with the host.
 */

import { WORKFLOW_API_ROUTES } from '../../shared/api.ts';
import type {
  BuildManifest,
  CapabilityCatalog,
  CreateExecutionResponse,
  ExecutionSnapshotDto,
  ExecutionSummaryDto,
  SaveWorkspaceTablePayload,
  StartExecutionPayload,
  WorkspaceTableResponse,
} from '../../shared/api.ts';
import type {
  CanvasWorkspaceSnapshot,
  SaveCanvasWorkspacePayload,
  WorkspaceSummary,
} from '../../shared/canvasTypes.ts';
import type {
  IndexProjectAssetsPayload,
  MkdirProjectAssetsPayload,
  ProjectAssetsDocument,
  SaveProjectAssetsPayload,
} from '../../shared/projectAssets.ts';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  /** Success payload intersected with the error envelope fields. */
  body: T & { error?: string; message?: string };
}

export async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  let json = {} as T & { error?: string; message?: string };
  try {
    json = (await response.json()) as T & { error?: string; message?: string };
  } catch {
    json = { error: `HTTP ${String(response.status)}` } as T & { error?: string; message?: string };
  }
  return { ok: response.ok, status: response.status, body: json };
}

export function fetchManifest(): Promise<ApiResult<BuildManifest>> {
  return request<BuildManifest>(WORKFLOW_API_ROUTES.manifest);
}

export function fetchCapabilities(): Promise<ApiResult<CapabilityCatalog>> {
  return request<CapabilityCatalog>(WORKFLOW_API_ROUTES.capabilities);
}

export function listWorkspaces(): Promise<ApiResult<{ workspaces: WorkspaceSummary[] }>> {
  return request<{ workspaces: WorkspaceSummary[] }>(WORKFLOW_API_ROUTES.workspaces);
}

export function createWorkspace(name?: string, id?: string): Promise<ApiResult<{ workspace: CanvasWorkspaceSnapshot }>> {
  return request<{ workspace: CanvasWorkspaceSnapshot }>(WORKFLOW_API_ROUTES.workspaces, {
    method: 'POST',
    body: { name, id },
  });
}

export function getWorkspace(id: string): Promise<ApiResult<{ workspace: CanvasWorkspaceSnapshot }>> {
  return request<{ workspace: CanvasWorkspaceSnapshot }>(WORKFLOW_API_ROUTES.workspace(encodeURIComponent(id)));
}

/** PR3: lightweight version probe for external-edit detection. */
export function getWorkspaceVersion(id: string): Promise<ApiResult<{ id: string; version: number }>> {
  return request<{ id: string; version: number }>(WORKFLOW_API_ROUTES.workspaceVersion(encodeURIComponent(id)));
}

export interface SaveResponse {
  workspace?: CanvasWorkspaceSnapshot;
  error?: string;
  message?: string;
  current?: number;
}

export function saveWorkspace(id: string, payload: SaveCanvasWorkspacePayload): Promise<ApiResult<SaveResponse>> {
  return request<SaveResponse>(WORKFLOW_API_ROUTES.workspace(encodeURIComponent(id)), {
    method: 'PUT',
    body: payload,
  });
}

export function getWorkspaceTable(
  workspaceId: string,
  tableId: string,
): Promise<ApiResult<WorkspaceTableResponse>> {
  return request<WorkspaceTableResponse>(
    WORKFLOW_API_ROUTES.workspaceTable(encodeURIComponent(workspaceId), encodeURIComponent(tableId)),
  );
}

export function saveWorkspaceTable(
  workspaceId: string,
  tableId: string,
  payload: SaveWorkspaceTablePayload,
): Promise<ApiResult<WorkspaceTableResponse>> {
  return request<WorkspaceTableResponse>(
    WORKFLOW_API_ROUTES.workspaceTable(encodeURIComponent(workspaceId), encodeURIComponent(tableId)),
    {
      method: 'PUT',
      body: payload,
    },
  );
}

export function deleteWorkspaceTable(
  workspaceId: string,
  tableId: string,
): Promise<ApiResult<{ ok?: boolean }>> {
  return request<{ ok?: boolean }>(
    WORKFLOW_API_ROUTES.workspaceTable(encodeURIComponent(workspaceId), encodeURIComponent(tableId)),
    {
      method: 'DELETE',
    },
  );
}

// ============================================================================
// Execution API (M3)
// ============================================================================

export function createExecution(
  workspaceId: string,
  payload: StartExecutionPayload = {},
): Promise<ApiResult<CreateExecutionResponse>> {
  return request<CreateExecutionResponse>(WORKFLOW_API_ROUTES.executions(encodeURIComponent(workspaceId)), {
    method: 'POST',
    body: payload,
  });
}

export function listExecutions(
  workspaceId: string,
): Promise<ApiResult<{ executions: ExecutionSummaryDto[] }>> {
  return request<{ executions: ExecutionSummaryDto[] }>(WORKFLOW_API_ROUTES.executions(encodeURIComponent(workspaceId)));
}

export function getExecution(
  workspaceId: string,
  executionId: string,
): Promise<ApiResult<{ execution: ExecutionSnapshotDto }>> {
  return request<{ execution: ExecutionSnapshotDto }>(
    WORKFLOW_API_ROUTES.execution(encodeURIComponent(workspaceId), encodeURIComponent(executionId)),
  );
}

export type ExecutionAction = 'pause' | 'resume' | 'cancel';

export function getWorkspaceAssets(
  id: string,
  signal?: AbortSignal,
): Promise<ApiResult<{ assets: ProjectAssetsDocument }>> {
  return request<{ assets: ProjectAssetsDocument }>(
    WORKFLOW_API_ROUTES.workspaceAssets(encodeURIComponent(id)),
    { signal },
  );
}

export function saveWorkspaceAssets(
  id: string,
  payload: SaveProjectAssetsPayload,
): Promise<ApiResult<{ assets: ProjectAssetsDocument; current?: number }>> {
  return request<{ assets: ProjectAssetsDocument; current?: number }>(
    WORKFLOW_API_ROUTES.workspaceAssets(encodeURIComponent(id)),
    { method: 'PUT', body: payload },
  );
}

export function mkdirWorkspaceAsset(
  id: string,
  payload: MkdirProjectAssetsPayload,
): Promise<ApiResult<{ assets: ProjectAssetsDocument; current?: number }>> {
  return request<{ assets: ProjectAssetsDocument; current?: number }>(
    WORKFLOW_API_ROUTES.workspaceAssetsMkdir(encodeURIComponent(id)),
    { method: 'POST', body: payload },
  );
}

export function ingestWorkspaceAssets(
  id: string,
  payload: IndexProjectAssetsPayload,
): Promise<ApiResult<{ assets: ProjectAssetsDocument; current?: number }>> {
  return request<{ assets: ProjectAssetsDocument; current?: number }>(
    WORKFLOW_API_ROUTES.workspaceAssetsIngest(encodeURIComponent(id)),
    { method: 'POST', body: payload },
  );
}

export function indexWorkspaceAssets(
  id: string,
  payload: IndexProjectAssetsPayload,
): Promise<ApiResult<{ assets: ProjectAssetsDocument; current?: number }>> {
  return ingestWorkspaceAssets(id, payload);
}

export function instantiateWorkspaceAssets(
  id: string,
  payload: { globalSubjectId: string; parentId?: string | null; expectedRev?: number },
): Promise<ApiResult<{ assets: ProjectAssetsDocument; current?: number }>> {
  return request<{ assets: ProjectAssetsDocument; current?: number }>(
    WORKFLOW_API_ROUTES.workspaceAssetsInstantiate(encodeURIComponent(id)),
    { method: 'POST', body: payload },
  );
}

export function promoteWorkspaceAsset(
  id: string,
  payload: { relative_path: string; name: string; type?: string },
): Promise<ApiResult<{ asset: unknown }>> {
  return request<{ asset: unknown }>(
    WORKFLOW_API_ROUTES.workspaceAssetsPromote(encodeURIComponent(id)),
    { method: 'POST', body: payload },
  );
}

export function pickLocalFiles(): Promise<ApiResult<{ path: string | null; paths: string[] }>> {
  return request<{ path: string | null; paths: string[] }>(WORKFLOW_API_ROUTES.pick, {
    method: 'POST',
    body: { kind: 'file' },
  });
}

export function probeLocalFiles(
  paths: string[],
): Promise<ApiResult<{ items: Array<{ path: string; exists: boolean; size?: number; mime?: string; name?: string }> }>> {
  return request<{ items: Array<{ path: string; exists: boolean; size?: number; mime?: string; name?: string }> }>(
    WORKFLOW_API_ROUTES.localFileProbe,
    { method: 'POST', body: { paths } },
  );
}

export function executionAction(
  workspaceId: string,
  executionId: string,
  action: ExecutionAction,
): Promise<ApiResult<{ ok: boolean }>> {
  return request<{ ok: boolean }>(
    WORKFLOW_API_ROUTES.executionAction(
      encodeURIComponent(workspaceId),
      encodeURIComponent(executionId),
      action,
    ),
    { method: 'POST', body: {} },
  );
}
