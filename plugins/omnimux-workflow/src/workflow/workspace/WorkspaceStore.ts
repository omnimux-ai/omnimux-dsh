/**
 * WorkspaceStore: canvas.json CRUD + optimistic lock + atomic writes.
 *
 * Unbound canvases live under `$DSH_HOME/omnimux/workflow/workspaces/<id>/canvas.json`.
 * Bound canvases migrate (copy, metadata only) to
 * `<ProjectRoot>/.omnimux/canvases/<id>.json` and that file becomes SSOT.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveProjectPaths, assertProjectWriteSafe } from '../../projects/paths.ts';
import {
  DEFAULT_CANVAS_SETTINGS,
  SNAPSHOT_SCHEMA_VERSION,
  type CanvasWorkspaceSnapshot,
  type SaveCanvasWorkspacePayload,
  type WorkspaceSummary,
} from '../../shared/canvasTypes.ts';
import { workspaceSnapshotSchema } from './snapshotSchema.ts';
import { WorkflowStoreError } from './WorkflowStoreError.ts';
import { migrateSnapshot } from './snapshotMigration.ts';

/** Mirrors the snapshot schema name cap (workspaceSnapshotSchema). */
const MAX_WORKSPACE_NAME_LENGTH = 200;

export { WorkflowStoreError } from './WorkflowStoreError.ts';

export interface WorkspaceSaveResult {
  snapshot: CanvasWorkspaceSnapshot;
}

export interface ProjectRootRecord {
  path: string;
}

export type ResolveProjectRoot = (workspaceId: string) => ProjectRootRecord | null;

export interface WorkspaceStore {
  /** Absolute workspaces root; sibling stores (assets.json) share this. */
  readonly workspacesDir: string;
  /** Bound-project lookup; null when the canvas is not a local project. */
  resolveProjectRoot(workspaceId: string): ProjectRootRecord | null;
  /** Absolute canvas.json path after lazy migrate. */
  canvasFileOf(id: string): string;
  list(): WorkspaceSummary[];
  create(name: string | undefined, id?: string): CanvasWorkspaceSnapshot;
  get(id: string): CanvasWorkspaceSnapshot;
  save(id: string, payload: SaveCanvasWorkspacePayload): WorkspaceSaveResult;
  remove(id: string): void;
}

