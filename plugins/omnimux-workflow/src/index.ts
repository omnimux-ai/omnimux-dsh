/**
 * omnimux-workflow host entry (Cordis host face).
 *
 * M1: HTTP routes only (workspace CRUD + island bundle + media).
 * M3: execution engine (scheduler + context + manager + SSE) mounted with
 * the routes.
 * M4: real generation — the gateway is assembled from the execution hub
 * seams (ctx.get('videoGenerate'|'imageGenerate'|'textComplete')) when the
 * hub is reachable, falling back to the mock gateway otherwise.
 * M5: agent seats — three ctx.tools tools (workflow_list / workflow_run /
 * workflow_snapshot) plus the workflow:ops systemPrompt section, letting an
 * Agent inspect and execute the user's canvas in-process.
 */
import { mountWorkflowHost } from './workflow/index';

export const name = 'omnimux-workflow';
export const inject = ['tools', 'systemPrompt'];

/**
 * @param {{
 *   webServer?: { register: (route: { kind: string, path: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void> }) => () => void },
 *   tools?: { register: (tool: object) => unknown },
 *   systemPrompt?: { section: (spec: object) => unknown },
 *   effect?: (fn: () => unknown, label?: string) => unknown,
 *   inject?: (deps: string[], callback: (inner: object) => void) => void,
 *   get?: (name: string) => unknown,
 * }} ctx
 */
export function apply(ctx: {
  webServer?: Parameters<typeof mountWorkflowHost>[0]['webServer'];
  tools?: Parameters<typeof mountWorkflowHost>[0]['tools'];
  systemPrompt?: Parameters<typeof mountWorkflowHost>[0]['systemPrompt'];
  effect?: Parameters<typeof mountWorkflowHost>[0]['effect'];
  inject?: Parameters<typeof mountWorkflowHost>[0]['inject'];
  get?: Parameters<typeof mountWorkflowHost>[0]['get'];
}): void {
  mountWorkflowHost(ctx);
}

// Re-exported for the route/engine smoke tests (dist consumers get the same API).
export { mountWorkflowHost } from './workflow/index';

// Phase 0 project shell surface (node --test suites + dist consumers).
export {
  PROJECT_SCHEMA_VERSION,
  MAX_PROJECT_TITLE_LENGTH,
  projectSchema,
  projectSummarySchema,
  projectIndexSchema,
  parseProject,
  parseProjectIndex,
} from './projects/schema';
export type {
  Project,
  ProjectSummary,
  ProjectIndex,
} from './projects/schema';
export {
  resolveProjectPaths,
  resolveLibraryPaths,
  resolveProjectRelPath,
  toProjectRelativePath,
  assertProjectInsideLibrary,
  isInsideDir,
  assertProjectWriteSafe,
  ProjectPathError,
  PROJECT_README_NAME,
} from './projects/paths';
export type { ProjectPaths, LibraryPaths } from './projects/paths';
export {
  resolveVideosDir,
  defaultProjectLibrary,
  ensureLibraryRoot,
  displayHomePath,
  VIDEOS_DIR_ENV,
} from './projects/library';
export {
  sanitizeFolderName,
  folderNameAttempt,
  validateProjectTitle,
  allocateUniqueProjectFolder,
  MAX_DIRECTORY_ATTEMPTS,
} from './projects/folderName';
export {
  createProjectStore,
  ProjectStoreError,
  defaultReadme,
} from './projects/ProjectStore';
export type { ProjectStore, ProjectRecord } from './projects/ProjectStore';
export {
  PROJECT_ROUTE_PREFIX,
  PROJECT_LIBRARY_PATH,
  createProjectDispatcher,
} from './projects/routes';
export type { ProjectDispatcher } from './projects/routes';

// M5 agent tool surface (also consumed by node --test suites / self-verify).
export {
  registerWorkflowAgentSeats,
  WORKFLOW_PROMPT_SECTION,
  DEFAULT_RUN_WAIT_TIMEOUT_MS,
} from './workflow/agent/agentTools';
export type {
  AgentToolSpec,
  ToolsSeat,
  SystemPromptSeat,
  AgentSeatContext,
  WorkflowAgentDeps,
} from './workflow/agent/agentTools';

// PR1 shared graph core + host mutation entry (agent write tools, tests).
export { mutateWorkspaceGraph } from './workflow/graph/GraphMutator';
export type {
  GraphMutationResult,
  GraphMutationSuccess,
  GraphMutationError,
} from './workflow/graph/GraphMutator';
export { createWorkspaceStore } from './workflow/workspace/WorkspaceStore';
export { WorkflowStoreError } from './workflow/workspace/WorkflowStoreError';
export type { WorkspaceStore } from './workflow/workspace/WorkspaceStore';
export { createProjectAssetsStore } from './workflow/workspace/ProjectAssetsStore';
export type { ProjectAssetsStore } from './workflow/workspace/ProjectAssetsStore';
export {
  sessionToWorkspaceId,
  setSessionCanvasOverride,
  getSessionCanvasOverride,
  resolveEffectiveWorkspaceId,
} from './shared/sessionWorkspaceId';
export {
  PROJECT_ASSETS_SCHEMA_VERSION,
  emptyProjectAssetsDocument,
} from './shared/projectAssets';
export type {
  ProjectAssetsDocument,
  ProjectAssetsFolder,
  ProjectAssetsItem,
  SaveProjectAssetsPayload,
} from './shared/projectAssets';

// M3 execution engine surface (also consumed by node --test suites).
export {
  ExecutionContext,
  ExecutionStatus,
  NodeStatus,
} from './workflow/execution/ExecutionContext';
export type {
  ExecutionEventName,
  ExecutionEventPayloads,
  SerializedContext,
} from './workflow/execution/ExecutionContext';
export {
  ExecutionScheduler,
  NodeExecutionError,
  DEFAULT_MAX_PARALLEL,
} from './workflow/execution/ExecutionScheduler';
export type {
  DagState,
  ExecutableNode,
  ExecutableEdge,
  SchedulerProgress,
} from './workflow/execution/ExecutionScheduler';
export {
  resolveExecutionSubgraph,
  toExecutionMode,
  normalizeNodeIds,
  subgraphContainsMediaGenerate,
} from './workflow/execution/subgraph';
export { createExecutionManager } from './workflow/execution/ExecutionManager';
export type {
  ExecutionManager,
  ExecutionSnapshot,
  ExecutionSummary,
} from './workflow/execution/ExecutionManager';
export { createSSEPublisher } from './workflow/execution/ExecutionSSE';
export { createMockGateway } from './workflow/seam/mockGateway';
export {
  createOmnimuxSeamClient,
  SeamGatewayError,
  SEAM_CONCURRENCY_ENV,
  DEFAULT_SEAM_CONCURRENCY,
} from './workflow/seam/omnimuxGateway';
export {
  assembleGateway,
  createAutoSwitchGateway,
  probeSeams,
  resolveGatewayMode,
  GATEWAY_MODE_ENV,
} from './workflow/seam/gatewaySelection';
export {
  canonicalJson,
  computeNodeFingerprint,
  NodeResultCache,
  globalNodeCache,
} from './workflow/execution/fingerprintCache';
export {
  CheckpointManager,
  globalCheckpointManager,
} from './workflow/execution/stepCheckpoint';
export type {
  StepCheckpointRecord,
  WorkflowCheckpoint,
} from './workflow/execution/stepCheckpoint';
