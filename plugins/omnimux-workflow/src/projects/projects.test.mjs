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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, realpathSync, readdirSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
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
  assert.equal(host.PROJECT_SCHEMA_VERSION, 2);
  assert.equal(host.MAX_PROJECT_TITLE_LENGTH, 200);

  const good = host.parseProject({
    schemaVersion: 2,
    id: 'p1',
    title: '我的项目',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    activePageId: 'page-default',
    pages: [{ id: 'page-default', title: '创作页 1', createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z', canvasWorkspaceId: 'ws_abc123' }],
  });
  assert.ok(good, '合法 project.json 解析成功');
  assert.equal(host.parseProject({ ...good, schemaVersion: 3 }), null);
  assert.equal(host.parseProject({ ...good, title: 'x'.repeat(201) }), null);
  assert.equal(host.parseProjectIndex({ schemaVersion: 2, projects: 'nope' }), null);
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
    assert.equal(created.pages.length, 1);
    assert.equal(projectRoot, join(libraryRoot, '项目甲'));
    assert.ok(existsSync(projectRoot));
    assert.ok(readFileSync(join(projectRoot, '.omnimux', 'project.json'), 'utf8').includes(created.id));
    assert.equal(existsSync(join(projectRoot, '说明.md')), false, '新建项目不自动生成无意义的说明.md');
    writeFileSync(join(projectRoot, 'user-notes.txt'), 'hello');

    const renamedFolder = store.create('项目甲');
    assert.equal(renamedFolder.path, join(libraryRoot, '项目甲 (2)'));

    const found = store.findByCanvasWorkspaceId(created.pages[0].canvasWorkspaceId);
    assert.equal(found.id, created.id);
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
    assert.equal(existsSync(join(projectRoot, '.omnimux', 'project.json')), false, 'remove() 必须摘除项目档案');
    assert.equal(existsSync(join(projectRoot, '.omnimux')), true, '画布/资产等用户数据所在的 .omnimux 目录不得整目录删除');
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

    // 1. 测试 a: 若 pages 为空，自动补全首个创作页并生成合法 ws_*
    const projectA = store.create('项目自愈测试A');
    const projectDirA = projectA.path;
    const projectFileA = join(projectDirA, '.omnimux', 'project.json');
    // 手工制造脏数据：清空 pages 且 activePageId 为空
    const rawDirtyA = JSON.parse(readFileSync(projectFileA, 'utf8'));
    rawDirtyA.pages = [];
    rawDirtyA.activePageId = '';
    writeFileSync(projectFileA, JSON.stringify(rawDirtyA, null, 2), 'utf8');

    // 读时触发自愈 (get)
    const healedA = store.get(projectA.id);
    assert.ok(healedA.pages && healedA.pages.length === 1, 'pages 为空时自动补全首个创作页');
    assert.equal(healedA.pages[0].id, 'page-default');
    assert.match(healedA.pages[0].canvasWorkspaceId, /^ws_[a-zA-Z0-9_-]{1,128}$/);
    assert.equal(healedA.activePageId, 'page-default', 'activePageId 回落至 pages[0].id');
    // 验证立即原子写盘持久化且绝无绝对路径 path 字段泄露污染
    const persistedA = JSON.parse(readFileSync(projectFileA, 'utf8'));
    assert.match(persistedA.pages[0].canvasWorkspaceId, /^ws_[a-zA-Z0-9_-]{1,128}$/);
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
    assert.equal(afterAdd.pages.at(-1).canvasWorkspaceId, newAddedPage.canvasWorkspaceId);
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
  assert.ok(addPageRes.body.project.pages.some((page) => page.canvasWorkspaceId === createdWorkspaces[0].id));

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

test('T04: POST /pages 事务补偿与回滚：store.addPage 失败时自动调用 workspaceStore.remove 清理残留工作区', async () => {
  const libraryRoot = tmpDir('omnimux-pages-rollback-');
  const createdWorkspaces = [];
  const removedWorkspaces = [];
  const fakeWorkspaceStore = {
    create(name) {
      const ws = { id: `ws_rollback_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name };
      createdWorkspaces.push(ws);
      return ws;
    },
    remove(id) {
      removedWorkspaces.push(id);
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
    body: { title: '测试回滚项目' },
  });
  assert.equal(createProjectRes.status, 200);
  const projectId = createProjectRes.body.project.id;
  const projectRoot = createProjectRes.body.project.path;
  const dotOmnimuxDir = join(projectRoot, '.omnimux');

  // 2. 将 .omnimux 设为只读模式 (0o555)，使后续 store.addPage 写盘时触发 EACCES 抛出异常
  chmodSync(dotOmnimuxDir, 0o555);

  try {
    const failedAddRes = await dispatcher.dispatch({
      method: 'POST',
      url: `/omnimux-workflow/api/projects/${projectId}/pages`,
      headers: localHeaders,
      body: { title: '回滚镜头组' },
    });

    // 写入失败应返回 500 internal error
    assert.equal(failedAddRes.status, 500);
    // 验证先调用了 workspaceStore.create
    assert.equal(createdWorkspaces.length, 1);
    const createdId = createdWorkspaces[0].id;
    // 核心断言：验证 store.addPage 失败时触发回滚补偿，workspaceStore.remove 被精确调用
    assert.equal(removedWorkspaces.length, 1);
    assert.equal(removedWorkspaces[0], createdId, 'opts.workspaceStore.remove 必须被调用以清理残留物理工作区');
  } finally {
    // 恢复目录写权限
    chmodSync(dotOmnimuxDir, 0o755);
  }

  // 3. 对比断言：显式提供 canvasWorkspaceId 时，若 store.addPage 失败，严禁调用 remove 误删已有工作区
  chmodSync(dotOmnimuxDir, 0o555);
  try {
    const failedWithExplicitWs = await dispatcher.dispatch({
      method: 'POST',
      url: `/omnimux-workflow/api/projects/${projectId}/pages`,
      headers: localHeaders,
      body: { title: '已有画布页', canvasWorkspaceId: 'ws_existing_canvas_preserve' },
    });
    assert.equal(failedWithExplicitWs.status, 500);
    // 严禁对已有工作区调用 remove
    assert.equal(removedWorkspaces.length, 1, '未自动创建工作区时严禁调用 opts.workspaceStore.remove');
    assert.equal(removedWorkspaces.includes('ws_existing_canvas_preserve'), false);
  } finally {
    chmodSync(dotOmnimuxDir, 0o755);
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

// ── v1→v2 读取迁移（建不出项目红字死循环的真因修复）────────────────────────
function writeV1Project(root, overrides = {}) {
  mkdirSync(join(root, '.omnimux'), { recursive: true });
  const record = {
    schemaVersion: 1,
    id: 'v1-project',
    title: '旧项目',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    sessionId: 'sess-legacy',
    canvasWorkspaceIds: ['ws_legacy_a', 'ws_legacy_b'],
    ...overrides,
  };
  writeFileSync(join(root, '.omnimux', 'project.json'), JSON.stringify(record));
  return record;
}

test('T0 v1→v2 读取迁移：合法 v2、丢弃 sessionId/canvasWorkspaceIds、幂等确定', () => {
  const v1 = {
    schemaVersion: 1, id: 'p-v1', title: '旧项目',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    sessionId: 'sess-1', canvasWorkspaceIds: ['ws_old_a', 'ws_old_b'],
  };
  const migrated = host.parseProject(v1);
  assert.ok(migrated, 'v1 必须迁移为合法 v2');
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.id, 'p-v1');
  assert.equal(migrated.title, '旧项目');
  assert.equal(migrated.createdAt, v1.createdAt);
  assert.equal(migrated.updatedAt, v1.updatedAt);
  assert.equal(migrated.pages.length, 2);
  assert.deepEqual(migrated.pages.map((p) => p.canvasWorkspaceId), ['ws_old_a', 'ws_old_b']);
  assert.equal(migrated.activePageId, migrated.pages[0].id);
  assert.equal('sessionId' in migrated, false, 'v1 sessionId 必须丢弃');
  assert.equal('canvasWorkspaceIds' in migrated, false, 'v1 canvasWorkspaceIds 必须丢弃');
  assert.deepEqual(host.parseProject(migrated), migrated, '对迁移结果再解析必须幂等');
  assert.deepEqual(host.parseProject(v1), migrated, '同一 v1 输入迁移必须确定');
});

test('T0 v1 无 canvasWorkspaceIds：仍生成 ≥1 个带有效 canvasWorkspaceId 的 page', () => {
  const migrated = host.parseProject({ schemaVersion: 1, id: 'p2', title: '空画布旧项目', createdAt: 'c', updatedAt: 'u' });
  assert.ok(migrated);
  assert.ok(migrated.pages.length >= 1);
  assert.ok(migrated.pages.every((p) => typeof p.canvasWorkspaceId === 'string' && p.canvasWorkspaceId.trim() !== ''));
  assert.equal(migrated.activePageId, migrated.pages[0].id);
});

test('T0 v2 行为不变；坏 JSON / 坏版本 = null', () => {
  const v2 = {
    schemaVersion: 2, id: 'p-v2', title: '新项目', createdAt: 'c', updatedAt: 'u', activePageId: 'page-default',
    pages: [{ id: 'page-default', title: '创作页 1', createdAt: 'c', updatedAt: 'u', canvasWorkspaceId: 'ws_ok' }],
  };
  assert.deepEqual(host.parseProject(v2), v2, 'v2 解析必须原样不变');
  assert.equal(host.parseProject(null), null);
  assert.equal(host.parseProject('not-json'), null);
  assert.equal(host.parseProject({ schemaVersion: 1 }), null, '缺 id/title 的 v1 是坏记录');
  assert.equal(host.parseProject({ schemaVersion: 99, id: 'x', title: 'y' }), null, '高版本拒绝');
});

test('T1 create() 遇 v1 project.json：返回迁移记录（非 409），二次幂等', () => {
  const libraryRoot = tmpDir('omnimux-v1-create-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const projectRoot = join(libraryRoot, '旧项目甲');
    writeV1Project(projectRoot, { id: 'v1-甲', title: '旧项目甲', canvasWorkspaceIds: ['ws_a'] });

    const first = store.create('旧项目甲', { projectRoot });
    assert.equal(first.id, 'v1-甲');
    assert.equal(first.path, projectRoot);
    assert.equal(first.schemaVersion, 2, 'create 应返回迁移后的 v2 记录');
    assert.equal(first.pages[0].canvasWorkspaceId, 'ws_a');

    const second = store.create('旧项目甲', { projectRoot });
    assert.equal(second.id, 'v1-甲', '二次 create 幂等，同一个项目');
    assert.deepEqual(second.pages, first.pages);

    const listed = store.list();
    assert.equal(listed.length, 1, 'v1 迁移后必须出现在列表');
    assert.equal(listed[0].id, 'v1-甲');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('T1 长标题 v1 迁移：生成页标题必须 ≤200，落盘后仍可解析且列表可见（F1 回归）', () => {
  const MAX = host.MAX_PROJECT_TITLE_LENGTH;
  const libraryRoot = tmpDir('omnimux-v1-long-title-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const projectRoot = join(libraryRoot, '长标题项目');
    const longTitle = '长'.repeat(MAX); // 项目标题恰在上限，页标题再由其派生必然越界

    // 1) 纯迁移：多 canvasWorkspaceIds 生成 `${title} · 创作页 N` 时必须截断
    const migrated = host.parseProject({
      schemaVersion: 1, id: 'v1-long', title: longTitle,
      createdAt: 'c', updatedAt: 'u', canvasWorkspaceIds: ['ws_1', 'ws_2', 'ws_3'],
    });
    assert.ok(migrated, '长标题 v1 必须迁移为合法 v2，不能被丢弃');
    assert.equal(migrated.pages.length, 3);
    for (const page of migrated.pages) {
      assert.ok(
        page.title.length <= MAX,
        `页标题必须 ≤ ${MAX}，实际 ${page.title.length}`,
      );
      assert.equal(page.title.trim().length > 0, true, '页标题不能为空');
    }

    // 2) 落盘闭环：create() 返回迁移记录 → addPage 写 v2 → 磁盘记录仍可解析
    writeV1Project(projectRoot, { id: 'v1-long', title: longTitle, canvasWorkspaceIds: ['ws_1', 'ws_2'] });
    const created = store.create(longTitle, { projectRoot });
    assert.equal(created.id, 'v1-long', 'create() 应返回迁移后的既有项目，而非 409');
    store.addPage(created.id, '追加页');

    const onDisk = JSON.parse(readFileSync(join(projectRoot, '.omnimux', 'project.json'), 'utf8'));
    const reparsed = host.parseProject(onDisk);
    assert.ok(reparsed, '落盘后的 v2 记录必须能被 parseProject 读取（否则项目会从列表消失）');
    assert.ok(
      reparsed.pages.every((page) => page.title.length <= MAX),
      '落盘记录中所有页标题必须仍 ≤ 上限',
    );
    const listed = store.list();
    assert.ok(
      listed.some((row) => row.id === 'v1-long'),
      '长标题 v1 迁移落盘后必须仍出现在列表（原 bug 是列表消失→再建只回红字）',
    );
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('T1 create() 遇真损坏 project.json：返回 project-record-invalid（非 project-exists/409）', () => {
  const libraryRoot = tmpDir('omnimux-bad-create-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const projectRoot = join(libraryRoot, '坏项目');
    mkdirSync(join(projectRoot, '.omnimux'), { recursive: true });
    writeFileSync(join(projectRoot, '.omnimux', 'project.json'), '{ not-valid-json');
    assert.throws(
      () => store.create('坏项目', { projectRoot }),
      (e) => e.code === 'project-record-invalid',
      '损坏记录必须是可操作的 project-record-invalid，而不是 project-exists',
    );
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('T1 scanEntries 收录 v1 外部目录并保留 registry；坏文件留登记+diagnostic', () => {
  const libraryRoot = tmpDir('omnimux-ext-lib-');
  const extGood = tmpDir('omnimux-ext-good-');
  const extBad = tmpDir('omnimux-ext-bad-');
  try {
    writeV1Project(extGood, { id: 'ext-v1', title: '外部旧项目', canvasWorkspaceIds: ['ws_ext'] });
    mkdirSync(join(extBad, '.omnimux'), { recursive: true });
    writeFileSync(join(extBad, '.omnimux', 'project.json'), '{ broken');
    writeFileSync(join(libraryRoot, '.external-projects.json'), JSON.stringify([extGood, extBad]));

    const store = host.createProjectStore({ libraryRoot });
    const listed = store.list();
    assert.ok(listed.some((row) => row.id === 'ext-v1' && row.path === extGood), 'v1 外部目录必须被收录');

    const registry = JSON.parse(readFileSync(join(libraryRoot, '.external-projects.json'), 'utf8'));
    assert.ok(registry.includes(extGood), '合法外部目录保留在 registry');
    assert.ok(registry.includes(extBad), '损坏外部目录也必须保留登记，不得静默剔除');

    const found = store.findByRoot(extGood);
    assert.equal(found.id, 'ext-v1', 'findByRoot 对 v1 目录命中');
    assert.equal(store.findByCanvasWorkspaceId('ws_ext').id, 'ext-v1', 'findByCanvasWorkspaceId 对迁移后 page 命中');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(extGood, { recursive: true, force: true });
    rmSync(extBad, { recursive: true, force: true });
  }
});

test('T2 routes：POST/GET v1 目录 200 非 409，随后可追加创作页', async () => {
  const libraryRoot = tmpDir('omnimux-v1-route-');
  const externalRoot = tmpDir('omnimux-v1-ext-');
  try {
    writeV1Project(externalRoot, { id: 'v1-route', title: '路由旧项目', canvasWorkspaceIds: ['ws_route_a'] });
    const dispatcher = host.createProjectDispatcher({ libraryRoot });
    const localHeaders = { origin: 'http://localhost:3000' };

    const created = await dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers: localHeaders,
      body: { title: '路由旧项目', projectRoot: externalRoot },
    });
    assert.equal(created.status, 200, 'POST v1 目录必须 200，不能 409');
    assert.equal(created.body.project.id, 'v1-route');
    assert.equal(created.body.project.schemaVersion, 2);

    const got = await dispatcher.dispatch({
      method: 'GET', url: `/omnimux-workflow/api/projects?path=${encodeURIComponent(externalRoot)}`, headers: localHeaders,
    });
    assert.equal(got.status, 200);
    assert.ok(got.body.project, 'GET ?path 对 v1 目录必须返回 project');
    assert.equal(got.body.project.id, 'v1-route');

    const added = await dispatcher.dispatch({
      method: 'POST', url: `/omnimux-workflow/api/projects/${created.body.project.id}/pages`, headers: localHeaders,
      body: { title: '追加创作页' },
    });
    assert.equal(added.status, 200, '迁移后必须能追加创作页');
    assert.ok(added.body.project.pages.some((p) => p.title === '追加创作页'));
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

// ── B1：项目↔工作区关系模型（ensureProject S0–S4 / 单一真源 / 事务 / 并发）─────
function writeValidV2(root, overrides = {}) {
  const record = {
    schemaVersion: 2,
    id: 'b1-v2',
    title: '已有项目',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    activePageId: 'page-default',
    pages: [{
      id: 'page-default',
      title: '创作页 1',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      canvasWorkspaceId: 'ws_keep_1',
    }],
    ...overrides,
  };
  mkdirSync(join(root, '.omnimux'), { recursive: true });
  writeFileSync(join(root, '.omnimux', 'project.json'), JSON.stringify(record, null, 2));
  return record;
}

function writeCanvasFile(root, id, name) {
  const dir = join(root, '.omnimux', 'canvases');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({
    schemaVersion: 2,
    id,
    name,
    version: 0,
    nodes: [],
    edges: [],
    settings: {},
    metadata: { createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', nodeCount: 0 },
  }, null, 2));
}

function readProjectFile(root) {
  return JSON.parse(readFileSync(join(root, '.omnimux', 'project.json'), 'utf8'));
}

function readRegistry(libraryRoot) {
  const file = join(libraryRoot, '.external-projects.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

test('B1 S0：空工作区 ensureProject → initialized（合法 v2 + 首创作页 + 登记索引）', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const result = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(result.action, 'initialized');
    assert.equal(result.root, realpathSync(workspace));
    assert.equal(result.project.path, realpathSync(workspace));
    const onDisk = readProjectFile(result.root);
    assert.equal(onDisk.schemaVersion, 2);
    assert.equal(onDisk.pages.length, 1);
    assert.match(onDisk.pages[0].canvasWorkspaceId, /^ws_/);
    assert.equal(onDisk.activePageId, onDisk.pages[0].id);
    assert.ok(host.parseProject(onDisk), '落盘档案必须可被 parseProject 读取');
    assert.ok(readRegistry(libraryRoot).includes(realpathSync(workspace)), '外置工作区必须登记进索引');
    assert.equal(store.list().some((row) => row.id === result.project.id), true, '初始化后必须出现在列表');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 S1：合法 v2 → adopted；重复调用 → existing 且页数不增长', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const seeded = writeValidV2(workspace, { id: 'b1-s1' });
    const first = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(first.action, 'adopted');
    assert.equal(first.project.id, 'b1-s1');
    assert.equal(first.project.pages.length, 1);
    assert.equal(first.project.pages[0].canvasWorkspaceId, 'ws_keep_1');
    assert.equal(readProjectFile(workspace).id, seeded.id, '采纳不得新建第二个项目');

    const second = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(second.action, 'existing');
    assert.equal(second.project.id, 'b1-s1');
    assert.equal(second.project.pages.length, 1, '幂等不得重复加页');
    assert.deepEqual(readProjectFile(workspace).pages, seeded.pages);
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 S2：v1 档案 → repaired（复用 parseProject 迁移，绝不抛 project-exists）', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    writeV1Project(workspace, { id: 'b1-s2', title: '旧项目', canvasWorkspaceIds: ['ws_v1_a', 'ws_v1_b'] });
    const first = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(first.action, 'repaired');
    assert.equal(first.project.id, 'b1-s2');
    assert.deepEqual(first.project.pages.map((p) => p.canvasWorkspaceId), ['ws_v1_a', 'ws_v1_b']);
    const onDisk = readProjectFile(workspace);
    assert.equal(onDisk.schemaVersion, 2, 'v1 必须迁移并写回 v2');
    assert.equal('sessionId' in onDisk, false);
    assert.equal('canvasWorkspaceIds' in onDisk, false);

    const second = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(second.action, 'existing', '迁移后重复调用幂等');
    assert.equal(second.project.id, 'b1-s2');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 S2：坏 JSON 档案 → repaired（重建合法 v2），不 409', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    mkdirSync(join(workspace, '.omnimux'), { recursive: true });
    writeFileSync(join(workspace, '.omnimux', 'project.json'), '{ not json');
    const result = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(result.action, 'repaired');
    const onDisk = readProjectFile(workspace);
    assert.equal(onDisk.schemaVersion, 2);
    assert.ok(host.parseProject(onDisk));
    assert.equal(onDisk.pages.length >= 1, true);
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 S3：无档案但有画布文件 → adopted-files，保留原 canvasWorkspaceId 且不覆盖文件', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    writeCanvasFile(workspace, 'ws_canvas_a', '镜头A');
    writeCanvasFile(workspace, 'ws_canvas_b', '镜头B');
    const canvasA = join(workspace, '.omnimux', 'canvases', 'ws_canvas_a.json');
    const beforeA = readFileSync(canvasA, 'utf8');

    const result = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(result.action, 'adopted-files');
    assert.deepEqual(
      result.project.pages.map((p) => p.canvasWorkspaceId),
      ['ws_canvas_a', 'ws_canvas_b'],
      '必须保留既有画布 id',
    );
    assert.deepEqual(result.project.pages.map((p) => p.title), ['镜头A', '镜头B']);
    assert.equal(readFileSync(canvasA, 'utf8'), beforeA, '不得覆盖既有画布文件');
    assert.equal(readProjectFile(workspace).schemaVersion, 2);
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 S4：registry 重复/同 id 双记录 → converged（只收敛索引，不动用户文件）', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  const duplicate = tmpDir('omnimux-b1-dup-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    writeValidV2(workspace, { id: 'b1-shared', title: '主项目' });
    writeValidV2(duplicate, { id: 'b1-shared', title: '重复副本' });
    const realWorkspace = realpathSync(workspace);
    const realDuplicate = realpathSync(duplicate);
    writeFileSync(
      join(libraryRoot, '.external-projects.json'),
      JSON.stringify([realWorkspace, realWorkspace, realDuplicate], null, 2),
    );

    const result = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(result.action, 'converged');
    assert.equal(result.project.id, 'b1-shared');
    const registry = readRegistry(libraryRoot);
    assert.deepEqual(registry, [realWorkspace], '同一 root 去重 + 同 id 的重复索引被丢弃');
    assert.ok(existsSync(join(duplicate, '.omnimux', 'project.json')), '重复副本的用户文件必须保留');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(duplicate, { recursive: true, force: true });
  }
});

test('B1 independent：默认库按标题派生 root，重复调用幂等', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const first = await store.ensureProject({ mode: 'independent', title: '独立项目' });
    assert.equal(first.action, 'initialized');
    assert.equal(first.root, join(resolve(libraryRoot), '独立项目'));
    assert.equal(first.project.path, first.root);
    const folders = readdirSync(libraryRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
    assert.equal(folders.length, 1, '只能产生一个项目文件夹');

    const second = await store.ensureProject({ mode: 'independent', title: '独立项目' });
    assert.equal(second.action, 'existing');
    assert.equal(second.project.id, first.project.id, '同一 (mode,title) 必须返回同一项目');
    assert.equal(second.project.pages.length, 1, '幂等不得加页');
    assert.equal(readRegistry(libraryRoot).includes(first.root), false, '独立项目不登记外置索引');
    await assert.rejects(
      store.ensureProject({ mode: 'independent', title: 'x'.repeat(host.MAX_PROJECT_TITLE_LENGTH + 1) }),
      (error) => error?.code === 'title-too-long',
    );
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
});

test('B1 并发：同一工作区两次并发 ensure → 1 个项目 / 1 个 project.json', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const [a, b] = await Promise.all([
      store.ensureProject({ mode: 'workspace', workspaceDir: workspace }),
      store.ensureProject({ mode: 'workspace', workspaceDir: workspace }),
    ]);
    assert.equal(a.project.id, b.project.id, '并发必须收敛到同一 project id');
    assert.deepEqual(new Set([a.action, b.action]), new Set(['initialized', 'existing']));
    assert.equal(readProjectFile(workspace).pages.length, 1, '不得产生重复创作页');
    const files = readdirSync(join(workspace, '.omnimux')).filter((f) => f === 'project.json');
    assert.equal(files.length, 1);
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 锁：过期 .lock 可回收；活锁超时 → project-lock-timeout 且无半成品', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const staleWorkspace = tmpDir('omnimux-b1-stale-');
  const heldWorkspace = tmpDir('omnimux-b1-held-');
  try {
    const staleStore = host.createProjectStore({ libraryRoot, lockStaleMs: 50, lockTimeoutMs: 2_000 });
    mkdirSync(join(staleWorkspace, '.omnimux'), { recursive: true });
    const staleLock = join(staleWorkspace, '.omnimux', '.lock');
    writeFileSync(staleLock, '{"pid":999999}');
    const old = new Date(Date.now() - 60_000);
    utimesSync(staleLock, old, old);
    const recovered = await staleStore.ensureProject({ mode: 'workspace', workspaceDir: staleWorkspace });
    assert.equal(recovered.action, 'initialized', '过期锁必须被回收后正常初始化');
    assert.equal(existsSync(staleLock), false, '完成后必须释放锁');

    const heldStore = host.createProjectStore({ libraryRoot, lockStaleMs: 60_000, lockTimeoutMs: 120 });
    mkdirSync(join(heldWorkspace, '.omnimux'), { recursive: true });
    writeFileSync(join(heldWorkspace, '.omnimux', '.lock'), JSON.stringify({ pid: process.pid }));
    await assert.rejects(
      heldStore.ensureProject({ mode: 'workspace', workspaceDir: heldWorkspace }),
      (error) => error?.code === 'project-lock-timeout',
    );
    assert.equal(existsSync(join(heldWorkspace, '.omnimux', 'project.json')), false, '拿不到锁不得写半成品');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(staleWorkspace, { recursive: true, force: true });
    rmSync(heldWorkspace, { recursive: true, force: true });
  }
});

test('B1 事务：写盘失败注入 → 无 project.json；恢复后重试得到合法档案', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const metaDir = join(workspace, '.omnimux');
    mkdirSync(metaDir, { recursive: true });
    chmodSync(metaDir, 0o555);
    try {
      await assert.rejects(store.ensureProject({ mode: 'workspace', workspaceDir: workspace }));
      assert.equal(existsSync(join(metaDir, 'project.json')), false, '失败后不得留下 project.json');
    } finally {
      chmodSync(metaDir, 0o755);
    }
    const retry = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(retry.action, 'initialized');
    assert.ok(host.parseProject(readProjectFile(workspace)), '恢复后必须是合法档案');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 自愈：registry 有记录无文件 → 删索引；有文件无记录 → 补索引（不动用户文件）', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const ghost = tmpDir('omnimux-b1-ghost-');
  const unregistered = tmpDir('omnimux-b1-unreg-');
  try {
    writeValidV2(unregistered, { id: 'b1-unreg' });
    const realGhost = realpathSync(ghost);
    const realUnregistered = realpathSync(unregistered);
    writeFileSync(join(libraryRoot, '.external-projects.json'), JSON.stringify([realGhost], null, 2));

    const store = host.createProjectStore({ libraryRoot, workspaceDirs: () => [unregistered] });
    const listed = store.list();
    assert.equal(listed.some((row) => row.id === 'b1-unreg'), true, '有文件无记录必须补索引并出现在列表');
    const registry = readRegistry(libraryRoot);
    assert.equal(registry.includes(realGhost), false, '无文件的记录必须从索引删除');
    assert.equal(registry.includes(realUnregistered), true, '补索引后必须登记');
    assert.ok(existsSync(join(unregistered, '.omnimux', 'project.json')));
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(ghost, { recursive: true, force: true });
    rmSync(unregistered, { recursive: true, force: true });
  }
});

test('B1 remove()：只摘项目档案，不删画布/用户文件夹', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const created = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    writeCanvasFile(workspace, 'ws_canvas_keep', '保留画布');
    const canvasFile = join(workspace, '.omnimux', 'canvases', 'ws_canvas_keep.json');
    store.remove(created.project.id);
    assert.equal(existsSync(join(workspace, '.omnimux', 'project.json')), false, '项目档案必须摘除');
    assert.equal(existsSync(canvasFile), true, '画布文件属于用户数据，不得删除');
    assert.equal(existsSync(workspace), true, '用户文件夹不得删除');
    assert.equal(store.list().some((row) => row.id === created.project.id), false, '摘除后不再出现在列表');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});


test('B1 锁（F1）：活持有者不被年龄回收 → 超时且不抢写；死 pid 锁可回收', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const liveWorkspace = tmpDir('omnimux-b1-live-');
  const deadWorkspace = tmpDir('omnimux-b1-dead-');
  try {
    // 活 pid（本进程）持锁且 mtime 很旧：必须等超时，绝不按年龄抢占。
    const liveStore = host.createProjectStore({ libraryRoot, lockStaleMs: 50, lockTimeoutMs: 150 });
    const liveMeta = join(liveWorkspace, '.omnimux');
    mkdirSync(liveMeta, { recursive: true });
    const liveLock = join(liveMeta, '.lock');
    writeFileSync(liveLock, JSON.stringify({ pid: process.pid }));
    const old = new Date(Date.now() - 60_000);
    utimesSync(liveLock, old, old);
    await assert.rejects(
      liveStore.ensureProject({ mode: 'workspace', workspaceDir: liveWorkspace }),
      (error) => error?.code === 'project-lock-timeout',
      '活持有者的锁不得被 mtime 年龄回收（否则会写出第二个 project id）',
    );
    assert.equal(existsSync(join(liveMeta, 'project.json')), false, '未拿到锁不得写盘');
    rmSync(liveLock, { force: true });
    const afterRelease = await liveStore.ensureProject({ mode: 'workspace', workspaceDir: liveWorkspace });
    assert.equal(afterRelease.action, 'initialized');

    // 死 pid 锁：即使未过期也可回收（真正崩溃残留）。
    const deadStore = host.createProjectStore({ libraryRoot, lockStaleMs: 60_000, lockTimeoutMs: 2_000 });
    const deadMeta = join(deadWorkspace, '.omnimux');
    mkdirSync(deadMeta, { recursive: true });
    writeFileSync(join(deadMeta, '.lock'), JSON.stringify({ pid: 999999 }));
    const recovered = await deadStore.ensureProject({ mode: 'workspace', workspaceDir: deadWorkspace });
    assert.equal(recovered.action, 'initialized', '死 pid 锁必须被回收');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(liveWorkspace, { recursive: true, force: true });
    rmSync(deadWorkspace, { recursive: true, force: true });
  }
});

test('B1 锁（F1b）：不可解析锁按 1s 宽限回收；刚写入的坏锁不被立即抢占', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const staleWorkspace = tmpDir('omnimux-b1-brokenlock-');
  const freshWorkspace = tmpDir('omnimux-b1-freshlock-');
  try {
    // 崩溃残留的垃圾锁（2s 前）在默认 10s 超时内应被宽限回收，不能等满 30s。
    const store = host.createProjectStore({ libraryRoot });
    mkdirSync(join(staleWorkspace, '.omnimux'), { recursive: true });
    const staleLock = join(staleWorkspace, '.omnimux', '.lock');
    writeFileSync(staleLock, 'garbage-not-json');
    const old = new Date(Date.now() - 2_000);
    utimesSync(staleLock, old, old);
    const started = Date.now();
    const result = await store.ensureProject({ mode: 'workspace', workspaceDir: staleWorkspace });
    assert.equal(result.action, 'initialized');
    assert.ok(Date.now() - started < 5_000, '不可解析锁不得让首次打开等满 lockTimeoutMs');

    // 刚写入（可能是写入瞬间）的坏锁不能被立即抢。
    const impatient = host.createProjectStore({ libraryRoot, lockTimeoutMs: 120, lockStaleMs: 60_000 });
    mkdirSync(join(freshWorkspace, '.omnimux'), { recursive: true });
    writeFileSync(join(freshWorkspace, '.omnimux', '.lock'), 'garbage-not-json');
    await assert.rejects(
      impatient.ensureProject({ mode: 'workspace', workspaceDir: freshWorkspace }),
      (error) => error?.code === 'project-lock-timeout',
    );
    assert.equal(existsSync(join(freshWorkspace, '.omnimux', 'project.json')), false);
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(staleWorkspace, { recursive: true, force: true });
    rmSync(freshWorkspace, { recursive: true, force: true });
  }
});

test('B1 F5：写盘失败时不得先写外置索引', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    // 让 project.json 目标路径是目录 → 原子写 rename 必失败；锁仍可正常创建。
    mkdirSync(join(workspace, '.omnimux', 'project.json'), { recursive: true });
    await assert.rejects(store.ensureProject({ mode: 'workspace', workspaceDir: workspace }));
    assert.equal(
      existsSync(join(libraryRoot, '.external-projects.json')),
      false,
      '写盘失败时不得先登记 registry（F5：先落盘后索引）',
    );
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B1 F6：库根是符号链接时，库内项目不得误登记外置/列表重复', async () => {
  const realLibrary = tmpDir('omnimux-b1-reallib-');
  const linkLibrary = join(tmpdir(), `omnimux-b1-liblink-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  symlinkSync(realLibrary, linkLibrary, 'dir');
  try {
    const store = host.createProjectStore({ libraryRoot: linkLibrary });
    const workspace = join(realLibrary, 'proj-in-library');
    mkdirSync(workspace, { recursive: true });
    const result = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(result.action, 'initialized');
    assert.equal(
      readRegistry(linkLibrary).includes(realpathSync(workspace)),
      false,
      '库内项目（经 realpath）不得写入外置索引',
    );
    const listed = store.list();
    assert.equal(listed.length, 1, '列表不得出现重复项目');
    assert.equal(listed.filter((row) => row.id === result.project.id).length, 1);
  } finally {
    rmSync(linkLibrary, { force: true });
    rmSync(realLibrary, { recursive: true, force: true });
  }
});


test('B1 I4：重复 canvasWorkspaceId 归一（保留首个，其余换新 id）', async () => {
  const libraryRoot = tmpDir('omnimux-b1-lib-');
  const workspace = tmpDir('omnimux-b1-ws-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    writeValidV2(workspace, {
      id: 'b1-i4',
      activePageId: 'page-default',
      pages: [
        { id: 'page-default', title: '页一', createdAt: 'c', updatedAt: 'u', canvasWorkspaceId: 'ws_same' },
        { id: 'page-2', title: '页二', createdAt: 'c', updatedAt: 'u', canvasWorkspaceId: 'ws_same' },
      ],
    });
    const result = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(result.action, 'repaired');
    const ids = result.project.pages.map((page) => page.canvasWorkspaceId);
    assert.equal(ids[0], 'ws_same', '首个引用保留原 id');
    assert.notEqual(ids[1], 'ws_same', '重复引用必须换新 id');
    assert.equal(new Set(ids).size, ids.length, 'I4：canvasWorkspaceId 必须唯一');
    const second = await store.ensureProject({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(second.action, 'existing', '归一后重复调用幂等');
    assert.deepEqual(second.project.pages.map((page) => page.canvasWorkspaceId), ids);
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});


// ── B2：API（mode / 只读预检 / 两级删除 / I3 画布）──────────────────────────
test('B2 预检：S0/S1/S2/S3/S4 状态 + 零写盘', async () => {
  const libraryRoot = tmpDir('omnimux-b2-lib-');
  const s0 = tmpDir('omnimux-b2-s0-');
  const s1 = tmpDir('omnimux-b2-s1-');
  const s2 = tmpDir('omnimux-b2-s2-');
  const s3 = tmpDir('omnimux-b2-s3-');
  const s4 = tmpDir('omnimux-b2-s4-');
  try {
    const store = host.createProjectStore({ libraryRoot });
    const p0 = await store.preflightProject({ workspaceDir: s0 });
    assert.equal(p0.state, 'S0');
    assert.equal(p0.action, 'initialize');
    assert.equal(existsSync(join(s0, '.omnimux')), false, '预检不得创建 .omnimux');
    assert.equal(existsSync(join(libraryRoot, '.external-projects.json')), false, '预检不得写 registry');

    writeValidV2(s1, { id: 'b2-s1' });
    const beforeS1 = readFileSync(join(s1, '.omnimux', 'project.json'), 'utf8');
    const p1 = await store.preflightProject({ workspaceDir: s1 });
    assert.equal(p1.state, 'S1');
    assert.equal(p1.action, 'open');
    assert.equal(p1.project.id, 'b2-s1');
    assert.equal(readFileSync(join(s1, '.omnimux', 'project.json'), 'utf8'), beforeS1, '预检不得改写合法档案');

    writeV1Project(s2, { id: 'b2-s2', title: '旧项目', canvasWorkspaceIds: ['ws_a'] });
    const p2 = await store.preflightProject({ workspaceDir: s2 });
    assert.equal(p2.state, 'S2');
    assert.equal(p2.action, 'repair');

    writeCanvasFile(s3, 'ws_canvas_pre', '预检画布');
    const p3 = await store.preflightProject({ workspaceDir: s3 });
    assert.equal(p3.state, 'S3');
    assert.equal(p3.action, 'rebuild');

    writeValidV2(s4, { id: 'b2-s4' });
    const realS4 = realpathSync(s4);
    writeFileSync(join(libraryRoot, '.external-projects.json'), JSON.stringify([realS4, realS4], null, 2));
    const p4 = await store.preflightProject({ workspaceDir: s4 });
    assert.equal(p4.state, 'S4');
    assert.equal(p4.action, 'converge');
    assert.deepEqual(readRegistry(libraryRoot), [realS4, realS4], '预检不得收敛 registry（只读）');

    // B7：其它 root 的重复索引不属于本 root 的 S4（只判本 root 重复 / 同 id 双 root）。
    const other = tmpDir('omnimux-b2-other-');
    try {
      writeValidV2(other, { id: 'b2-other' });
      const realOther = realpathSync(other);
      writeFileSync(join(libraryRoot, '.external-projects.json'), JSON.stringify([realS4, realOther, realOther], null, 2));
      const p4b = await store.preflightProject({ workspaceDir: s4 });
      assert.equal(p4b.state, 'S1', '其它 root 重复不应把本 root 判成 S4');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    for (const dir of [libraryRoot, s0, s1, s2, s3, s4]) rmSync(dir, { recursive: true, force: true });
  }
});

test('B2 POST /projects mode：independent 幂等 + workspace 初始化/采纳非 409', async () => {
  const libraryRoot = tmpDir('omnimux-b2-lib-');
  const workspace = tmpDir('omnimux-b2-ws-');
  try {
    const dispatcher = host.createProjectDispatcher({ libraryRoot });
    const headers = { origin: 'http://localhost:3000' };
    const post = (body) => dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers, body,
    });

    const ind1 = await post({ mode: 'independent', title: '独立甲' });
    assert.equal(ind1.status, 200);
    assert.equal(ind1.body.action, 'initialized');
    assert.equal(ind1.body.project.path, join(libraryRoot, '独立甲'));
    const ind2 = await post({ mode: 'independent', title: '独立甲' });
    assert.equal(ind2.status, 200);
    assert.equal(ind2.body.action, 'existing');
    assert.equal(ind2.body.project.id, ind1.body.project.id);
    assert.equal(ind2.body.project.pages.length, 1, '幂等不得加页');

    const ws1 = await post({ mode: 'workspace', title: '工作区项目', workspaceDir: workspace });
    assert.equal(ws1.status, 200);
    assert.equal(ws1.body.action, 'initialized');
    const ws2 = await post({ mode: 'workspace', title: '工作区项目', workspaceDir: workspace });
    assert.equal(ws2.status, 200, '已存在的合法项目必须 200，不得 409');
    assert.equal(ws2.body.action, 'existing');
    assert.equal(ws2.body.project.id, ws1.body.project.id);

    writeV1Project(workspace, { id: 'b2-v1', title: '旧项目', canvasWorkspaceIds: ['ws_v1'] });
    const repaired = await post({ mode: 'workspace', title: '旧项目', workspaceDir: workspace });
    assert.equal(repaired.status, 200, 'v1 项目必须 200 修复，不得 409');
    assert.equal(repaired.body.action, 'repaired');
    assert.equal(repaired.body.project.id, 'b2-v1');

    const missingDir = await post({ mode: 'workspace', title: '缺目录' });
    assert.equal(missingDir.status, 400);
    assert.equal(missingDir.body.error, 'invalid-workspace-dir');

    const badMode = await post({ mode: 'bogus', title: '坏模式' });
    assert.equal(badMode.status, 400);
    assert.equal(badMode.body.error, 'invalid-mode');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B2 POST /projects/preflight 路由：只读 + 状态/动作语义', async () => {
  const libraryRoot = tmpDir('omnimux-b2-lib-');
  const workspace = tmpDir('omnimux-b2-ws-');
  try {
    const dispatcher = host.createProjectDispatcher({ libraryRoot });
    const headers = { origin: 'http://localhost:3000' };
    const pre = (body) => dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects/preflight', headers, body,
    });
    const empty = await pre({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.state, 'S0');
    assert.equal(empty.body.action, 'initialize');
    assert.equal(existsSync(join(workspace, '.omnimux')), false, '路由预检也必须零写盘');

    writeValidV2(workspace, { id: 'b2-pre', title: '已有' });
    const existing = await pre({ mode: 'workspace', workspaceDir: workspace });
    assert.equal(existing.body.state, 'S1');
    assert.equal(existing.body.action, 'open');
    assert.equal(existing.body.project.title, '已有');

    const independent = await pre({ mode: 'independent', title: '独立预检' });
    assert.equal(independent.body.state, 'independent');
    assert.equal(independent.body.action, 'create-independent');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B2 I3：POST ensure 为缺画布的创作页补空画布（不撞 workspace-not-found）', async () => {
  const libraryRoot = tmpDir('omnimux-b2-lib-');
  const workspace = tmpDir('omnimux-b2-ws-');
  const canvasHome = tmpDir('omnimux-b2-canvases-');
  const created = new Map();
  try {
    const fakeWorkspaceStore = {
      canvasFileOf(id) { return join(canvasHome, `${id}.json`); },
      create(name, id) {
        created.set(id, { id, name });
        writeFileSync(join(canvasHome, `${id}.json`), JSON.stringify({ id, name }));
        return { id, name };
      },
    };
    const dispatcher = host.createProjectDispatcher({ libraryRoot, workspaceStore: fakeWorkspaceStore });
    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux-workflow/api/projects',
      headers: { origin: 'http://localhost:3000' },
      body: { mode: 'workspace', title: '缺画布项目', workspaceDir: workspace },
    });
    assert.equal(res.status, 200);
    const page = res.body.project.pages[0];
    assert.ok(page.canvasWorkspaceId);
    assert.equal(created.has(page.canvasWorkspaceId), true, '缺画布的创作页必须补一张空画布');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(canvasHome, { recursive: true, force: true });
  }
});

test('B2 两级删除：移出保留画布；purge 删画布/资产；删了不复活', async () => {
  const libraryRoot = tmpDir('omnimux-b2-lib-');
  const workspace = tmpDir('omnimux-b2-ws-');
  try {
    const dispatcher = host.createProjectDispatcher({ libraryRoot });
    const headers = { origin: 'http://localhost:3000' };
    writeCanvasFile(workspace, 'ws_keep', '保留画布');
    writeFileSync(join(workspace, 'user-file.txt'), 'keep me');
    const created = await dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers,
      body: { mode: 'workspace', title: '删除语义', workspaceDir: workspace },
    });
    assert.equal(created.status, 200);
    const id = created.body.project.id;

    // 1) 移出项目库：只摘 project.json + 索引，画布保留。
    const removed = await dispatcher.dispatch({
      method: 'DELETE', url: `/omnimux-workflow/api/projects/${id}`, headers,
    });
    assert.equal(removed.status, 200);
    assert.equal(existsSync(join(workspace, '.omnimux', 'project.json')), false);
    assert.equal(existsSync(join(workspace, '.omnimux', 'canvases', 'ws_keep.json')), true, '移出不得删画布');
    assert.equal(existsSync(join(workspace, 'user-file.txt')), true);

    // 同 root 再次 ensure：S3 采纳既有画布（复活是“移出”的既定语义）。
    const readopted = await dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers,
      body: { mode: 'workspace', title: '删除语义', workspaceDir: workspace },
    });
    assert.equal(readopted.body.action, 'adopted-files');

    // 2) 删除项目（purge）：再删画布与 assets，用户自有文件保留。
    writeFileSync(join(workspace, '.omnimux', 'assets.json'), JSON.stringify({ items: [] }));
    const purged = await dispatcher.dispatch({
      method: 'DELETE', url: `/omnimux-workflow/api/projects/${readopted.body.project.id}?mode=purge`, headers,
    });
    assert.equal(purged.status, 200);
    assert.equal(existsSync(join(workspace, '.omnimux', 'canvases')), false, 'purge 必须删画布目录');
    assert.equal(existsSync(join(workspace, '.omnimux', 'assets.json')), false, 'purge 必须删 assets.json');
    assert.equal(existsSync(join(workspace, 'user-file.txt')), true, 'purge 不得删用户自有文件');

    // 3) 删了不复活：同 root ensure 不得把已删画布复活（全新 initialized）。
    const revived = await dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers,
      body: { mode: 'workspace', title: '删除语义', workspaceDir: workspace },
    });
    assert.equal(revived.body.action, 'initialized', 'purge 后同 root 必须重新初始化，不得复活旧画布');
    assert.equal(revived.body.project.id === readopted.body.project.id, false);
    assert.equal(
      revived.body.project.pages.some((page) => page.canvasWorkspaceId === 'ws_keep'),
      false,
      '已删除的画布不得出现在新项目',
    );

    const badMode = await dispatcher.dispatch({
      method: 'DELETE', url: `/omnimux-workflow/api/projects/${revived.body.project.id}?mode=bogus`, headers,
    });
    assert.equal(badMode.status, 400);
    assert.equal(badMode.body.error, 'invalid-mode');
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B2 列表区分独立/关联工作区', async () => {
  const libraryRoot = tmpDir('omnimux-b2-lib-');
  const workspace = tmpDir('omnimux-b2-ws-');
  try {
    const dispatcher = host.createProjectDispatcher({ libraryRoot });
    const headers = { origin: 'http://localhost:3000' };
    await dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers,
      body: { mode: 'independent', title: '库内独立' },
    });
    await dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers,
      body: { mode: 'workspace', title: '外置绑定', workspaceDir: workspace },
    });
    const list = await dispatcher.dispatch({ method: 'GET', url: '/omnimux-workflow/api/projects', headers });
    const byTitle = Object.fromEntries(list.body.projects.map((p) => [p.title, p]));
    assert.equal(byTitle['库内独立'].bound, false, '默认库项目必须是独立项目');
    assert.equal(byTitle['库内独立'].workspaceDir, null);
    assert.equal(byTitle['外置绑定'].bound, true, '库外工作区项目必须标记为关联工作区');
    assert.equal(byTitle['外置绑定'].workspaceDir, realpathSync(workspace));
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});


