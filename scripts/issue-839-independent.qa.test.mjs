import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { transitionFixture } from './managed-tarball-transaction.test.mjs';

// Reuse input construction, not the implementation's graph/digest/recovery oracle.
function snapshot(root) {
  const rows = [];
  function walk(dir, relative = '') {
    for (const name of fs.readdirSync(dir).sort()) {
      if (!relative && ['.materialize-transactions', '.materialize.lock'].includes(name)) continue;
      const file = path.join(dir, name), rel = path.join(relative, name), st = fs.lstatSync(file);
      rows.push([rel, st.mode & 0o7777, st.isSymbolicLink() ? ['link', fs.readlinkSync(file)]
        : st.isDirectory() ? ['dir'] : ['file', createHash('sha256').update(fs.readFileSync(file)).digest('hex')]]);
      if (st.isDirectory()) walk(file, rel);
    }
  }
  walk(root); return rows;
}
function fixtureRun(f, request, recover) {
  const input = recover ? { target: f.task, profile: f.profile, recover } : request;
  const code = `import {ManagedSync} from ${JSON.stringify(new URL('./managed-tarball.mjs', import.meta.url).href)}; const result=await new ManagedSync(JSON.parse(process.argv[1])).run(); console.log(JSON.stringify(result)); process.exitCode=result.code;`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(input)], {
    encoding: 'utf8', timeout: 90000,
  });
}
for (const point of ['after-rename-2', 'after-rename-8']) {
  test(`QA839 real SIGKILL ${point}: module recovery restores bytes modes links without archives`, async () => {
    const { f, request } = await transitionFixture(`qa839-${point}`);
    const before = snapshot(f.profile);
    const code = `import {ManagedSync} from ${JSON.stringify(new URL('./managed-tarball.mjs', import.meta.url).href)}; await new ManagedSync(JSON.parse(process.argv[1]), {checkpoint(p){if(p===${JSON.stringify(point)}) process.kill(process.pid,'SIGKILL')}}).run();`;
    const killed = spawnSync(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(request)], {
      encoding: 'utf8', timeout: 90000,
    });
    assert.equal(killed.signal, 'SIGKILL', killed.stderr + killed.stdout);
    const ids = fs.readdirSync(path.join(f.profile, '.materialize-transactions'));
    const id = ids.find(id => JSON.parse(fs.readFileSync(path.join(f.profile, '.materialize-transactions', id, 'journal.json'))).phase === 'COMMITTING');
    assert.ok(id);
    fs.unlinkSync(f.tarball); fs.unlinkSync(request.tarball); fs.unlinkSync(request.transition.after.qaReceipt);
    const recovered = fixtureRun(f, request, id);
    assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    assert.deepEqual(snapshot(f.profile), before);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.profile, '.materialize-transactions', id, 'journal.json'))).phase, 'ROLLED_BACK');
  });
}
test('QA839 module transition and COMMITTED recovery never downgrade', async () => {
  const { f, request } = await transitionFixture('qa839-module');
  const result = fixtureRun(f, request);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(receipt.status, 'committed');
  const committed = snapshot(f.profile);
  fs.unlinkSync(f.tarball); fs.unlinkSync(request.tarball);
  const recovered = fixtureRun(f, request, receipt.transactionId);
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.deepEqual(snapshot(f.profile), committed);
});
