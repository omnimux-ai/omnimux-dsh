/**
 * 项目 HTTP 路由（host 侧）。
 *
 *   GET    /omnimux-workflow/api/projects/library         默认库路径（host 解析 videos）
 *   GET    /omnimux-workflow/api/projects                 list（扫描默认库）
 *   POST   /omnimux-workflow/api/projects                 seed { title, projectRoot, sessionId? }
 *   GET    /omnimux-workflow/api/projects/:id             get
 *   PATCH  /omnimux-workflow/api/projects/:id             rename/bindSession { title?, sessionId? }
 *   DELETE /omnimux-workflow/api/projects/:id             摘元数据，不 rm 用户文件夹
 *
 * 项目库作用域 = 默认库，不再接收 cwd。写操作先过 assertLocalWrite。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  MAX_JSON_BODY_BYTES,
  sendJson,
  JsonBodyLimitError,
  readJsonBody,
  assertLocalWrite,
  messageOf,
  jsonBodyProblem,
} from '../http/helpers';
import { displayHomePath, ensureLibraryRoot, resolveVideosDir } from './library';
import { ProjectPathError } from './paths';
import { createProjectStore, ProjectStoreError } from './ProjectStore';
import type { WorkspaceStore } from '../workflow/workspace/WorkspaceStore.ts';
import { createProjectCoverService } from './ProjectCoverService.ts';

export const PROJECT_ROUTE_PREFIX = '/omnimux-workflow/api/projects';
export const PROJECT_LIBRARY_PATH = `${PROJECT_ROUTE_PREFIX}/library`;

function inferMediaType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'aac', 'm4a', 'flac'].includes(ext)) return 'audio';
  if (['txt', 'md', 'json', 'csv', 'htable'].includes(ext)) return 'text';
  return 'other';
}

const STATUS_BY_CODE: Record<string, number> = {
  'invalid-json': 400,
  'invalid-cwd': 400,
  'invalid-library-root': 400,
  'invalid-project-root': 400,
  'invalid-id': 400,
  'title-required': 400,
  'title-too-long': 400,
  'title-invalid': 400,
  'directory-create-failed': 500,
  'session-required': 400,
  'body-too-large': 413,
  'project-not-found': 404,
  'project-exists': 409,
  'not-found': 404,
  'not-local': 403,
  'path-denied': 403,
  'internal': 500,
};

/** Request-body cap for JSON routes（与 canvasRoutes 一致）。 */
export const MAX_PROJECT_JSON_BODY_BYTES = MAX_JSON_BODY_BYTES;

export { sendJson, JsonBodyLimitError, readJsonBody, assertLocalWrite };

function scopedStore(libraryRootOverride?: string) {
  const libraryRoot = libraryRootOverride ?? ensureLibraryRoot();
  return { libraryRoot, store: createProjectStore({ libraryRoot }) };
}

export interface ProjectDispatchRequest {
  method: string;
  url: string;
  origin?: string;
  referer?: string;
  secFetchSite?: string;
  body?: unknown;
}

export type ProjectDispatchResult = { status: number; body?: unknown };

export interface ProjectDispatcher {
  /** 判断某 path 是否属于项目路由（供 workflow dispatcher 委托前判断）。 */
  owns(path: string): boolean;
  dispatch(req: ProjectDispatchRequest): Promise<ProjectDispatchResult>;
}

