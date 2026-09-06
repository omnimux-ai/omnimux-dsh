/**
 * Workflow host assembly: mounts the WorkspaceStore, the generation gateway
 * (M4: OmniMux seam client when the execution hub is reachable, mock
 * otherwise), the M3 execution engine (ExecutionManager + recovery), the
 * /omnimux-workflow HTTP routes (with the legacy /dsh-workflow alias) onto
 * the webServer seat, and the M5 agent seats (three ctx.tools tools + the
 * workflow:ops systemPrompt section).
 *
 * M3: executions became first-class — creating / pausing / resuming /
 * cancelling runs and streaming the 11-event SSE protocol. Live executions
 * persisted under $DSH_HOME/omnimux/workflow/executions/ are recovered and
 * resumed automatically at mount (fromPersistedState breakpoint recovery).
 *
 * M4: gateway selection happens here — see seam/gatewaySelection.ts and the
 * README「真实网关」chapter (env override OMNIMUX_WORKFLOW_GATEWAY).
 *
 * M5: agent tools (workflow_list / workflow_run / workflow_snapshot) work
 * directly against this store + executionManager — no HTTP round-trip, no
 * new seam consumers; see agent/agentTools.ts.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerResponse, IncomingMessage } from 'node:http';
import type { WorkflowPaths } from './paths';
import { resolveWorkflowPaths } from './paths';
import { createWorkspaceStore } from './workspace/WorkspaceStore';
import { createGenerationPreferencesStore } from './workspace/GenerationPreferencesStore';
import { createProjectAssetsStore } from './workspace/ProjectAssetsStore';
import { createProjectStore } from '../projects/ProjectStore';
import { bindEnsureProjectBound } from '../projects/ensureProjectBound';
import { ensureLibraryRoot } from '../projects/library';
import { TemplateStore } from './templates/TemplateStore.ts';
import type { GenerationGateway } from './seam/gateway';
import {
  assembleGateway,
  type GatewayMode,
} from './seam/gatewaySelection';
import { createExecutionManager } from './execution/ExecutionManager';
import { persistGeneratedArtifact } from './execution/persistGeneratedArtifact';
import { createLibraryHttpClient } from './library/libraryHttp';
import { createWorkflowDispatcher, registerWorkflowRoutes } from './routes/canvasRoutes';
import { registerWorkflowAgentSeats } from './agent/agentTools';
import type { AgentSeatContext } from './agent/agentTools';

type WebServer = {
  register: (route: {
    kind: string;
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  }) => () => void;
};

type HostContext = AgentSeatContext & {
  webServer?: WebServer;
  inject?: (deps: string[], callback: (inner: { webServer?: WebServer }) => void) => void;
  /** cordis seam lookup — the only legal path to the execution hub. */
  get?: (name: string) => unknown;
};

