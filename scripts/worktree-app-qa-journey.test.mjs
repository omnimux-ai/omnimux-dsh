/**
 * scripts/worktree-app-qa-journey.test.mjs
 * 任务功能旅程机制的单元测试：路径解析、断言归并、失败语义。
 * 编排与真实链路由任务工作树实跑证据覆盖，此处只测语义。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveJourneyPath, runJourney, createAppQaRunner } from './worktree-app-qa.mjs';

const root = '/repo/.worktrees/task-x';

test('resolveJourneyPath 只接受工作树内的 js 模块', () => {
  assert.deepEqual(resolveJourneyPath('.workbuddy/qa-journeys/a.mjs', root).ok, true);
  assert.equal(resolveJourneyPath('../outside/a.mjs', root).ok, false);
  assert.equal(resolveJourneyPath('/etc/passwd', root).ok, false);
  assert.equal(resolveJourneyPath('a.txt', root).ok, false);
  assert.equal(resolveJourneyPath('', root).ok, false);
});

test('resolveJourneyPath 返回工作树内绝对路径', () => {
  const r = resolveJourneyPath('journeys/t.mjs', root);
  assert.equal(r.ok, true);
  assert.equal(r.path, '/repo/.worktrees/task-x/journeys/t.mjs');
});

function tmpJourney(code) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-journey-'));
  const p = join(dir, 'j.mjs');
  writeFileSync(p, code);
  return { dir, p };
}

const noopDeps = { send: async () => ({}), sleep: async () => {}, evidenceDir: '/tmp/x', origin: 'http://127.0.0.1:1' };

test('runJourney 把 journey 断言并入并标前缀', async () => {
  const { dir, p } = tmpJourney(`export default async () => ({ assertions: [{name:'a',pass:true},{name:'b',pass:false}] })`);
  try {
    const out = await runJourney(p, noopDeps);
    assert.deepEqual(out.map(a => [a.name, a.pass]), [['journey:a', true], ['journey:b', false]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runJourney 模块抛错→journey-error FAIL 而非静默', async () => {
  const { dir, p } = tmpJourney(`export default async () => { throw new Error('boom') }`);
  try {
    const out = await runJourney(p, noopDeps);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, 'journey-error');
    assert.equal(out[0].pass, false);
    assert.match(out[0].detail, /boom/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runJourney 非函数默认导出→FAIL', async () => {
  const { dir, p } = tmpJourney(`export default { not: 'a function' }`);
  try {
    const out = await runJourney(p, noopDeps);
    assert.equal(out[0].name, 'journey-export-shape');
    assert.equal(out[0].pass, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runJourney 返回值形状不对→FAIL', async () => {
  const { dir, p } = tmpJourney(`export default async () => ({ notAssertions: true })`);
  try {
    const out = await runJourney(p, noopDeps);
    assert.equal(out[0].name, 'journey-result-shape');
    assert.equal(out[0].pass, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runJourney 断言缺 pass:true 一律算 FAIL', async () => {
  const { dir, p } = tmpJourney(`export default async () => ({ assertions: [{name:'truthy',pass:1},{name:'ok',pass:true}] })`);
  try {
    const out = await runJourney(p, noopDeps);
    assert.equal(out[0].pass, false, 'pass:1 不算显式 true');
    assert.equal(out[1].pass, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runner 拒绝越界 journey 路径并报可读错误', async () => {
  const run = createAppQaRunner({ io: { lstatSync: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }, realpathSync: p => p, readFileSync: () => '' } });
  await assert.rejects(
    run({ root: '/repo/.worktrees/task-x', journey: '../evil.mjs' }),
    err => err.code === 'TEST_APP_QA_JOURNEY_PATH' && /outside/.test(err.message),
  );
});
