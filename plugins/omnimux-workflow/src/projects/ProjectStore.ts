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
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { allocateUniqueProjectFolder, sanitizeFolderName } from './folderName.ts';
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
import {
  DEFAULT_ENSURE_LOCK_STALE_MS,
  DEFAULT_ENSURE_LOCK_TIMEOUT_MS,
  runEnsureProject,
  runPreflightProject,
  type EnsureProjectInput,
  type EnsureProjectResult,
  type PreflightProjectInput,
  type PreflightProjectResult,
} from './ensureProject.ts';

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
    /** Legacy callers may pass a preferred first canvas id; it becomes the default page. */
    canvasWorkspaceIds?: string[];
  }): ProjectRecord;
  get(id: string): ProjectRecord;
  rename(id: string, title: string): ProjectRecord;
  /** 按文件夹绝对路径认项目（含外部登记与磁盘档案）。 */
  findByRoot(projectRoot: string): ProjectRecord | null;
  /** Resolve a canvas `ws_*` id to the owning project via pages. */
  findByCanvasWorkspaceId(workspaceId: string): ProjectRecord | null;
  addPage(projectId: string, pageTitle: string, opts?: { canvasWorkspaceId?: string; loadMemory?: boolean }): ProjectRecord;
  removePage(projectId: string, pageId: string): ProjectRecord;
  renamePage(projectId: string, pageId: string, title: string): ProjectRecord;
  setActivePage(projectId: string, pageId: string): ProjectRecord;
  /**
   * 摘除元数据，保留用户文件夹与画布/资产（默认）；
   * `purge: true`（删除项目）再删 `.omnimux/canvases/` 与 `assets.json`，用户自有文件仍保留。
   */
  remove(id: string, opts?: { purge?: boolean }): void;
  /**
   * 项目↔工作区对齐唯一入口（B1）：S0–S4 + 幂等 existing。
   * 单一真源 = `<root>/.omnimux/project.json` + 画布文件；registry 只是索引。
   */
  ensureProject(input: EnsureProjectInput): Promise<EnsureProjectResult>;
  /** 只读对齐预检（S0–S4 + 建议动作），零写盘。 */
  preflightProject(input: PreflightProjectInput): Promise<PreflightProjectResult>;
  /** 库内判定（lexical + realpath），供路由区分独立/关联工作区。 */
  isInsideLibrary(dir: string): boolean;
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
        canvasWorkspaceId: `ws_${project.id.replace(/-/g, '').slice(0, 12)}`,
      }];
  return {
    id: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
    path,
    pages: existingPages,
    activePageId: project.activePageId || existingPages[0]?.id || '',
  };
}