export interface MountWorkflowHostOptions {
  paths?: WorkflowPaths;
  /** Override OmniMux/Projects library root (tests). */
  libraryRoot?: string;
  /** Override the gateway entirely (tests / embedding code win over assembly). */
  gateway?: GenerationGateway;
  /** Gateway selection override (default: env OMNIMUX_WORKFLOW_GATEWAY / auto). */
  gatewayMode?: GatewayMode;
  /** Max concurrent in-flight hub seam calls (default 2). */
  seamConcurrency?: number;
  /** Env source for gateway knobs (tests); defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export function mountWorkflowHost(ctx: HostContext, opts: MountWorkflowHostOptions = {}): () => void {
  const paths = opts.paths ?? resolveWorkflowPaths();
  const templatesDir = paths.templatesDir || join(paths.root, 'templates');
  mkdirSync(paths.workspacesDir, { recursive: true });
  mkdirSync(paths.mediaDir, { recursive: true });
  mkdirSync(paths.executionsDir, { recursive: true });
  mkdirSync(templatesDir, { recursive: true });

  const libraryRoot = opts.libraryRoot ?? ensureLibraryRoot();
  const projectStore = createProjectStore({ libraryRoot });
  const ensureProjectBound = bindEnsureProjectBound(projectStore);
  const resolveProjectRoot = (workspaceId: string) => projectStore.findByCanvasWorkspaceId(workspaceId);
  const store = createWorkspaceStore({
    workspacesDir: paths.workspacesDir,
    resolveProjectRoot,
  });
  const generationPreferences = createGenerationPreferencesStore(join(paths.root, 'generation-preferences.json'));
  const templates = new TemplateStore({ templatesDir });
  const gateway =
    opts.gateway
    ?? assembleGateway({
      getSeam: (name: string) => ctx.get?.(name),
      ...(opts.gatewayMode !== undefined ? { mode: opts.gatewayMode } : {}),
      ...(opts.seamConcurrency !== undefined ? { seamConcurrency: opts.seamConcurrency } : {}),
      env: opts.env ?? process.env,
    }).gateway;
  const libraryHttp = createLibraryHttpClient();
  const assetsStore = createProjectAssetsStore({
    workspacesDir: paths.workspacesDir,
    resolveProjectRoot,
    fetchLibraryDetail: libraryHttp.fetchLibraryDetail,
    promoteToLibrary: libraryHttp.promoteToLibrary,
  });
  const executionManager = createExecutionManager({
    executionsDir: paths.executionsDir,
    gateway,
    mediaDir: paths.mediaDir,
    persistGenerated: (input) => persistGeneratedArtifact({
      ...input,
      resolveProjectRoot,
      registerGenerated: (workspaceId, payload) => assetsStore.registerGenerated(workspaceId, payload),
    }),
  });
  const dispatcher = createWorkflowDispatcher({
    store,
    generationPreferences,
    gateway,
    mediaDir: paths.mediaDir,
    executionManager,
    templates,
    libraryRoot,
    assetsStore,
    projectStore,
    ensureProjectBound,
  });

  // Recovery pass (Gxgen ExecutionRecoveryService port): resume live runs
  // persisted by a previous mount / process. Fire-and-forget — route mounts
  // do not wait on it; recovered executions stream to late SSE subscribers.
  void executionManager.recoverAll();

  const disposers: Array<() => void> = [];

  const mountHttp = (httpCtx: { webServer?: WebServer }) => {
    const webServer = httpCtx.webServer;
    if (!webServer || typeof webServer.register !== 'function') return;
    const mount = () => {
      // 项目库 API（Phase 0）已并入 workflow dispatcher（/omnimux-workflow/api/projects*），
      // 与画布路由共用同一 prefix 注册，最长前缀不冲突、无二次 register。
      disposers.push(registerWorkflowRoutes(webServer, dispatcher));
    };
    if (typeof ctx.effect === 'function') {
      ctx.effect(mount, 'omnimux-workflow: http routes');
    } else {
      mount();
    }
  };

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (inner) => mountHttp(inner));
  } else {
    mountHttp(ctx);
  }

  // ---- M5 agent seats: three tools + workflow:ops systemPrompt section ----
  // Host-side only (store + executionManager in-process, no HTTP calls).
  // Mounts when either seat is present; wrapped in ctx.effect for disposal.
  if (ctx.tools || ctx.systemPrompt) {
    const mountAgent = () => {
      // Optional hub seam: last-known UI viewport for default workspace targeting.
      // Vertical package must not import hub — only ctx.get('workbenchMailbox').
      const mailbox = typeof ctx.get === 'function' ? ctx.get('workbenchMailbox') : undefined;
      const getActiveView =
        mailbox && typeof mailbox === 'object' && typeof (mailbox as { getActiveView?: unknown }).getActiveView === 'function'
          ? (mailbox as { getActiveView: (sessionId?: string) => unknown }).getActiveView.bind(mailbox)
          : undefined;
      // Optional hub seam: Catalog v1.1 DTO for the compat kernel (Issue
      // #466). Read lazily at mutation time; null → fail closed.
      const getCatalog = () => {
        const seam = typeof ctx.get === 'function' ? ctx.get('modelCatalog') : undefined;
        if (seam && typeof seam === 'object' && typeof (seam as { list?: unknown }).list === 'function') {
          try {
            return (seam as { list: () => unknown }).list();
          } catch {
            return null;
          }
        }
        return null;
      };
      disposers.push(
        registerWorkflowAgentSeats(ctx, {
          store,
          executionManager,
          mediaDir: paths.mediaDir,
          ensureProjectBound,
          getCatalog,
          getGenerationPreferences: () => generationPreferences.get().lastModelByType,
          getActiveView: getActiveView as
            | ((sessionId?: string) => {
                ok?: boolean;
                uiContext?: {
                  view?: { kind?: string; extra?: { workspaceId?: string } } | null;
                } | null;
              })
            | undefined,
        }),
      );
    };
    if (typeof ctx.effect === 'function') {
      ctx.effect(mountAgent, 'omnimux-workflow: agent seats');
    } else {
      mountAgent();
    }
  }

  return () => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
    // Flush + detach in-memory executions (persisted state stays recoverable).
    executionManager.disposeAll();
  };
}

export { resolveWorkflowPaths };
export * from './execution/fingerprintCache';
export * from './execution/stepCheckpoint';
