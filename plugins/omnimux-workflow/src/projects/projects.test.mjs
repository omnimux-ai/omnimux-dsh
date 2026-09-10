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

}); // describe
