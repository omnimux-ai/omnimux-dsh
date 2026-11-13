/**
 * ensureProject —— 项目↔工作区关系模型（B1：数据/契约层）。
 *
 * 唯一入口，两种模式（PRD project-workspace-model v2 §2）：
 *   - independent：不选工作区，root = 默认库下按标题派生的唯一文件夹；
 *   - workspace  ：选了工作区，对 realpath(workspaceDir) 执行对齐状态机。
 *
 * 状态机（动作名即返回值 action）：
 *   S0 无 project.json 且无画布文件       → initialized   初始化档案 + 首创作页
 *   S1 有合法 project.json               → adopted       采纳/登记（pages 缺失引用补齐）
 *   S2 有 project.json 但旧版/坏 JSON     → repaired      v1→v2 读迁移后写回 / 容错重建
 *   S3 无（或坏）档案但有画布文件          → adopted-files 以画布文件重建 pages（保留原 canvasWorkspaceId）
 *   S4 registry 指向同一 root 的重复记录   → converged     以文件为准收敛索引（不动用户文件）
 *   —  同一调用重复执行                    → existing      幂等返回同一 project.id / 同一 root
 *
 * 单一真源：`<root>/.omnimux/project.json` + 画布文件；`.external-projects.json`
 * 只是可重建索引，文件优先（scanEntries 侧做「有文件补索引 / 无文件删索引」自愈）。
 *
 * 事务：写盘统一走 ProjectStore.persistProject → 临时文件 + rename 原子替换；
 * 失败时目录要么没有 project.json，要么是合法档案（不会半写）。
 *
 * 并发：按 resolve(root) 的进程内 mutex 串行 + 跨进程 `.omnimux/.lock`
 * （`wx` 创建、超时轮询、过期回收）；两并发只产生 1 个项目 / 1 个 project.json。
 */
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { sanitizeFolderName } from './folderName.ts';
import { assertProjectInsideLibrary, resolveProjectPaths } from './paths.ts';
import {
  MAX_PROJECT_TITLE_LENGTH,
  PROJECT_SCHEMA_VERSION,
  parseProject,
  projectSchema,
  type Project,
  type ProjectPage,
} from './schema.ts';
import type { ProjectRecord } from './ProjectStore.ts';

export type EnsureProjectMode = 'independent' | 'workspace';

export interface EnsureProjectInput {
  mode: EnsureProjectMode;
  /** workspace 模式必填：要绑定的工作区目录（绝对路径）。 */
  workspaceDir?: string;
  /** 可选标题；缺省时 independent 用「未命名项目」，workspace 用目录名。 */
  title?: string;
}

export type EnsureProjectAction =
  | 'initialized'
  | 'adopted'
  | 'repaired'
  | 'adopted-files'
  | 'converged'
  | 'existing';

export interface EnsureProjectResult {
  action: EnsureProjectAction;
  project: ProjectRecord;
  root: string;
}

export type PreflightState = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'independent';
export type PreflightAction = 'initialize' | 'open' | 'rebuild' | 'repair' | 'converge' | 'create-independent';

export interface PreflightProjectInput {
  mode?: EnsureProjectMode;
  workspaceDir?: string;
  /** 兼容旧调用：等价于 workspaceDir。 */
  projectRoot?: string;
  title?: string;
}

export interface PreflightProjectResult {
  mode: EnsureProjectMode;
  state: PreflightState;
  action: PreflightAction;
  root: string;
  workspaceDir: string | null;
  /** 预检只读视图（未写盘）；无档案时为 null。 */
  project: { id: string; title: string; pages: ProjectPage[]; activePageId: string; path: string } | null;
}

/** ProjectStore 注入给状态机的写入/索引能力（不在此复制迁移或落盘逻辑）。 */
export interface EnsureProjectDeps {
  libraryRoot: string;
  /** 库内判定（lexical + realpath，符号链接库根两种形态都算库内）。 */
  isInsideLibrary(dir: string): boolean;
  loadExternalProjectDirs(): string[];
  saveExternalProjectDirs(dirs: string[]): void;
  registerExternalProjectDir(dir: string): void;
  persistProject(dir: string, project: Project): ProjectRecord;
  /** 跨进程锁等待上限（毫秒）。 */
  lockTimeoutMs: number;
  /** 超过该年龄的锁文件视为进程已死，可回收（毫秒）。 */
  lockStaleMs: number;
}

