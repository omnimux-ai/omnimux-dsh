import { closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertProjectWriteSafe, resolveProjectPaths, resolveProjectRelPath } from '../../projects/paths.ts';
import { verifyDirectorModel } from './modelManifest.ts';
import { DIRECTOR_DOCUMENT_LIMIT, directorDocumentSchema, directorSceneSchema, type DirectorDocument } from '../../shared/directorSchema.ts';

interface DirectorWorkspaceStore {
  get: (workspaceId: string) => { nodes: Array<{ id: string; type?: string }> };
  resolveProjectRoot: (workspaceId: string) => { path: string } | null;
}
export class DirectorHostError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'DirectorHostError'; this.code = code; }
}
const validId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(id);
function assertContained(path: string, root: string): void {
  try { assertProjectWriteSafe(path, root); }
  catch (error) {
    if ((error as { code?: string }).code === 'path-denied') throw new DirectorHostError('path-denied');
    throw error;
  }
}

/** One authoritative, versioned scene document per director node in its bound project. */
export function createDirectorHost({ store }: { store: DirectorWorkspaceStore }) {
  function target(workspaceId: string, nodeId: string) {
    if (!validId(workspaceId) || !validId(nodeId)) throw new DirectorHostError('invalid-id');
    const workspace = store.get(workspaceId);
    if (!workspace.nodes.some(node => node.id === nodeId && node.type === 'director')) throw new DirectorHostError('director-node-not-found');
    const project = store.resolveProjectRoot(workspaceId);
    if (!project) throw new DirectorHostError('project-required');
    const paths = resolveProjectPaths(project.path);
    const directory = join(paths.metaDir, 'director', workspaceId);
    assertContained(directory, paths.projectRoot);
    const file = join(directory, `${nodeId}.json`);
    assertContained(file, paths.projectRoot);
    return { file, directory, projectRoot: paths.projectRoot };
  }
  function readBounded(file: string): Buffer {
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd);
      if (!before.isFile()) throw new DirectorHostError('director-invalid-document');
      if (before.size > DIRECTOR_DOCUMENT_LIMIT) throw new DirectorHostError('director-document-budget');
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!count) throw new DirectorHostError('director-invalid-document');
        offset += count;
      }
      const after = fstatSync(fd);
      if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
        || after.mtimeMs !== before.mtimeMs) throw new DirectorHostError('director-invalid-document');
      return bytes;
    } finally { closeSync(fd); }
  }
  function read(workspaceId: string, nodeId: string, file: string): DirectorDocument | null {
    if (!existsSync(file)) return null;
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBounded(file)));
    } catch (error) {
      if (error instanceof DirectorHostError) throw error;
      throw new DirectorHostError('director-invalid-document');
    }
    const parsed = directorDocumentSchema.safeParse(value);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId || parsed.data.nodeId !== nodeId) throw new DirectorHostError('director-invalid-document');
    return parsed.data;
  }
  function assertResourceReferences(scene: DirectorDocument['scene'], projectRoot: string): void {
    for (const object of scene.objects) {
      if (object.kind === 'model') {
        const reference = object.storageKey || object.url;
        if (!reference) throw new DirectorHostError('director-model-unconfirmed');
        verifyDirectorModel({ projectRoot, reference });
      }
    }
    const references = [scene.panorama?.url, scene.panorama?.storageKey,
      ...scene.objects.flatMap(item => [item.url, item.storageKey]),
      ...scene.shots.flatMap(shot => (shot.screenshots ?? []).flatMap(item => [item.url, item.storageKey]))];
    for (const reference of references) {
      if (!reference) continue;
      if (reference.startsWith('/omnimux-workflow/director-assets/')) {
        if (!['quaternius-standard-male.glb', 'quaternius-standard-female.glb'].includes(reference.split('/').at(-1) ?? '')) throw new DirectorHostError('director-invalid-scene');
        continue;
      }
      const file = resolveProjectRelPath(projectRoot, reference);
      assertContained(file, projectRoot);
      if (!existsSync(file) || !statSync(file).isFile()) throw new DirectorHostError('director-resource-not-found');
    }
  }
  return {
    projectRootFor(workspaceId: string, nodeId: string): string {
      return target(workspaceId, nodeId).projectRoot;
    },
    getScene(workspaceId: string, nodeId: string): DirectorDocument {
      const location = target(workspaceId, nodeId);
      const document = read(workspaceId, nodeId, location.file);
      if (!document) throw new DirectorHostError('director-scene-not-found');
      assertResourceReferences(document.scene, location.projectRoot);
      return document;
    },
    saveScene(workspaceId: string, nodeId: string, input: { expectedRevision: number; scene: unknown }): DirectorDocument {
      if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new DirectorHostError('version-required');
      const parsed = directorSceneSchema.safeParse(input.scene);
      if (!parsed.success) throw new DirectorHostError('director-invalid-scene');
      const location = target(workspaceId, nodeId);
      assertResourceReferences(parsed.data, location.projectRoot);
      const current = read(workspaceId, nodeId, location.file);
      if ((current?.revision ?? 0) !== input.expectedRevision) throw new DirectorHostError('version_conflict');
      const document: DirectorDocument = { schemaVersion: 1, workspaceId, nodeId, revision: input.expectedRevision + 1, scene: parsed.data };
      const text = JSON.stringify(document);
      if (Buffer.byteLength(text) > DIRECTOR_DOCUMENT_LIMIT) throw new DirectorHostError('director-document-budget');
      assertContained(location.directory, location.projectRoot);
      mkdirSync(location.directory, { recursive: true });
      assertContained(location.directory, location.projectRoot);
      const temporary = join(location.directory, `.${nodeId}.${randomUUID()}.tmp`);
      assertContained(temporary, location.projectRoot);
      try {
        writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        assertContained(location.file, location.projectRoot);
        renameSync(temporary, location.file);
      } finally {
        if (existsSync(temporary)) { assertContained(temporary, location.projectRoot); unlinkSync(temporary); }
      }
      const confirmed = read(workspaceId, nodeId, location.file);
      if (!confirmed || confirmed.revision !== document.revision) throw new DirectorHostError('director-save-unconfirmed');
      return confirmed;
    },
  };
}
export type DirectorHost = ReturnType<typeof createDirectorHost>;
