/**
 * scripts/upstream-sentinel.test.mjs
 * 上游哨兵的注入桩单元测试：diff 判定、探针语义、报告产出。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dispositionIds, manifestIds, vendorIds, parseUpstreamModels,
  diffRegistrations, probeEndpoint, createUpstreamSentinel,
} from './upstream-sentinel.mjs';

test('id 提取函数各归其位', () => {
  assert.deepEqual([...dispositionIds({ dispositions: [{ id: 'a-1' }, { model: 'b-2' }, { id: 3 }] })].sort(), ['a-1', 'b-2']);
  assert.deepEqual([...manifestIds({ models: [{ productId: 'x-9' }, { id: 'y-8' }] })].sort(), ['x-9', 'y-8']);
  const vend = vendorIds(`const M = { 'seedance-2-0': 1, "gpt-image-2.5": 2, short: 3 }`);
  assert.ok(vend.has('seedance-2-0') && vend.has('gpt-image-2.5'));
});

test('parseUpstreamModels 兼容三种返回形态', () => {
  assert.deepEqual([...parseUpstreamModels({ data: { data: ['a-1', 'b-2'] } })].sort(), ['a-1', 'b-2']);
  assert.deepEqual([...parseUpstreamModels({ data: ['c-3'] })].sort(), ['c-3']);
  assert.deepEqual([...parseUpstreamModels(['d-4'])].sort(), ['d-4']);
});

test('diffRegistrations 分出 local-only 与 upstream-only（vendor 不入 diff）', () => {
  const r = diffRegistrations({
    upstream: new Set(['a-1', 'c-3']),
    dispositions: new Set(['a-1', 'b-2']),
    manifest: new Set(['a-1']),
  });
  assert.deepEqual(r.localOnly, ['b-2']);
  assert.deepEqual(r.upstreamOnly, ['c-3']);
});

test('probeEndpoint：4xx 判连通，5xx/网络错判不可达，不产生真实请求', async () => {
  const ok400 = await probeEndpoint('http://x', { fetchImpl: async () => ({ status: 400 }) });
  assert.equal(ok400.ok, true);
  const bad500 = await probeEndpoint('http://x', { fetchImpl: async () => ({ status: 502 }) });
  assert.equal(bad500.ok, false);
  const net = await probeEndpoint('http://x', { fetchImpl: async () => Promise.reject(new Error('conn refused')) });
  assert.equal(net.ok, false);
  assert.equal(net.error, 'conn refused');
});

function makeRunner({ upstream = new Set(['a-1', 'b-2']), dispositions = ['a-1'], manifest = [], probeStatus = 400 } = {}) {
  const files = new Map();
  const io = {
    existsSync: () => true, mkdirSync: () => {},
    readdirSync: () => [],
    readFileSync: (p) => {
      if (String(p).endsWith('dispositions.json')) return JSON.stringify({ dispositions: dispositions.map((id) => ({ id })) });
      if (String(p).endsWith('auto-serving-manifest.json')) return JSON.stringify({ models: manifest.map((id) => ({ id })) });
      return files.get(p) || '';
    },
    writeFileSync: (p, c) => files.set(p, c),
  };
  const run = createUpstreamSentinel({
    io, upstreamModels: upstream,
    execImpl: () => '{}',
    fetchImpl: async () => ({ status: probeStatus }),
    now: () => new Date('2026-10-05T00:00:00Z'),
    uuid: () => 'r1',
  });
  return { run, files };
}

test('无差异 + 探针 4xx → status pass', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sent-'));
  try {
    const { run } = makeRunner();
    const r = await run({ offline: false, reportDir: dir });
    assert.equal(r.status, 'pass');
    assert.equal(r.localOnly.length, 0);
    assert.ok(r.probes.every((p) => p.ok));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('本地登记但上游无 → status warn，写报告文件', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sent-'));
  try {
    const { run, files } = makeRunner({ dispositions: ['a-1', 'ghost-model-x'] });
    const r = await run({ offline: true, reportDir: dir });
    assert.equal(r.status, 'warn');
    assert.deepEqual(r.localOnly, ['ghost-model-x']);
    const md = files.get(join(dir, '2026-10-05.md'));
    assert.ok(md.includes('ghost-model-x'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('探针 5xx → warn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sent-'));
  try {
    const { run } = makeRunner({ probeStatus: 503 });
    const r = await run({ offline: false, reportDir: dir });
    assert.equal(r.status, 'warn');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