export function createProjectStore(opts: {
  libraryRoot: string;
  /**
   * 可重建索引的补全来源：已注册的工作区目录（B2 路由接 workspaceRegistry）。
   * 扫描到「目录有合法 project.json 但 registry 无记录」时补索引（文件优先自愈）。
   */
  workspaceDirs?: () => string[];
  /** 跨进程 `.omnimux/.lock` 等待上限（测试可调小）。 */
  lockTimeoutMs?: number;
  /** 锁文件过期回收阈值（测试可调小）。 */
  lockStaleMs?: number;
  /** 是否创建库根目录（默认 true；只读预检传 false，避免预检写盘）。 */
  ensureLibrary?: boolean;
}): ProjectStore {
  const { libraryRoot } = opts;
  const lockTimeoutMs = opts.lockTimeoutMs ?? DEFAULT_ENSURE_LOCK_TIMEOUT_MS;
  const lockStaleMs = opts.lockStaleMs ?? DEFAULT_ENSURE_LOCK_STALE_MS;
  if (opts.ensureLibrary !== false) mkdirSync(libraryRoot, { recursive: true });
  const externalProjectsFile = join(libraryRoot, '.external-projects.json');
  // 库根可能是符号链接（macOS /var → /private/var）：lexical 与 realpath 两种形态都算库内。
  // 写路径（persistProject/register）与扫描必须共用同一判定（评审 F6）。
  let realLibraryRoot: string | null = null;
  try {
    realLibraryRoot = realpathSync(resolve(libraryRoot));
  } catch {
    realLibraryRoot = null;
  }

  function isInsideLibrary(dir: string): boolean {
    const root = resolve(dir);
    if (isInsideDir(root, resolve(libraryRoot))) return true;
    if (realLibraryRoot === null) return false;
    if (isInsideDir(root, realLibraryRoot)) return true;
    try {
      return isInsideDir(realpathSync(root), realLibraryRoot);
    } catch {
      return false;
    }
  }

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
    if (isInsideLibrary(root)) return;
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
        // Registered external dir exists but its project.json is unreadable (corrupt
        // or unsupported schema). Keep it registered and leave a diagnostic instead of
        // silently dropping a real user project from the registry.
        console.warn(`[project-store] external project at ${dir} has an unreadable .omnimux/project.json; kept in registry for repair`);
        validExternalDirs.push(dir);
        continue;
      }
      rows.push({ dir, project });
      seenDirs.add(dir);
      validExternalDirs.push(dir);
    }
    // 有文件补索引：已注册工作区目录若已有合法 project.json 而 registry 漏记，
    // 以文件为准补索引（文件优先自愈；只登记，不动用户文件）。
    if (typeof opts.workspaceDirs === 'function') {
      let candidates: string[] = [];
      try {
        candidates = opts.workspaceDirs() ?? [];
      } catch {
        candidates = [];
      }
      for (const candidate of candidates) {
        if (typeof candidate !== 'string' || candidate.trim() === '') continue;
        const lexical = resolve(candidate);
        let dir: string;
        try {
          dir = realpathSync(lexical);
        } catch {
          continue;
        }
        // 兼容「库路径是 /var/…、realpath 是 /private/var/…」的同一目录去重。
        if (seenDirs.has(dir) || seenDirs.has(lexical)) continue;
        const file = join(dir, '.omnimux', 'project.json');
        if (!existsSync(file)) continue;
        const project = parseProject(readJsonFile(file));
        if (!project) continue;
        rows.push({ dir, project });
        seenDirs.add(dir);
        seenDirs.add(lexical);
        if (!isInsideLibrary(dir) && !validExternalDirs.includes(dir)) {
          validExternalDirs.push(dir);
          externalChanged = true;
        }
      }
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
    const insideLibrary = isInsideLibrary(paths.projectRoot);
    if (insideLibrary && isInsideDir(paths.projectRoot, resolve(libraryRoot))) {
      assertProjectInsideLibrary(paths.projectRoot, libraryRoot);
    }
    assertProjectWriteSafe(paths.projectFile, paths.projectRoot);
    const { path: _path, ...cleanProject } = project as Project & { path?: string };
    // 先写档案、后登记索引：写盘失败时 registry 不会指向「无档案的 root」（评审 F5）。
    atomicWriteJson(paths.projectFile, cleanProject);
    if (!insideLibrary) registerExternalProjectDir(paths.projectRoot);
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
    let pages: ProjectPage[] = Array.isArray(record.pages) && record.pages.length > 0
      ? [...record.pages]
      : [];

    if (pages.length === 0) {
      changed = true;
      pages = [{
        id: 'page-default',
        title: record.title || '创作页 1',
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || new Date().toISOString(),
        canvasWorkspaceId: `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      }];
    }

    pages = pages.map((page) => {
      const wsId = typeof page.canvasWorkspaceId === 'string' ? page.canvasWorkspaceId.trim() : '';
      if (!wsId) {
        changed = true;
        return { ...page, canvasWorkspaceId: `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}` };
      }
      if (page.canvasWorkspaceId !== wsId) {
        changed = true;
        return { ...page, canvasWorkspaceId: wsId };
      }
      return page;
    });

    let nextActivePageId = record.activePageId;
    if (!nextActivePageId || !pages.some((page) => page.id === nextActivePageId)) {
      nextActivePageId = pages[0]?.id ?? '';
      if (nextActivePageId !== record.activePageId) changed = true;
    }

    if (changed) {
      const { path: _path, ...projectData } = record;
      const nextProject: Project = {
        ...projectData,
        pages,
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
        // A v1 (or otherwise repairable) record now parses via migrateV1Project, so
        // lookupByRoot returns a project instead of null → this seed is idempotent
        // (returns the existing/migrated record), never a 409.
        const existing = lookupByRoot(paths.projectRoot);
        if (existing) return existing;
        // File exists but is genuinely unreadable (bad JSON / unsupported schema).
        // Surface an actionable error instead of a bare `project-exists` — the bare
        // 409 is what the UI looped on ("已有项目/新建创作页" that never created).
        throw new ProjectStoreError(
          'project-record-invalid',
          `existing .omnimux/project.json at ${paths.projectRoot} is not a readable project record; fix or remove it to create a project here`,
        );
      }
      const now = new Date().toISOString();
      const requestedCanvasIds = Array.from(new Set(
        (createOpts.canvasWorkspaceIds ?? []).map((id) => id.trim()).filter(Boolean),
      ));
      const canvasIds = requestedCanvasIds.length > 0
        ? requestedCanvasIds
        : [`ws_${newProjectId().replace(/-/g, '').slice(0, 12)}`];
      const pages: ProjectPage[] = canvasIds.map((canvasWorkspaceId, index) => ({
        id: index === 0 ? 'page-default' : `page-${index + 1}`,
        title: index === 0 ? trimmed : `${trimmed} · 创作页 ${index + 1}`,
        createdAt: now,
        updatedAt: now,
        canvasWorkspaceId,
      }));
      const project: Project = {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        id: newProjectId(),
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        activePageId: pages[0]!.id,
        pages,
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

    findByCanvasWorkspaceId(workspaceId: string): ProjectRecord | null {
      if (typeof workspaceId !== 'string' || workspaceId.trim() === '') return null;
      const id = workspaceId.trim();
      for (const row of scanEntries()) {
        const repaired = repairProjectRecord({ ...row.project, path: row.dir });
        if (repaired.pages?.some((page) => page.canvasWorkspaceId === id)) return repaired;
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
      // b. 将 project.activePageId 设置为新页面的 pageId
      const { path: _path, ...projectData } = repaired;
      const next: Project = {
        ...projectData,
        pages: nextPages,
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
          ? (nextPages[0]?.id ?? '')
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

    remove(id: string, opts: { purge?: boolean } = {}): void {
      const current = requireProject(id);
      const paths = resolveProjectPaths(current.dir);
      assertProjectWriteSafe(paths.projectFile, paths.projectRoot);
      // 只摘「项目档案」：画布（.omnimux/canvases）、assets.json、生成物与用户
      // 文件夹全部保留（单一真源里画布文件属于用户数据，默认不做删除）。
      if (existsSync(paths.projectFile)) rmSync(paths.projectFile, { force: true });
      if (opts.purge) {
        // 「删除项目」：在移出项目库的基础上，再删画布与资产元数据；用户根目录
        // 自有文件与文件夹一律保留（不 rm 用户文件红线）。
        if (existsSync(paths.canvasesDir)) {
          assertProjectWriteSafe(paths.canvasesDir, paths.projectRoot);
          rmSync(paths.canvasesDir, { recursive: true, force: true });
        }
        if (existsSync(paths.assetsFile)) {
          assertProjectWriteSafe(paths.assetsFile, paths.projectRoot);
          rmSync(paths.assetsFile, { force: true });
        }
      }
      unregisterExternalProjectDir(paths.projectRoot);
    },

    preflightProject(input: PreflightProjectInput): Promise<PreflightProjectResult> {
      return runPreflightProject({
        libraryRoot,
        isInsideLibrary,
        loadExternalProjectDirs,
        saveExternalProjectDirs,
        registerExternalProjectDir,
        persistProject,
        lockTimeoutMs,
        lockStaleMs,
      }, input);
    },

    isInsideLibrary(dir: string): boolean {
      return isInsideLibrary(dir);
    },

    ensureProject(input: EnsureProjectInput): Promise<EnsureProjectResult> {
      return runEnsureProject({
        libraryRoot,
        isInsideLibrary,
        loadExternalProjectDirs,
        saveExternalProjectDirs,
        registerExternalProjectDir,
        persistProject,
        lockTimeoutMs,
        lockStaleMs,
      }, input);
    },
  };
}
