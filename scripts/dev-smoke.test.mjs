/**
 * scripts/dev-smoke.test.mjs
 * dev-smoke 的单元测试：注入桩覆盖 BLOCKED / PASS / needs-restart / 失败路径。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDevSmoke, finiteNonNegative } from './dev-smoke.mjs';

function fakeIo(dir) {
  const files = new Map();
  return {
    statSync: (p) => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    existsSync: (p) => files.has(p),
    mkdirSync: (p) => {},
    writeFileSync: (p, content) => { files.set(p, content); },
    files,
  };
}

const PAGE = { type: 'page', url: 'http://127.0.0.1:45120/', webSocketDebuggerUrl: 'ws://x/y' };

function makeRunner(overrides = {}) {
  const io = fakeIo();
  const written = [];
  const run = createDevSmoke({
    io: { ...io, writeFileSync: (p, c) => { written.push([p, c]); io.writeFileSync(p, c); } },
    probeCdp: async () => [PAGE],
    evaluateInPage: async () => ({ ok: true, result: JSON.stringify({ title: 'OmniMux', bodyLen: 500, readyState: 'complete' }) }),
    captureScreenshot: async () => ({ ok: true, data: Buffer.alloc(2048, 1).toString('base64') }),
    devProcessStart: () => 1000,
    pluginMtime: () => 500,
    uuid: () => 'run-test',
    now: () => new Date('2026-10-05T00:00:00Z'),
    ...overrides,
  });
  return { run, io, written };
}

test('CDP 无目标 → status=blocked，不误报 pass/fail', async () => {
  const { run } = makeRunner({ probeCdp: async () => null });
  const r = await run({ plugins: [] });
  assert.equal(r.status, 'blocked');
  assert.equal(r.assertions.find(a => a.name === 'cdp-targets').pass, false);
});

test('页面健康 + 插件 mtime 早于进程 → status=pass，写截图与报告', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
  try {
    const { run, io } = makeRunner();
    const r = await run({ plugins: ['omnimux-assets'], evidenceRoot: dir });
    assert.equal(r.status, 'pass');
    assert.equal(r.needsRestart, false);
    assert.ok(r.screenshot);
    const report = JSON.parse(io.files.get(join(dir, 'docs', 'evidence', 'dev-smoke-report.json')));
    assert.equal(report.status, 'pass');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('插件 mtime 晚于 Dev 进程 → status=needs-restart，附提示且退出码仍 0', async () => {
  const { run } = makeRunner({ pluginMtime: () => 5000, devProcessStart: () => 1000 });
  const r = await run({ plugins: ['omnimux-assets'] });
  assert.equal(r.status, 'needs-restart');
  assert.equal(r.needsRestart, true);
  assert.match(r.restartHint, /重新打开|重启/);
});

test('插件未物化（mtime null）→ 断言 FAIL', async () => {
  const { run } = makeRunner({ pluginMtime: () => null });
  const r = await run({ plugins: ['omnimux-assets'] });
  assert.equal(r.status, 'fail');
  assert.equal(r.assertions.find(a => a.name === 'plugin:omnimux-assets:materialized').pass, false);
});

test('无 :45120 页面 → blocked', async () => {
  const { run } = makeRunner({ probeCdp: async () => [{ type: 'page', url: 'http://example.com', webSocketDebuggerUrl: 'ws://x' }] });
  const r = await run({});
  assert.equal(r.status, 'blocked');
  assert.match(r.blockedReason, /45120/);
});

test('evaluateInPage 失败 → page-health FAIL，整体 fail', async () => {
  const { run } = makeRunner({ evaluateInPage: async () => ({ ok: false, error: 'dead ws' }) });
  const r = await run({});
  assert.equal(r.status, 'fail');
});

// --- Issue #3610：重启窗口内页面仍在 loading 时不得判负 ---------------------

const LOADING = () => ({ ok: true, result: JSON.stringify({ title: '', bodyLen: 0, readyState: 'loading' }) });
const READY = () => ({ ok: true, result: JSON.stringify({ title: 'OmniMux', bodyLen: 500, readyState: 'complete' }) });

test('page-health 有界等待：首次 loading、随后 complete → PASS 且记录 attempts/waitedMs', async () => {
  let calls = 0;
  const { run } = makeRunner({
    evaluateInPage: async () => (++calls === 1 ? LOADING() : READY()),
    wait: async () => {},
    healthTimeoutMs: 5000,
    healthPollMs: 10,
  });
  const r = await run({ plugins: [] });
  const health = r.assertions.find((a) => a.name === 'page-health');
  assert.equal(health.pass, true);
  assert.equal(health.detail.attempts, 2);
  assert.equal(typeof health.detail.waitedMs, 'number');
  assert.equal(r.status, 'pass');
});

test('page-health 预算耗尽仍 loading → FAIL，不静默通过', async () => {
  const { run } = makeRunner({
    evaluateInPage: async () => LOADING(),
    wait: async () => {},
    healthTimeoutMs: 0,
    healthPollMs: 10,
  });
  const r = await run({ plugins: [] });
  const health = r.assertions.find((a) => a.name === 'page-health');
  assert.equal(health.pass, false);
  assert.match(String(health.detail.error), /未就绪/);
  assert.equal(r.status, 'fail');
});

test('page-health 传输错误不重试：连不上不等于页面在加载', async () => {
  let calls = 0;
  const { run } = makeRunner({
    evaluateInPage: async () => { calls += 1; return { ok: false, error: 'ws closed' }; },
    wait: async () => {},
    healthTimeoutMs: 5000,
    healthPollMs: 10,
  });
  const r = await run({ plugins: [] });
  assert.equal(calls, 1);
  assert.equal(r.assertions.find((a) => a.name === 'page-health').pass, false);
});

// --- 评审补强：预算校验、超时重试、多轮耗尽、坏载荷 -------------------------

test('预算解析：NaN / Infinity / 负数回退默认值，0 是合法值', () => {
  assert.equal(finiteNonNegative('abc', 30000, 't'), 30000);
  assert.equal(finiteNonNegative('20s', 30000, 't'), 30000);
  assert.equal(finiteNonNegative(Number.NaN, 30000, 't'), 30000);
  assert.equal(finiteNonNegative(Number.POSITIVE_INFINITY, 30000, 't'), 30000);
  assert.equal(finiteNonNegative(-5, 30000, 't'), 30000);
  assert.equal(finiteNonNegative(undefined, 30000, 't'), 30000);
  assert.equal(finiteNonNegative(0, 30000, 't'), 0);
  assert.equal(finiteNonNegative('1200', 30000, 't'), 1200);
});

test('page-health：evaluate 超时（渲染进程忙）在预算内重试，不立即判负', async () => {
  let calls = 0;
  const { run } = makeRunner({
    evaluateInPage: async () => {
      calls += 1;
      if (calls < 3) return { ok: false, kind: 'timeout', error: 'CDP evaluate timed out' };
      return READY();
    },
    wait: async () => {},
    healthTimeoutMs: 5000,
    healthPollMs: 10,
  });
  const r = await run({ plugins: [] });
  const health = r.assertions.find((a) => a.name === 'page-health');
  assert.equal(health.pass, true);
  assert.equal(health.detail.attempts, 3);
  assert.equal(r.status, 'pass');
});

test('page-health：多轮尝试后耗尽预算 → FAIL，attempts>1 且 wait 收到 pollMs', async () => {
  const waits = [];
  const { run } = makeRunner({
    evaluateInPage: async () => LOADING(),
    wait: async (ms) => { waits.push(ms); },
    healthTimeoutMs: 5,
    healthPollMs: 3,
  });
  const r = await run({ plugins: [] });
  const health = r.assertions.find((a) => a.name === 'page-health');
  assert.equal(health.pass, false);
  assert.ok(health.detail.attempts > 1, `attempts=${health.detail.attempts}`);
  assert.deepEqual(Array.from(new Set(waits)), [3]);
  assert.match(String(health.detail.error), /未就绪/);
});

test('page-health：非 JSON 载荷 → 立即 FAIL（kind=decode）', async () => {
  const { run } = makeRunner({
    evaluateInPage: async () => ({ ok: true, result: 'not-json' }),
    wait: async () => {},
    healthTimeoutMs: 5000,
    healthPollMs: 10,
  });
  const r = await run({ plugins: [] });
  const health = r.assertions.find((a) => a.name === 'page-health');
  assert.equal(health.pass, false);
  assert.equal(health.detail.kind, 'decode');
  assert.equal(r.status, 'fail');
});
