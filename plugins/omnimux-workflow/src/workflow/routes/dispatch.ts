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
