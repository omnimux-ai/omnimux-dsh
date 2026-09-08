/**
 * ProjectAssetsStore: assets.json CRUD + independent optimistic lock.
 *
 * Layout: `<ProjectRoot>/.omnimux/assets.json`. Canvas DAG lives under
 * `<ProjectRoot>/.omnimux/canvases/<id>.json` once bound (T03).
 * GET of a missing / corrupt file returns an empty document (rev:0), not 404.
 * Writes are atomic (tmp-pid-ts + rename). Ingest copies; never unlinks user sources.
 */
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { ingestAudioBytes } from '../ingest/AudioBytesIngest.ts';
import type { AudioBytesResponse } from '../../shared/projectAssets.ts';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { materialTypeFromFilename } from '../../shared/localMedia.ts';
import {
  emptyProjectAssetsDocument,
  forbiddenRelativePathCode,
  forbiddenSourcePathCode,
  isProjectAssetFileType,
  normalizeParentId,
  PROJECT_ASSETS_SCHEMA_VERSION,
  validateFolderName,
  type IngestProjectAssetsPayload,
  type InstantiateProjectAssetsPayload,
  type MkdirProjectAssetsPayload,
  type ProjectAssetFileType,
  type ProjectAssetsDocument,
  type ProjectAssetsFolder,
  type ProjectAssetsItem,
  type PromoteProjectAssetsPayload,
  type SaveProjectAssetsPayload,
} from '../../shared/projectAssets.ts';
import {
  assertProjectWriteSafe,
  resolveProjectPaths,
  resolveProjectRelPath,
} from '../../projects/paths.ts';
import { copyFileIntoImported, copyPathIntoDir } from '../ingest/IngestionPipeline.ts';
import { WorkflowStoreError } from './WorkflowStoreError.ts';
import { canvasExistsOnDisk } from './WorkspaceStore.ts';

export interface ProjectRootRecord {
  path: string;
}

export type ResolveProjectRoot = (workspaceId: string) => ProjectRootRecord | null;

export interface LibraryFileRef {
  id?: string;
  relative_path?: string;
  real_path?: string;
  original_name?: string;
  kind?: string;
  visible?: boolean;
}

export interface LibraryAssetDetail {
  id: string;
  name?: string;
  files?: LibraryFileRef[];
}

export type FetchLibraryDetail = (id: string) => Promise<LibraryAssetDetail | null>;
export type PromoteToLibrary = (payload: {
  name: string;
  type?: string;
  files: Array<{ real_path: string }>;
}) => Promise<unknown>;

export interface ProjectAssetsStore {
  get(workspaceId: string): ProjectAssetsDocument;
  save(workspaceId: string, payload: SaveProjectAssetsPayload): ProjectAssetsDocument;
  mkdir(workspaceId: string, payload: MkdirProjectAssetsPayload): ProjectAssetsDocument;
  ingest(workspaceId: string, payload: IngestProjectAssetsPayload): Promise<ProjectAssetsDocument>;
  ingestAudio(workspaceId: string, source: Readable, signal: AbortSignal): Promise<AudioBytesResponse>;
  /** Deprecated alias — forwards to ingest (physical copy). */
  index(workspaceId: string, payload: IngestProjectAssetsPayload): Promise<ProjectAssetsDocument>;
  instantiate(workspaceId: string, payload: InstantiateProjectAssetsPayload): Promise<ProjectAssetsDocument>;
  promote(workspaceId: string, payload: PromoteProjectAssetsPayload): Promise<{ asset: unknown }>;
  registerGenerated(workspaceId: string, payload: RegisterGeneratedAssetPayload): ProjectAssetsDocument;
  resolveProjectFile(workspaceId: string, rel: string): string;
}

