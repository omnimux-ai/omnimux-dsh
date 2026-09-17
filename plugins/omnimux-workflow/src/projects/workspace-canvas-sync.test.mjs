import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveCanvasTargetWorkspaceId } from '../client/projects/projectCanvas.js';

const host = await import('../../dist/index.js');

describe('创作画布与工作区同频流转契约 (#2224)', () => {
  it('ProjectStore 支持登记与列表扫描库外工作区项目', () => {
    const libraryRoot = mkdtempSync(join(tmpdir(), 'omnimux-lib-sync-'));
    const externalRoot = mkdtempSync(join(tmpdir(), 'omnimux-ext-sync-'));

    const store = host.createProjectStore({ libraryRoot });
    const record = store.create('外部测试项目', {
      projectRoot: externalRoot,
    });

    assert.equal(record.title, '外部测试项目');
    assert.equal(record.path, externalRoot);
    assert.ok(existsSync(join(externalRoot, '.omnimux', 'project.json')));

    // 验证 list() 能够同时扫描出库外项目
    const list = store.list();
    const hit = list.find((p) => p.path === externalRoot);
    assert.ok(hit, '项目中心必须能够列出外部登记项目');
    assert.equal(hit.title, '外部测试项目');

    // 删除项目
    store.remove(record.id);
    assert.equal(existsSync(join(externalRoot, '.omnimux', 'project.json')), false);
    assert.equal(store.list().some((p) => p.path === externalRoot), false);

    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(externalRoot, { recursive: true, force: true });
  });

  it('Agent 建画布时 allowCreateOutsideLibrary 自动就地在工作区建项', () => {
    const libraryRoot = mkdtempSync(join(tmpdir(), 'omnimux-lib-agent-'));
    const workspaceDir = mkdtempSync(join(tmpdir(), 'omnimux-ws-agent-'));

    const store = host.createProjectStore({ libraryRoot });
    const bound = host.ensureWorkspaceProjectBound(store, {
      workspaceDir,
      canvasWorkspaceId: 'ws_agent_canvas_1',
      title: 'Agent广告工作流',
      libraryRoot,
      allowCreateOutsideLibrary: true,
    });

    assert.ok(bound, 'Agent 必须能在任意工作区自动建立项目绑定');
    assert.equal(bound.title, 'Agent广告工作流');
    assert.ok(existsSync(join(workspaceDir, '.omnimux', 'project.json')));
    assert.ok(bound.canvasWorkspaceIds.includes('ws_agent_canvas_1'));

    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('GET session-binding 在未建项工作区返回 workspaceDir 供前端弹窗预填', async () => {
    const libraryRoot = mkdtempSync(join(tmpdir(), 'omnimux-lib-route-'));
    const outsideDir = mkdtempSync(join(tmpdir(), 'omnimux-ws-route-'));

    const dispatcher = host.createProjectDispatcher({
      libraryRoot,
      resolveSessionWorkspaceDir: (sessId) => (sessId === 's_test' ? outsideDir : undefined),
    });

    const res = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux-workflow/api/projects/session-binding?sessionId=s_test',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.project, null);
    assert.equal(res.body.workspaceDir, outsideDir, '必须返回 workspaceDir 供弹窗自动预填路径');

    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it('resolveCanvasTargetWorkspaceId：未建项工作区拒绝加载伪造散列画布', () => {
    const target = resolveCanvasTargetWorkspaceId({
      sessionId: 'sess_unprojected',
      sessionBinding: {
        sessionId: 'sess_unprojected',
        project: null,
        canvasWorkspaceId: null,
      },
      fallbackWorkspaceId: 'ws_fake_hash',
    });

    assert.equal(target, undefined, '未建项时不得回退到散列空画布');
  });
});
