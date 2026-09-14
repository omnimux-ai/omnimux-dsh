/**
 * scripts/test-env-root-diagnosis.test.mjs
 * 位置诊断：位置不合规时，除稳定错误码外必须给出可读、可操作的说明。
 * 覆盖仓库外兄弟目录（历史真实阻塞）、非 Git 工作树、符号链接、注册不符等原因。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const moduleUrl = new URL('./test-env-bootstrap.mjs', import.meta.url);
const load = () => import(moduleUrl);

/** 精确假文件系统：files 为文件、dirs 为目录、symlinks 为符号链接。
 * 对不存在的路径必须像真实 fs.lstatSync 一样抛错，否则「不存在」会被误读成「存在但形态未知」。 */
function fakeFs({ files = [], dirs = [], symlinks = [], realpaths = new Map(), bodies = new Map() } = {}) {
  const fileSet = new Set(files);
  const dirSet = new Set(dirs);
  const linkSet = new Set(symlinks);
  return {
    realpathSync: p => realpaths.get(p) ?? p,
    lstatSync: p => {
      if (!fileSet.has(p) && !dirSet.has(p) && !linkSet.has(p)) {
        const error = new Error('ENOENT: no such file or directory, lstat ' + p);
        error.code = 'ENOENT';
        throw error;
      }
      const isLink = linkSet.has(p);
      return {
        isSymbolicLink: () => isLink,
        isDirectory: () => dirSet.has(p) && !isLink,
        isFile: () => fileSet.has(p) && !isLink,
      };
    },
    readFileSync: p => {
      if (!bodies.has(p)) throw new Error('unapproved read: ' + p);
      return bodies.get(p);
    },
  };
}

/** 构造一个「注册完全正确」的工作树假现场，可按需破坏某一点。 */
function worktreeFixture(name, { gitBody, symlinks = [], realpaths = new Map(), dropRegistry = false } = {}) {
  const wt = '/repo/.worktrees/' + name;
  const gitdir = '/repo/.git/worktrees/' + name;
  const files = [wt + '/.git'];
  const dirs = ['/repo', '/repo/.worktrees', wt, '/repo/.git'];
  const bodies = new Map([[wt + '/.git', gitBody ?? ('gitdir: ' + gitdir + '\n')]]);
  if (!dropRegistry) {
    files.push(gitdir + '/commondir', gitdir + '/gitdir');
    dirs.push('/repo/.git/worktrees', gitdir);
    bodies.set(gitdir + '/commondir', '../..\n');
    bodies.set(gitdir + '/gitdir', wt + '/.git\n');
  }
  return { io: fakeFs({ files, dirs, symlinks, realpaths, bodies }), wt, gitdir, repo: '/repo' };
}

