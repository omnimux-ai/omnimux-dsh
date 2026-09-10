import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { createProjectStore } from '../../projects/ProjectStore.ts';
import { createWorkspaceRoutes } from './workspaceRoutes.ts';

test('workspaceRoutes: project-pages GET, POST, and PATCH routes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-test-pages-'));
  try {
    const workspacesDir = join(dir, 'workspaces');
    const libraryRoot = join(dir, 'library');
    const projectStore = createProjectStore({ libraryRoot });
    const workspaceStore = createWorkspaceStore({
      workspacesDir,
      resolveProjectRoot: (id) => projectStore.findByCanvasWorkspaceId(id),
    });

    const routes = createWorkspaceRoutes(workspaceStore, projectStore);

    // 1. 创建初始画布与项目
    const ws1 = workspaceStore.create('初始画布');
    const project = projectStore.create('测试视频项目', {
      canvasWorkspaceIds: [ws1.id],
    });

    // 2. GET /api/workspaces/:id/project-pages
    const getRes = await routes.tryHandle(
      'GET',
      `/omnimux-workflow/api/workspaces/${ws1.id}/project-pages`,
      { method: 'GET' },
    );
    assert.ok(getRes);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.projectId, project.id);
    assert.equal(getRes.body.projectTitle, '测试视频项目');
    assert.equal(getRes.body.pages.length, 1);

    // 3. POST /api/workspaces/:id/project-pages (新建创作页)
    const postRes = await routes.tryHandle(
      'POST',
      `/omnimux-workflow/api/workspaces/${ws1.id}/project-pages`,
      {
        method: 'POST',
        body: { title: '创作页 2 (爆款分镜)' },
      },
    );
    assert.ok(postRes);
    assert.equal(postRes.status, 200);
    assert.ok(postRes.body.page);
    assert.equal(postRes.body.page.title, '创作页 2 (爆款分镜)');
    assert.ok(postRes.body.workspace);
    assert.notEqual(postRes.body.workspace.id, ws1.id); // 物理隔离的新 ID

    // 4. GET 验证包含新页面
    const getRes2 = await routes.tryHandle(
      'GET',
      `/omnimux-workflow/api/workspaces/${ws1.id}/project-pages`,
      { method: 'GET' },
    );
    assert.equal(getRes2.body.pages.length, 2);

    // 5. PATCH /api/workspaces/:id/project-pages/:pageId (切换激活页)
    const newPageId = postRes.body.page.id;
    const patchRes = await routes.tryHandle(
      'PATCH',
      `/omnimux-workflow/api/workspaces/${ws1.id}/project-pages/${newPageId}`,
      {
        method: 'PATCH',
        body: { active: true },
      },
    );
    assert.ok(patchRes);
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.canvasWorkspaceId, postRes.body.workspace.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