export const DEFAULT_ENSURE_LOCK_TIMEOUT_MS = 10_000;
/** 默认必须大于 lockTimeoutMs：只按年龄回收活锁会抢占合法持有者（评审 F1）。 */
export const DEFAULT_ENSURE_LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 25;
/** 不可解析锁的最短回收宽限：有效锁是 `wx` 原子创建的完整 JSON，坏文件只可能是崩溃残留。
 *  不能等到 30s（默认 lockStaleMs）——那会让首次打开必超时（评审 F1b），也不能 0——写入瞬间
 *  可能读到半文件。1s 宽限兼顾两者。 */
const UNREADABLE_LOCK_GRACE_MS = 1_000;
const CANVAS_ID_RE = /^ws_[a-zA-Z0-9_-]{1,128}$/;
const FALLBACK_TITLE = '未命名项目';

class EnsureProjectError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'EnsureProjectError';
  }
}

export function isEnsureProjectError(error: unknown): error is EnsureProjectError {
  return error instanceof EnsureProjectError;
}

/* ────────────────────────────── 输入 / 路径解析 ────────────────────────────── */

function resolveTitle(value: string | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback.trim();
  const safe = trimmed !== '' ? trimmed : FALLBACK_TITLE;
  if (typeof value === 'string' && value.trim() !== '' && value.trim().length > MAX_PROJECT_TITLE_LENGTH) {
    throw new EnsureProjectError('title-too-long', `project title exceeds ${MAX_PROJECT_TITLE_LENGTH} characters`);
  }
  return safe.slice(0, MAX_PROJECT_TITLE_LENGTH);
}

/**
 * independent 模式 root：默认库下一层，按标题派生（确定性 → 重复调用同一 root）。
 * 不用 allocateUniqueProjectFolder：后者每次分配新文件夹，会破坏 ensure 幂等。
 */
function independentRoot(libraryRoot: string, title?: string): string {
  const folder = sanitizeFolderName(resolveTitle(title, FALLBACK_TITLE));
  if (folder === '') {
    throw new EnsureProjectError('title-invalid', 'folder name is empty after sanitizing');
  }
  const root = join(resolve(libraryRoot), folder);
  assertProjectInsideLibrary(root, resolve(libraryRoot));
  return root;
}

function resolveWorkspaceRoot(workspaceDir: string | undefined): string {
  const raw = typeof workspaceDir === 'string' ? workspaceDir.trim() : '';
  if (raw === '') {
    throw new EnsureProjectError('invalid-workspace-dir', 'workspace mode requires workspaceDir');
  }
  if (!isAbsolute(raw)) {
    throw new EnsureProjectError('invalid-workspace-dir', 'workspaceDir must be an absolute path');
  }
  let real: string;
  try {
    if (!statSync(raw).isDirectory()) {
      throw new Error('not a directory');
    }
    real = realpathSync(raw);
  } catch {
    throw new EnsureProjectError('invalid-workspace-dir', `workspaceDir does not exist or is not a directory: ${raw}`);
  }
  return real;
}

/* ─────────────────────────────── 锁（并发） ──────────────────────────────── */

/** 进程内 mutex：key = resolve(root)。同一 root 的 ensure 串行执行。 */
const inProcessTails = new Map<string, Promise<void>>();

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function withRootLock<T>(deps: EnsureProjectDeps, root: string, fn: () => T | Promise<T>): Promise<T> {
  const key = resolve(root);
  const previous = inProcessTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  const tail = previous.then(() => gate);
  inProcessTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await withFileLock(deps, root, fn);
  } finally {
    release();
    if (inProcessTails.get(key) === tail) inProcessTails.delete(key);
  }
}

function lockAgeMs(lockPath: string): number {
  try {
    return Date.now() - statSync(lockPath).mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * 锁持有者是否仍存活（评审 F1）：只按 mtime 年龄回收会抢占合法慢持有者，
 * 导致两个 writer 各建一个 project id。这里以锁里的 pid 为准：
 *   - pid 已不存在（ESRCH）→ 死锁，可立即回收；
 *   - pid 存活（或 EPERM/无法判定）→ 不抢，等超时或持有者自己释放。
 */
function lockHolderAlive(lockPath: string): boolean | null {
  let pid: number;
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid?: unknown };
    pid = typeof parsed.pid === 'number' ? parsed.pid : Number(parsed.pid);
  } catch {
    return null;
  }
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return null;
  }
}