function isWorkspaceId(id: string): boolean {
  return /^ws_[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function newWorkspaceId(): string {
  return `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.tmp-${randomUUID()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  renameSync(tmp, filePath);
}

function readSnapshotFile(filePath: string): CanvasWorkspaceSnapshot | null {
  if (!existsSync(filePath)) return null;
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = workspaceSnapshotSchema.safeParse(parsed);
  if (!result.success) return null;
  return migrateSnapshot(result.data as CanvasWorkspaceSnapshot);
}

function homeCanvasFile(workspacesDir: string, id: string): string {
  if (!isWorkspaceId(id)) throw new WorkflowStoreError('invalid-id', 'invalid workspace id');
  const file = join(workspacesDir, id, 'canvas.json');
  assertProjectWriteSafe(file, workspacesDir);
  return file;
}

function projectCanvasFile(projectRoot: string, id: string): string {
  if (!isWorkspaceId(id)) throw new WorkflowStoreError('invalid-id', 'invalid workspace id');
  const file = join(resolveProjectPaths(projectRoot).canvasesDir, `${id}.json`);
  assertProjectWriteSafe(file, projectRoot);
  return file;
}

/**
 * Prefer the project DAG after bind. First bind copies the home canvas
 * (JSON only — not media) into `.omnimux/canvases/`.
 */
export function resolveCanvasFilePath(opts: {
  workspacesDir: string;
  workspaceId: string;
  resolveProjectRoot?: ResolveProjectRoot;
}): string {
  const home = homeCanvasFile(opts.workspacesDir, opts.workspaceId);
  const bound = opts.resolveProjectRoot?.(opts.workspaceId);
  if (!bound) return home;
  const projectFile = projectCanvasFile(bound.path, opts.workspaceId);
  if (existsSync(projectFile)) return projectFile;
  if (existsSync(home)) {
    mkdirSync(join(projectFile, '..'), { recursive: true });
    copyFileSync(home, projectFile);
    return projectFile;
  }
  return projectFile;
}

export function canvasExistsOnDisk(opts: {
  workspacesDir: string;
  workspaceId: string;
  resolveProjectRoot?: ResolveProjectRoot;
}): boolean {
  const home = homeCanvasFile(opts.workspacesDir, opts.workspaceId);
  if (existsSync(home)) return true;
  const bound = opts.resolveProjectRoot?.(opts.workspaceId);
  if (!bound) return false;
  return existsSync(projectCanvasFile(bound.path, opts.workspaceId));
}

export function createWorkspaceStore(opts: {
  workspacesDir: string;
  resolveProjectRoot?: ResolveProjectRoot;
}): WorkspaceStore {
  const { workspacesDir, resolveProjectRoot } = opts;
  mkdirSync(workspacesDir, { recursive: true });

  const fileOf = (id: string) =>
    resolveCanvasFilePath({ workspacesDir, workspaceId: id, resolveProjectRoot });

  function requireSnapshot(id: string): CanvasWorkspaceSnapshot {
    if (!isWorkspaceId(id)) {
      throw new WorkflowStoreError('invalid-id', `invalid workspace id ${id}`);
    }
    const snapshot = readSnapshotFile(fileOf(id));
    if (!snapshot) {
      throw new WorkflowStoreError('workspace-not-found', `workspace ${id} not found`);
    }
    return snapshot;
  }

  return {
    workspacesDir,
    resolveProjectRoot(workspaceId: string): ProjectRootRecord | null {
      return resolveProjectRoot?.(workspaceId) ?? null;
    },
    canvasFileOf(id: string): string {
      return fileOf(id);
    },

    list(): WorkspaceSummary[] {
      if (!existsSync(workspacesDir)) return [];
      const rows: WorkspaceSummary[] = [];
      for (const entry of readdirSync(workspacesDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !isWorkspaceId(entry.name)) continue;
        const snapshot = readSnapshotFile(fileOf(entry.name));
        if (!snapshot) continue;
        rows.push({
          id: snapshot.id,
          name: snapshot.name,
          version: snapshot.version,
          nodeCount: snapshot.metadata.nodeCount,
          updatedAt: snapshot.metadata.updatedAt,
        });
      }
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      return rows;
    },

    create(name: string | undefined, explicitId?: string): CanvasWorkspaceSnapshot {
      // M2 QA fix #1: validate BEFORE writing anything to disk. Without this
      // a >200-char name was persisted by create() but rejected by the read
      // side (workspaceSnapshotSchema), leaving an unreadable "zombie"
      // workspace behind (list invisible / GET+PUT 404, only DELETE worked).
      if (typeof name === 'string' && name.trim().length > MAX_WORKSPACE_NAME_LENGTH) {
        throw new WorkflowStoreError(
          'name-too-long',
          `workspace name exceeds ${MAX_WORKSPACE_NAME_LENGTH} characters (got ${name.trim().length})`,
        );
      }
      const id = explicitId === undefined ? newWorkspaceId() : explicitId;
      if (typeof id !== 'string' || !isWorkspaceId(id)) throw new WorkflowStoreError('invalid-id', 'invalid workspace id');
      const now = new Date().toISOString();
      const snapshot: CanvasWorkspaceSnapshot = {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        id,
        name: (name && name.trim()) || '未命名工作流',
        version: 0,
        nodes: [],
        edges: [],
        settings: { ...DEFAULT_CANVAS_SETTINGS },
        metadata: {
          createdAt: now,
          updatedAt: now,
          nodeCount: 0,
        },
      };
      // Create always seeds the home canvas so unbound sessions still work.
      atomicWriteJson(homeCanvasFile(workspacesDir, id), snapshot);
      return snapshot;
    },

    get(id: string): CanvasWorkspaceSnapshot {
      return requireSnapshot(id);
    },

    save(id: string, payload: SaveCanvasWorkspacePayload): WorkspaceSaveResult {
      const current = requireSnapshot(id);
      if (
        typeof payload.expectedVersion === 'number' &&
        payload.expectedVersion !== current.version
      ) {
        throw new WorkflowStoreError(
          'version_conflict',
          `workspace ${id} moved on: expected ${String(payload.expectedVersion)}, current ${String(current.version)}`,
          { current: current.version },
        );
      }

      const now = new Date().toISOString();
      const next: CanvasWorkspaceSnapshot = {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        id: current.id,
        name: payload.name !== undefined && payload.name.trim() ? payload.name : current.name,
        version: current.version + 1,
        nodes: payload.nodes ?? current.nodes,
        edges: payload.edges ?? current.edges,
        settings: {
          maxParallel: payload.settings?.maxParallel ?? current.settings.maxParallel,
          failStrategy: payload.settings?.failStrategy ?? current.settings.failStrategy,
        },
        metadata: {
          createdAt: current.metadata.createdAt,
          updatedAt: now,
          nodeCount: payload.nodes ? payload.nodes.length : current.metadata.nodeCount,
        },
      };

      const strict = workspaceSnapshotSchema.safeParse(next);
      if (!strict.success) {
        throw new WorkflowStoreError(
          'invalid-snapshot',
          `snapshot failed schema validation: ${strict.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
        );
      }

      // 必须落盘 zod 清洗结果：默认 strip 未知字段，避免客户端误带
      // measured/dragging/positionAbsolute 等瞬时键常驻 canvas.json。
      const cleaned = strict.data as CanvasWorkspaceSnapshot;
      atomicWriteJson(fileOf(id), cleaned);
      return { snapshot: cleaned };
    },

    remove(id: string): void {
      if (!isWorkspaceId(id)) {
        throw new WorkflowStoreError('invalid-id', `invalid workspace id ${id}`);
      }
      homeCanvasFile(workspacesDir, id);
      const homeDir = join(workspacesDir, id);
      const bound = resolveProjectRoot?.(id);
      if (bound) {
        const projectFile = projectCanvasFile(bound.path, id);
        if (existsSync(projectFile)) rmSync(projectFile, { force: true });
      }
      if (!existsSync(homeDir) && !bound) {
        throw new WorkflowStoreError('workspace-not-found', `workspace ${id} not found`);
      }
      if (existsSync(homeDir)) {
        rmSync(homeDir, { recursive: true, force: true });
      }
    },
  };
}

/** Content hash helper reused by the route layer for the build manifest. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
