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
import { join, resolve } from 'node:path';
import { allocateUniqueProjectFolder, sanitizeFolderName } from './folderName.ts';
import { sessionToWorkspaceId } from '../shared/sessionWorkspaceId.ts';
import {
  assertProjectInsideLibrary,
  assertProjectWriteSafe,
  isInsideDir,
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
  repairProjectRecord(record: ProjectRecord): ProjectRecord;
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
  /** 按文件夹绝对路径认项目（含外部登记与磁盘档案）。 */
  findByRoot(projectRoot: string): ProjectRecord | null;
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

export function validateTitle(title: unknown): string {
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
  const externalProjectsFile = join(libraryRoot, '.external-projects.json');

  function loadExternalProjectDirs(): string[] {
    const raw = readJsonFile(externalProjectsFile);
    if (Array.isArray(raw)) {
      return raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    }
    return [];
  }

  function saveExternalProjectDirs(dirs: string[]): void {
    const unique = Array.from(new Set(dirs.map((d) => resolve(d))));
    atomicWriteJson(externalProjectsFile, unique);
  }

  function registerExternalProjectDir(dir: string): void {
    const root = resolve(dir);
    if (isInsideDir(root, libraryRoot)) return;
    const current = loadExternalProjectDirs();
    if (!current.includes(root)) {
      current.push(root);
      saveExternalProjectDirs(current);
    }
  }

  function unregisterExternalProjectDir(dir: string): void {
    const root = resolve(dir);
    const current = loadExternalProjectDirs();
    const next = current.filter((d) => resolve(d) !== root);
    if (next.length !== current.length) {
      saveExternalProjectDirs(next);
    }
  }

  function scanEntries(): Array<{ dir: string; project: Project }> {
    const rows: Array<{ dir: string; project: Project }> = [];
    const seenDirs = new Set<string>();

    if (existsSync(libraryRoot)) {
      for (const entry of readdirSync(libraryRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = resolve(join(libraryRoot, entry.name));
        const file = join(dir, '.omnimux', 'project.json');
        const raw = readJsonFile(file);
        if (raw === undefined) continue;
        const project = parseProject(raw);
        if (!project) continue;
        rows.push({ dir, project });
        seenDirs.add(dir);
      }
    }

    const externalDirs = loadExternalProjectDirs();
    let externalChanged = false;
    const validExternalDirs: string[] = [];
    for (const extDir of externalDirs) {
      const dir = resolve(extDir);
      if (seenDirs.has(dir)) continue;
      const file = join(dir, '.omnimux', 'project.json');
      if (!existsSync(file)) {
        externalChanged = true;
        continue;
      }
      const raw = readJsonFile(file);
      const project = parseProject(raw);
      if (!project) {
        externalChanged = true;
        continue;
      }
      rows.push({ dir, project });
      seenDirs.add(dir);
      validExternalDirs.push(dir);
    }
    if (externalChanged) {
      saveExternalProjectDirs(validExternalDirs);
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
    if (isInsideDir(paths.projectRoot, libraryRoot)) {
      assertProjectInsideLibrary(paths.projectRoot, libraryRoot);
    } else {
      registerExternalProjectDir(paths.projectRoot);
    }
    assertProjectWriteSafe(paths.projectFile, paths.projectRoot);
    const { path: _path, ...cleanProject } = project as Project & { path?: string };
    atomicWriteJson(paths.projectFile, cleanProject);
    return { ...cleanProject, path: paths.projectRoot };
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

  function lookupByRoot(projectRoot: string): ProjectRecord | null {
    const dir = typeof projectRoot === 'string' ? projectRoot.trim() : '';
    if (dir === '') return null;
    const root = resolve(dir);
    const file = join(root, '.omnimux', 'project.json');
    const raw = readJsonFile(file);
    if (raw === undefined) return null;
    const project = parseProject(raw);
    if (!project) return null;
    return repairProjectRecord({ ...project, path: root });
  }

  function repairProjectRecord(record: ProjectRecord): ProjectRecord {
    const dir = record.path;
    let changed = false;

    // a. 若 record.project.pages 为空，自动补全首个创作页，生成唯一合法的 ws_${randomUUID().replace(/-/g, '').slice(0, 12)}
    let pages: ProjectPage[] = Array.isArray(record.pages) && record.pages.length > 0
      ? [...record.pages]
      : [];

    if (pages.length === 0) {
      changed = true;
      const defaultWsId = (record.canvasWorkspaceIds && record.canvasWorkspaceIds[0]?.trim())
        ? record.canvasWorkspaceIds[0].trim()
        : `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      pages = [{
        id: 'page-default',
        title: record.title || '创作页 1',
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || new Date().toISOString(),
        canvasWorkspaceId: defaultWsId,
      }];
    }

    // b. 遍历 record.project.pages，对任何缺失或空串的 canvasWorkspaceId，分配一个全新的 ws_${randomUUID().replace(/-/g, '').slice(0, 12)}
    pages = pages.map((page) => {
      const wsId = typeof page.canvasWorkspaceId === 'string' ? page.canvasWorkspaceId.trim() : '';
      if (!wsId) {
        changed = true;
        return {
          ...page,
          canvasWorkspaceId: `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        };
      }
      if (page.canvasWorkspaceId !== wsId) {
        changed = true;
        return {
          ...page,
          canvasWorkspaceId: wsId,
        };
      }
      return page;
    });

    // c. 收集所有页面的 canvasWorkspaceId，更新并去重同步至 record.project.canvasWorkspaceIds 数组中
    const pageWsIds = pages
      .map((p) => p.canvasWorkspaceId)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');

    const currentCanvasIds = (record.canvasWorkspaceIds ?? []).filter(
      (id): id is string => typeof id === 'string' && id.trim() !== '',
    );

    const collectedWorkspaceIds = Array.from(new Set([...currentCanvasIds, ...pageWsIds]));

    const idsMatch = currentCanvasIds.length === collectedWorkspaceIds.length &&
      currentCanvasIds.every((id, idx) => id === collectedWorkspaceIds[idx]);
    if (!idsMatch) {
      changed = true;
    }

    // d. 校验 record.project.activePageId，若为空或不存在于 pages 中，回落至 pages[0].id
    let nextActivePageId = record.activePageId;
    if (!nextActivePageId || !pages.some((p) => p.id === nextActivePageId)) {
      nextActivePageId = pages[0]?.id ?? '';
      if (nextActivePageId !== record.activePageId) {
        changed = true;
      }
    }

    // e. 若有任何自愈修复发生，调用 persistProject(record.dir, nextProject) 立即原子写盘持久化
    if (changed) {
      const { path: _path, ...projectData } = record;
      const nextProject: Project = {
        ...projectData,
        pages,
        canvasWorkspaceIds: collectedWorkspaceIds,
        activePageId: nextActivePageId,
        updatedAt: new Date().toISOString(),
      };
      return persistProject(dir, nextProject);
    }

    return record;
  }

  return {
    repairProjectRecord(record: ProjectRecord): ProjectRecord {
      return repairProjectRecord(record);
    },

    list(): ProjectSummary[] {
      return scanEntries().map((row) => {
        const repaired = repairProjectRecord({ ...row.project, path: row.dir });
        return toSummary(repaired, repaired.path);
      });
    },

    findByRoot(projectRoot: string): ProjectRecord | null {
      return lookupByRoot(projectRoot);
    },

    create(title, createOpts = {}): ProjectRecord {
      const trimmed = validateTitle(title);
      const givenRoot = typeof createOpts.projectRoot === 'string' ? createOpts.projectRoot.trim() : '';
      const projectRoot = givenRoot !== ''
        ? givenRoot
        : allocateUniqueProjectFolder(libraryRoot, sanitizeFolderName(trimmed));
      const paths = resolveProjectPaths(projectRoot);
      if (isInsideDir(paths.projectRoot, libraryRoot)) {
        assertProjectInsideLibrary(paths.projectRoot, libraryRoot);
      } else {
        registerExternalProjectDir(paths.projectRoot);
      }
      if (existsSync(paths.projectFile)) {
        const existing = lookupByRoot(paths.projectRoot);
        if (existing) return existing;
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
      return repairProjectRecord({ ...found.project, path: found.dir });
    },

    rename(id: string, title: string): ProjectRecord {
      const current = requireProject(id);
      const repaired = repairProjectRecord({ ...current.project, path: current.dir });
      const trimmed = validateTitle(title);
      const { path: _path, ...projectData } = repaired;
      const next: Project = { ...projectData, title: trimmed, updatedAt: new Date().toISOString() };
      return persistProject(repaired.path, next);
    },

    bindSession(id: string, sessionId: string): ProjectRecord {
      const current = requireProject(id);
      const repaired = repairProjectRecord({ ...current.project, path: current.dir });
      if (typeof sessionId !== 'string' || sessionId.trim() === '') {
        throw new ProjectStoreError('session-required', 'sessionId is required');
      }
      const { path: _path, ...projectData } = repaired;
      const next: Project = { ...projectData, sessionId, updatedAt: new Date().toISOString() };
      return persistProject(repaired.path, next);
    },

    findByCanvasWorkspaceId(workspaceId: string): ProjectRecord | null {
      if (typeof workspaceId !== 'string' || workspaceId.trim() === '') return null;
      const id = workspaceId.trim();
      for (const row of scanEntries()) {
        const repaired = repairProjectRecord({ ...row.project, path: row.dir });
        const ids = repaired.canvasWorkspaceIds ?? [];
        if (ids.includes(id) || repaired.pages?.some((page) => page.canvasWorkspaceId === id)) {
          return repaired;
        }
        if (repaired.sessionId && sessionToWorkspaceId(repaired.sessionId) === id) {
          if (ids.includes(id)) {
            return repaired;
          }
          const { path: _path, ...projectData } = repaired;
          const next: Project = {
            ...projectData,
            canvasWorkspaceIds: [...ids, id],
            updatedAt: new Date().toISOString(),
          };
          const persisted = persistProject(repaired.path, next);
          return repairProjectRecord(persisted);
        }
      }
      return null;
    },

    addPage(projectId: string, pageTitle: string, opts: { canvasWorkspaceId?: string; loadMemory?: boolean } = {}): ProjectRecord {
      const current = requireProject(projectId);
      const repaired = repairProjectRecord({ ...current.project, path: current.dir });
      const trimmed = validateTitle(pageTitle);
      const now = new Date().toISOString();
      const pageId = randomUUID();
      // a. 确保新页面必有合法的 canvasWorkspaceId（若 opts.canvasWorkspaceId 为空则生成）
      const canvasWorkspaceId = (typeof opts.canvasWorkspaceId === 'string' && opts.canvasWorkspaceId.trim() !== '')
        ? opts.canvasWorkspaceId.trim()
        : `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

      const newPage: ProjectPage = {
        id: pageId,
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        canvasWorkspaceId,
        loadMemory: opts.loadMemory ?? false,
      };
      const existingPages = repaired.pages ?? [];
      const nextPages = [...existingPages, newPage];
      // b. 将该 canvasWorkspaceId 添加进 project.canvasWorkspaceIds 数组中
      const currentCanvasIds = repaired.canvasWorkspaceIds ?? [];
      const nextCanvasWorkspaceIds = Array.from(new Set([...currentCanvasIds, canvasWorkspaceId]));
      // c. 将 project.activePageId 设置为新页面的 pageId
      const { path: _path, ...projectData } = repaired;
      const next: Project = {
        ...projectData,
        pages: nextPages,
        canvasWorkspaceIds: nextCanvasWorkspaceIds,
        activePageId: pageId,
        updatedAt: now,
      };
      // d. 持久化写盘
      return persistProject(repaired.path, next);
    },

    removePage(projectId: string, pageId: string): ProjectRecord {
      const current = requireProject(projectId);
      const repaired = repairProjectRecord({ ...current.project, path: current.dir });
      const existingPages = repaired.pages ?? [];
      const nextPages = existingPages.filter((p) => p.id !== pageId);
      const nextActiveId =
        repaired.activePageId === pageId
          ? nextPages[0]?.id
          : repaired.activePageId;
      const { path: _path, ...projectData } = repaired;
      const next: Project = {
        ...projectData,
        pages: nextPages,
        activePageId: nextActiveId,
        updatedAt: new Date().toISOString(),
      };
      const persisted = persistProject(repaired.path, next);
      return repairProjectRecord(persisted);
    },

    renamePage(projectId: string, pageId: string, title: string): ProjectRecord {
      const current = requireProject(projectId);
      const repaired = repairProjectRecord({ ...current.project, path: current.dir });
      const trimmed = validateTitle(title);
      const existingPages = repaired.pages ?? [];
      const nextPages = existingPages.map((p) =>
        p.id === pageId ? { ...p, title: trimmed, updatedAt: new Date().toISOString() } : p,
      );
      const { path: _path, ...projectData } = repaired;
      const next: Project = {
        ...projectData,
        pages: nextPages,
        updatedAt: new Date().toISOString(),
      };
      return persistProject(repaired.path, next);
    },

    setActivePage(projectId: string, pageId: string): ProjectRecord {
      const current = requireProject(projectId);
      const repaired = repairProjectRecord({ ...current.project, path: current.dir });
      const pages = repaired.pages ?? [];
      const targetPage = pages.find((p) => p.id === pageId);
      if (!targetPage) {
        throw new ProjectStoreError('page-not-found', `page ${pageId} not found in project ${projectId}`);
      }
      const { path: _path, ...projectData } = repaired;
      const next: Project = {
        ...projectData,
        activePageId: pageId,
        updatedAt: new Date().toISOString(),
      };
      const persisted = persistProject(repaired.path, next);
      return repairProjectRecord(persisted);
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