async function withFileLock<T>(deps: EnsureProjectDeps, root: string, fn: () => T | Promise<T>): Promise<T> {
  const paths = resolveProjectPaths(root);
  mkdirSync(paths.metaDir, { recursive: true });
  const lockPath = join(paths.metaDir, '.lock');
  const started = Date.now();
  for (;;) {
    try {
      writeFileSync(lockPath, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      break;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (code !== 'EEXIST') {
        throw new EnsureProjectError('project-lock-failed', `could not create .omnimux/.lock at ${root}: ${(error as Error)?.message ?? String(error)}`);
      }
      const age = lockAgeMs(lockPath);
      const alive = lockHolderAlive(lockPath);
      const holderDead = alive === false;
      const unreadableAndStale = alive === null
        && age >= 0
        && age > Math.min(deps.lockStaleMs, UNREADABLE_LOCK_GRACE_MS);
      if (holderDead || unreadableAndStale) {
        rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() - started > deps.lockTimeoutMs) {
        throw new EnsureProjectError('project-lock-timeout', `timed out waiting for .omnimux/.lock at ${root}`);
      }
      await sleep(LOCK_POLL_MS);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lockPath, { force: true });
  }
}

/* ────────────────────────────── 单一真源：画布 ───────────────────────────── */

function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function canvasIdsOnDisk(root: string): string[] {
  const dir = join(root, '.omnimux', 'canvases');
  if (!existsSync(dir)) return [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((id) => CANVAS_ID_RE.test(id))
    .sort();
}

/** 从既有画布文件重建创作页：保留原 canvasWorkspaceId（S3 硬要求），不读坏文件即失败。 */
function pagesFromCanvasFiles(root: string): ProjectPage[] {
  const now = new Date().toISOString();
  return canvasIdsOnDisk(root).map((canvasWorkspaceId, index) => {
    const snapshot = readJsonFile(join(root, '.omnimux', 'canvases', `${canvasWorkspaceId}.json`));
    const record = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : null;
    const rawName = record && typeof record.name === 'string' ? record.name.trim() : '';
    const meta = record && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : null;
    const createdAt = meta && typeof meta.createdAt === 'string' && meta.createdAt !== ''
      ? meta.createdAt
      : now;
    const updatedAt = meta && typeof meta.updatedAt === 'string' && meta.updatedAt !== ''
      ? meta.updatedAt
      : createdAt;
    return {
      id: index === 0 ? 'page-default' : `page-${index + 1}`,
      title: (rawName !== '' ? rawName : `创作页 ${index + 1}`).slice(0, MAX_PROJECT_TITLE_LENGTH),
      createdAt,
      updatedAt,
      canvasWorkspaceId,
      loadMemory: false,
    };
  });
}

/* ────────────────────────────── 档案归一化 ──────────────────────────────── */

function defaultPage(title: string, now: string): ProjectPage {
  return {
    id: 'page-default',
    title: title.slice(0, MAX_PROJECT_TITLE_LENGTH),
    createdAt: now,
    updatedAt: now,
    canvasWorkspaceId: `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    loadMemory: false,
  };
}

function newProject(title: string, pages: ProjectPage[]): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    activePageId: pages[0]!.id,
    pages,
  };
}

function normalizePages(project: Project): { project: Project; changed: boolean } {
  const now = new Date().toISOString();
  let pages: ProjectPage[] = Array.isArray(project.pages) ? project.pages.map((page) => ({ ...page })) : [];
  let changed = false;
  if (pages.length === 0) {
    pages = [defaultPage(project.title, now)];
    changed = true;
  }
  // I4：一个 canvasWorkspaceId 最多映射一个 page —— 重复引用归一（保留首个，其余换新 id）。
  const seenCanvasIds = new Set<string>();
  pages = pages.map((page) => {
    let wsId = typeof page.canvasWorkspaceId === 'string' ? page.canvasWorkspaceId.trim() : '';
    if (wsId === '') {
      changed = true;
      wsId = `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    } else if (seenCanvasIds.has(wsId)) {
      changed = true;
      wsId = `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }
    seenCanvasIds.add(wsId);
    if (wsId !== page.canvasWorkspaceId) {
      return { ...page, canvasWorkspaceId: wsId };
    }
    return page;
  });
  let activePageId = project.activePageId;
  if (typeof activePageId !== 'string' || !pages.some((page) => page.id === activePageId)) {
    activePageId = pages[0]!.id;
    changed = true;
  }
  return { project: { ...project, pages, activePageId }, changed };
}

/* ───────────────────────────── S4：索引收敛 ──────────────────────────────── */

/**
 * 收敛 `.external-projects.json` 中指向同一 root 的重复记录 / 与当前项目同 id 的
 * 其它 root 记录。只改索引，**不动任何用户文件**。
 * @returns 是否有索引被收敛（true → action=converged）
 */
function convergeRegistry(deps: EnsureProjectDeps, root: string, projectId: string): boolean {
  const current = deps.loadExternalProjectDirs();
  const target = resolve(root);
  const seen = new Set<string>();
  const kept: string[] = [];
  let changed = false;
  for (const entry of current) {
    const dir = resolve(entry);
    if (seen.has(dir)) {
      changed = true;
      continue;
    }
    seen.add(dir);
    if (dir === target) {
      kept.push(dir);
      continue;
    }
    // 同一 project id 出现在另一个 root：以当前文件为准，丢弃该重复索引（文件保留）。
    const otherRaw = readJsonFile(join(dir, '.omnimux', 'project.json'));
    const other = otherRaw === undefined ? null : parseProject(otherRaw);
    if (other && other.id === projectId) {
      changed = true;
      continue;
    }
    kept.push(dir);
  }
  if (changed) deps.saveExternalProjectDirs(kept);
  return changed;
}

/* ─────────────────────────────── 状态机本体 ─────────────────────────────── */

function ensureAtRoot(
  deps: EnsureProjectDeps,
  root: string,
  opts: { mode: EnsureProjectMode; title?: string },
): EnsureProjectResult {
  const paths = resolveProjectPaths(root);
  const fileExists = existsSync(paths.projectFile);
  const raw = fileExists ? readJsonFile(paths.projectFile) : undefined;
  const parsed = raw === undefined ? null : parseProject(raw);
  const fallbackTitle = opts.title ?? basename(root) ?? FALLBACK_TITLE;
  const title = resolveTitle(opts.title, fallbackTitle);

  let action: EnsureProjectAction;
  let project: Project;

  if (parsed) {
    const normalized = normalizePages(parsed);
    const strictOnDisk = raw !== undefined && projectSchema.safeParse(raw).success;
    if (!strictOnDisk || normalized.changed) {
      // S1（补齐 pages 引用）或 S2（v1 / 容错结构 → 写回合法 v2）。
      // parseProject 已负责 v1→v2 迁移，这里绝不复制第二份迁移逻辑。
      project = normalized.project;
      action = 'repaired';
    } else {
      project = parsed;
      action = opts.mode === 'workspace' && !isRegisteredOutsideLibrary(deps, root) && !deps.isInsideLibrary(root)
        ? 'adopted'
        : 'existing';
    }
  } else if (fileExists) {
    // S2：project.json 存在但坏 JSON / 不支持的版本 —— 按画布文件容错重建（没有就新建）。
    const fromFiles = pagesFromCanvasFiles(root);
    project = newProject(title, fromFiles.length > 0 ? fromFiles : [defaultPage(title, new Date().toISOString())]);
    action = 'repaired';
  } else {
    const fromFiles = pagesFromCanvasFiles(root);
    if (fromFiles.length > 0) {
      // S3：无档案但有创作页/画布文件 → 采纳既有文件，保留原 canvasWorkspaceId。
      project = newProject(title, fromFiles);
      action = 'adopted-files';
    } else {
      // S0：无档案无文件 → 初始化。
      project = newProject(title, [defaultPage(title, new Date().toISOString())]);
      action = 'initialized';
    }
  }

  const needsWrite = action !== 'existing' && action !== 'adopted';
  const record = needsWrite
    ? deps.persistProject(root, project)
    : { ...project, path: root };
  if (opts.mode === 'workspace' && !deps.isInsideLibrary(root)) {
    // F5：先落盘再改索引 —— 写盘失败时 registry 不会指向「无档案的 root」。
    if (convergeRegistry(deps, root, project.id)) action = 'converged';
    deps.registerExternalProjectDir(root);
  }
  return { action, project: record, root };
}

function isRegisteredOutsideLibrary(deps: EnsureProjectDeps, root: string): boolean {
  if (deps.isInsideLibrary(root)) return false;
  const target = resolve(root);
  return deps.loadExternalProjectDirs().some((entry) => resolve(entry) === target);
}

/* ────────────────────────── 只读对齐预检（B2） ──────────────────────────── */

/** 只读检查 registry 异常：同一 root 重复 / 同 id 的另一个 root。绝不写索引。 */
function registryHasAnomaly(deps: EnsureProjectDeps, root: string, projectId: string | null): boolean {
  const target = resolve(root);
  const seen = new Set<string>();
  let targetSeen = false;
  for (const entry of deps.loadExternalProjectDirs()) {
    const dir = resolve(entry);
    if (dir === target) {
      if (targetSeen) return true; // 本 root 在 registry 里重复
      targetSeen = true;
      continue;
    }
    // 其它 root 的重复索引不属于本 root 的 S4（converge 会处理它自己的重复）。
    if (seen.has(dir)) continue;
    seen.add(dir);
    if (!projectId) continue;
    const otherRaw = readJsonFile(join(dir, '.omnimux', 'project.json'));
    const other = otherRaw === undefined ? null : parseProject(otherRaw);
    if (other && other.id === projectId) return true;
  }
  return false;
}

/**
 * 对齐预检（B2）：返回 S0–S4 状态与建议动作，**零写盘**。
 * 只 stat/read/parse；不 mkdir、不写 project.json、不碰 registry、不建画布。
 */
export async function runPreflightProject(
  deps: EnsureProjectDeps,
  input: PreflightProjectInput,
): Promise<PreflightProjectResult> {
  const candidate = typeof input.workspaceDir === 'string' && input.workspaceDir.trim() !== ''
    ? input.workspaceDir
    : input.projectRoot;
  const wantsWorkspace = input.mode === 'workspace' || (typeof candidate === 'string' && candidate.trim() !== '');
  if (!wantsWorkspace) {
    const root = independentRoot(deps.libraryRoot, input.title);
    return { mode: 'independent', state: 'independent', action: 'create-independent', root, workspaceDir: null, project: null };
  }
  const root = resolveWorkspaceRoot(candidate);
  const paths = resolveProjectPaths(root);
  const fileExists = existsSync(paths.projectFile);
  const raw = fileExists ? readJsonFile(paths.projectFile) : undefined;
  const parsed = raw === undefined ? null : parseProject(raw);
  const normalized = parsed ? normalizePages(parsed) : null;
  const strictOnDisk = raw !== undefined && projectSchema.safeParse(raw).success;
  const canvases = canvasIdsOnDisk(root);
  const preview = normalized
    ? {
        id: normalized.project.id,
        title: normalized.project.title,
        pages: normalized.project.pages,
        activePageId: normalized.project.activePageId,
        path: root,
      }
    : null;

  const anomaly = registryHasAnomaly(deps, root, preview?.id ?? null);

  let state: PreflightState;
  let action: PreflightAction;
  if (parsed) {
    if (strictOnDisk && !normalized?.changed && !anomaly) {
      state = 'S1';
      action = 'open';
    } else if (strictOnDisk && !normalized?.changed && anomaly) {
      state = 'S4';
      action = 'converge';
    } else {
      // v1 / 容错结构 / 缺页引用 / 坏档案 → 修复后打开。
      state = 'S2';
      action = 'repair';
    }
  } else if (fileExists) {
    state = 'S2';
    action = 'repair';
  } else if (canvases.length > 0) {
    state = 'S3';
    action = 'rebuild';
  } else {
    state = 'S0';
    action = 'initialize';
  }
  return { mode: 'workspace', state, action, root, workspaceDir: root, project: preview };
}

/* ─────────────────────────────── 公开入口 ────────────────────────────────── */

export async function runEnsureProject(
  deps: EnsureProjectDeps,
  input: EnsureProjectInput,
): Promise<EnsureProjectResult> {
  if (input.mode === 'independent') {
    const root = independentRoot(deps.libraryRoot, input.title);
    mkdirSync(root, { recursive: true });
    return withRootLock(deps, root, () => ensureAtRoot(deps, root, { mode: 'independent', title: input.title }));
  }
  if (input.mode === 'workspace') {
    const root = resolveWorkspaceRoot(input.workspaceDir);
    return withRootLock(deps, root, () => ensureAtRoot(deps, root, { mode: 'workspace', title: input.title }));
  }
  throw new EnsureProjectError('invalid-mode', `unknown ensureProject mode: ${String((input as { mode?: unknown }).mode)}`);
}

export { EnsureProjectError };
