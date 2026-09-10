/**
 * ProjectStore：默认库下一层作品包 CRUD。
 *
 * 列表真相 = 扫描 `libraryRoot` 下一层含合法 `.omnimux/project.json` 的文件夹。
 * `index.json` 停用主路径（写也不再维护）。
 *
 * 新建：Host 在默认库 mkdir 作品文件夹（桌面壳 picker 是 native，
 * 没有 workspaces.createDirectory），再写 project.json。
 * 客户端也可先建好 projectRoot 再 POST 种子。
 *
 * 删除：只摘 json / 账本引用，**不 rm 用户文件夹**（与资产库同一红线）。
 */
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { allocateUniqueProjectFolder, sanitizeFolderName } from './folderName.ts';
import { sessionToWorkspaceId } from '../shared/sessionWorkspaceId.ts';
import {
  assertProjectInsideLibrary,
  assertProjectWriteSafe,
  resolveProjectPaths,
} from './paths.ts';
import {
  MAX_PROJECT_TITLE_LENGTH,
  PROJECT_SCHEMA_VERSION,
  parseProject,
  type Project,
  type ProjectPage,
  type ProjectSummary,
} from './schema.ts';

export class ProjectStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ProjectStoreError';
  }
}

export type ProjectRecord = Project & { path: string };

export interface ProjectStore {
  list(): ProjectSummary[];
  /**
   * 种子写入。未传 projectRoot 时 Host 在默认库分配唯一文件夹。
   */
  create(title: string, opts?: {
    projectRoot?: string;
    sessionId?: string | null;
    canvasWorkspaceIds?: string[];
  }): ProjectRecord;
  get(id: string): ProjectRecord;
  rename(id: string, title: string): ProjectRecord;
  bindSession(id: string, sessionId: string): ProjectRecord;
  /** Resolve a canvas `ws_*` id to the owning project (lazy-binds canvasWorkspaceIds). */
  findByCanvasWorkspaceId(workspaceId: string): ProjectRecord | null;
  addPage(projectId: string, pageTitle: string, opts?: { canvasWorkspaceId?: string; loadMemory?: boolean }): ProjectRecord;
  removePage(projectId: string, pageId: string): ProjectRecord;
  renamePage(projectId: string, pageId: string, title: string): ProjectRecord;
  setActivePage(projectId: string, pageId: string): ProjectRecord;
  /** 摘除元数据，保留用户文件夹。 */
  remove(id: string): void;
}

function isProjectId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function newProjectId(): string {
  return randomUUID();
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
}

function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** @deprecated 默认说明文档模板（已废弃，新建项目不再自动生成 说明.md） */
export function defaultReadme(title: string): string {
  return `# ${title}\n\n本地项目不会自动与其他设备或用户共享。\n`;
}

function validateTitle(title: unknown): string {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new ProjectStoreError('title-required', 'project title is required');
  }
  const trimmed = title.trim();
  if (trimmed.length > MAX_PROJECT_TITLE_LENGTH) {
    throw new ProjectStoreError('title-too-long', `project title exceeds ${MAX_PROJECT_TITLE_LENGTH} characters`);
  }
  return trimmed;
}

function toSummary(project: Project, path: string): ProjectSummary {
  const existingPages = project.pages && project.pages.length > 0
    ? project.pages
    : [{
        id: 'page-default',
        title: project.title || '创作页 1',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        canvasWorkspaceId: project.canvasWorkspaceIds?.[0] || `ws_${project.id.replace(/-/g, '').slice(0, 12)}`,
      }];
  return {
    id: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
    sessionId: project.sessionId,
    path,
    pages: existingPages,
    activePageId: project.activePageId || existingPages[0]?.id || '',
  };
}

