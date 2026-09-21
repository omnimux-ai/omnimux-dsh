/**
 * Issue #2104：工作区文件夹项目登记。
 *
 * 覆盖规格 `specs/2104-project-canvas-workspace-binding.spec.md` 的 A1–A4 与降级路径：
 *   A1 新目录建项目 + 画布登记为创作页
 *   A2 同目录第二个画布 → 第二个创作页，activePageId 跟随
 *   A3 库根之外 → 不写入、返回 null
 *   A4 已存在 project.json → 复用；重复登记同一画布幂等
 *   A5 降级：会话无目录 / 宿主解析抛错 → null，不抛
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = await import('../../dist/index.js');

function tmpDir(prefix = 'omnimux-ws-binding-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function projectFileOf(dir) {
  return join(dir, '.omnimux', 'project.json');
}

describe('workspace project binding (#2104)', { concurrency: 1 }, () => {
  test('A1：库内新工作区建画布 → 登记项目与首个创作页', () => {
    const libraryRoot = tmpDir();
    const workspaceDir = join(libraryRoot, '约会穿搭');
    mkdirSync(workspaceDir, { recursive: true });
    const projectStore = host.createProjectStore({ libraryRoot });

    const record = host.ensureWorkspaceProjectBound(projectStore, {
      workspaceDir,
      canvasWorkspaceId: 'ws_443c648c4dfb',
      sessionId: 'session-afc2a612',
      libraryRoot,
    });

    assert.ok(record, '应在既有工作区文件夹登记项目');
    assert.equal(record.path, workspaceDir, '项目根必须是既有文件夹，不新建重复目录');
    assert.equal(record.title, '约会穿搭', '标题取文件夹名');
    assert.deepEqual(record.canvasWorkspaceIds, ['ws_443c648c4dfb']);
    assert.equal(record.pages.length, 1);
    assert.equal(record.pages[0].canvasWorkspaceId, 'ws_443c648c4dfb');
    assert.equal(record.activePageId, record.pages[0].id);
    assert.equal(record.sessionId, 'session-afc2a612');
    assert.ok(existsSync(projectFileOf(workspaceDir)), 'project.json 必须落在工作区文件夹内');

    // 项目页真相：扫描库根下一层即可看到该项目。
    const listed = projectStore.list().map((row) => row.path);
    assert.deepEqual(listed, [workspaceDir]);
    rmSync(libraryRoot, { recursive: true, force: true });
  });

  test('A2：同目录第二个画布 → 第二个创作页且激活页跟随', () => {
    const libraryRoot = tmpDir();
    const workspaceDir = join(libraryRoot, '测试画布');
    mkdirSync(workspaceDir, { recursive: true });
    const projectStore = host.createProjectStore({ libraryRoot });

    host.ensureWorkspaceProjectBound(projectStore, {
      workspaceDir,
      canvasWorkspaceId: 'ws_first',
      libraryRoot,
    });
    const second = host.ensureWorkspaceProjectBound(projectStore, {
      workspaceDir,
      canvasWorkspaceId: 'ws_second',
      libraryRoot,
    });

    assert.equal(second.pages.length, 2);
    assert.deepEqual(
      second.pages.map((page) => page.canvasWorkspaceId),
      ['ws_first', 'ws_second'],
    );
    assert.equal(second.activePageId, second.pages[1].id);

    // 幂等：同一画布重复登记不再加页。
    const again = host.ensureWorkspaceProjectBound(projectStore, {
      workspaceDir,
      canvasWorkspaceId: 'ws_second',
      libraryRoot,
    });
    assert.equal(again.pages.length, 2);
    rmSync(libraryRoot, { recursive: true, force: true });
  });

  test('A3：库根之外的工作区不写入、不报错', () => {
    const libraryRoot = tmpDir();
    const outside = tmpDir('omnimux-outside-');
    const projectStore = host.createProjectStore({ libraryRoot });

    const record = host.ensureWorkspaceProjectBound(projectStore, {
      workspaceDir: outside,
      canvasWorkspaceId: 'ws_outside',
      libraryRoot,
    });

    assert.equal(record, null);
    assert.equal(existsSync(projectFileOf(outside)), false, '库外目录不得被写入项目元数据');
    assert.equal(projectStore.list().length, 0);
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  test('A4：已有 project.json 复用而非抛 project-exists', () => {
    const libraryRoot = tmpDir();
    const workspaceDir = join(libraryRoot, '测试 (5)');
    mkdirSync(workspaceDir, { recursive: true });
    const projectStore = host.createProjectStore({ libraryRoot });

    const first = host.ensureWorkspaceProjectBound(projectStore, {
      workspaceDir,
      canvasWorkspaceId: 'ws_d89d7bf878ec',
      title: '测试',
      libraryRoot,
    });
    const reloaded = host.createProjectStore({ libraryRoot });
    const reused = host.ensureWorkspaceProjectBound(reloaded, {
      workspaceDir,
      canvasWorkspaceId: 'ws_d89d7bf878ec',
      libraryRoot,
    });

    assert.equal(reused.id, first.id);
    assert.equal(reused.title, '测试', '既有标题不被文件夹名覆盖');
    assert.equal(reused.pages.length, 1);
    const raw = JSON.parse(readFileSync(projectFileOf(workspaceDir), 'utf8'));
    assert.equal(raw.id, first.id);
    rmSync(libraryRoot, { recursive: true, force: true });
  });

  test('A5：宿主会话解析不可用/抛错时降级为 null', async () => {
    const libraryRoot = tmpDir();
    const workspaceDir = join(libraryRoot, '降级');
    mkdirSync(workspaceDir, { recursive: true });
    const projectStore = host.createProjectStore({ libraryRoot });

    const noResolver = host.createWorkspaceProjectBinder({ projectStore, libraryRoot });
    assert.equal(await noResolver({ canvasWorkspaceId: 'ws_x', sessionId: 's1' }), null);

    const noSession = host.createWorkspaceProjectBinder({
      projectStore,
      libraryRoot,
      resolveWorkspaceDir: () => workspaceDir,
    });
    assert.equal(await noSession({ canvasWorkspaceId: 'ws_x', sessionId: null }), null);

    const throwing = host.createWorkspaceProjectBinder({
      projectStore,
      libraryRoot,
      resolveWorkspaceDir: () => {
        throw new Error('agents service unavailable');
      },
    });
    assert.equal(await throwing({ canvasWorkspaceId: 'ws_x', sessionId: 's1' }), null);

    const working = host.createWorkspaceProjectBinder({
      projectStore,
      libraryRoot,
      resolveWorkspaceDir: (sessionId) => (sessionId === 's1' ? workspaceDir : undefined),
    });
    const record = await working({ canvasWorkspaceId: 'ws_bound', sessionId: 's1', title: '降级' });
    assert.ok(record);
    assert.equal(record.path, workspaceDir);
    assert.deepEqual(record.canvasWorkspaceIds, ['ws_bound']);
    rmSync(libraryRoot, { recursive: true, force: true });
  });

  test('A6：客户端打开画布前按会话查询 → 缺失即登记项目', async () => {
    const libraryRoot = tmpDir();
    const workspaceDir = join(libraryRoot, '测试画布');
    mkdirSync(workspaceDir, { recursive: true });
    const dispatcher = host.createProjectDispatcher({
      libraryRoot,
      resolveSessionWorkspaceDir: (sessionId) => (sessionId === 'session-afc2a612' ? workspaceDir : undefined),
    });

    const first = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux-workflow/api/projects/session-binding?sessionId=session-afc2a612`,
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.source, 'registered', '首次查询即完成登记');
    assert.equal(first.body.project.path, workspaceDir);
    assert.ok(first.body.project.canvasWorkspaceId, '返回当前创作页绑定的画布');
    assert.equal(
      first.body.project.canvasWorkspaceId,
      host.sessionToWorkspaceId('session-afc2a612'),
      '首个创作页必须绑到该会话自己的画布（客户端兜底用的散列 id），不能是随机画布 id',
    );
    assert.equal(first.body.project.pages.length, 1);
    assert.ok(existsSync(projectFileOf(workspaceDir)), '登记后工作区文件夹内出现 project.json');

    const second = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux-workflow/api/projects/session-binding?sessionId=session-afc2a612`,
    });
    assert.equal(second.body.source, 'existing', '重复查询幂等，不重复登记');
    assert.equal(second.body.project.id, first.body.project.id);
    rmSync(libraryRoot, { recursive: true, force: true });
  });

  test('A7：会话不可解析 / 库外工作区 / 缺 sessionId 的降级语义', async () => {
    const libraryRoot = tmpDir();
    const outside = tmpDir('omnimux-outside-route-');
    const dispatcher = host.createProjectDispatcher({
      libraryRoot,
      resolveSessionWorkspaceDir: (sessionId) => {
        if (sessionId === 's-out') return outside;
        throw new Error('agents service unavailable');
      },
    });

    const unknown = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux-workflow/api/projects/session-binding?sessionId=s-unknown',
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.source, 'unknown-session');
    assert.equal(unknown.body.project, null);

    const out = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux-workflow/api/projects/session-binding?sessionId=s-out',
    });
    assert.equal(out.status, 200);
    assert.equal(out.body.source, 'outside-library');
    assert.equal(out.body.project, null);
    assert.equal(existsSync(projectFileOf(outside)), false, '库外目录不得被写入');

    const missing = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux-workflow/api/projects/session-binding',
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, 'session-required');
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  test('库外已有档案按路径认项目，不抛 project-exists', async () => {
    const libraryRoot = tmpDir();
    const outside = tmpDir('omnimux-outside-seeded-');
    mkdirSync(join(outside, '.omnimux'), { recursive: true });
    const store = host.createProjectStore({ libraryRoot });
    const first = store.create('视频代做', { projectRoot: outside });
    const reused = store.create('视频代做', { projectRoot: outside });
    assert.equal(reused.id, first.id);
    assert.equal(store.findByRoot(outside)?.id, first.id);

    const dispatcher = host.createProjectDispatcher({
      libraryRoot,
      resolveSessionWorkspaceDir: () => outside,
    });
    const bound = await dispatcher.dispatch({
      method: 'GET',
      url: '/omnimux-workflow/api/projects/session-binding?sessionId=s-out',
    });
    assert.equal(bound.status, 200);
    assert.equal(bound.body.source, 'existing');
    assert.equal(bound.body.project.id, first.id);

    const byPath = await dispatcher.dispatch({
      method: 'GET',
      url: `/omnimux-workflow/api/projects?path=${encodeURIComponent(outside)}`,
    });
    assert.equal(byPath.status, 200);
    assert.equal(byPath.body.project.id, first.id);
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
});