export interface RegisterGeneratedAssetPayload {
  relative_path: string;
  name: string;
  type?: ProjectAssetFileType;
  /** Byte size when known; omit / null when unknown (never invent 0). */
  size?: number | null;
  /** Canonical MIME; null/omit when unknown. */
  mimeType?: string | null;
  /** Duration seconds for AV; null/omit when unknown. */
  durationSec?: number | null;
  lineage?: unknown;
}

function isWorkspaceId(id: string): boolean {
  return /^ws_[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function newFolderId(): string {
  return `fld_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function newItemId(): string {
  return `ast_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fileTypeOf(name: string): ProjectAssetFileType {
  const material = materialTypeFromFilename(name);
  if (material === 'image' || material === 'video' || material === 'audio') return material;
  return 'doc';
}

function persistableItem(item: ProjectAssetsItem): ProjectAssetsItem {
  const next: ProjectAssetsItem = {
    id: item.id,
    name: item.name,
    type: item.type,
    parentId: item.parentId,
    relative_path: item.relative_path,
    updatedAt: item.updatedAt,
  };
  if (typeof item.size === 'number' && Number.isFinite(item.size)) next.size = item.size;
  if (typeof item.mimeType === 'string' || item.mimeType === null) next.mimeType = item.mimeType;
  if (typeof item.durationSec === 'number' || item.durationSec === null) next.durationSec = item.durationSec;
  if (typeof item.sizeBytes === 'number' || item.sizeBytes === null) next.sizeBytes = item.sizeBytes;
  if (item.lineage != null) next.lineage = item.lineage;
  if (item.snapshot?.globalSubjectId) next.snapshot = { globalSubjectId: item.snapshot.globalSubjectId };
  return next;
}

function hydrateFolder(row: unknown): ProjectAssetsFolder | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const rec = row as Record<string, unknown>;
  if (typeof rec.id !== 'string' || rec.id.trim() === '') return null;
  const named = validateFolderName(rec.name);
  if (!named.ok) return null;
  const folder: ProjectAssetsFolder = {
    id: rec.id,
    name: named.name,
    parentId: normalizeParentId(rec.parentId),
    updatedAt: asNumber(rec.updatedAt, 0),
  };
  if (typeof rec.real_path === 'string' && rec.real_path.trim() !== '') {
    folder.real_path = rec.real_path;
  }
  return folder;
}

function hydrateItem(row: unknown): ProjectAssetsItem | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const rec = row as Record<string, unknown>;
  if (typeof rec.id !== 'string' || rec.id.trim() === '') return null;
  if (typeof rec.name !== 'string' || rec.name.trim() === '') return null;
  const relative = typeof rec.relative_path === 'string' ? rec.relative_path.trim() : '';
  const legacy = typeof rec.real_path === 'string' ? rec.real_path.trim() : '';
  if (!relative && !legacy) return null;
  const type = isProjectAssetFileType(rec.type) ? rec.type : fileTypeOf(rec.name);
  const item: ProjectAssetsItem = {
    id: rec.id,
    name: rec.name.trim(),
    type,
    parentId: normalizeParentId(rec.parentId),
    relative_path: relative,
    updatedAt: asNumber(rec.updatedAt, 0),
  };
  if (typeof rec.size === 'number' && Number.isFinite(rec.size)) item.size = rec.size;
  else if (rec.size === null) item.size = null;
  if (typeof rec.sizeBytes === 'number' && Number.isFinite(rec.sizeBytes)) {
    item.sizeBytes = rec.sizeBytes;
    if (item.size === undefined) item.size = rec.sizeBytes;
  } else if (rec.sizeBytes === null) {
    item.sizeBytes = null;
  } else if (typeof item.size === 'number') {
    item.sizeBytes = item.size;
  }
  if (typeof rec.mimeType === 'string' && rec.mimeType.trim()) {
    const mime = rec.mimeType.trim();
    item.mimeType =
      mime.toLowerCase() === 'unknown' || mime === 'application/octet-stream' ? null : mime;
  } else if (rec.mimeType === null) {
    item.mimeType = null;
  }
  if (typeof rec.durationSec === 'number' && Number.isFinite(rec.durationSec)) {
    item.durationSec = rec.durationSec;
  } else if (rec.durationSec === null) {
    item.durationSec = null;
  }
  if (rec.lineage != null) item.lineage = rec.lineage;
  if (rec.snapshot && typeof rec.snapshot === 'object' && !Array.isArray(rec.snapshot)) {
    const snap = rec.snapshot as Record<string, unknown>;
    if (typeof snap.globalSubjectId === 'string' && snap.globalSubjectId.trim()) {
      item.snapshot = { globalSubjectId: snap.globalSubjectId.trim() };
    }
  }
  if (!relative && legacy) item.real_path = legacy;
  return item;
}

function readAssetsFile(filePath: string): ProjectAssetsDocument {
  if (!existsSync(filePath)) return emptyProjectAssetsDocument();
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return emptyProjectAssetsDocument();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProjectAssetsDocument();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyProjectAssetsDocument();
  }
  const rec = parsed as Record<string, unknown>;
  const folders = Array.isArray(rec.folders)
    ? rec.folders.map(hydrateFolder).filter((row): row is ProjectAssetsFolder => row !== null)
    : [];
  const items = Array.isArray(rec.items)
    ? rec.items.map(hydrateItem).filter((row): row is ProjectAssetsItem => row !== null)
    : [];
  return {
    schemaVersion: PROJECT_ASSETS_SCHEMA_VERSION,
    rev: asNumber(rec.rev, 0),
    folders,
    items,
  };
}