test('diagnoseWorktreeRoot pinpoints each rejection reason instead of one blanket code', async () => {
  const { diagnoseWorktreeRoot } = await load();
  const good = worktreeFixture('task');

  // 合法工作树
  assert.deepEqual(diagnoseWorktreeRoot(good.wt, good.io, good.repo), { ok: true, reason: 'ok' });

  // 非绝对路径 / 未规范化
  assert.equal(diagnoseWorktreeRoot('relative/path', good.io, good.repo).reason, 'not-absolute-or-unnormalized');
  assert.equal(diagnoseWorktreeRoot('/repo/.worktrees/task/../task', good.io, good.repo).reason, 'not-absolute-or-unnormalized');
  assert.equal(diagnoseWorktreeRoot('/repo/.worktrees/task/', good.io, good.repo).reason, 'not-absolute-or-unnormalized');

  // 不在 <repo>/.worktrees/ 直接子级 —— 仓库外兄弟目录即命中此条（历史真实阻塞）
  assert.equal(diagnoseWorktreeRoot('/repo', good.io, good.repo).reason, 'outside-worktrees');
  assert.equal(diagnoseWorktreeRoot('/repo/.worktrees', good.io, good.repo).reason, 'outside-worktrees');
  assert.equal(diagnoseWorktreeRoot('/repo/.worktrees/task/tmp', good.io, good.repo).reason, 'outside-worktrees');
  assert.equal(diagnoseWorktreeRoot('/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-legacy', good.io, good.repo).reason, 'outside-worktrees');

  // 路径不存在
  const missing = fakeFs({ dirs: ['/repo', '/repo/.worktrees'] });
  assert.equal(diagnoseWorktreeRoot('/repo/.worktrees/ghost', missing, '/repo').reason, 'path-missing');

  // 路径经符号链接
  const linked = worktreeFixture('task', { symlinks: ['/repo/.worktrees/task'] });
  assert.equal(diagnoseWorktreeRoot(linked.wt, linked.io, linked.repo).reason, 'path-through-symlink');

  // 缺 .git —— 多半根本不是 Git 工作树（残留空壳目录即此形）
  const noGit = fakeFs({ dirs: ['/repo', '/repo/.worktrees', '/repo/.worktrees/task', '/repo/.git', '/repo/.git/worktrees'] });
  assert.equal(diagnoseWorktreeRoot('/repo/.worktrees/task', noGit, '/repo').reason, 'not-a-git-worktree');

  // .git 是目录而非文件（gitlink 形态不符）
  const asDir = worktreeFixture('task');
  const baseLstat = asDir.io.lstatSync;
  asDir.io.lstatSync = p => (p === asDir.wt + '/.git'
    ? { isSymbolicLink: () => false, isDirectory: () => true, isFile: () => false }
    : baseLstat(p));
  assert.equal(diagnoseWorktreeRoot(asDir.wt, asDir.io, asDir.repo).reason, 'gitlink-shape-unsupported');

  // .git 内容不指向 <repo>/.git/worktrees/<name>
  assert.equal(
    diagnoseWorktreeRoot('/repo/.worktrees/task', worktreeFixture('task', { gitBody: 'gitdir: /somewhere/else\n' }).io, '/repo').reason,
    'registry-mismatch',
  );

  // 注册目录缺失
  const noRegistry = worktreeFixture('task', { dropRegistry: true });
  assert.equal(diagnoseWorktreeRoot(noRegistry.wt, noRegistry.io, noRegistry.repo).reason, 'registry-missing');

  // 每条拒绝都必须带稳定错误码与可读中文说明
  for (const bad of ['/repo', '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-legacy']) {
    const d = diagnoseWorktreeRoot(bad, good.io, good.repo);
    assert.equal(d.ok, false);
    assert.equal(d.code, 'TEST_ENV_ROOT_UNSAFE');
    assert.equal(typeof d.hint, 'string');
    assert.ok(d.hint.length > 0, 'hint 不能为空');
  }

  // 兄弟目录的说明必须明确指向正确位置，便于直接照做
  const legacy = diagnoseWorktreeRoot('/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-legacy', good.io, good.repo);
  assert.match(legacy.hint, /\.worktrees/);
});

test('startTestEnvironment rejection keeps the stable code and adds the readable hint', async () => {
  const { createTestEnvironmentStarter } = await load();
  const repo = '/repo';
  const files = new Map();
  const fs = {
    realpathSync: p => p,
    lstatSync: () => ({ isSymbolicLink: () => false, isDirectory: () => true, isFile: () => false }),
    readFileSync: p => { if (!files.has(p)) throw new Error('unapproved read'); return files.get(p); },
    mkdirSync() {}, chmodSync() {}, mkdtempSync: p => p + '1', writeFileSync() {}, rmSync() {}, accessSync() {},
  };
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = 1;
  child.exitCode = null; child.signalCode = null; child.kill = () => true;
  const deps = {
    fs, repositoryRoot: repo, signals: new EventEmitter(), startupTimeoutMs: 20, shutdownTimeoutMs: 20,
    readCredential: () => 'unit-secret-never-log', spawn: () => child,
  };

  await assert.rejects(
    createTestEnvironmentStarter(deps)({ root: '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-legacy', mode: 'ui' }),
    error => {
      assert.equal(error.code, 'TEST_ENV_ROOT_UNSAFE', '稳定错误码不能变');
      assert.equal(typeof error.hint, 'string', '必须附带可读说明');
      assert.ok(error.hint.length > 0);
      return true;
    },
  );
});
