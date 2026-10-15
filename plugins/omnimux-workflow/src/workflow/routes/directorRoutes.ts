import { assertLocalWrite, jsonBodyProblem } from '../../http/helpers.ts';
import { createDirectorHost, DirectorHostError } from '../director/directorHost.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { RouteTry } from './dispatch.ts';

export function createDirectorRoutes(store: WorkspaceStore, ensureProjectBound?: (workspaceId: string, title?: string) => Promise<unknown>): { tryHandle: RouteTry } {
  const host = createDirectorHost({ store });
  const tryHandle: RouteTry = async (method, path, request) => {
    const match = /^\/omnimux-workflow\/api\/workspaces\/([^/]+)\/director\/([^/]+)$/.exec(path);
    if (!match) return null;
    try {
      if (method === 'GET') return { status: 200, body: { document: host.getScene(match[1]!, match[2]!) } };
      if (method !== 'PUT') return { status: 405, body: { error: 'method-not-allowed' } };
      assertLocalWrite(request);
      const problem = jsonBodyProblem(request.body);
      if (problem) return problem;
      const body = request.body as { expectedRevision: number; scene: unknown };
      const workspace = store.get(match[1]!);
      if (!workspace.nodes.some(node => node.id === match[2] && node.type === 'director')) throw new DirectorHostError('director-node-not-found');
      if (!store.resolveProjectRoot(match[1]!) && ensureProjectBound) await ensureProjectBound(match[1]!, workspace.name);
      const document = host.saveScene(match[1]!, match[2]!, body);
      return { status: 200, body: { document } };
    } catch (error) {
      if (error instanceof DirectorHostError) {
        const statuses: Record<string, number> = { 'version_conflict': 409, 'director-node-not-found': 404, 'director-scene-not-found': 404, 'project-required': 400, 'path-denied': 403, 'director-document-budget': 413 };
        return { status: statuses[error.code] ?? 400, body: { error: error.code } };
      }
      throw error;
    }
  };
  return { tryHandle };
}
