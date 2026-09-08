/**
 * Project-private assets.json REST (GET/PUT + mkdir/ingest).
 * `POST .../assets/index` forwards to ingest (physical copy).
 * Mounted after workspace CRUD and before execution routes so
 * `/workspaces/:id/assets` is not swallowed by `/workspaces/:id`.
 */
import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { assertLocalWrite, jsonBodyProblem } from '../../http/helpers.ts';
import { audioFileAction, AudioFileActionError, type AudioFileActionDeps } from '../audioFileAction.ts';
import type {
  IngestProjectAssetsPayload,
  InstantiateProjectAssetsPayload,
  MkdirProjectAssetsPayload,
  PromoteProjectAssetsPayload,
  SaveProjectAssetsPayload,
} from '../../shared/projectAssets.ts';
import type { ProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';
import { notFound, type RouteTry, type WorkflowDispatchRequest } from './dispatch.ts';

export function createProjectAssetsRoutes(store: ProjectAssetsStore, audioDeps: AudioFileActionDeps = {}): { tryHandle: RouteTry } {
  const assetsRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/assets$`);
  const mkdirRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/assets/mkdir$`);
  const ingestRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/assets/ingest$`);
  const indexRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/assets/index$`);
  const instantiateRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/assets/instantiate$`);
  const promoteRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/assets/promote$`);
  const fileRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/file$`);
  const aliasFilePath = `${WORKFLOW_ROUTE_PREFIX}/api/project-file`;
  const audioActionRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/audio-file-action$`);

  const tryHandle: RouteTry = async (method, path, req: WorkflowDispatchRequest) => {
    const audioActionMatch = audioActionRe.exec(path);
    if (audioActionMatch) {
      if (method !== 'POST') return notFound();
      try { assertLocalWrite(req); } catch {
        return { status: 403, body: { error: 'not-local' } };
      }
      const problem = jsonBodyProblem(req.body);
      if (problem) return problem;
      try {
        await audioFileAction(store, decodeURIComponent(audioActionMatch[1] ?? ''), req.body as { action?: unknown; relativePath?: unknown }, audioDeps);
        return { status: 200, body: { ok: true } };
      } catch (error) {
        if (error instanceof AudioFileActionError) return { status: error.status, body: { error: error.code } };
        throw error;
      }
    }

    const mkdirMatch = mkdirRe.exec(path);
    if (mkdirMatch) {
      if (method !== 'POST') return notFound();
      const problem = jsonBodyProblem(req.body);
      if (problem) return problem;
      const body = req.body as MkdirProjectAssetsPayload;
      const assets = store.mkdir(mkdirMatch[1] ?? '', body);
      return { status: 200, body: { assets } };
    }

    const ingestMatch = ingestRe.exec(path) ?? indexRe.exec(path);
    if (ingestMatch) {
      if (method !== 'POST') return notFound();
      const problem = jsonBodyProblem(req.body);
      if (problem) return problem;
      const body = req.body as IngestProjectAssetsPayload;
      const assets = await store.ingest(ingestMatch[1] ?? '', body);
      return { status: 200, body: { assets } };
    }

    const instantiateMatch = instantiateRe.exec(path);
    if (instantiateMatch) {
      if (method !== 'POST') return notFound();
      const problem = jsonBodyProblem(req.body);
      if (problem) return problem;
      const body = req.body as InstantiateProjectAssetsPayload;
      const assets = await store.instantiate(instantiateMatch[1] ?? '', body);
      return { status: 200, body: { assets } };
    }

    const promoteMatch = promoteRe.exec(path);
    if (promoteMatch) {
      if (method !== 'POST') return notFound();
      const problem = jsonBodyProblem(req.body);
      if (problem) return problem;
      const body = req.body as PromoteProjectAssetsPayload;
      const promoted = await store.promote(promoteMatch[1] ?? '', body);
      return { status: 200, body: promoted };
    }

    if (method === 'GET' && (fileRe.test(path) || path === aliasFilePath)) {
      const url = new URL(req.url, 'http://127.0.0.1');
      const fromPath = fileRe.exec(path)?.[1];
      const workspaceId = fromPath || url.searchParams.get('workspace') || '';
      const rel = url.searchParams.get('rel') || '';
      const file = store.resolveProjectFile(workspaceId, rel);
      return { status: 200, file };
    }

    const assetsMatch = assetsRe.exec(path);
    if (assetsMatch) {
      const id = assetsMatch[1] ?? '';
      if (method === 'GET') {
        return { status: 200, body: { assets: store.get(id) } };
      }
      if (method === 'PUT') {
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const payload = req.body as SaveProjectAssetsPayload;
        if (typeof payload.expectedRev !== 'number') {
          return {
            status: 400,
            body: { error: 'version-required', message: 'expectedRev is required for saves' },
          };
        }
        const assets = store.save(id, payload);
        return { status: 200, body: { assets } };
      }
      return notFound();
    }

    return null;
  };

  return { tryHandle };
}
