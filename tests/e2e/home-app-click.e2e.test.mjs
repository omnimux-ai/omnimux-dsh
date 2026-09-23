import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readPreparedContract } from './home-app-click.contracts.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The task-owned lifecycle harness installs the candidate in a private ui profile,
// completes real onboarding, and owns finish + environment cleanup in its finally.
// Explicit attachment avoids guessing onboarding state or touching shared profiles.
test('home apps: complete browser navigation journey', {
  skip: process.env.OMX_HOME_APP_E2E !== '1', timeout: 180000,
}, () => {
  const { spaceId, originalMetricsOverride } = readPreparedContract(
    JSON.parse(process.env.OMX_HOME_APP_PREPARED || 'null'),
  );
  const out = process.env.OMX_HOME_APP_QA_OUT;
  assert.ok(out && path.isAbsolute(out), 'Owner must supply an absolute evidence directory');
  fs.mkdirSync(out, { recursive: true });
  const script = `
    const task = await taskSpace(${spaceId});
    const page = task.page('p1');
    const {runHomeAppJourney} = await import(${JSON.stringify(path.join(root, 'tests/e2e/home-app-click.journey.mjs'))});
    const results = await runHomeAppJourney(page, ${JSON.stringify(out)}, {
      originalMetricsOverride: ${JSON.stringify(originalMetricsOverride)}
    });
    if(results.some(r=>r.status!=='pass')) throw new Error('HOME_APP_JOURNEY_FAILED');
  `;
  const child = spawnSync('ego-browser', ['nodejs'], {
    input: script, cwd: root, encoding: 'utf8', timeout: 170000, maxBuffer: 4 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(out, 'ego.log'), `${child.stdout || ''}\n${child.stderr || ''}`);
  assert.equal(child.status, 0, child.error?.message || `See ${out}`);
  const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
  assert.equal(results.length, 7);
  assert.ok(results.every(r => r.status === 'pass'));
});