export function createProjectStore(opts: { libraryRoot: string }): ProjectStore {
  const { libraryRoot } = opts;
  mkdirSync(libraryRoot, { recursive: true });

  function scanEntries(): Array<{ dir: string; project: Project }> {
    if (!existsSync(libraryRoot)) return [];
    const rows: Array<{ dir: string; project: Project }> = [];
    for (const entry of readdirSync(libraryRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(libraryRoot, entry.name);
      const file = join(dir, '.omnimux', 'project.json');
      const raw = readJsonFile(file);
      if (raw === undefined) continue;
      const project = parseProject(raw);
      if (!project) continue;
      rows.push({ dir, project });
    }
    rows.sort((a, b) => {
      if (a.project.updatedAt !== b.project.updatedAt) {
        return a.project.updatedAt < b.project.updatedAt ? 1 : -1;
      }
      return a.project.id < b.project.id ? 1 : -1;
    });
    return rows;
  }

  function findById(id: string): { dir: string; project: Project } | null {
    for (const row of scanEntries()) {
      if (row.project.id === id) return row;
    }
    return null;
  }

  function persistProject(dir: string, project: Project): ProjectRecord {
    const paths = resolveProjectPaths(dir);
    assertProjectInsideLibrary(paths.projectRoot, libraryRoot);
    assertProjectWriteSafe(paths.projectFile, paths.projectRoot);
    atomicWriteJson(paths.projectFile, project);
    return { ...project, path: paths.projectRoot };
  }

  function requireProject(id: string): { dir: string; project: Project } {
    if (!isProjectId(id)) {
      throw new ProjectStoreError('invalid-id', `invalid project id ${id}`);
    }
    const found = findById(id);
    if (!found) {
      throw new ProjectStoreError('project-not-found', `project ${id} not found`);
    }
    return found;
  }

  return {
    list(): ProjectSummary[] {
      return scanEntries().map((row) => toSummary(row.project, row.dir));
    },

    create(title, createOpts = {}): ProjectRecord {
      const trimmed = validateTitle(title);
      const givenRoot = typeof createOpts.projectRoot === 'string' ? createOpts.projectRoot.trim() : '';
      const projectRoot = givenRoot !== ''
        ? givenRoot
        : allocateUniqueProjectFolder(libraryRoot, sanitizeFolderName(trimmed));
      const paths = resolveProjectPaths(projectRoot);
      assertProjectInsideLibrary(paths.projectRoot, libraryRoot);
      if (existsSync(paths.projectFile)) {
        throw new ProjectStoreError('project-exists', `project already seeded at ${paths.projectRoot}`);
      }
      const now = new Date().toISOString();
      const defaultWsId = createOpts.canvasWorkspaceIds?.[0] || `ws_${newProjectId().replace(/-/g, '').slice(0, 12)}`;
      const initialPage: ProjectPage = {
        id: 'page-default',
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        canvasWorkspaceId: defaultWsId,
      };
      const project: Project = {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        id: newProjectId(),
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        sessionId: createOpts.sessionId ?? null,
        canvasWorkspaceIds: createOpts.canvasWorkspaceIds ?? [defaultWsId],
        activePageId: initialPage.id,
        pages: [initialPage],
      };
      return persistProject(paths.projectRoot, project);
    },

    get(id: string): ProjectRecord {
      const found = requireProject(id);
      const existingPages = found.project.pages && found.project.pages.length > 0 ? found.project.pages : [];
      if (existingPages.length === 0) {
        const defaultWsId = found.project.canvasWorkspaceIds?.[0] || `ws_${found.project.id.replace(/-/g, '').slice(0, 12)}`;
        const initialPage: ProjectPage = {
          id: 'page-default',
          title: found.project.title || '创作页 1',
          createdAt: found.project.createdAt,
          updatedAt: found.project.updatedAt,
          canvasWorkspaceId: defaultWsId,
        };
        const updatedProject: Project = {
          ...found.project,
          canvasWorkspaceIds: found.project.canvasWorkspaceIds?.includes(defaultWsId)
            ? found.project.canvasWorkspaceIds
            : [...(found.project.canvasWorkspaceIds ?? []), defaultWsId],
          pages: [initialPage],
          activePageId: initialPage.id,
          updatedAt: found.project.updatedAt,
        };
        return persistProject(found.dir, updatedProject);
      }
      return { ...found.project, path: found.dir };
    },

    rename(id: string, title: string): ProjectRecord {
      const current = requireProject(id);
      const trimmed = validateTitle(title);
      const next: Project = { ...current.project, title: trimmed, updatedAt: new Date().toISOString() };
      return persistProject(current.dir, next);
    },

    bindSession(id: string, sessionId: string): ProjectRecord {
      const current = requireProject(id);
      if (typeof sessionId !== 'string' || sessionId.trim() === '') {
        throw new ProjectStoreError('session-required', 'sessionId is required');
      }
      const next: Project = { ...current.project, sessionId, updatedAt: new Date().toISOString() };
      return persistProject(current.dir, next);
    },

    findByCanvasWorkspaceId(workspaceId: string): ProjectRecord | null {
      if (typeof workspaceId !== 'string' || workspaceId.trim() === '') return null;
      const id = workspaceId.trim();
      for (const row of scanEntries()) {
        const ids = row.project.canvasWorkspaceIds ?? [];
        if (ids.includes(id)) {
          return { ...row.project, path: row.dir };
        }
        if (row.project.pages?.some((page) => page.canvasWorkspaceId === id)) {
          return { ...row.project, path: row.dir };
        }
        if (row.project.sessionId && sessionToWorkspaceId(row.project.sessionId) === id) {
          if (ids.includes(id)) {
            return { ...row.project, path: row.dir };
          }
          const next: Project = {
            ...row.project,
            canvasWorkspaceIds: [...ids, id],
            updatedAt: new Date().toISOString(),
          };
          return persistProject(row.dir, next);
        }
      }
      return null;
    },

    addPage(projectId: string, pageTitle: string, opts = {}): ProjectRecord {
      const current = requireProject(projectId);
      const trimmed = validateTitle(pageTitle);
      const now = new Date().toISOString();
      const pageId = randomUUID();
      const newPage: ProjectPage = {
        id: pageId,
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        canvasWorkspaceId: opts.canvasWorkspaceId,
        loadMemory: opts.loadMemory ?? false,
      };
      const existingPages = current.project.pages ?? [];
      const nextPages = [...existingPages, newPage];
      const next: Project = {
        ...current.project,
        pages: nextPages,
        activePageId: pageId,
        updatedAt: now,
      };
      return persistProject(current.dir, next);
    },

    removePage(projectId: string, pageId: string): ProjectRecord {
      const current = requireProject(projectId);
      const existingPages = current.project.pages ?? [];
      const nextPages = existingPages.filter((p) => p.id !== pageId);
      const nextActiveId =
        current.project.activePageId === pageId
          ? nextPages[0]?.id
          : current.project.activePageId;
      const next: Project = {
        ...current.project,
        pages: nextPages,
        activePageId: nextActiveId,
        updatedAt: new Date().toISOString(),
      };
      return persistProject(current.dir, next);
    },

    renamePage(projectId: string, pageId: string, title: string): ProjectRecord {
      const current = requireProject(projectId);
      const trimmed = validateTitle(title);
      const existingPages = current.project.pages ?? [];
      const nextPages = existingPages.map((p) =>
        p.id === pageId ? { ...p, title: trimmed, updatedAt: new Date().toISOString() } : p,
      );
      const next: Project = {
        ...current.project,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      return persistProject(current.dir, next);
    },

    setActivePage(projectId: string, pageId: string): ProjectRecord {
      const current = requireProject(projectId);
      const next: Project = {
        ...current.project,
        activePageId: pageId,
        updatedAt: new Date().toISOString(),
      };
      return persistProject(current.dir, next);
    },

    remove(id: string): void {
      const current = requireProject(id);
      const paths = resolveProjectPaths(current.dir);
      assertProjectWriteSafe(paths.projectFile, paths.projectRoot);
      const metaDir = paths.metaDir;
      if (existsSync(metaDir)) {
        rmSync(metaDir, { recursive: true, force: true });
      }
      // 用户文件夹与生成物一律保留。
    },
  };
}
