/**
 * 项目落盘路径解析 + 写入 containment 断言。
 *
 * 红线（docs/contracts/gxgen-workflow-migration.md §5）：
 *   磁盘写只落「项目根」内（.omnimux/project.json），
 *   项目根必须落在默认库 `<videos>/OmniMux/Projects` 下。
 *   不再把当前会话 cwd 当项目库作用域。
 *
 * 实现复用官方 media 路由的 `isInsideDir`（lexical）+ `realpathSync`
 * （symlink）双重 containment。
 */
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

/** 结构化错误：路径非法 / 写入越界。路由层据此映射 400/403。 */
export class ProjectPathError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ProjectPathError';
  }
}

/** @deprecated 人读种子文件名（旧规格，不再自动生成 说明.md）。 */
export const PROJECT_README_NAME = '说明.md';

export interface ProjectPaths {
  /** 作品包根 = dsh workspace.path = 会话 cwd。 */
  projectRoot: string;
  /** `<projectRoot>/.omnimux` */
  metaDir: string;
  /** `<projectRoot>/.omnimux/project.json` */
  projectFile: string;
  /** `<projectRoot>/.omnimux/assets.json` */
  assetsFile: string;
  /** `<projectRoot>/assets/imported` */
  importedDir: string;
  /** `<projectRoot>/assets/subjects` */
  subjectsDir: string;
  /** `<projectRoot>/artifacts` — 画布 AIGC / 合成产物 */
  artifactsDir: string;
  /** `<projectRoot>/.omnimux/canvases` — 绑定后的 DAG */
  canvasesDir: string;
  /** `<projectRoot>/说明.md` (已废弃，新建项目不再自动生成) */
  readmeFile: string;
}

export interface LibraryPaths {
  /** `<videos>/OmniMux/Projects` */
  libraryRoot: string;
}

/** Lexical containment（分隔符边界，杜绝前缀误判），与 canvasRoutes.ts 同款。 */
export function isInsideDir(target: string, root: string): boolean {
  return target === root || target.startsWith(root + sep);
}

function assertExistingDirectory(abs: string, code: string, label: string): string {
  if (typeof abs !== 'string' || abs.trim() === '') {
    throw new ProjectPathError(code, `${label} must be a non-empty string`);
  }
  if (!isAbsolute(abs)) {
    throw new ProjectPathError(code, `${label} must be an absolute path`);
  }
  const normalized = resolve(abs);
  try {
    if (!statSync(normalized).isDirectory()) {
      throw new Error(`${label} is not a directory`);
    }
    realpathSync(normalized);
  } catch (error) {
    if (error instanceof ProjectPathError) throw error;
    throw new ProjectPathError(code, `${label} does not exist or is not a directory`);
  }
  return normalized;
}

/**
 * 解析默认库根。库根必须已存在（GET library / ensureLibraryRoot 会先建）。
 */
export function resolveLibraryPaths(libraryRoot: string): LibraryPaths {
  const normalized = assertExistingDirectory(libraryRoot, 'invalid-library-root', 'libraryRoot');
  return { libraryRoot: normalized };
}

/**
 * 解析单个项目根（作品包文件夹），断言绝对路径且真实存在为目录。
 * `.omnimux/` 尚未创建时仍允许（首次 POST 种子）。
 */
export function resolveProjectPaths(projectRoot: string): ProjectPaths {
  const normalized = assertExistingDirectory(projectRoot, 'invalid-project-root', 'projectRoot');
  const metaDir = join(normalized, '.omnimux');
  if (!isInsideDir(metaDir, normalized)) {
    throw new ProjectPathError('path-denied', 'meta dir escapes project root');
  }
  return {
    projectRoot: normalized,
    metaDir,
    projectFile: join(metaDir, 'project.json'),
    assetsFile: join(metaDir, 'assets.json'),
    importedDir: join(normalized, 'assets', 'imported'),
    subjectsDir: join(normalized, 'assets', 'subjects'),
    artifactsDir: join(normalized, 'artifacts'),
    canvasesDir: join(metaDir, 'canvases'),
    readmeFile: join(normalized, PROJECT_README_NAME),
  };
}

function looksAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

/**
 * Resolve a project-relative POSIX path. Absolute / `..` / NUL → path-denied.
 */
export function resolveProjectRelPath(projectRoot: string, rel: string): string {
  if (typeof rel !== 'string' || rel.trim() === '') {
    throw new ProjectPathError('path-denied', 'relative path is required');
  }
  if (rel.includes('\0')) {
    throw new ProjectPathError('path-denied', 'relative path contains NUL');
  }
  const posix = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (looksAbsolutePath(rel) || isAbsolute(rel)) {
    throw new ProjectPathError('path-denied', 'absolute paths are not allowed as relative_path');
  }
  if (posix.split('/').some((segment) => segment === '..')) {
    throw new ProjectPathError('path-denied', 'relative path escapes project root');
  }
  const root = resolve(projectRoot);
  const target = resolve(join(root, posix));
  if (!isInsideDir(target, root)) {
    throw new ProjectPathError('path-denied', 'relative path escapes project root');
  }
  return target;
}

/**
 * Convert an absolute path already inside projectRoot to a POSIX relative path.
 */
export function toProjectRelativePath(projectRoot: string, abs: string): string {
  const root = resolve(projectRoot);
  const target = resolve(abs);
  if (!isInsideDir(target, root)) {
    throw new ProjectPathError('path-denied', 'path is outside project root');
  }
  const rel = target.slice(root.length).replace(/\\/g, '/');
  return rel.startsWith('/') ? rel.slice(1) : rel;
}

/**
 * `projectRoot` 必须落在 `libraryRoot` 内（且不能等于库根本身）。
 */
export function assertProjectInsideLibrary(projectRoot: string, libraryRoot: string): void {
  const root = resolve(libraryRoot);
  const target = resolve(projectRoot);
  if (target === root || !isInsideDir(target, root)) {
    throw new ProjectPathError('path-denied', 'project root escapes library root');
  }
}

/**
 * 写入前双重 containment：lexical + realpath。
 * `target` 必须落在 `root`（libraryRoot 或 projectRoot）内。
 */
export function assertProjectWriteSafe(target: string, root: string): void {
  if (!isInsideDir(target, root)) {
    throw new ProjectPathError('path-denied', 'project path escapes containment root');
  }
  try {
    const realRoot = realpathSync(root);
    const realTarget = realpathSync(target);
    if (!isInsideDir(realTarget, realRoot)) {
      throw new ProjectPathError('path-denied', 'project path escapes containment root (symlink)');
    }
  } catch (error) {
    if (error instanceof ProjectPathError) throw error;
    // root / target 尚未存在时跳过 realpath 层。
  }
}
