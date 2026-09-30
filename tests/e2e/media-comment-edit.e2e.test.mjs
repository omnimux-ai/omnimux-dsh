import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startCommentEditFixture } from './media-comment-edit-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('real browser: comment → original reference → image edit, default and explicit channel, error detail', { timeout: 90000 }, async () => {
  const out = path.join(root, 'docs/evidence/comment-edit-2847/formal');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  const fixture = await startCommentEditFixture(root);
  let cleanup;
  try {
    const script = await fs.readFile(path.join(root, 'tests/e2e/media-comment-edit.browser.mjs'), 'utf8');
    const output = await new Promise((resolve, reject) => {
      const child = spawn('ego-browser', ['nodejs'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
      let text = '';
      child.stdout.on('data', (data) => { text += data; });
      child.stderr.on('data', (data) => { text += data; });
      child.on('error', reject);
      child.on('exit', (code) => code === 0 ? resolve(text) : reject(new Error(`Browser exit ${code}: ${text}`)));
      child.stdin.end(`const url=${JSON.stringify(fixture.identity.url)},out=${JSON.stringify(out)};\n${script}`);
    });
    assert.equal(typeof output, 'string');
    const report = JSON.parse(await fs.readFile(path.join(out, 'browser-result.json'), 'utf8'));
    assert.equal(report.pass, true);
    assert.equal(report.notLiveGeneration, true);
    assert.equal(report.result.naturalWidth, 640);
    assert.equal(JSON.parse(await fs.readFile(path.join(out, 'browser-cleanup.json'), 'utf8')).closed, true);
  } finally {
    await fixture.cleanup();
    await assert.rejects(fetch(fixture.identity.url, { signal: AbortSignal.timeout(1000) }));
    cleanup = { serviceClosed: true, privateFilesRemoved: true, url: fixture.identity.url };
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, 'service-cleanup.json'), JSON.stringify(cleanup));
  }
});
