/**
 * Workspace CRUD (optimistic-lock PUT, name-validated POST).
 */
import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import type { SaveCanvasWorkspacePayload } from '../../shared/canvasTypes.ts';
import { jsonBodyProblem } from '../../http/helpers.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { ProjectStore } from '../../projects/ProjectStore.ts';
import { notFound, type RouteTry, type WorkflowDispatchRequest } from './dispatch.ts';

export function createWorkspaceRoutes(store: WorkspaceStore, projectStore?: ProjectStore): { tryHandle: RouteTry } {
  const workspacesPath = `${WORKFLOW_ROUTE_PREFIX}/api/workspaces`;
  const workspaceRouteRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)$`);
  // PR3: lightweight version probe for external-edit detection (agent tools
  // bump the version without the open canvas noticing — the island polls
  // this and rehydrates when it falls behind).
  const workspaceVersionRouteRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/version$`);
  const projectPagesRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/project-pages$`);
  const projectPageItemRe = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/project-pages/([^/]+)$`);

  const tryHandle: RouteTry = (method, path, req: WorkflowDispatchRequest) => {
    // 创作页集合路由 GET/POST /omnimux-workflow/api/workspaces/:id/project-pages
    const pagesMatch = projectPagesRe.exec(path);
    if (pagesMatch) {
      const workspaceId = pagesMatch[1] ?? '';
      if (method !== 'GET' && method !== 'POST') return notFound();
      const project = projectStore?.findByCanvasWorkspaceId(workspaceId);
      if (method === 'GET') {
        if (project) {
          const pages = project.pages && project.pages.length > 0
            ? project.pages
            : [{
                id: 'page-default',
                title: project.title || '创作页 1',
                canvasWorkspaceId: workspaceId,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
              }];
          return {
            status: 200,
            body: {
              projectId: project.id,
              projectTitle: project.title,
              activePageId: project.activePageId || pages[0]?.id,
              pages,
            },
          };
        }
        return {
          status: 200,
          body: {
            projectId: null,
            projectTitle: null,
            activePageId: 'page-default',
            pages: [{
              id: 'page-default',
              title: '创作页 1',
              canvasWorkspaceId: workspaceId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }],
          },
        };
      }
      if (method === 'POST') {
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const body = req.body as { title?: unknown };
        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '新建创作页';
        const newWs = store.create(title);
        if (project && projectStore) {
          if (!project.pages || project.pages.length === 0) {
            projectStore.addPage(project.id, project.title || '创作页 1', { canvasWorkspaceId: workspaceId });
          }
          const updatedProject = projectStore.addPage(project.id, title, { canvasWorkspaceId: newWs.id });
          const newPage = updatedProject.pages?.find((p) => p.canvasWorkspaceId === newWs.id);
          return {
            status: 200,
            body: {
              page: newPage || { id: newWs.id, title, canvasWorkspaceId: newWs.id },
              workspace: newWs,
              project: updatedProject,
            },
          };
        }
        return {
          status: 200,
          body: {
            page: { id: newWs.id, title, canvasWorkspaceId: newWs.id },
            workspace: newWs,
          },
        };
      }
    }

    // 创作页单项路由 PATCH/DELETE /omnimux-workflow/api/workspaces/:id/project-pages/:pageId
    const pageItemMatch = projectPageItemRe.exec(path);
    if (pageItemMatch) {
      const workspaceId = pageItemMatch[1] ?? '';
      const pageId = pageItemMatch[2] ?? '';
      const project = projectStore?.findByCanvasWorkspaceId(workspaceId);
      if (method === 'PATCH') {
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const body = req.body as { active?: unknown; title?: unknown };
        if (project && projectStore) {
          let updatedProject = project;
          if (typeof body.title === 'string' && body.title.trim()) {
            updatedProject = projectStore.renamePage(project.id, pageId, body.title.trim());
          }
          if (body.active === true) {
            updatedProject = projectStore.setActivePage(project.id, pageId);
          }
          const activePage = updatedProject.pages?.find((p) => p.id === pageId);
          return {
            status: 200,
            body: {
              ok: true,
              activePage,
              canvasWorkspaceId: activePage?.canvasWorkspaceId || workspaceId,
            },
          };
        }
        return {
          status: 200,
          body: {
            ok: true,
            activePage: { id: pageId },
            canvasWorkspaceId: workspaceId,
          },
        };
      }
      if (method === 'DELETE') {
        if (project && projectStore) {
          const updatedProject = projectStore.removePage(project.id, pageId);
          return { status: 200, body: { ok: true, project: updatedProject } };
        }
        return { status: 200, body: { ok: true } };
      }
      return notFound();
    }
    const versionMatch = workspaceVersionRouteRe.exec(path);
    if (versionMatch) {
      if (method !== 'GET') return notFound();
      const snapshot = store.get(versionMatch[1] ?? '');
      return { status: 200, body: { id: snapshot.id, version: snapshot.version } };
    }

    if (path === workspacesPath) {
      if (method === 'GET') {
        return { status: 200, body: { workspaces: store.list() } };
      }
      if (method === 'POST') {
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const body = req.body as { name?: unknown; id?: unknown };
        const name = typeof body.name === 'string' ? body.name : undefined;
        const id = typeof body.id === 'string' ? body.id : undefined;
        return { status: 200, body: { workspace: store.create(name, id) } };
      }
      return notFound();
    }

    const workspaceMatch = workspaceRouteRe.exec(path);
    if (workspaceMatch) {
      const id = workspaceMatch[1] ?? '';
      if (method === 'GET') {
        return { status: 200, body: { workspace: store.get(id) } };
      }
      if (method === 'PUT') {
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const payload = req.body as SaveCanvasWorkspacePayload;
        if (typeof payload.expectedVersion !== 'number') {
          return { status: 400, body: { error: 'version-required', message: 'expectedVersion is required for saves' } };
        }
        const result = store.save(id, payload);
        return { status: 200, body: { workspace: result.snapshot } };
      }
      if (method === 'DELETE') {
        store.remove(id);
        return { status: 200, body: { ok: true } };
      }
      return notFound();
    }

    return null;
  };

  return { tryHandle };
}
