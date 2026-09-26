/**
 * Phase 0 项目壳 host 数据层测试（默认库语义）。
 *
 * 覆盖：
 *   library：darwin/win32/linux videos 兜底；OMNIMUX_VIDEOS_DIR
 *   T0 schema：schemaVersion 冻结 / title 边界 / 更高版本拒绝
 *   T0 paths：libraryRoot / projectRoot 必须绝对路径；containment 相对库/项目根
 *   T1 ProjectStore：扫描 list / seed create / remove 不 rm 项目根
 *   T2 routes：GET library；list 无 cwd；POST {title,projectRoot}；跨源写拒绝
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

const host = await import('../../dist/index.js');

class FakeRes extends Writable {
  constructor() {
    super();
    this.state = { status: 0, headers: {}, body: '' };
  }
  writeHead(status, headers) {
    this.state.status = status;
    this.state.headers = headers ?? {};
    return this;
  }
  _write(chunk, _encoding, callback) {
    this.state.body += chunk.toString();
    callback();
  }
  end(text) {
    if (typeof text === 'string') this.state.body += text;
    super.end();
    return this;
  }
}

function fakeReq({ method = 'GET', url = '/', headers = {}, body = undefined }) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function tmpDir(prefix = 'omnimux-project-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('omnimux-workflow projects host', { concurrency: 1 }, () => {

test('library：平台兜底 + OMNIMUX_VIDEOS_DIR', () => {
  const home = '/Users/demo';
  assert.equal(
    host.resolveVideosDir({ platform: 'darwin', homedir: home, env: {} }),
    join(home, 'Movies'),
  );
  assert.equal(
    host.resolveVideosDir({ platform: 'win32', homedir: 'C:\\Users\\demo', env: {} }),
    'C:\\Users\\demo\\Videos',
  );
  assert.equal(
    host.resolveVideosDir({
      platform: 'linux',
      homedir: home,
      env: {},
      exists: (p) => p === join(home, 'Videos'),
    }),
    join(home, 'Videos'),
  );
  assert.equal(
    host.resolveVideosDir({
      platform: 'linux',
      homedir: home,
      env: {},
      exists: () => false,
    }),
    home,
  );
  assert.equal(
    host.resolveVideosDir({ platform: 'darwin', homedir: home, env: { OMNIMUX_VIDEOS_DIR: '/tmp/v' } }),
    '/tmp/v',
  );
  assert.equal(
    host.defaultProjectLibrary({ platform: 'darwin', homedir: home, env: {} }),
    join(home, 'Movies', 'OmniMux', 'Projects'),
  );
  const videosRoot = tmpDir('omnimux-videos-');
  try {
    const ensured = host.ensureLibraryRoot({ env: { OMNIMUX_VIDEOS_DIR: videosRoot } });
    assert.equal(ensured, join(videosRoot, 'OmniMux', 'Projects'));
    assert.equal(existsSync(ensured), true);
  } finally {
    rmSync(videosRoot, { recursive: true, force: true });
  }
  assert.match(host.displayHomePath(join(homedir(), 'Movies', 'OmniMux', 'Projects')), /^~/);
});

test('T0 schema：冻结版本 + title 边界 + 高版本拒绝', () => {
  assert.equal(host.PROJECT_SCHEMA_VERSION, 1);
  assert.equal(host.MAX_PROJECT_TITLE_LENGTH, 200);

  const good = host.parseProject({
    schemaVersion: 1,
    id: 'p1',
    title: '我的项目',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    sessionId: null,
    canvasWorkspaceIds: [],
  });
  assert.ok(good, '合法 project.json 解析成功');
  assert.equal(host.parseProject({ ...good, schemaVersion: 2 }), null);
  assert.equal(host.parseProject({ ...good, title: 'x'.repeat(201) }), null);
  assert.equal(host.parseProjectIndex({ schemaVersion: 1, projects: 'nope' }), null);
});

test('T0 paths：libraryRoot / projectRoot 必须绝对路径 + 越界断言', () => {
  assert.throws(() => host.resolveProjectPaths(''), (e) => e.code === 'invalid-project-root');
  assert.throws(() => host.resolveProjectPaths('relative/path'), (e) => e.code === 'invalid-project-root');
  assert.throws(
    () => host.resolveProjectPaths(join(tmpdir(), 'definitely-missing-project-xyz')),
    (e) => e.code === 'invalid-project-root',
  );

  const fileRoot = join(tmpdir(), `omnimux-project-file-${Date.now()}.txt`);
  writeFileSync(fileRoot, 'not a dir');
  try {
    assert.throws(() => host.resolveProjectPaths(fileRoot), (e) => e.code === 'invalid-project-root');
  } finally {
    rmSync(fileRoot, { force: true });
  }

  const libraryRoot = tmpDir('omnimux-lib-');
  const projectRoot = join(libraryRoot, '宣传片');
  mkdirSync(projectRoot);
  try {
    const paths = host.resolveProjectPaths(projectRoot);
    assert.equal(paths.projectRoot, projectRoot);
    assert.equal(paths.projectFile, join(projectRoot, '.omnimux', 'project.json'));
    assert.equal(paths.assetsFile, join(projectRoot, '.omnimux', 'assets.json'));
    assert.equal(paths.importedDir, join(projectRoot, 'assets', 'imported'));
    assert.equal(paths.subjectsDir, join(projectRoot, 'assets', 'subjects'));
    assert.equal(paths.artifactsDir, join(projectRoot, 'artifacts'));
    assert.equal(paths.canvasesDir, join(projectRoot, '.omnimux', 'canvases'));
    assert.equal(paths.readmeFile, join(projectRoot, '说明.md'));
    host.assertProjectInsideLibrary(projectRoot, libraryRoot);
    assert.throws(
      () => host.assertProjectInsideLibrary(libraryRoot, libraryRoot),
      (e) => e.code === 'path-denied',
    );
    assert.throws(
      () => host.assertProjectWriteSafe(join(projectRoot, '..', 'evil.json'), projectRoot),
      (e) => e.code === 'path-denied',
    );
    assert.equal(host.toProjectRelativePath(projectRoot, join(projectRoot, 'assets', 'imported', 'a.png')), 'assets/imported/a.png');
    assert.throws(
      () => host.resolveProjectRelPath(projectRoot, '../evil.png'),
      (e) => e.code === 'path-denied',
    );
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('T1 ProjectStore：扫描 list / Host mkdir+seed / remove 不 rm 项目根', () => {
  const libraryRoot = tmpDir('omnimux-store-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const created = store.create('  项目甲  ');
    const projectRoot = created.path;
    assert.equal(created.title, '项目甲');
    assert.equal(created.sessionId, null);
    assert.equal(projectRoot, join(libraryRoot, '项目甲'));
    assert.ok(existsSync(projectRoot));
    assert.ok(readFileSync(join(projectRoot, '.omnimux', 'project.json'), 'utf8').includes(created.id));
    assert.equal(existsSync(join(projectRoot, '说明.md')), false, '新建项目不自动生成无意义的说明.md');
    writeFileSync(join(projectRoot, 'user-notes.txt'), 'hello');

    const renamedFolder = store.create('项目甲');
    assert.equal(renamedFolder.path, join(libraryRoot, '项目甲 (2)'));

    const bound = store.bindSession(created.id, 'sess-1');
    assert.equal(bound.sessionId, 'sess-1');
    const hashed = host.sessionToWorkspaceId('sess-1');
    const found = store.findByCanvasWorkspaceId(hashed);
    assert.equal(found.id, created.id);
    assert.equal(found.canvasWorkspaceIds.includes(hashed), true);
    assert.equal(store.findByCanvasWorkspaceId('ws_missing0000'), null);
    const renamed = store.rename(created.id, '项目乙');
    assert.equal(renamed.title, '项目乙');

    const extraRoot = join(libraryRoot, '项目丙');
    mkdirSync(extraRoot);
    store.create('项目丙', { projectRoot: extraRoot });
    const listed = store.list();
    assert.equal(listed.length, 3);
    assert.deepEqual(new Set(listed.map((row) => row.title)), new Set(['项目乙', '项目甲', '项目丙']));
    assert.ok(listed.every((row) => typeof row.path === 'string' && row.path !== ''));

    // 脏 index.json 不得覆盖扫描真相。
    writeFileSync(join(libraryRoot, 'index.json'), '{"schemaVersion":1,"projects":[]}\n');
    assert.equal(store.list().length, 3);

    store.remove(created.id);
    assert.throws(() => store.get(created.id), (e) => e.code === 'project-not-found');
    assert.equal(existsSync(projectRoot), true, '删除不得 rm 用户文件夹');
    assert.equal(existsSync(join(projectRoot, 'user-notes.txt')), true);
    assert.equal(existsSync(join(projectRoot, '.omnimux')), false);
    assert.equal(store.list().length, 2);
    assert.throws(() => store.get('../etc'), (e) => e.code === 'invalid-id');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('T2 routes：GET library + 无 cwd list/create + 跨源写拒绝', async () => {
  const videosRoot = tmpDir('omnimux-videos-');
  const prevVideos = process.env.OMNIMUX_VIDEOS_DIR;
  process.env.OMNIMUX_VIDEOS_DIR = videosRoot;
  const registered = [];
  const webServer = {
    register(route) {
      registered.push({ path: route.path, handler: route.handler });
      return () => {};
    },
  };
  const harness = tmpDir('omnimux-route-');
  host.mountWorkflowHost(
    { webServer },
    { paths: { root: harness, workspacesDir: join(harness, 'w'), executionsDir: join(harness, 'e'), mediaDir: join(harness, 'm') } },
  );
  const workflowRoute = registered.find((r) => r.path === '/omnimux-workflow');
  assert.ok(workflowRoute, 'workflow prefix route registered');
  const handler = workflowRoute.handler;
  const localHeaders = { origin: 'http://localhost:3000' };

  const call = async ({ method = 'GET', url, body, headers = localHeaders }) => {
    const res = new FakeRes();
    await handler(fakeReq({ method, url, headers, body }), res);
    if (!res.writableEnded) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        res.once('finish', () => { clearTimeout(timer); resolve(); });
        res.once('close', () => { clearTimeout(timer); resolve(); });
      });
    }
    let json = null;
    try { json = JSON.parse(res.state.body); } catch { json = null; }
    return { status: res.state.status, body: json };
  };

  try {
    const library = await call({ url: '/omnimux-workflow/api/projects/library' });
    assert.equal(library.status, 200);
    assert.equal(library.body.libraryRoot, join(videosRoot, 'OmniMux', 'Projects'));
    assert.equal(library.body.videosDir, videosRoot);
    assert.ok(existsSync(library.body.libraryRoot));

    const created = await call({
      method: 'POST',
      url: '/omnimux-workflow/api/projects',
      body: { title: '路由项目' },
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.project.title, '路由项目');
    const projectRoot = created.body.project.path;
    assert.equal(projectRoot, join(library.body.libraryRoot, '路由项目'));
    assert.equal(existsSync(join(projectRoot, '说明.md')), false, '新建项目不自动生成无意义的说明.md');

    const listed = await call({ url: '/omnimux-workflow/api/projects' });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.projects.length, 1);
    assert.equal(listed.body.projects[0].path, projectRoot);

    const cwdRejected = await call({
      method: 'POST',
      url: '/omnimux-workflow/api/projects',
      body: { cwd: harness, title: 'x' },
    });
    assert.equal(cwdRejected.status, 400);

    const cross = await call({
      method: 'POST',
      url: '/omnimux-workflow/api/projects',
      body: { title: 'x', projectRoot },
      headers: { origin: 'http://evil.example.com' },
    });
    assert.equal(cross.status, 403);
    assert.equal(cross.body.error, 'not-local');

    const removed = await call({
      method: 'DELETE',
      url: `/omnimux-workflow/api/projects/${created.body.project.id}`,
    });
    assert.equal(removed.status, 200);
    assert.equal(existsSync(projectRoot), true);
  } finally {
    if (prevVideos === undefined) delete process.env.OMNIMUX_VIDEOS_DIR;
    else process.env.OMNIMUX_VIDEOS_DIR = prevVideos;
    rmSync(harness, { recursive: true, force: true });
    rmSync(videosRoot, { recursive: true, force: true });
  }
});

test('T0 schema：projectPageSchema 的 canvasWorkspaceId 必须 min(1)', () => {
  assert.ok(host.projectPageSchema, 'projectPageSchema 存在');
  const valid = host.projectPageSchema.safeParse({
    id: 'page-1',
    title: '第一页',
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    canvasWorkspaceId: 'ws_valid123',
  });
  assert.equal(valid.success, true);

  const missingWs = host.projectPageSchema.safeParse({
    id: 'page-1',
    title: '第一页',
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
  });
  assert.equal(missingWs.success, false, '缺失 canvasWorkspaceId 必须拒绝');

  const emptyWs = host.projectPageSchema.safeParse({
    id: 'page-1',
    title: '第一页',
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    canvasWorkspaceId: '',
  });
  assert.equal(emptyWs.success, false, '空串 canvasWorkspaceId 必须拒绝');
});

test('T01: ProjectStore 数据一致性与读时自愈机制 (repairProjectRecord)', () => {
  const libraryRoot = tmpDir('omnimux-healing-');
  try {
    const store = host.createProjectStore({ libraryRoot });

    // 1. 测试 a: 若 pages 为空，自动补全首个创作页，生成合法 ws_*，去重同步 canvasWorkspaceIds
    const projectA = store.create('项目自愈测试A');
    const projectDirA = projectA.path;
    const projectFileA = join(projectDirA, '.omnimux', 'project.json');
    // 手工制造脏数据：清空 pages 且 activePageId 为空
    const rawDirtyA = JSON.parse(readFileSync(projectFileA, 'utf8'));
    rawDirtyA.pages = [];
    rawDirtyA.activePageId = '';
    rawDirtyA.canvasWorkspaceIds = ['ws_original_canvas'];
    writeFileSync(projectFileA, JSON.stringify(rawDirtyA, null, 2), 'utf8');

    // 读时触发自愈 (get)
    const healedA = store.get(projectA.id);
    assert.ok(healedA.pages && healedA.pages.length === 1, 'pages 为空时自动补全首个创作页');
    assert.equal(healedA.pages[0].id, 'page-default');
    assert.equal(healedA.pages[0].canvasWorkspaceId, 'ws_original_canvas', '优先保留已有合法 canvasWorkspaceIds[0]');
    assert.equal(healedA.activePageId, 'page-default', 'activePageId 回落至 pages[0].id');
    assert.deepEqual(healedA.canvasWorkspaceIds, ['ws_original_canvas'], '去重同步 canvasWorkspaceIds');
    // 验证立即原子写盘持久化且绝无绝对路径 path 字段泄露污染
    const persistedA = JSON.parse(readFileSync(projectFileA, 'utf8'));
    assert.equal(persistedA.pages[0].canvasWorkspaceId, 'ws_original_canvas');
    assert.equal(persistedA.activePageId, 'page-default');
    assert.equal(persistedA.path, undefined, '写入磁盘的 project.json 严禁包含运行时派生的 path 绝对路径');
    assert.equal('path' in persistedA, false, 'project.json 纯净元数据中不得有 path 键');

    // 2. 测试 b/c/d: 遍历 pages，对缺失或空串分配全新 ws_*，去重同步，activePageId 失效回落
    const projectB = store.create('项目自愈测试B');
    const projectDirB = projectB.path;
    const projectFileB = join(projectDirB, '.omnimux', 'project.json');
    // 制造脏数据：包含缺失 canvasWorkspaceId 与空串的页面，activePageId 指向不存在的页面
    const rawDirtyB = JSON.parse(readFileSync(projectFileB, 'utf8'));
    rawDirtyB.pages = [
      { id: 'page-1', title: '页1', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' },
      { id: 'page-2', title: '页2', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z', canvasWorkspaceId: '' },
      { id: 'page-3', title: '页3', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z', canvasWorkspaceId: 'ws_existing_3' },
    ];
    rawDirtyB.activePageId = 'page-ghost';
    rawDirtyB.canvasWorkspaceIds = ['ws_stale'];
    writeFileSync(projectFileB, JSON.stringify(rawDirtyB, null, 2), 'utf8');

    // 读时触发自愈 (list)
    const listResult = store.list();
    const itemB = listResult.find((p) => p.id === projectB.id);
    assert.ok(itemB);
    assert.equal(itemB.pages.length, 3);
    assert.match(itemB.pages[0].canvasWorkspaceId, /^ws_[a-zA-Z0-9_-]{1,128}$/);
    assert.match(itemB.pages[1].canvasWorkspaceId, /^ws_[a-zA-Z0-9_-]{1,128}$/);
    assert.equal(itemB.pages[2].canvasWorkspaceId, 'ws_existing_3');
    assert.notEqual(itemB.pages[0].canvasWorkspaceId, itemB.pages[1].canvasWorkspaceId, '各分配全新独立 ID');
    assert.equal(itemB.activePageId, 'page-1', 'activePageId 安全回落至 pages[0].id');

    // 验证盘上已同步
    const diskB = store.get(projectB.id);
    assert.equal(diskB.pages[0].canvasWorkspaceId, itemB.pages[0].canvasWorkspaceId);
    assert.deepEqual(
      new Set(diskB.canvasWorkspaceIds),
      new Set([diskB.pages[0].canvasWorkspaceId, diskB.pages[1].canvasWorkspaceId, 'ws_existing_3', 'ws_stale']),
      '所有创作页的 canvasWorkspaceId 去重同步至 canvasWorkspaceIds',
    );
    const persistedB = JSON.parse(readFileSync(projectFileB, 'utf8'));
    assert.equal(persistedB.path, undefined, '自愈写盘后的 project.json 严禁泄露绝对路径 path');
    assert.equal('path' in persistedB, false);

    // 3. 测试 findByCanvasWorkspaceId 命中自愈后的创作页
    const foundByWs = store.findByCanvasWorkspaceId(diskB.pages[1].canvasWorkspaceId);
    assert.ok(foundByWs);
    assert.equal(foundByWs.id, projectB.id);

    // 4. 测试 setActivePage 自愈与安全设置
    const activated = store.setActivePage(projectB.id, 'page-3');
    assert.equal(activated.activePageId, 'page-3');
    assert.throws(() => store.setActivePage(projectB.id, 'not-exist'), (e) => e.code === 'page-not-found');

    // 5. 重构 addPage 契约测试
    const afterAdd = store.addPage(projectB.id, '新创作页');
    const newAddedPage = afterAdd.pages[afterAdd.pages.length - 1];
    assert.match(newAddedPage.canvasWorkspaceId, /^ws_[a-zA-Z0-9_-]{1,128}$/);
    assert.equal(afterAdd.activePageId, newAddedPage.id, 'activePageId 设置为新页面');
    assert.ok(afterAdd.canvasWorkspaceIds.includes(newAddedPage.canvasWorkspaceId), '新页面的 wsId 自动进入 canvasWorkspaceIds');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('T02: POST /pages 物理工作区自动创建与 session-binding 修正', async () => {
  const libraryRoot = tmpDir('omnimux-pages-routes-');
  const createdWorkspaces = [];
  const fakeWorkspaceStore = {
    create(name) {
      const ws = { id: `ws_created_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name };
      createdWorkspaces.push(ws);
      return ws;
    },
  };

  const dispatcher = host.createProjectDispatcher({
    libraryRoot,
    workspaceStore: fakeWorkspaceStore,
    resolveSessionWorkspaceDir: (sess) => join(libraryRoot, sess),
  });

  const localHeaders = { origin: 'http://localhost:3000' };

  // 1. 先通过 dispatcher 创建一个测试项目
  const createProjectRes = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-workflow/api/projects',
    headers: localHeaders,
    body: { title: '多创作页项目' },
  });
  assert.equal(createProjectRes.status, 200);
  const projectId = createProjectRes.body.project.id;

  // 2. POST /projects/:projectId/pages 未传 canvasWorkspaceId：
  // 必须自动调用 workspaceStore.create(title)，并返回 { status: 200, body: { project, page } }
  const addPageRes = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/projects/${projectId}/pages`,
    headers: localHeaders,
    body: { title: '第二镜头组' },
  });
  assert.equal(addPageRes.status, 200);
  assert.ok(addPageRes.body.project, '响应必须包含 project');
  assert.ok(addPageRes.body.page, '响应必须包含 page');
  assert.equal(addPageRes.body.page.title, '第二镜头组');
  assert.equal(createdWorkspaces.length, 1, '调用了 workspaceStore.create');
  assert.equal(addPageRes.body.page.canvasWorkspaceId, createdWorkspaces[0].id, '创作页使用了物理创建的 workspace ID');
  assert.equal(addPageRes.body.project.activePageId, addPageRes.body.page.id);
  assert.ok(addPageRes.body.project.canvasWorkspaceIds.includes(createdWorkspaces[0].id));

  // 3. GET /projects/session-binding 优先使用 activePage.canvasWorkspaceId
  const sessDir = join(libraryRoot, 'test-sess');
  mkdirSync(sessDir, { recursive: true });
  const bindingRes = await dispatcher.dispatch({
    method: 'GET',
    url: '/omnimux-workflow/api/projects/session-binding?sessionId=test-sess',
  });
  assert.equal(bindingRes.status, 200);
  assert.equal(bindingRes.body.ok, true);
  assert.ok(bindingRes.body.project);
  assert.equal(
    bindingRes.body.project.canvasWorkspaceId,
    bindingRes.body.project.pages[0].canvasWorkspaceId,
    '优先且必须等于 activePage 的 canvasWorkspaceId',
  );

  rmSync(libraryRoot, { recursive: true, force: true });
});

test('T03: POST /pages 前置校验 title 合法性，非法时不触发 workspaceStore.create 避免孤儿工作区', async () => {
  const libraryRoot = tmpDir('omnimux-pages-title-validation-');
  const createdWorkspaces = [];
  const fakeWorkspaceStore = {
    create(name) {
      const ws = { id: `ws_created_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name };
      createdWorkspaces.push(ws);
      return ws;
    },
  };

  const dispatcher = host.createProjectDispatcher({
    libraryRoot,
    workspaceStore: fakeWorkspaceStore,
  });

  const localHeaders = { origin: 'http://localhost:3000' };

  // 1. 创建测试项目
  const createProjectRes = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-workflow/api/projects',
    headers: localHeaders,
    body: { title: '测试项目校验' },
  });
  assert.equal(createProjectRes.status, 200);
  const projectId = createProjectRes.body.project.id;

  // 2. 缺少 title 字段
  const missingTitleRes = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/projects/${projectId}/pages`,
    headers: localHeaders,
    body: {},
  });
  assert.equal(missingTitleRes.status, 400);
  assert.equal(missingTitleRes.body.error, 'title-required');
  assert.equal(createdWorkspaces.length, 0, '缺少 title 严禁触发 workspaceStore.create');

  // 3. 空字符串 title: ''
  const emptyTitleRes = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/projects/${projectId}/pages`,
    headers: localHeaders,
    body: { title: '' },
  });
  assert.equal(emptyTitleRes.status, 400);
  assert.equal(emptyTitleRes.body.error, 'title-required');
  assert.equal(createdWorkspaces.length, 0, '空 title 严禁触发 workspaceStore.create');

  // 4. 纯空白字符串 title: '   '
  const blankTitleRes = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/projects/${projectId}/pages`,
    headers: localHeaders,
    body: { title: '   ' },
  });
  assert.equal(blankTitleRes.status, 400);
  assert.equal(blankTitleRes.body.error, 'title-required');
  assert.equal(createdWorkspaces.length, 0, '纯空白 title 严禁触发 workspaceStore.create');

  // 5. 非字符串 title: 123
  const nonStringTitleRes = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/projects/${projectId}/pages`,
    headers: localHeaders,
    body: { title: 123 },
  });
  assert.equal(nonStringTitleRes.status, 400);
  assert.equal(nonStringTitleRes.body.error, 'title-required');
  assert.equal(createdWorkspaces.length, 0, '非字符串 title 严禁触发 workspaceStore.create');

  // 6. 超过 200 字符的超长 title
  const tooLongTitle = 'a'.repeat(201);
  const tooLongTitleRes = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/projects/${projectId}/pages`,
    headers: localHeaders,
    body: { title: tooLongTitle },
  });
  assert.equal(tooLongTitleRes.status, 400);
  assert.equal(tooLongTitleRes.body.error, 'title-too-long');
  assert.equal(createdWorkspaces.length, 0, '超长 title 严禁触发 workspaceStore.create');

  // 7. 不存在的 projectId
  const notFoundProjectRes = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux-workflow/api/projects/non-existent-proj/pages',
    headers: localHeaders,
    body: { title: '有效名称' },
  });
  assert.equal(notFoundProjectRes.status, 404);
  assert.equal(notFoundProjectRes.body.error, 'project-not-found');
  assert.equal(createdWorkspaces.length, 0, '不存在的 projectId 严禁触发 workspaceStore.create');

  // 8. 正确合法的 title（如 '有效第三镜头组'），成功创建且此时才触发一次 workspaceStore.create
  const validAddPageRes = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/projects/${projectId}/pages`,
    headers: localHeaders,
    body: { title: '  有效第三镜头组  ' },
  });
  assert.equal(validAddPageRes.status, 200);
  assert.equal(createdWorkspaces.length, 1, '仅在校验合法后方才调用一次 workspaceStore.create');
  assert.equal(createdWorkspaces[0].name, '有效第三镜头组', '工作区名称使用去除首尾空格后的合法 title');
  assert.equal(validAddPageRes.body.page.title, '有效第三镜头组');

  rmSync(libraryRoot, { recursive: true, force: true });
});

}); // describe
