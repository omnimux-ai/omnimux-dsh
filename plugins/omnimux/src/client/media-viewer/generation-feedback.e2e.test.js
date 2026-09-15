import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lateReadyRegression, frozenInputRegression } from '../../../test-support/generation-feedback/generation-feedback-regressions.mjs';

// Bridge contract regressions are explicitly separate from the real-browser journey.
test('bridge regression: late single request consumes retained turn end', () => lateReadyRegression(false));
test('bridge regression: two real candidates resolve without cross-request media', () => lateReadyRegression(true));
test('bridge regression: submitted input is frozen and questions do not generate', frozenInputRegression);

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');

// Real browser; unavailable ego capabilities fail rather than skip.
// Independent command: node --test plugins/omnimux/src/client/media-viewer/generation-feedback.e2e.test.js
// Grounded in #1759 space700 and tmp/canvas-generation-feedback/video-browser.json.
test('generation feedback: real browser transport-to-viewer journeys', async (t) => {
  const evidence = resolve(root, '.agent-reports/canvas-generation-feedback/e2e-runs', randomUUID());
  await mkdir(evidence, { recursive: true });
  t.diagnostic(`retained evidence: ${evidence}`);
  const moduleUrl = new URL('../../../test-support/generation-feedback/generation-feedback-browser.mjs', import.meta.url).href;
  const script = `const { runGenerationFeedbackBrowser } = await import(${JSON.stringify(moduleUrl)});
await runGenerationFeedbackBrowser(taskSpace, ${JSON.stringify(evidence)});`;
  const { NODE_TEST_CONTEXT: _testContext, ...env } = process.env;
  const output = await new Promise((accept, reject) => {
    const child = spawn('ego-browser', ['nodejs'], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => accept({ code, signal, stdout, stderr }));
    child.stdin.on('error', (error) => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(script);
  });
  await writeFile(resolve(evidence, 'ego-output.json'), JSON.stringify(output, null, 2));
  assert.equal(output.code, 0, `ego-browser failed (${output.signal || output.code}); see ${evidence}/ego-output.json`);
  const report = JSON.parse(await readFile(resolve(evidence, 'result.json'), 'utf8'));
  assert.equal(report.status, 'PASS_SCOPED', report.error);
  assert.equal(report.checks.length, 20);
  assert.equal(report.closed, true, 'ego TaskSpace was not closed');
  assert.equal(report.server.closed, true, 'fixture server was not closed');
  assert.deepEqual(report.server.changedSources, []);
  assert.equal(report.screenshots.length, 7);
});