test('B2 预检零写盘（B2）：libraryRoot 不存在时也不得被创建', async () => {
  const parent = tmpDir('omnimux-b2-nolib-');
  const libraryRoot = join(parent, 'Projects'); // 故意不存在
  const workspace = tmpDir('omnimux-b2-ws-');
  try {
    const dispatcher = host.createProjectDispatcher({ libraryRoot });
    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux-workflow/api/projects/preflight',
      headers: { origin: 'http://localhost:3000' },
      body: { mode: 'workspace', workspaceDir: workspace },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'S0');
    assert.equal(existsSync(libraryRoot), false, '预检不得创建库根（B2）');
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('B2 purge 级联 home canvas（B4）：移出保留、删除项目清理', async () => {
  const libraryRoot = tmpDir('omnimux-b2-lib-');
  const keepWorkspace = tmpDir('omnimux-b2-keep-');
  const purgeWorkspace = tmpDir('omnimux-b2-purge-');
  const canvasHome = tmpDir('omnimux-b2-home-');
  const home = new Set();
  try {
    const fakeWorkspaceStore = {
      canvasFileOf(id) { return join(canvasHome, `${id}.json`); },
      create(name, id) { home.add(id); writeFileSync(join(canvasHome, `${id}.json`), JSON.stringify({ id, name })); return { id }; },
      remove(id) { if (!home.has(id)) throw new Error('workspace-not-found'); home.delete(id); },
    };
    const dispatcher = host.createProjectDispatcher({ libraryRoot, workspaceStore: fakeWorkspaceStore });
    const headers = { origin: 'http://localhost:3000' };
    const create = (dir, title) => dispatcher.dispatch({
      method: 'POST', url: '/omnimux-workflow/api/projects', headers,
      body: { mode: 'workspace', title, workspaceDir: dir },
    });

    const kept = await create(keepWorkspace, '保留项目');
    const keptCanvas = kept.body.project.pages[0].canvasWorkspaceId;
    assert.equal(home.has(keptCanvas), true, 'ensure 必须补 home canvas');
    await dispatcher.dispatch({ method: 'DELETE', url: `/omnimux-workflow/api/projects/${kept.body.project.id}`, headers });
    assert.equal(home.has(keptCanvas), true, '移出项目库不得删 home canvas');

    const purged = await create(purgeWorkspace, '删除项目');
    const purgedCanvas = purged.body.project.pages[0].canvasWorkspaceId;
    assert.equal(home.has(purgedCanvas), true);
    await dispatcher.dispatch({
      method: 'DELETE', url: `/omnimux-workflow/api/projects/${purged.body.project.id}?mode=purge`, headers,
    });
    assert.equal(home.has(purgedCanvas), false, '删除项目必须级联清掉 home canvas（B4）');

    // B4 顺序证伪：档案摘除失败时，home canvas 必须原样保留（不得先删画布）。
    const failWorkspace = tmpDir('omnimux-b2-fail-');
    try {
      const failing = await create(failWorkspace, '失败注入项目');
      const failingCanvas = failing.body.project.pages[0].canvasWorkspaceId;
      assert.equal(home.has(failingCanvas), true);
      const metaDir = join(failWorkspace, '.omnimux');
      chmodSync(metaDir, 0o555);
      try {
        const failed = await dispatcher.dispatch({
          method: 'DELETE', url: `/omnimux-workflow/api/projects/${failing.body.project.id}?mode=purge`, headers,
        });
        assert.notEqual(failed.status, 200, '档案摘除失败必须报错');
        assert.equal(home.has(failingCanvas), true, '档案还在时画布不得被删（B4 顺序）');
        assert.equal(existsSync(join(metaDir, 'project.json')), true, '失败后项目档案仍在');
      } finally {
        chmodSync(metaDir, 0o755);
      }
      const retried = await dispatcher.dispatch({
        method: 'DELETE', url: `/omnimux-workflow/api/projects/${failing.body.project.id}?mode=purge`, headers,
      });
      assert.equal(retried.status, 200);
      assert.equal(home.has(failingCanvas), false, '重试成功后画布才被清理');
    } finally {
      rmSync(failWorkspace, { recursive: true, force: true });
    }
  } finally {
    rmSync(libraryRoot, { recursive: true, force: true });
    rmSync(keepWorkspace, { recursive: true, force: true });
    rmSync(purgeWorkspace, { recursive: true, force: true });
    rmSync(canvasHome, { recursive: true, force: true });
  }
});


}); // describe
