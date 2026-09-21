/**
 * 工作区文件夹项目登记（Issue #2104）。
 *
 * 工作区里出现的创作页必须能被项目页看到：只要会话所在文件夹里建了画布，
 * 就在**该既有文件夹**内补一份 `.omnimux/project.json`，并把画布登记为该项目
 * 的一个创作页。既有 `ensureProjectBound` 只在媒体生成时分配新文件夹，管不到
 * 「画布先建、生成后到」的路径，这里补的是同一件事的前半段。
 *
 * 红线：只在库根内的既有目录写元数据，绝不新建重复目录，绝不 rm 用户文件夹；
 * 登记失败不得影响画布创建（调用方 best-effort）。
 */
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { assertProjectInsideLibrary } from './paths.ts';
import type { ProjectRecord, ProjectStore } from './ProjectStore.ts';
import { MAX_PROJECT_TITLE_LENGTH } from './schema.ts';

/** 工具侧回调：宿主闭包已绑定库根与会话→目录解析。 */
export type BindWorkspaceProjectFn = (input: {
  canvasWorkspaceId: string;
  sessionId?: string | null;
  workspaceDir?: string | null;
  title?: string | null;
}) => Promise<ProjectRecord | null>;

export interface WorkspaceProjectBindingInput {
  /** 会话工作区目录（库根下一层的既有文件夹）。 */
  workspaceDir?: string | null;
  /** 要登记为该工作区项目创作页的画布工作区 id（`ws_*`）。 */
  canvasWorkspaceId?: string | null;
  /** 会话 id；登记时写入项目档案，供按会话反查。 */
  sessionId?: string | null;
  /** 项目标题；缺省取文件夹名。 */
  title?: string | null;
  /** 库根（默认 `~/Movies/OmniMux/Projects`）。 */
  libraryRoot: string;
  /** 是否允许在库外工作区自动初始化项目（Agent 作业建画布时使用）。 */
  allowCreateOutsideLibrary?: boolean;
}

/** 标题：显式标题优先，否则文件夹名，超长截断。 */
export function normalizeWorkspaceProjectTitle(
  title: string | null | undefined,
  workspaceDir: string,
): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const base = trimmed !== '' ? trimmed : basename(resolve(workspaceDir));
  return base.length > MAX_PROJECT_TITLE_LENGTH ? base.slice(0, MAX_PROJECT_TITLE_LENGTH) : base;
}

function normalizeCanvasId(canvasWorkspaceId: string | null | undefined): string | null {
  const value = typeof canvasWorkspaceId === 'string' ? canvasWorkspaceId.trim() : '';
  return value === '' ? null : value;
}

/** 该项目是否已经把这个画布登记为任一创作页。 */
function canvasAlreadyBound(record: ProjectRecord, canvasId: string): boolean {
  if (record.canvasWorkspaceIds?.includes(canvasId)) return true;
  return (record.pages ?? []).some((page) => page.canvasWorkspaceId === canvasId);
}

function findProjectByRoot(
  projectStore: ProjectStore,
  root: string,
): ProjectRecord | null {
  if (typeof projectStore.findByRoot === 'function') {
    return projectStore.findByRoot(root);
  }
  const row = projectStore.list().find((entry) => resolve(entry.path) === root);
  if (!row) return null;
  try {
    return projectStore.get(row.id);
  } catch {
    return null;
  }
}

/**
 * 把既有工作区文件夹登记为项目（幂等）。
 *
 * @returns 登记后的项目；库根之外、目录缺失或登记不可用时返回 `null`。
 */
export function ensureWorkspaceProjectBound(
  projectStore: ProjectStore,
  input: WorkspaceProjectBindingInput,
): ProjectRecord | null {
  const dir = typeof input.workspaceDir === 'string' ? input.workspaceDir.trim() : '';
  if (dir === '') return null;
  const root = resolve(dir);

  const canvasId = normalizeCanvasId(input.canvasWorkspaceId);
  const title = normalizeWorkspaceProjectTitle(input.title, root);
  const existing = findProjectByRoot(projectStore, root);

  if (existing) {
    if (canvasId === null || canvasAlreadyBound(existing, canvasId)) return existing;
    return projectStore.addPage(existing.id, title, { canvasWorkspaceId: canvasId });
  }

  const projectFile = join(root, '.omnimux', 'project.json');
  if (!existsSync(projectFile) && !input.allowCreateOutsideLibrary) {
    try {
      assertProjectInsideLibrary(root, input.libraryRoot);
    } catch {
      return null;
    }
  }

  try {
    return projectStore.create(title, {
      projectRoot: root,
      sessionId: input.sessionId ?? null,
      ...(canvasId !== null ? { canvasWorkspaceIds: [canvasId] } : {}),
    });
  } catch (error) {
    // 并发写入：另一个调用已经种子了同一目录 → 复用而不是抛错。
    const raced = findProjectByRoot(projectStore, root);
    if (raced) return raced;
    throw error;
  }
}

/**
 * 组装工具侧回调：宿主注入「会话 id → 工作区目录」，其余边界在这里收敛。
 * 解析不可用（宿主无 `agents` 服务、会话无 cwd）时返回 `null`，不报错。
 */
export function createWorkspaceProjectBinder(deps: {
  projectStore: ProjectStore;
  libraryRoot: string;
  resolveWorkspaceDir?: (sessionId: string) => string | undefined;
}): BindWorkspaceProjectFn {
  return async (input) => {
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';
    let workspaceDir: string | undefined = typeof input.workspaceDir === 'string' && input.workspaceDir.trim() ? input.workspaceDir.trim() : undefined;
    if (!workspaceDir && sessionId && typeof deps.resolveWorkspaceDir === 'function') {
      try {
        workspaceDir = deps.resolveWorkspaceDir(sessionId);
      } catch {
        return null; // 宿主服务抖动不该冒泡成工具失败
      }
    }
    if (typeof workspaceDir !== 'string' || workspaceDir.trim() === '') return null;
    return ensureWorkspaceProjectBound(deps.projectStore, {
      workspaceDir,
      canvasWorkspaceId: input.canvasWorkspaceId,
      sessionId: sessionId || undefined,
      title: input.title,
      libraryRoot: deps.libraryRoot,
      allowCreateOutsideLibrary: true,
    });
  };
}
