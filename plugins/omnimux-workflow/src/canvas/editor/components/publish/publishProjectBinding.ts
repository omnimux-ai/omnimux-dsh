/**
 * 发布时解析「所属项目 id」。
 *
 * 画布岛只持有 `workspaceId`；项目归属由 ProjectStore 扫盘维护
 * （`ProjectStore.findByCanvasWorkspaceId`）。这里复用客户端同一条只读接口
 * 拉项目列表，按 `canvasWorkspaceIds` / `pages[].canvasWorkspaceId` 反查，
 * 把结果落进 manifest 的 `workflowBinding.projectId`，供「项目」页
 * 「AI应用」卡片的「编辑」直接定位。
 *
 * 失败一律返回 null：发布不因项目反查失败而中断，消费端按 `workspaceId` 兜底。
 */

/**
 * 项目列表只读路由。真源是 host 侧 `src/projects/routes.ts` 的
 * `PROJECT_ROUTE_PREFIX`（该模块依赖 node:fs，岛 bundle 不能引入），
 * 与客户端 `src/client/api.js` 的 `listProjects()` 同址。
 */
export const PROJECTS_LIST_PATH = '/omnimux-workflow/api/projects';

export interface ProjectLookupRow {
  id?: unknown;
  canvasWorkspaceIds?: unknown;
  pages?: unknown;
}

function textOf(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

/**
 * 在项目列表里找拥有该画布工作区的项目 id。
 *
 * @param projects 项目列表（`GET /omnimux-workflow/api/projects` 的 `projects`）
 * @param workspaceId 画布工作区 id
 * @returns 项目 id，未命中返回 null
 */
export function pickProjectIdForWorkspace(
  projects: readonly ProjectLookupRow[] | undefined,
  workspaceId: string,
): string | null {
  const ws = textOf(workspaceId);
  if (!ws || !Array.isArray(projects)) return null;
  for (const row of projects) {
    if (!row || typeof row !== 'object') continue;
    const id = textOf(row.id);
    if (!id) continue;
    const ids: unknown[] = Array.isArray(row.canvasWorkspaceIds) ? row.canvasWorkspaceIds : [];
    if (ids.some((value: unknown) => textOf(value) === ws)) return id;
    const pages: unknown[] = Array.isArray(row.pages) ? row.pages : [];
    const hit = pages.some((page: unknown) => {
      if (!page || typeof page !== 'object') return false;
      return textOf((page as { canvasWorkspaceId?: unknown }).canvasWorkspaceId) === ws;
    });
    if (hit) return id;
  }
  return null;
}

/**
 * 拉取项目列表并反查所属项目 id。
 *
 * @param workspaceId 画布工作区 id
 * @param fetchImpl 注入点（单测用），默认全局 fetch
 */
export async function resolveProjectIdForWorkspace(
  workspaceId: string,
  fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): Promise<string | null> {
  if (!textOf(workspaceId) || typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(PROJECTS_LIST_PATH, { method: 'GET' });
    if (!response || !response.ok) return null;
    const body = (await response.json()) as { projects?: ProjectLookupRow[] } | null;
    return pickProjectIdForWorkspace(body?.projects, workspaceId);
  } catch {
    return null;
  }
}
