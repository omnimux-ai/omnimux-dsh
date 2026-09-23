import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOwnedHomeAppHarness, runPreparedHomeAppWrapper } from './home-app-click.harness.mjs';
import { copyOriginalMetrics, readPreparedContract, withRestoredMetrics } from './home-app-click.contracts.mjs';
import { runHomeAppJourney } from './home-app-click.journey.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function temporary(t) {
  const parent = path.join(root, '.agent-reports/home-app-click');
  const out = await fs.mkdtemp(path.join(parent, 'contract-unit-'));
  t.after(() => fs.rm(out, { recursive: true, force: true }));
  return out;
}
const metrics = { width: 1536, height: 960, deviceScaleFactor: 2, mobile: false,
  scale: 0.85, screenWidth: 1600, screenHeight: 1000,
  screenOrientation: { type: 'landscapePrimary', angle: 0 } };

for (const mode of ['success', 'prepare-throw', 'prepare-false', 'prepare-missing', 'wrapper-failure']) {
  test(`borrowed task ${mode}: no finish or environment ownership`, async t => {
    const calls = [];
    const out = await temporary(t);
    const task = { spaceId: 80, page: () => ({}), finish: async () => {
      calls.push('finish'); assert.fail('borrowed task must not be finished');
    } };
    const run = runPreparedHomeAppWrapper({ root, out, task, originalMetricsOverride: null,
      prepare: async ({ task: borrowed }) => {
        assert.equal(borrowed, task); calls.push('prepare');
        if (mode === 'prepare-throw') throw Error('prepare failed');
        if (mode === 'prepare-missing') return;
        return { prepared: mode !== 'prepare-false' };
      },
      runWrapper: async ({ contract }) => {
        calls.push('wrapper'); assert.equal(contract.spaceId, 80);
        assert.equal(contract.originalMetricsOverride, null);
        return { code: mode === 'wrapper-failure' ? 1 : 0 };
      },
    });
    if (mode === 'success') await run; else await assert.rejects(run);
    assert.deepEqual(calls, mode.startsWith('prepare-') ? ['prepare'] : ['prepare', 'wrapper']);
    const report = JSON.parse(await fs.readFile(path.join(out, 'prepared-run.json')));
    assert.equal(report.wrapperStarted, !mode.startsWith('prepare-'));
    assert.equal('browserCleanup' in report, false);
    assert.equal('environmentCleanup' in report, false);
  });
}

for (const failure of ['throw', 'false', 'missing']) {
  test(`prepare ${failure} never invokes the formal wrapper and cleans owned resources`, async t => {
    const calls = [];
    const out = await temporary(t);
    await assert.rejects(runOwnedHomeAppHarness({ root, out, originalMetricsOverride: null,
      startEnvironment: async () => ({ env: { cleanup: async () => calls.push('cleanup') } }),
      createTask: async () => ({ spaceId: 91, page: () => ({}), finish: async options => {
        assert.deepEqual(options, { keep: [] }); calls.push('finish');
      } }),
      prepare: async () => { calls.push('prepare'); if (failure === 'throw') throw Error('preparation failed');
        return failure === 'false' ? { prepared: false } : undefined; },
      runWrapper: async () => { calls.push('wrapper'); return { code: 0 }; },
    }));
    assert.deepEqual(calls, ['prepare', 'finish', 'cleanup']);
    const report = JSON.parse(await fs.readFile(path.join(out, 'owner-lifecycle.json')));
    assert.equal(report.wrapperStarted, false);
    await assert.rejects(fs.stat(path.join(out, 'prepared.json')));
  });
}
for (const mode of ['success', 'wrapper-exit', 'wrapper-throw', 'finish-throw']) {
  test(`owner finally cleanup: ${mode}`, async t => {
    const calls = [];
    const out = await temporary(t);
    const run = runOwnedHomeAppHarness({ root, out, originalMetricsOverride: metrics,
      startEnvironment: async () => ({ env: { cleanup: async () => calls.push('cleanup') } }),
      createTask: async () => ({ spaceId: 92, page: () => ({}), finish: async () => {
        calls.push('finish'); if (mode === 'finish-throw') throw Error('finish failed');
      } }),
      prepare: async () => { calls.push('prepare'); return { prepared: true }; },
      runWrapper: async ({ contract }) => { calls.push('wrapper');
        assert.deepEqual(readPreparedContract(contract), { spaceId: 92, originalMetricsOverride: metrics });
        if (mode === 'wrapper-throw') throw Error('spawn failed');
        return { code: mode === 'wrapper-exit' ? 1 : 0, log: 'unit stub' };
      },
    });
    if (mode === 'success') await run; else await assert.rejects(run);
    assert.deepEqual(calls, ['prepare', 'wrapper', 'finish', 'cleanup']);
  });
}