function parentExists(doc: ProjectAssetsDocument, parentId: string | null): boolean {
  if (parentId === null) return true;
  return doc.folders.some((folder) => folder.id === parentId);
}

function siblingFolderConflict(
  folders: ProjectAssetsFolder[],
  parentId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  return folders.some(
    (folder) =>
      folder.parentId === parentId
      && folder.name === name
      && folder.id !== exceptId,
  );
}

function assertRelativeLedgerPath(path: string, field: string): void {
  const code = forbiddenRelativePathCode(path);
  if (code === 'blob-url-forbidden') {
    throw new WorkflowStoreError('blob-url-forbidden', `${field} must not be a blob: URL`);
  }
  if (code === 'path-denied') {
    throw new WorkflowStoreError('path-denied', `${field} must be a project-relative POSIX path`);
  }
  if (code === 'invalid-path') {
    throw new WorkflowStoreError('invalid-path', `${field} must be a project-relative POSIX path`);
  }
}

function assertWritableDocument(next: ProjectAssetsDocument): void {
  const folderIds = new Set<string>();
  for (const folder of next.folders) {
    const named = validateFolderName(folder.name);
    if (!named.ok) {
      throw new WorkflowStoreError(named.code, named.message);
    }
    if (folderIds.has(folder.id)) {
      throw new WorkflowStoreError('invalid-id', `duplicate folder id ${folder.id}`);
    }
    folderIds.add(folder.id);
    if (folder.real_path) {
      const code = forbiddenSourcePathCode(folder.real_path);
      if (code) throw new WorkflowStoreError(code, `folder.real_path is invalid`);
    }
  }
  for (const folder of next.folders) {
    if (folder.parentId && !folderIds.has(folder.parentId)) {
      throw new WorkflowStoreError('invalid-id', `folder parent ${folder.parentId} does not exist`);
    }
  }
  const seenNames = new Map<string, Set<string>>();
  for (const folder of next.folders) {
    const key = folder.parentId ?? '';
    const bucket = seenNames.get(key) ?? new Set<string>();
    if (bucket.has(folder.name)) {
      throw new WorkflowStoreError('name-conflict', `folder name already exists at this level: ${folder.name}`);
    }
    bucket.add(folder.name);
    seenNames.set(key, bucket);
  }

  const itemIds = new Set<string>();
  for (const item of next.items) {
    if (itemIds.has(item.id)) {
      throw new WorkflowStoreError('invalid-id', `duplicate item id ${item.id}`);
    }
    itemIds.add(item.id);
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new WorkflowStoreError('name-invalid', 'item name is required');
    }
    if (!isProjectAssetFileType(item.type)) {
      throw new WorkflowStoreError('invalid-path', `unknown item type ${String(item.type)}`);
    }
    if (item.parentId && !folderIds.has(item.parentId)) {
      throw new WorkflowStoreError('invalid-id', `item parent ${item.parentId} does not exist`);
    }
    const relative = typeof item.relative_path === 'string' ? item.relative_path.trim() : '';
    if (relative) {
      assertRelativeLedgerPath(relative, 'item.relative_path');
      continue;
    }
    if (item.real_path) {
      const code = forbiddenSourcePathCode(item.real_path);
      if (code === 'blob-url-forbidden') {
        throw new WorkflowStoreError(code, 'item.real_path is invalid');
      }
      if (code) throw new WorkflowStoreError(code, 'item.real_path is invalid');
      continue;
    }
    throw new WorkflowStoreError('invalid-path', 'item.relative_path is required');
  }
}

