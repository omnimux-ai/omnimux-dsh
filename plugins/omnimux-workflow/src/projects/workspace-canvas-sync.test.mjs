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

  it('智能助手建画布时从 exec 提取上下文并就地建项 (#2299)', async () => {
    const libraryRoot = mkdtempSync(join(tmpdir(), 'omnimux-lib-agent-exec-'));
    const workspaceDir = mkdtempSync(join(tmpdir(), 'omnimux-ws-agent-exec-'));
    const store = host.createProjectStore({ libraryRoot });

    const binder = host.createWorkspaceProjectBinder({
      projectStore: store,
      libraryRoot,
      resolveWorkspaceDir: (sid) => (sid === 's_active' ? workspaceDir : undefined),
    });

    const toolShared = await import('../workflow/agent/agentToolShared.ts');
    const execCtx = toolShared.extractSessionContext({
      agent: {
        session: {
          id: 's_active',
          header: { cwd: workspaceDir },
        },
      },
    });

    assert.equal(execCtx.sessionId, 's_active');
    assert.equal(execCtx.workspaceDir, workspaceDir);

    await binder({
      canvasWorkspaceId: 'ws_test_created',
      sessionId: execCtx.sessionId,
      workspaceDir: execCtx.workspaceDir,
      title: '文生图创作画布',
    });

    assert.ok(existsSync(join(workspaceDir, '.omnimux', 'project.json')), '项目档案必须就地成功生成');
    const project = store.list().find((p) => p.path === workspaceDir);
    assert.ok(project, '项目中心必须能够找到该外部工作区项目');
    assert.equal(project.pages[0]?.canvasWorkspaceId, 'ws_test_created', '创作页画布编号必须绑定一致');

    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('GET session-binding 在工作区已有项目时保持严格幂等且不追加创作页 (#2322)', async () => {
    const libraryRoot = mkdtempSync(join(tmpdir(), 'omnimux-lib-idempotent-'));
    const workspaceDir = mkdtempSync(join(tmpdir(), 'omnimux-ws-idempotent-'));
    const store = host.createProjectStore({ libraryRoot });

    // 先建好项目，带有一个明确的创作页 ws_original
    store.create('原有项目', {
      projectRoot: workspaceDir,
      canvasWorkspaceIds: ['ws_original'],
    });

    const dispatcher = host.createProjectDispatcher({
      libraryRoot,
      resolveSessionWorkspaceDir: (sid) => (sid === 's_existing' ? workspaceDir : undefined),
    });

    // 第一次 GET 查询
    const res1 = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux-workflow/api/projects/session-binding?sessionId=s_existing',
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.source, 'existing');
    assert.equal(res1.body.project.pages.length, 1);
    assert.equal(res1.body.project.canvasWorkspaceId, 'ws_original');

    // 第二次 GET 查询，断言绝对不触发 addPage
    const res2 = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux-workflow/api/projects/session-binding?sessionId=s_existing',
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.source, 'existing');
    assert.equal(res2.body.project.pages.length, 1, '页面数量绝不得自增');
    assert.equal(res2.body.project.canvasWorkspaceId, 'ws_original');

    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });
});
