import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E2E #3034: real ConfigPanel in a real browser. Each slot definition renders at
 * most one empty well (placeholder + append merged) for both legacy and current
 * input nodes; unbound prompt → exactly 1 empty well.
 */
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const outputBase = process.env.WORKFLOW_E2E_OUTPUT || resolve(here, 'workflow-single-empty-well-3034-evidence');

test('E2E #3034: exactly one empty well per slot definition (legacy and new)', { timeout: 180000 }, async () => {
  await mkdir(outputBase, { recursive: true }); const output = await mkdtemp(resolve(outputBase, 'run-'));
  const server = spawn(process.execPath, [resolve(here, 'workflow-effective-input-server.mjs')], { cwd: root, env: { ...process.env, WORKFLOW_E2E_OUTPUT: output }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', url; const report = { output, status: 'running', browserClosed: false, serverClosed: false };
  server.stdout.on('data', b => { log += b; }); server.stderr.on('data', b => { log += b; });
  try {
    url = await new Promise((res, rej) => { const timer = setTimeout(() => rej(Error('Fixture startup timeout')), 60000); server.once('exit', code => { clearTimeout(timer); rej(Error('Fixture exited ' + code)); }); server.stdout.on('data', () => { const m = log.match(/"url":"(http:\/\/127\.0\.0\.1:\d+)"/); if (m) { clearTimeout(timer); res(m[1]); } }); });
    const script = `const out=${JSON.stringify(output)},url=${JSON.stringify(url)};\n` + await readFile(resolve(here, 'workflow-single-empty-well-3034-browser.mjs'), 'utf8');
    const ego = spawn('ego-browser', ['nodejs'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }); let browserLog = '';
    ego.stdout.on('data', b => browserLog += b); ego.stderr.on('data', b => browserLog += b); ego.stdin.end(script);
    const timer = setTimeout(() => ego.kill('SIGTERM'), 125000); const [code] = await once(ego, 'exit'); clearTimeout(timer);
    await writeFile(resolve(output, 'browser.log'), browserLog);
    assert.equal(code, 0, browserLog);
    const result = JSON.parse(await readFile(resolve(output, 'browser-result.json'), 'utf8'));
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.results, [
      { tag: 'new-unbound', emptyWells: 1 },
      { tag: 'legacy-unbound', emptyWells: 1 },
    ]);
    report.browserClosed = JSON.parse(await readFile(resolve(output, 'browser-cleanup.json'), 'utf8')).closed;
    assert.equal(report.browserClosed, true); report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = error.stack; throw error; } finally {
    if (server.exitCode === null) { server.kill('SIGTERM'); await Promise.race([once(server, 'exit'), new Promise(r => setTimeout(() => { server.kill('SIGKILL'); r(); }, 5000))]); }
    report.serverClosed = server.exitCode !== null || server.signalCode !== null;
    await writeFile(resolve(output, 'server.log'), log); await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
});
