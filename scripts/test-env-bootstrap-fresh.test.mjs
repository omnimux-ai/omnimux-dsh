import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnvironmentStarter, normalizeTaskPlugins } from './test-env-bootstrap.mjs';

const root = '/repo/.worktrees/task';
function starter() {
  let writes = 0, reads = 0;
  const files = new Map([[root + '/.git', 'gitdir: /repo/.git/worktrees/task\n'], ['/repo/.git/worktrees/task/commondir', '../..\n'], ['/repo/.git/worktrees/task/gitdir', root + '/.git\n']]);
  const fs = { realpathSync: p => p, lstatSync: p => ({ isSymbolicLink: () => false, isDirectory: () => !files.has(p), isFile: () => files.has(p) }), readFileSync: p => { reads++; return files.get(p); }, mkdirSync: () => { writes++; }, mkdtempSync: () => { writes++; throw new Error('must not create'); } };
  return { start: createTestEnvironmentStarter({ fs, repositoryRoot: '/repo' }), writes: () => writes, reads: () => reads };
}
const valid = { root, mode: 'ui', evidenceContext: { taskId: '3409', runId: 'unit' }, candidate: { base: 'a'.repeat(40), head: 'b'.repeat(40) }, taskPlugins: ['omnimux-inspiration'] };

test('task targets are finite, unique and hub is always included', () => {
  assert.deepEqual(normalizeTaskPlugins(['omnimux-browser', 'omnimux-inspiration']), ['omnimux', 'omnimux-browser', 'omnimux-inspiration']);
  for (const value of [null, '../omnimux', ['omnimux-video'], ['omnimux-inspiration', 'omnimux-inspiration']]) assert.throws(() => normalizeTaskPlugins(value), { code: 'TEST_ENV_OPTIONS' });
});

test('fresh input rejection precedes private resource allocation', async () => {
  for (const [change, code] of [
    [{ mode: 'live' }, 'FRESH_MODE_UNSUPPORTED'], [{ mode: 'onboarding' }, 'FRESH_MODE_UNSUPPORTED'],
    [{ taskPlugins: ['omnimux-viewer'] }, 'OPTIONS'], [{ taskPlugins: ['omnimux-inspiration', 'omnimux-inspiration'] }, 'OPTIONS'],
    [{ candidate: { ...valid.candidate, command: 'npm install' } }, 'PREPARE_CANDIDATE_REQUIRED'],
    [{ candidate: { ...valid.candidate, extraInputs: 'src' } }, 'PREPARE_CANDIDATE_REQUIRED'],
    [{ candidate: null }, 'PREPARE_CANDIDATE_REQUIRED'], [{ evidenceContext: null }, 'OPTIONS'],
  ]) {
    const f = starter();
    await assert.rejects(f.start({ ...valid, ...change }), { code: 'TEST_ENV_' + code });
    assert.equal(f.writes(), 0);
  }
});

test('legacy explicit requests retain their non-fresh refusal', async () => {
  const f = starter();
  await assert.rejects(f.start({ root, mode: 'ui', evidenceContext: valid.evidenceContext }), error => error.code === 'TEST_ENV_NOT_USER_FRESH_TASK_UNKNOWN' && error.observations.userFresh === false);
  assert.equal(f.writes(), 0);
});