/** 项目路由无状态：库根由 host 解析，不跟当前会话 cwd。 */
export function createProjectDispatcher(opts: { libraryRoot?: string; workspaceStore?: WorkspaceStore; mediaRevision?: (url: string) => string } = {}): ProjectDispatcher {
  const coverService = opts.workspaceStore ? createProjectCoverService(opts.workspaceStore, opts.mediaRevision) : undefined;
  const enrich = <T extends { pages?: Array<{ id: string; canvasWorkspaceId?: string }> }>(project: T) => coverService ? coverService(project) : project;
  const collectionRe = new RegExp(`^${PROJECT_ROUTE_PREFIX}$`);
  const libraryRe = new RegExp(`^${PROJECT_LIBRARY_PATH}$`);
  const itemRe = new RegExp(`^${PROJECT_ROUTE_PREFIX}/([^/]+)$`);
  const pagesRe = new RegExp(`^${PROJECT_ROUTE_PREFIX}/([^/]+)/pages$`);
  const pageItemRe = new RegExp(`^${PROJECT_ROUTE_PREFIX}/([^/]+)/pages/([^/]+)$`);
  const filesRe = new RegExp(`^${PROJECT_ROUTE_PREFIX}/([^/]+)/files$`);
  const mkdirRe = new RegExp(`^${PROJECT_ROUTE_PREFIX}/([^/]+)/mkdir$`);
  const uploadRe = new RegExp(`^${PROJECT_ROUTE_PREFIX}/([^/]+)/upload$`);

  function owns(path: string): boolean {
    return path === PROJECT_ROUTE_PREFIX || path.startsWith(`${PROJECT_ROUTE_PREFIX}/`);
  }

  async function dispatch(req: ProjectDispatchRequest): Promise<ProjectDispatchResult> {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const method = (req.method || 'GET').toUpperCase();
      const path = decodeURIComponent(url.pathname);

      if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
        try {
          assertLocalWrite(req);
        } catch {
          return { status: 403, body: { error: 'not-local', message: 'cross-origin write refused' } };
        }
      }

      if (libraryRe.exec(path)) {
        if (method !== 'GET') {
          return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
        }
        const libraryRoot = opts.libraryRoot ?? ensureLibraryRoot();
        return {
          status: 200,
          body: {
            libraryRoot,
            videosDir: resolveVideosDir(),
            displayPath: displayHomePath(libraryRoot),
          },
        };
      }

      if (collectionRe.exec(path)) {
        if (method === 'GET') {
          const { store } = scopedStore(opts.libraryRoot);
          return { status: 200, body: { projects: store.list().map((project) => enrich(project)) } };
        }
        if (method === 'POST') {
          const problem = jsonBodyProblem(req.body);
          if (problem) return problem;
          const body = req.body as {
            title?: unknown;
            projectRoot?: unknown;
            sessionId?: unknown;
            cwd?: unknown;
            canvasWorkspaceIds?: unknown;
          };
          if (body.cwd !== undefined) {
            return { status: 400, body: { error: 'invalid-json', message: 'cwd is no longer a project library scope' } };
          }
          const { store } = scopedStore(opts.libraryRoot);
          const title = typeof body.title === 'string' ? body.title : undefined;
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
          const projectRoot = typeof body.projectRoot === 'string' && body.projectRoot.trim() !== ''
            ? body.projectRoot
            : undefined;
          const canvasWorkspaceIds = Array.isArray(body.canvasWorkspaceIds)
            ? body.canvasWorkspaceIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
            : undefined;
          return {
            status: 200,
            body: { project: store.create(title ?? '', { projectRoot, sessionId, canvasWorkspaceIds }) },
          };
        }
        return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
      }

      // 创作页集合路由 POST /api/projects/:id/pages
      const pagesMatch = pagesRe.exec(path);
      if (pagesMatch) {
        const projectId = pagesMatch[1] ?? '';
        const { store } = scopedStore(opts.libraryRoot);
        if (method === 'POST') {
          const problem = jsonBodyProblem(req.body);
          if (problem) return problem;
          const body = req.body as { title?: unknown; canvasWorkspaceId?: unknown; loadMemory?: unknown };
          const title = typeof body.title === 'string' ? body.title : '';
          const canvasWorkspaceId = typeof body.canvasWorkspaceId === 'string' ? body.canvasWorkspaceId : undefined;
          const loadMemory = Boolean(body.loadMemory);
          return {
            status: 200,
            body: { project: store.addPage(projectId, title, { canvasWorkspaceId, loadMemory }) },
          };
        }
        return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
      }

      // 创作页单项路由 PATCH/DELETE /api/projects/:id/pages/:pageId
      const pageItemMatch = pageItemRe.exec(path);
      if (pageItemMatch) {
        const projectId = pageItemMatch[1] ?? '';
        const pageId = pageItemMatch[2] ?? '';
        const { store } = scopedStore(opts.libraryRoot);
        if (method === 'PATCH') {
          const problem = jsonBodyProblem(req.body);
          if (problem) return problem;
          const body = req.body as { title?: unknown; active?: unknown };
          if (typeof body.title === 'string') {
            return { status: 200, body: { project: store.renamePage(projectId, pageId, body.title) } };
          }
          if (body.active === true) {
            return { status: 200, body: { project: store.setActivePage(projectId, pageId) } };
          }
          return { status: 400, body: { error: 'invalid-json', message: 'title or active is required' } };
        }
        if (method === 'DELETE') {
          return { status: 200, body: { project: store.removePage(projectId, pageId) } };
        }
        return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
      }

      // 物理工作区文件列表 GET /api/projects/:id/files
      const filesMatch = filesRe.exec(path);
      if (filesMatch) {
        if (method !== 'GET') return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
        const projectId = filesMatch[1] ?? '';
        const { store } = scopedStore(opts.libraryRoot);
        const project = store.get(projectId);
        const subpath = url.searchParams.get('subpath') || '';
        const targetDir = resolve(project.path, subpath);
        const rel = relative(project.path, targetDir);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { status: 403, body: { error: 'path-denied', message: 'access denied outside project directory' } };
        }
        if (!existsSync(targetDir)) {
          return { status: 200, body: { items: [], currentSubpath: subpath } };
        }
        const entries = readdirSync(targetDir, { withFileTypes: true });
        const items = [];
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = join(targetDir, entry.name);
          const isFolder = entry.isDirectory();
          let size = 0;
          let updatedAt = new Date().toISOString();
          try {
            const st = statSync(full);
            size = isFolder ? 0 : st.size;
            updatedAt = st.mtime.toISOString();
          } catch {}
          items.push({
            id: `${subpath ? subpath + '/' : ''}${entry.name}`,
            name: entry.name,
            isFolder,
            size,
            updatedAt,
            type: inferMediaType(entry.name),
          });
        }
        items.sort((a, b) => {
          if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return { status: 200, body: { items, currentSubpath: subpath } };
      }

      // 物理工作区新建文件夹 POST /api/projects/:id/mkdir
      const mkdirMatch = mkdirRe.exec(path);
      if (mkdirMatch) {
        if (method !== 'POST') return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
        const projectId = mkdirMatch[1] ?? '';
        const { store } = scopedStore(opts.libraryRoot);
        const project = store.get(projectId);
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const body = req.body as { name?: unknown; subpath?: unknown };
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return { status: 400, body: { error: 'name-required' } };
        const subpath = typeof body.subpath === 'string' ? body.subpath.trim() : '';
        const targetDir = resolve(project.path, subpath, name);
        const rel = relative(project.path, targetDir);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { status: 403, body: { error: 'path-denied' } };
        }
        mkdirSync(targetDir, { recursive: true });
        return { status: 200, body: { ok: true, name, path: targetDir } };
      }

      // 物理工作区上传文件 POST /api/projects/:id/upload
      const uploadMatch = uploadRe.exec(path);
      if (uploadMatch) {
        if (method !== 'POST') return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
        const projectId = uploadMatch[1] ?? '';
        const { store } = scopedStore(opts.libraryRoot);
        const project = store.get(projectId);
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const body = req.body as { paths?: unknown; subpath?: unknown };
        const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string') : [];
        const subpath = typeof body.subpath === 'string' ? body.subpath.trim() : '';
        const targetDir = resolve(project.path, subpath);
        const rel = relative(project.path, targetDir);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { status: 403, body: { error: 'path-denied' } };
        }
        mkdirSync(targetDir, { recursive: true });
        for (const src of paths) {
          if (existsSync(src)) {
            const basename = join(src).split('/').pop() || 'upload';
            copyFileSync(src, join(targetDir, basename));
          }
        }
        return { status: 200, body: { ok: true } };
      }

      const itemMatch = itemRe.exec(path);
      if (itemMatch) {
        const id = itemMatch[1] ?? '';
        if (id === 'library') {
          return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
        }
        const { store } = scopedStore(opts.libraryRoot);
        if (method === 'GET') {
          return { status: 200, body: { project: enrich(store.get(id)) } };
        }
        if (method === 'PATCH') {
          const problem = jsonBodyProblem(req.body);
          if (problem) return problem;
          const body = req.body as { title?: unknown; sessionId?: unknown };
          if (typeof body.title === 'string') {
            return { status: 200, body: { project: store.rename(id, body.title) } };
          }
          if (typeof body.sessionId === 'string') {
            return { status: 200, body: { project: store.bindSession(id, body.sessionId) } };
          }
          return { status: 400, body: { error: 'invalid-json', message: 'title or sessionId is required' } };
        }
        if (method === 'DELETE') {
          store.remove(id);
          return { status: 200, body: { ok: true } };
        }
        return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
      }

      return { status: 404, body: { error: 'not-found', message: 'unknown route' } };
    } catch (error) {
      if (error instanceof ProjectPathError) {
        return { status: STATUS_BY_CODE[error.code] ?? 400, body: { error: error.code, message: error.message } };
      }
      if (error instanceof ProjectStoreError) {
        return { status: STATUS_BY_CODE[error.code] ?? 400, body: { error: error.code, message: error.message } };
      }
      return { status: 500, body: { error: 'internal', message: messageOf(error) } };
    }
  }

  return { owns, dispatch };
}
