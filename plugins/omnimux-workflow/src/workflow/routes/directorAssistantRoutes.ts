import { z } from 'zod';
import { createDirectorAssistant } from '../director/directorAssistant.ts';
import { createDirectorHost } from '../director/directorHost.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { ProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';
import type { RouteTry } from './dispatch.ts';
import { getDirectorModelDependencies, verifyDirectorModel } from '../director/modelManifest.ts';
import { jsonBodyProblem } from '../../http/helpers.ts';
const analysis = z.object({ imageRef: z.string().max(1024), expectedRevision: z.number().int().positive() }).strict();
const submit = z.object({ requestId: z.string().max(120), prompt: z.string().max(8000), imageRef: z.string().max(1024).optional(), expectedRevision: z.number().int().positive() }).strict();
const task = z.object({ requestId: z.string().max(120) }).strict();
export function createDirectorAssistantRoutes(input: { store: WorkspaceStore; assetsStore: ProjectAssetsStore; getSeam?: (name: string) => unknown }) {
  const tryHandle: RouteTry = async (method, path, request) => {
    const assistant = createDirectorAssistant({ host: createDirectorHost({ store: input.store }), assetsStore: input.assetsStore, getSeam: name => input.getSeam?.(name), taskScope: request.directorTaskScope ?? (() => null), taskOwner: request.directorTaskOwner ?? (() => null) });
    const match = /^\/omnimux-workflow\/api\/workspaces\/([^/]+)\/director\/([^/]+)\/(session|model-manifest|capabilities|analyze|panorama(?:\/history|\/recover|\/cancel|\/query)?)$/.exec(path);
    if (!match) return null;
    const workspaceId = match[1]!, nodeId = match[2]!, action = match[3]!;
    if (method === 'GET' && action === 'session') return request.directorSession ? { status: 200, body: request.directorSession } : { status: 503, body: { error: 'director-session-unavailable' } };
    if (method === 'GET' && action === 'capabilities') return { status: 200, body: await assistant.capabilities(workspaceId, nodeId) };
    if (method === 'GET' && action === 'panorama/history') return { status: 200, body: assistant.panoramaHistory(workspaceId, nodeId) };
    if (method !== 'POST') return { status: 405, body: { error: 'method-not-allowed' } };
    const problem = jsonBodyProblem(request.body); if (problem) return problem;
    if (action === 'model-manifest') {
      const parsed = z.object({ reference: z.string().max(1024) }).strict().safeParse(request.body);
      if (!parsed.success) return { status: 400, body: { error: 'director-model-invalid' } };
      const projectRoot = createDirectorHost({ store: input.store }).projectRootFor(workspaceId, nodeId);
      return { status: 200, body: { resource: verifyDirectorModel({ projectRoot, reference: parsed.data.reference }), ...getDirectorModelDependencies({ projectRoot, reference: parsed.data.reference }) } };
    }
    const schema = action === 'analyze' ? analysis : action === 'panorama' ? submit : task;
    const checked = schema.safeParse(request.body);
    if (!checked.success) return { status: 400, body: { error: 'director-request-invalid' } };
    if (action === 'analyze') return { status: 200, body: await assistant.analyzeImage(workspaceId, nodeId, analysis.parse(checked.data)) };
    if (action === 'panorama') return { status: 202, body: await assistant.submitPanorama(workspaceId, nodeId, submit.parse(checked.data)) };
    const query = task.parse(checked.data);
    if (action === 'panorama/query') return { status: 200, body: assistant.queryPanorama(workspaceId, nodeId, query) };
    if (action === 'panorama/recover') return { status: 200, body: await assistant.recoverPanorama(workspaceId, nodeId, query) };
    if (action === 'panorama/cancel') return { status: 200, body: assistant.cancelPanoramaObserver(workspaceId, nodeId, query) };
    return { status: 404, body: { error: 'not-found' } };
  };
  return { tryHandle };
}
