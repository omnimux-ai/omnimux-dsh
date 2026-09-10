/**
 * Workflow HTTP routes mounted on the official webServer seat.
 *
 * Prefix: /omnimux-workflow/* (canonical, M2+) with the M1 /dsh-workflow/*
 * prefix kept as a legacy alias — both prefixes dispatch into the same
 * handler, so existing sessions/bookmarks keep working without a redirect.
 *   GET  /omnimux-workflow/canvas.js            island bundle (cache-busted)
 *   GET  /omnimux-workflow/api/manifest         build manifest (canvas.js hash)
 *   GET  /omnimux-workflow/api/workspaces       list summaries
 *   POST /omnimux-workflow/api/workspaces       create (name validated, 400 if >200 chars)
 *   GET  /omnimux-workflow/api/workspaces/:id   snapshot
 *   PUT  /omnimux-workflow/api/workspaces/:id   save (optimistic lock -> 409, body limit 1MB)
 *   DELETE /omnimux-workflow/api/workspaces/:id
 *   GET  /omnimux-workflow/api/capabilities     capability catalog (stub in M1)
 *   GET  /omnimux-workflow/media/*              media files (traversal- + symlink-guarded)
 *   POST /omnimux-workflow/api/pick             native file picker (absolute paths)
 *   GET  /omnimux-workflow/api/local-file       stream imported realPath (Range 206)
 *   POST /omnimux-workflow/api/local-file/probe batch exists/size for realPath[]
 *   GET  /omnimux-workflow/api/workspaces/:id/assets          project assets.json
 *   PUT  /omnimux-workflow/api/workspaces/:id/assets          save (independent rev)
 *   POST /omnimux-workflow/api/workspaces/:id/assets/mkdir    create folder record
 *   POST /omnimux-workflow/api/workspaces/:id/assets/ingest   copy into project assets/imported/
 *   POST /omnimux-workflow/api/workspaces/:id/assets/index    deprecated alias of ingest
 *   GET  /omnimux-workflow/api/workspaces/:id/file?rel=       stream project-relative file
 *   GET  /omnimux-workflow/api/project-file?workspace=&rel=   alias of workspace file
 *   GET  /omnimux-workflow/api/templates        list reusable workflow templates
 *   POST /omnimux-workflow/api/templates        create template from a group subgraph
 *   GET  /omnimux-workflow/api/templates/:id    one template
 *   DELETE /omnimux-workflow/api/templates/:id
 *
 *   POST /omnimux-workflow/api/workspaces/:id/speech-to-text audio → text via hub seam
 *
 * Dispatch is composed from per-domain route modules; this file stays the
 * public assembly + HTTP adapter. Named exports keep the original surface.
 */
import { createGenerationPreferencesRoutes } from './generationPreferencesRoutes';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { serveFile } from './serveFile';
import {
  LEGACY_WORKFLOW_ROUTE_PREFIX,
  WORKFLOW_ROUTE_PREFIX,
} from '../../shared/api';
import {
  MAX_JSON_BODY_BYTES,
  sendJson,
  JsonBodyLimitError,
  readJsonBody,
  assertLocalWrite,
  header,
  messageOf,
} from '../../http/helpers';
import { WorkflowStoreError } from '../workspace/WorkspaceStore';
import { ProjectPathError } from '../../projects/paths';
import { createSSEPublisher } from '../execution/ExecutionSSE';
import { createProjectDispatcher } from '../../projects/routes';
import type {
  DispatchResult,
  WorkflowDispatcherDeps,
  WorkflowDispatchRequest,
} from './dispatch';
import { resolvePluginRoot } from './pluginRoot';
import { createStaticRoutes } from './staticRoutes';
import { createWorkspaceRoutes } from './workspaceRoutes';
import { createExecutionRoutes } from './executionRoutes';
import { createMediaRoutes } from './mediaRoutes';
import { createLocalFileRoutes } from './localFileRoutes';
import { createProjectAssetsRoutes } from './projectAssetsRoutes';
import { createAudioBytesRoutes } from './audioBytesRoutes.ts';
import { createLibraryHttpClient } from '../library/libraryHttp';
import { createProjectAssetsStore } from '../workspace/ProjectAssetsStore';
import { createProjectStore } from '../../projects/ProjectStore';
import { ensureLibraryRoot } from '../../projects/library';
import { bindEnsureProjectBound } from '../../projects/ensureProjectBound';
import { createTemplateRoutes } from './templateRoutes';
import { createTableRoutes } from './tableRoutes';
import { createSpeechToTextRoutes } from './speechToTextRoutes';
import { createVideoExtractionRoutes } from './videoExtractionRoutes';
import { createVideoDeconstructRoutes } from './videoDeconstructRoutes';
import { createVideoStoryboardRoutes } from './videoStoryboardRoutes';