function persist(
  filePath: string,
  current: ProjectAssetsDocument,
  next: { folders: ProjectAssetsFolder[]; items: ProjectAssetsItem[] },
): ProjectAssetsDocument {
  assertWritableDocument({
    schemaVersion: PROJECT_ASSETS_SCHEMA_VERSION,
    rev: current.rev + 1,
    folders: next.folders,
    items: next.items,
  });
  const document: ProjectAssetsDocument = {
    schemaVersion: PROJECT_ASSETS_SCHEMA_VERSION,
    rev: current.rev + 1,
    folders: next.folders,
    items: next.items.map(persistableItem).filter((item) => item.relative_path.trim() !== ''),
  };
  atomicWriteJson(filePath, document);
  return document;
}

function assertExpectedRev(current: ProjectAssetsDocument, expectedRev: unknown): void {
  if (typeof expectedRev !== 'number') return;
  if (expectedRev !== current.rev) {
    throw new WorkflowStoreError(
      'version_conflict',
      `assets moved on: expected ${String(expectedRev)}, current ${String(current.rev)}`,
      { current: current.rev },
    );
  }
}

export function createProjectAssetsStore(opts: {
  workspacesDir: string;
  resolveProjectRoot: ResolveProjectRoot;
  fetchLibraryDetail?: FetchLibraryDetail;
  promoteToLibrary?: PromoteToLibrary;
}): ProjectAssetsStore {
  const { workspacesDir, resolveProjectRoot, fetchLibraryDetail, promoteToLibrary } = opts;

  function requireWorkspaceId(id: string): string {
    if (!isWorkspaceId(id)) {
      throw new WorkflowStoreError('invalid-id', `invalid workspace id ${id}`);
    }
    return id;
  }

  function requireBoundProject(id: string): { projectRoot: string; assetsFile: string } {
    const workspaceId = requireWorkspaceId(id);
    const bound = resolveProjectRoot(workspaceId);
    const hasCanvas = canvasExistsOnDisk({
      workspacesDir,
      workspaceId,
      resolveProjectRoot,
    });
    if (!bound) {
      if (!hasCanvas) {
        throw new WorkflowStoreError('workspace-not-found', `workspace ${workspaceId} not found`);
      }
      throw new WorkflowStoreError('project-required', `workspace ${workspaceId} is not bound to a local project`);
    }
    if (!hasCanvas) {
      throw new WorkflowStoreError('workspace-not-found', `workspace ${workspaceId} not found`);
    }
    const paths = resolveProjectPaths(bound.path);
    return { projectRoot: paths.projectRoot, assetsFile: paths.assetsFile };
  }

  function load(id: string): { current: ProjectAssetsDocument; filePath: string; projectRoot: string } {
    const bound = requireBoundProject(id);
    return {
      current: readAssetsFile(bound.assetsFile),
      filePath: bound.assetsFile,
      projectRoot: bound.projectRoot,
    };
  }

  async function ingest(workspaceId: string, payload: IngestProjectAssetsPayload): Promise<ProjectAssetsDocument> {
    const { current, filePath, projectRoot } = load(workspaceId);
    assertExpectedRev(current, payload.expectedRev);
    if (!Array.isArray(payload.paths)) {
      throw new WorkflowStoreError('invalid-json', 'paths must be an array');
    }
    const parentId = normalizeParentId(payload.parentId);
    if (!parentExists(current, parentId)) {
      throw new WorkflowStoreError('invalid-id', 'parent folder does not exist');
    }
    const now = Date.now();
    const stagedItems: ProjectAssetsItem[] = [];
    const seenRelative = new Set<string>();
    for (const raw of payload.paths) {
      if (typeof raw !== 'string') {
        throw new WorkflowStoreError('invalid-path', 'path must be a string');
      }
      const sourceCode = forbiddenSourcePathCode(raw);
      if (sourceCode) {
        throw new WorkflowStoreError(sourceCode, 'source path is invalid');
      }
      const copied = await copyFileIntoImported({ projectRoot, sourceAbs: raw });
      if (seenRelative.has(copied.relativePath)) continue;
      seenRelative.add(copied.relativePath);
      stagedItems.push({
        id: newItemId(),
        name: copied.name,
        type: fileTypeOf(copied.name),
        parentId,
        relative_path: copied.relativePath,
        size: copied.size,
        updatedAt: now,
      });
    }
    // The copy crossed awaits: reload the latest ledger, merge newly imported items, then persist.
    const latest = load(workspaceId);
    if (latest.projectRoot !== projectRoot || latest.filePath !== filePath) {
      throw new WorkflowStoreError('path-denied', 'workspace project changed');
    }
    assertProjectWriteSafe(join(latest.projectRoot, '.omnimux'), latest.projectRoot);
    assertProjectWriteSafe(latest.filePath, latest.projectRoot);
    if (!parentExists(latest.current, parentId)) {
      throw new WorkflowStoreError('invalid-id', 'parent folder does not exist');
    }
    const existingRel = new Set(latest.current.items.map((item) => item.relative_path).filter(Boolean));
    const mergedItems = [...latest.current.items];
    for (const item of stagedItems) {
      if (!existingRel.has(item.relative_path)) {
        existingRel.add(item.relative_path);
        mergedItems.push(item);
      }
    }
    return persist(latest.filePath, latest.current, { folders: latest.current.folders, items: mergedItems });
  }

  function resolveFile(workspaceId: string, rel: string): string {
    const { projectRoot } = load(workspaceId);
    const abs = resolveProjectRelPath(projectRoot, rel);
    assertProjectWriteSafe(abs, projectRoot);
    if (!existsSync(abs)) {
      throw new WorkflowStoreError('not-found', `file not found: ${rel}`);
    }
    let st;
    try {
      st = statSync(abs);
    } catch {
      throw new WorkflowStoreError('not-found', `file not found: ${rel}`);
    }
    if (!st.isFile()) {
      throw new WorkflowStoreError('not-a-file', 'path is not a regular file');
    }
    return abs;
  }

  return {
    get(workspaceId: string): ProjectAssetsDocument {
      return load(workspaceId).current;
    },

    save(workspaceId: string, payload: SaveProjectAssetsPayload): ProjectAssetsDocument {
      const { current, filePath } = load(workspaceId);
      if (typeof payload.expectedRev !== 'number') {
        throw new WorkflowStoreError('version-required', 'expectedRev is required for saves');
      }
      assertExpectedRev(current, payload.expectedRev);
      if (!Array.isArray(payload.folders) || !Array.isArray(payload.items)) {
        throw new WorkflowStoreError('invalid-json', 'folders and items must be arrays');
      }
      return persist(filePath, current, {
        folders: payload.folders,
        items: payload.items,
      });
    },

    mkdir(workspaceId: string, payload: MkdirProjectAssetsPayload): ProjectAssetsDocument {
      const { current, filePath } = load(workspaceId);
      assertExpectedRev(current, payload.expectedRev);
      const named = validateFolderName(payload.name);
      if (!named.ok) {
        throw new WorkflowStoreError(named.code, named.message);
      }
      const parentId = normalizeParentId(payload.parentId);
      if (!parentExists(current, parentId)) {
        throw new WorkflowStoreError('invalid-id', 'parent folder does not exist');
      }
      if (siblingFolderConflict(current.folders, parentId, named.name)) {
        throw new WorkflowStoreError('name-conflict', `folder name already exists at this level: ${named.name}`);
      }
      const folder: ProjectAssetsFolder = {
        id: newFolderId(),
        name: named.name,
        parentId,
        updatedAt: Date.now(),
      };
      return persist(filePath, current, {
        folders: [...current.folders, folder],
        items: current.items,
      });
    },

    ingest,

    async ingestAudio(workspaceId: string, source: Readable, signal: AbortSignal): Promise<AudioBytesResponse> {
      const bound = requireBoundProject(workspaceId);
      return ingestAudioBytes({
        projectRoot: bound.projectRoot, source, signal,
        register(audio) {
          signal.throwIfAborted();
          // The stream crossed awaits: reload, then append and persist synchronously.
          const { current, filePath, projectRoot } = load(workspaceId);
          if (projectRoot !== bound.projectRoot || filePath !== bound.assetsFile) {
            throw new WorkflowStoreError('path-denied', 'workspace project changed');
          }
          assertProjectWriteSafe(join(projectRoot, '.omnimux'), projectRoot);
          assertProjectWriteSafe(filePath, projectRoot);
          const item: ProjectAssetsItem = {
            id: newItemId(), name: audio.name, type: 'audio', parentId: null,
            relative_path: audio.relativePath, size: audio.size, sizeBytes: audio.size,
            mimeType: audio.mimeType, durationSec: null, updatedAt: Date.now(),
          };
          const document = persist(filePath, current, { folders: current.folders, items: [...current.items, item] });
          return { item, rev: document.rev };
        },
      });
    },

    index(workspaceId: string, payload: IngestProjectAssetsPayload): Promise<ProjectAssetsDocument> {
      return ingest(workspaceId, payload);
    },

    async instantiate(workspaceId: string, payload: InstantiateProjectAssetsPayload): Promise<ProjectAssetsDocument> {
      const { current, filePath, projectRoot } = load(workspaceId);
      assertExpectedRev(current, payload.expectedRev);
      const subjectId = typeof payload.globalSubjectId === 'string' ? payload.globalSubjectId.trim() : '';
      if (!subjectId) {
        throw new WorkflowStoreError('invalid-id', 'globalSubjectId is required');
      }
      if (!fetchLibraryDetail) {
        throw new WorkflowStoreError('internal', 'library client is not configured');
      }
      const parentId = normalizeParentId(payload.parentId);
      if (!parentExists(current, parentId)) {
        throw new WorkflowStoreError('invalid-id', 'parent folder does not exist');
      }
      const detail = await fetchLibraryDetail(subjectId);
      if (!detail) {
        throw new WorkflowStoreError('not-found', `subject ${subjectId} not found`);
      }
      const visible = (detail.files ?? []).filter((file) => file && file.visible !== false);
      const sources = visible
        .map((file) => String(file.real_path || '').trim())
        .filter(Boolean);
      if (sources.length === 0) {
        throw new WorkflowStoreError('subject-has-no-files', 'subject has no visible files');
      }
      const paths = resolveProjectPaths(projectRoot);
      const destDir = join(paths.subjectsDir, subjectId);
      const now = Date.now();
      const items = [...current.items];
      for (const sourceAbs of sources) {
        const copied = await copyPathIntoDir({
          projectRoot,
          destDir,
          sourceAbs,
        });
        items.push({
          id: newItemId(),
          name: copied.name,
          type: fileTypeOf(copied.name),
          parentId,
          relative_path: copied.relativePath,
          size: copied.size,
          snapshot: { globalSubjectId: subjectId },
          updatedAt: now,
        });
      }
      return persist(filePath, current, { folders: current.folders, items });
    },

    async promote(workspaceId: string, payload: PromoteProjectAssetsPayload): Promise<{ asset: unknown }> {
      if (!promoteToLibrary) {
        throw new WorkflowStoreError('internal', 'library client is not configured');
      }
      const rel = typeof payload.relative_path === 'string' ? payload.relative_path.trim() : '';
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) throw new WorkflowStoreError('name-required', 'name is required');
      const abs = resolveFile(workspaceId, rel);
      const asset = await promoteToLibrary({
        name,
        type: payload.type,
        files: [{ real_path: abs }],
      });
      return { asset };
    },

    registerGenerated(workspaceId: string, payload: RegisterGeneratedAssetPayload): ProjectAssetsDocument {
      const { current, filePath } = load(workspaceId);
      const relative = typeof payload.relative_path === 'string' ? payload.relative_path.trim() : '';
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) throw new WorkflowStoreError('name-required', 'name is required');
      assertRelativeLedgerPath(relative, 'item.relative_path');
      const existing = current.items.find((item) => item.relative_path === relative);
      if (existing) {
        const items = current.items.map((item) => {
          if (item.relative_path !== relative) return item;
          const size =
            typeof payload.size === 'number' && Number.isFinite(payload.size)
              ? payload.size
              : payload.size === null
                ? null
                : item.size;
          const mimeType =
            typeof payload.mimeType === 'string' && payload.mimeType.trim()
              ? (payload.mimeType.trim().toLowerCase() === 'unknown'
                  || payload.mimeType.trim() === 'application/octet-stream'
                  ? null
                  : payload.mimeType.trim())
              : payload.mimeType === null
                ? null
                : item.mimeType;
          const durationSec =
            typeof payload.durationSec === 'number' && Number.isFinite(payload.durationSec)
              ? payload.durationSec
              : payload.durationSec === null
                ? null
                : item.durationSec;
          return {
            ...item,
            name,
            type: payload.type && isProjectAssetFileType(payload.type) ? payload.type : item.type,
            size,
            sizeBytes: size ?? null,
            mimeType: mimeType ?? null,
            durationSec: durationSec ?? null,
            lineage: payload.lineage ?? item.lineage,
            updatedAt: Date.now(),
          };
        });
        return persist(filePath, current, { folders: current.folders, items });
      }
      const size =
        typeof payload.size === 'number' && Number.isFinite(payload.size) ? payload.size : null;
      const mimeType =
        typeof payload.mimeType === 'string' && payload.mimeType.trim()
          ? (payload.mimeType.trim().toLowerCase() === 'unknown'
              || payload.mimeType.trim() === 'application/octet-stream'
              ? null
              : payload.mimeType.trim())
          : null;
      const durationSec =
        typeof payload.durationSec === 'number' && Number.isFinite(payload.durationSec)
          ? payload.durationSec
          : null;
      const items = [
        ...current.items,
        {
          id: newItemId(),
          name,
          type: payload.type && isProjectAssetFileType(payload.type) ? payload.type : fileTypeOf(name),
          parentId: null,
          relative_path: relative,
          size,
          sizeBytes: size,
          mimeType,
          durationSec,
          lineage: payload.lineage,
          updatedAt: Date.now(),
        },
      ];
      return persist(filePath, current, { folders: current.folders, items });
    },

    resolveProjectFile(workspaceId: string, rel: string): string {
      return resolveFile(workspaceId, rel);
    },
  };
}
