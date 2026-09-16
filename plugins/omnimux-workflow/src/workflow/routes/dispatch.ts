/**
 * Shared dispatch DTOs for the workflow HTTP dispatcher.
 * Handlers return null when they do not own the request.
 */
import type { ExecutionManager, ExecutionEventLogEntry } from '../execution/ExecutionManager';
import type { ExecutionContext } from '../execution/ExecutionContext';
import type { GenerationGateway } from '../seam/gateway';
import type { WorkspaceStore } from '../workspace/WorkspaceStore';
import type { ProjectAssetsStore } from '../workspace/ProjectAssetsStore';
import type { TemplateStore } from '../templates/TemplateStore.ts';
import type { ProjectStore } from '../../projects/ProjectStore';
import type { EnsureProjectBoundFn } from '../../projects/ensureProjectBound';

import type { GenerationPreferencesStore } from '../workspace/GenerationPreferencesStore.ts';

export interface WorkflowDispatcherDeps {
  generationPreferences?: GenerationPreferencesStore;
  /** Lazy neutral seam lookup; no provider clients in workflow. */
  getSeam?: (name: string) => unknown;
  /** Lazy neutral tool lookup from host context. */
  getTool?: (name: string) => unknown;
  /** Injected fetcher for media downloads (tests). */
  fetcher?: typeof fetch;
  store: WorkspaceStore;
  gateway: GenerationGateway;
  mediaDir: string;
  executionManager: ExecutionManager;
  /** Override the default videos library (tests). */
  libraryRoot?: string;
  /** Injected native picker (tests). Default: macOS osascript chooser. */
  picker?: (kind: string) => Promise<{ path: string | null; paths: string[] }>;
  templates?: TemplateStore;
  /** Shared with host mount so generate persist and HTTP ingest use one ledger. */
  assetsStore?: ProjectAssetsStore;
  /** Same ProjectStore as mountWorkflowHost — avoid a second libraryRoot. */
  projectStore?: ProjectStore;
  /** Lazy-bind a local project before media generate executions. */
  ensureProjectBound?: EnsureProjectBoundFn;
  /**
   * 会话 id → 工作区目录（宿主 `agents` 服务的会话 `header.cwd`）。
   * 用于按会话解析/登记所属项目（Issue #2104）；不可用时路由降级为 unknown-session。
   */
  resolveSessionWorkspaceDir?: (sessionId: string) => string | undefined;
}

export interface WorkflowDispatchRequest {
  method: string;
  url: string;
  origin?: string;
  referer?: string;
  secFetchSite?: string;
  body?: unknown;
  range?: string;
}

export type DispatchResult =
  | { status: number; body?: unknown }
  | { status: number; file: string }
  | { status: number; sse: { context: ExecutionContext; eventLog: ExecutionEventLogEntry[] } };

export type RouteTry = (
  method: string,
  path: string,
  req: WorkflowDispatchRequest,
) => DispatchResult | null | Promise<DispatchResult | null>;

export const notFound = (): DispatchResult => ({
  status: 404,
  body: { error: 'not-found', message: 'unknown route' },
});