export {
  MAX_JSON_BODY_BYTES,
  sendJson,
  JsonBodyLimitError,
  readJsonBody,
  assertLocalWrite,
};
export type {
  WorkflowDispatcherDeps,
  WorkflowDispatchRequest,
  DispatchResult,
};

const STATUS_BY_CODE: Record<string, number> = {
  'invalid-json': 400,
  'invalid-id': 400,
  'invalid-snapshot': 400,
  'name-required': 400,
  'name-too-long': 400,
  'body-too-large': 413,
  'version_conflict': 409,
  'workspace-not-found': 404,
  'not-found': 404,
  'not-local': 403,
  'path-denied': 400,
  'internal': 500,
  'picker-unsupported': 501,
  'picker-failed': 500,
  'picker-invalid-kind': 400,
  'unsupported-media': 415,
  'invalid-path': 400,
  'not-a-file': 400,
  'blob-url-forbidden': 400,
  'name-conflict': 409,
  'name-invalid': 400,
  'version-required': 400,
  'project-required': 400,
  'disk-space-insufficient': 413,
  'subject-has-no-files': 400,
};

const PLUGIN_ROOT = resolvePluginRoot();

export function createWorkflowDispatcher(deps: WorkflowDispatcherDeps) {
  const { store, gateway, mediaDir, executionManager, picker, templates, libraryRoot } = deps;
  const projectDispatcher = createProjectDispatcher(libraryRoot ? { libraryRoot } : {});
  const projectStore = deps.projectStore
    ?? createProjectStore({ libraryRoot: libraryRoot ?? ensureLibraryRoot() });
  const staticRoutes = createStaticRoutes({ pluginRoot: PLUGIN_ROOT, gateway });
  const workspaceRoutes = createWorkspaceRoutes(store, projectStore);
  const preferenceRoutes = deps.generationPreferences ? createGenerationPreferencesRoutes(deps.generationPreferences, gateway) : null;
  const ensureProjectBound = deps.ensureProjectBound ?? bindEnsureProjectBound(projectStore);
  const libraryHttp = createLibraryHttpClient();
  const assetsStore = deps.assetsStore ?? createProjectAssetsStore({
    workspacesDir: store.workspacesDir,
    resolveProjectRoot: (workspaceId) => projectStore.findByCanvasWorkspaceId(workspaceId),
    fetchLibraryDetail: libraryHttp.fetchLibraryDetail,
    promoteToLibrary: libraryHttp.promoteToLibrary,
  });
  const projectAssetsRoutes = createProjectAssetsRoutes(assetsStore);
  const executionRoutes = createExecutionRoutes({
    store,
    mediaDir,
    resolveProjectFile: (workspaceId, relativePath) => assetsStore.resolveProjectFile(workspaceId, relativePath),
    executionManager,
    ensureProjectBound,
    getCatalog: async () => (await gateway.capabilities()) as import('../../shared/api').CapabilityCatalog,
  });
  const mediaRoutes = createMediaRoutes(mediaDir);
  const localFileRoutes = createLocalFileRoutes(picker ? { picker } : {});
  const templateRoutes = createTemplateRoutes(templates);
  const tableRoutes = createTableRoutes(store);
  const speechToTextRoutes = createSpeechToTextRoutes({ store, getSeam: deps.getSeam });
  const videoExtractionRoutes = createVideoExtractionRoutes({
    store,
    mediaDir,
    getSeam: deps.getSeam,
    getTool: deps.getTool,
    fetcher: deps.fetcher,
  });
  const videoDeconstructRoutes = createVideoDeconstructRoutes({
    store,
    mediaDir,
    getSeam: deps.getSeam,
    getTool: deps.getTool,
    resolveProjectFile: (workspaceId, relativePath) => assetsStore.resolveProjectFile(workspaceId, relativePath),
  });
  const videoStoryboardRoutes = createVideoStoryboardRoutes({
    store,
    mediaDir,
    getSeam: deps.getSeam,
    getTool: deps.getTool,
    resolveProjectFile: (workspaceId, relativePath) => assetsStore.resolveProjectFile(workspaceId, relativePath),
  });

  /**
   * Legacy M1 prefix compatibility: /dsh-workflow/* is rewritten (in-memory,
   * no redirect) to the canonical /omnimux-workflow/* before routing, so old
   * sessions and bookmarks keep working.
   */
  function normalizePath(path: string): string {
    if (path === LEGACY_WORKFLOW_ROUTE_PREFIX) return WORKFLOW_ROUTE_PREFIX;
    if (path.startsWith(`${LEGACY_WORKFLOW_ROUTE_PREFIX}/`)) {
      return WORKFLOW_ROUTE_PREFIX + path.slice(LEGACY_WORKFLOW_ROUTE_PREFIX.length);
    }
    return path;
  }

  async function dispatch(req: WorkflowDispatchRequest): Promise<DispatchResult> {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const method = (req.method || 'GET').toUpperCase();
      const path = normalizePath(decodeURIComponent(url.pathname));

      // ---- project shell routes (Phase 0): delegate to the project dispatcher ----
      if (projectDispatcher.owns(path)) {
        return projectDispatcher.dispatch(req);
      }

      const fromSpeechToText = await speechToTextRoutes.tryHandle(method, path, req);
      if (fromSpeechToText) return fromSpeechToText;

      const fromVideoExtraction = await videoExtractionRoutes.tryHandle(method, path, req);
      if (fromVideoExtraction) return fromVideoExtraction;

      const fromVideoDeconstruct = await videoDeconstructRoutes.tryHandle(method, path, req);
      if (fromVideoDeconstruct) return fromVideoDeconstruct;

      const fromVideoStoryboard = await videoStoryboardRoutes.tryHandle(method, path, req);
      if (fromVideoStoryboard) return fromVideoStoryboard;

      if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        try {
          assertLocalWrite(req);
        } catch {
          return { status: 403, body: { error: 'not-local', message: 'cross-origin write refused' } };
        }
      }

      // Match order matches the original monolith: bundle/manifest,
      // workspaces, SSE/control/item/collection, capabilities, media.
      const fromBundle = await Promise.resolve(staticRoutes.tryBundle(method, path, req));
      if (fromBundle) return fromBundle;
      const fromPreferences = await preferenceRoutes?.tryHandle(method, path, req);
      if (fromPreferences) return fromPreferences;
      const fromTable = await Promise.resolve(tableRoutes.tryHandle(method, path, req));
      if (fromTable) return fromTable;
      const fromWorkspace = await Promise.resolve(workspaceRoutes.tryHandle(method, path, req));
      if (fromWorkspace) return fromWorkspace;
      const fromProjectAssets = await Promise.resolve(projectAssetsRoutes.tryHandle(method, path, req));
      if (fromProjectAssets) return fromProjectAssets;
      const fromTemplates = await Promise.resolve(templateRoutes.tryHandle(method, path, req));
      if (fromTemplates) return fromTemplates;
      const fromExecution = await Promise.resolve(executionRoutes.tryHandle(method, path, req));
      if (fromExecution) return fromExecution;
      const fromCapabilities = await Promise.resolve(staticRoutes.tryCapabilities(method, path, req));
      if (fromCapabilities) return fromCapabilities;
      const fromLocalFile = await Promise.resolve(localFileRoutes.tryHandle(method, path, req));
      if (fromLocalFile) return fromLocalFile;
      const fromMedia = await Promise.resolve(mediaRoutes.tryHandle(method, path, req));
      if (fromMedia) return fromMedia;

      return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
    } catch (error) {
      if (error instanceof WorkflowStoreError) {
        const conflict = error.code === 'version_conflict';
        // M2 QA fix #5: the server version comes from the error object's
        // `current` field — no message-string regex parsing.
        return {
          status: STATUS_BY_CODE[error.code] ?? 400,
          body: {
            error: error.code,
            message: error.message,
            ...(conflict && error.current !== undefined ? { current: error.current } : {}),
          },
        };
      }
      if (error instanceof ProjectPathError) {
        return {
          status: STATUS_BY_CODE[error.code] ?? 400,
          body: { error: error.code, message: error.message },
        };
      }
      return { status: 500, body: { error: 'internal', message: messageOf(error) } };
    }
  }

  const audioRoutes = createAudioBytesRoutes(assetsStore, () => deps.getSeam?.('connection'));
  return { dispatch, handleAudioRequest: audioRoutes.handle };
}

