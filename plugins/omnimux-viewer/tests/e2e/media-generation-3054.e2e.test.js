import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// External Hub responses are synthetic. Browser interaction, viewer, runner,
// persistence and local-file byte serving execute the task worktree's code.
// Verify evidence: docs/evidence/media-generation-3054/verify-8-strict.
test('3054 real browser: original-task recovery, refresh, decoded media and zero-submit local failures', { timeout: 180000 }, async () => {
  const evidenceDir = resolve(root, 'docs/evidence/media-generation-3054', `e2e-${Date.now()}`);
  await mkdir(evidenceDir, { recursive: true });
  const browserUrl = pathToFileURL(resolve(root, 'plugins/omnimux-viewer/test-support/media-generation-3054/browser.mjs')).href;
  const journeyUrl = pathToFileURL(resolve(root, 'plugins/omnimux-viewer/test-support/media-generation-3054/journey.mjs')).href;
  const script = `const { runBrowser } = await import(${JSON.stringify(browserUrl)});\nconst { verifyJourney } = await import(${JSON.stringify(journeyUrl)});\nawait runBrowser(taskSpace, ${JSON.stringify(evidenceDir)}, verifyJourney);`;
  let output = '';
  const child = spawn('ego-browser', ['nodejs'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  child.stdin.end(script);
  const exitCode = await new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('exit', accept);
  });
  await writeFile(resolve(evidenceDir, 'runner.log'), output);
  await writeFile(resolve(evidenceDir, 'exit.json'), JSON.stringify({ exitCode, evidenceDir }, null, 2));
  const report = JSON.parse(await readFile(resolve(evidenceDir, 'result.json'), 'utf8'));
  assert.equal(report.closed, true, `browser space was not closed: ${evidenceDir}`);
  assert.equal(report.finishReceipt.closedSpace, true);
  assert.equal(report.server.closed, true);
  assert.deepEqual(report.server.changedSources, [], 'tested sources changed during acceptance');
  assert.equal(exitCode, 0, `${report.error || output}\nEvidence: ${evidenceDir}`);
  assert.equal(report.status, 'PASS_SCOPED');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.checks.map(check => check.name), [
    'production-mount-positive-geometry',
    'direct-image-original-task-retry',
    'inline-reference-persisted-original-task-refresh',
    'real-video-metadata-playback',
    'file-reader-failure-zero-post-draft-retained',
    'local-asset-failure-zero-post-draft-retained',
    'production-local-file-real-bytes',
  ]);
  const refresh = report.checks.find(check => check.name === 'inline-reference-persisted-original-task-refresh');
  assert.equal(typeof refresh.before.taskRef, 'string');
  assert.match(refresh.before.taskRef, /^mtask_/);
  assert.equal(refresh.after.taskRef, refresh.before.taskRef);
  assert.equal(refresh.after.requestKey, refresh.before.requestKey);
  assert.equal(refresh.image.naturalWidth, 480);
  assert.equal(refresh.image.naturalHeight, 320);
  const video = report.checks.find(check => check.name === 'real-video-metadata-playback').video;
  assert.ok(video.currentTime > 0 && video.duration > 0 && video.videoWidth > 0 && video.videoHeight > 0);
  assert.ok(report.screenshots.length >= 7);
});