test('task creation failure still cleans the already acquired environment', async t => {
  let cleaned = false;
  await assert.rejects(runOwnedHomeAppHarness({ root, out: await temporary(t), originalMetricsOverride: null,
    startEnvironment: async () => ({ env: { cleanup: async () => { cleaned = true; } } }),
    createTask: async () => { throw Error('task failed'); }, prepare: async () => assert.fail(),
    runWrapper: async () => assert.fail(),
  }));
  assert.equal(cleaned, true);
});

test('contract rejects unknown prior override rather than guessing browser dimensions', () => {
  assert.throws(() => copyOriginalMetrics(undefined), /Owner must supply/);
  assert.throws(() => readPreparedContract({ spaceId: 1, prepared: false, originalMetricsOverride: null }));
  assert.throws(() => copyOriginalMetrics({ width: 100, height: 100, mobile: false }));
  const copy = copyOriginalMetrics(metrics);
  assert.deepEqual(copy, metrics);
  assert.notEqual(copy.screenOrientation, metrics.screenOrientation);
});

for (const original of [null, metrics]) {
  for (const mode of ['success', 'observe-failure', 'set-failure']) {
    test(`resize ${mode} restores ${original === null ? 'no override via clear' : 'full owner configuration'}`, async () => {
      const calls = [];
      const page = { cdp: async (method, params) => { calls.push({ method, params });
        if (mode === 'set-failure' && calls.length === 1) throw Error('set failed');
      } };
      const run = withRestoredMetrics(page, original, async () => {
        await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1100 });
        if (mode === 'observe-failure') throw Error('observation failed');
      });
      if (mode === 'success') await run; else await assert.rejects(run);
      assert.deepEqual(calls.at(-1), original === null
        ? { method: 'Emulation.clearDeviceMetricsOverride', params: undefined }
        : { method: 'Emulation.setDeviceMetricsOverride', params: metrics });
    });
  }
}

test('restore failure retains the original resize failure', async () => {
  await assert.rejects(withRestoredMetrics({ cdp: async () => { throw Error('restore failed'); } }, null,
    async () => { throw Error('resize failed'); }), error => {
    assert.equal(error.code, 'HOME_APP_METRICS_RESTORE_FAILED');
    assert.deepEqual(error.errors.map(e => e.message), ['resize failed', 'restore failed']);
    return true;
  });
});

test('real journey blocks both provider cases when restoration fails, without provider operations', async t => {
  const calls = [];
  const page = {
    waitForSelector: async () => {}, fill: async () => {}, screenshot: async () => {},
    hover: async () => {}, waitForFunction: async () => {},
    click: async selector => { calls.push(selector); throw Error('earlier UI failure'); },
    evaluate: async () => assert.fail('provider or observation must not execute after failed resize set'),
    cdp: async method => { calls.push(method); throw Error(method.includes('clear') ? 'restore failed' : 'resize failed'); },
  };
  const out = await temporary(t);
  const results = await runHomeAppJourney(page, out, { originalMetricsOverride: null });
  assert.equal(results.length, 7);
  assert.equal(results[4].status, 'fail');
  assert.match(results[4].error, /resize failed/);
  assert.deepEqual(results.slice(5).map(r => r.status), ['blocked', 'blocked']);
  assert.equal(calls.filter(c => c === 'button[aria-label="Close"]').length, 1, 'only case04 attempted Close');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(out, 'results.json'))), results);
});