/**
 * Mount the /omnimux-workflow prefix (plus the legacy /dsh-workflow alias)
 * on the official webServer seat. JSON results go through sendJson; file
 * results stream from disk.
 */
export function registerWorkflowRoutes(
  webServer: { register: (route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => () => void },
  dispatcher: ReturnType<typeof createWorkflowDispatcher>,
): () => void {
  const makeHandler = () => {
    return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
      try {
        if (await dispatcher.handleAudioRequest(req, res)) return;
        const method = (req.method || 'GET').toUpperCase();
        let body: unknown;
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
          body = await readJsonBody(req);
        }
        const result = await dispatcher.dispatch({
          method,
          url: req.url || `${WORKFLOW_ROUTE_PREFIX}/api/manifest`,
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
          range: header(req, 'range'),
          body,
        });
        if ('file' in result) {
          serveFile(res, result.file, 'application/octet-stream', header(req, 'range'));
          return;
        }
        if ('sse' in result) {
          // SSE stream: headers + replay log + live event forwarding. The
          // connection stays open until the client disconnects (the
          // publisher cleans up on res 'close').
          createSSEPublisher(res, result.sse.context, { replay: result.sse.eventLog });
          return;
        }
        sendJson(res, result.status, result.body ?? {});
      } catch (error) {
        if (error instanceof JsonBodyLimitError) {
          sendJson(res, STATUS_BY_CODE['body-too-large'] ?? 413, {
            error: 'body-too-large',
            message: `request body exceeds ${String(error.limit)} bytes`,
          });
          return;
        }
        sendJson(res, 500, { error: 'internal', message: 'internal error' });
      }
    };
  };

  // Canonical + legacy prefixes both dispatch into the same handler (old
  // sessions/bookmarks keep working without a redirect). Ops note: a clean
  // OmniMux restart is required for prefix changes to take effect — quit can
  // leave an old Host process behind, which serves stale routes.
  const disposers = [
    webServer.register({ kind: 'prefix', path: WORKFLOW_ROUTE_PREFIX, handler: makeHandler() }),
    webServer.register({ kind: 'prefix', path: LEGACY_WORKFLOW_ROUTE_PREFIX, handler: makeHandler() }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
