import type { IncomingMessage, ServerResponse } from 'node:http';
import { header, sendJson } from '../../http/helpers.ts';
import { assertAudioRequestOrigin } from './audioBytesRoutes.ts';
import { createDirectorHost } from '../director/directorHost.ts';
import { importDirectorModel } from '../director/modelImport.ts';
import { DIRECTOR_MEDIA_LIMIT, persistDirectorMedia, type DirectorMediaInspector } from '../director/directorMedia.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { ProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';

export function createDirectorBytesRoutes(input: { store: WorkspaceStore; assetsStore: ProjectAssetsStore; getSeam?: (name: string) => unknown }) {
  const host = createDirectorHost({ store: input.store });
  const active = new Set<string>();
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const path = url.pathname.replace(/^\/dsh-workflow(?=\/)/, '/omnimux-workflow');
    const match = /^\/omnimux-workflow\/api\/workspaces\/([A-Za-z0-9_-]+)\/director\/([A-Za-z0-9_-]+)\/(model|media\/(?:image|video))$/.exec(path);
    if (!match) return false;
    const workspaceId = match[1]!, nodeId = match[2]!, model = match[3] === 'model', kind = match[3]?.endsWith('/video') ? 'video' : 'image';
    const key = `${workspaceId}/${nodeId}`;
    let claimed = false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(() => { controller.abort(); request.destroy(new Error('director-upload-timeout')); }, 60000);
    try {
      if (request.method !== 'POST') throw Object.assign(new Error('method-not-allowed'), { code: 'method-not-allowed' });
      const connection = input.getSeam?.('connection') as { requestRejection?: (req: IncomingMessage) => number | undefined } | undefined;
      if (typeof connection?.requestRejection !== 'function') throw Object.assign(new Error('auth-unavailable'), { code: 'auth-unavailable' });
      const rejection = connection.requestRejection(request);
      if (rejection !== undefined) { sendJson(response, rejection, { error: 'unauthorized' }); return true; }
      assertAudioRequestOrigin(request);
      if (url.search || header(request, 'content-type') !== 'application/octet-stream' || header(request, 'content-encoding')) throw Object.assign(new Error('director-media-invalid'), { code: 'director-media-invalid' });
      const rawRevision = header(request, 'x-director-revision');
      if (!rawRevision || !/^\d+$/.test(rawRevision)) throw Object.assign(new Error('version-required'), { code: 'version-required' });
      const expectedRevision = Number(rawRevision);
      if (host.getScene(workspaceId, nodeId).revision !== expectedRevision) throw Object.assign(new Error('version_conflict'), { code: 'version_conflict' });
      const projectRoot = host.projectRootFor(workspaceId, nodeId);
      let modelFiles: Array<{ name: string; bytes: number }> = [];
      if (model) {
        const manifest = header(request, 'x-director-files');
        if (!manifest || manifest.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(manifest)) throw Object.assign(new Error('director-model-invalid'), { code: 'director-model-invalid' });
        const parsed = JSON.parse(Buffer.from(manifest, 'base64').toString('utf8'));
        if (!Array.isArray(parsed) || !parsed.length || parsed.length > 32 || parsed.some(item => !item || typeof item.name !== 'string' || !Number.isSafeInteger(item.bytes) || item.bytes <= 0)) throw Object.assign(new Error('director-model-invalid'), { code: 'director-model-invalid' });
        modelFiles = parsed;
      }
      const inspector = input.getSeam?.('mediaInspect') as DirectorMediaInspector | undefined;
      if (!model && typeof inspector?.inspect !== 'function') throw Object.assign(new Error('media-inspect-unavailable'), { code: 'media-inspect-unavailable' });
      if (active.size >= 2 || active.has(key)) throw Object.assign(new Error('director-media-busy'), { code: 'director-media-busy' });
      active.add(key); claimed = true;
      request.once('aborted', abort); response.once('close', abort);
      const limit = model ? 64 * 1024 * 1024 : kind === 'image' ? 16 * 1024 * 1024 : DIRECTOR_MEDIA_LIMIT;
      const length = header(request, 'content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw Object.assign(new Error('director-media-budget'), { code: 'director-media-budget' });
      let total = 0; const chunks: Buffer[] = [];
      for await (const chunk of request) {
        controller.signal.throwIfAborted();
        const bytes = Buffer.from(chunk); total += bytes.length;
        if (total > limit) throw Object.assign(new Error('director-media-budget'), { code: 'director-media-budget' });
        chunks.push(bytes);
      }
      let resource;
      if (model) {
        if (modelFiles.reduce((sum, file) => sum + file.bytes, 0) !== total) throw Object.assign(new Error('director-model-invalid'), { code: 'director-model-invalid' });
        const bytes = Buffer.concat(chunks); let offset = 0;
        const files = modelFiles.map(file => { const content = bytes.subarray(offset, offset + file.bytes); offset += file.bytes; return { name: file.name, bytes: content }; });
        if (host.getScene(workspaceId, nodeId).revision !== expectedRevision || host.projectRootFor(workspaceId, nodeId) !== projectRoot) throw Object.assign(new Error('version_conflict'), { code: 'version_conflict' });
        resource = await importDirectorModel({ projectRoot, files, signal: controller.signal,
          trustedInspect: typeof inspector?.inspect === 'function' ? async options => ({ type: 'image', ...await inspector.inspect({ ...options, signal: options.signal ?? controller.signal }) }) : undefined });
        if (host.getScene(workspaceId, nodeId).revision !== expectedRevision || host.projectRootFor(workspaceId, nodeId) !== projectRoot) throw Object.assign(new Error('version_conflict'), { code: 'version_conflict' });
      } else resource = await persistDirectorMedia({ host, assetsStore: input.assetsStore, inspector: inspector!, workspaceId, nodeId, kind,
        bytes: Buffer.concat(chunks), signal: controller.signal, expectedRevision });
      if (!controller.signal.aborted) sendJson(response, 201, { resource });
    } catch (error) {
      const code = typeof (error as { code?: unknown }).code === 'string' ? String((error as { code: string }).code) : 'director-media-save-failed';
      const status: Record<string, number> = { 'method-not-allowed': 405, 'auth-unavailable': 503, 'media-inspect-unavailable': 503, 'director-media-budget': 413, 'director-media-busy': 409, 'version_conflict': 409,
        'path-denied': 403, 'not-local': 403, 'director-node-not-found': 404, 'director-scene-not-found': 404, 'project-required': 400, 'version-required': 400, 'director-media-invalid': 415, 'director-model-invalid': 415, 'director-model-budget': 413,
        'director-model-path-denied': 403, 'director-model-missing-sidecar': 400, 'director-model-duplicate-file': 400,
        'director-model-unreferenced-sidecar': 400, 'director-model-unsupported-extension': 415, 'director-model-unsupported-sparse': 415 };
      if (!response.destroyed && !response.headersSent) sendJson(response, status[code] ?? 500, { error: code });
    } finally {
      clearTimeout(timer); request.removeListener('aborted', abort); response.removeListener('close', abort);
      if (claimed) active.delete(key);
    }
    return true;
  }
  return { handle };
}
