/**
 * 媒体生成执行前惰性绑定本地项目。
 *
 * 作品媒体必须落项目根；非项目会话画布没有 ProjectStore 绑定。
 * 本 helper 在 media generate 且尚未绑定时，向默认库种子一个项目并把
 * `canvasWorkspaceIds` 写成该 workspace，供 `findByCanvasWorkspaceId` 扫盘命中。
 *
 * 幂等：已绑定则直接返回。并发：同一 workspaceId 共用一条 in-flight Promise。
 */
import { MAX_PROJECT_TITLE_LENGTH } from './schema';
import type { ProjectRecord, ProjectStore } from './ProjectStore';

export const FALLBACK_PROJECT_TITLE = '模板';

export type EnsureProjectBoundFn = (
  workspaceId: string,
  title?: string | null,
) => Promise<ProjectRecord>;

const inflightByWorkspace = new Map<string, Promise<ProjectRecord>>();

export function normalizeBoundProjectTitle(title?: string | null): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed) return FALLBACK_PROJECT_TITLE;
  return trimmed.length > MAX_PROJECT_TITLE_LENGTH
    ? trimmed.slice(0, MAX_PROJECT_TITLE_LENGTH)
    : trimmed;
}

export function ensureProjectBound(
  projectStore: ProjectStore,
  workspaceId: string,
  title?: string | null,
): Promise<ProjectRecord> {
  const existing = projectStore.findByCanvasWorkspaceId(workspaceId);
  if (existing) return Promise.resolve(existing);

  const pending = inflightByWorkspace.get(workspaceId);
  if (pending) return pending;

  const created = Promise.resolve()
    .then(() => {
      const again = projectStore.findByCanvasWorkspaceId(workspaceId);
      if (again) return again;
      return projectStore.create(normalizeBoundProjectTitle(title), {
        canvasWorkspaceIds: [workspaceId],
      });
    })
    .finally(() => {
      inflightByWorkspace.delete(workspaceId);
    });

  inflightByWorkspace.set(workspaceId, created);
  return created;
}

export function bindEnsureProjectBound(projectStore: ProjectStore): EnsureProjectBoundFn {
  return (workspaceId, title) => ensureProjectBound(projectStore, workspaceId, title);
}
