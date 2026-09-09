import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ManagedSync } from './managed-tarball.mjs';
import { transitionFixture } from './managed-tarball-transaction.test.mjs';

for (const kind of ['bytes', 'mode', 'type', 'extra', 'missing']) test(`839 final source ${kind} drift must never commit`, async () => {
  const { f, request } = await transitionFixture(`839-source-${kind}`);
  const source = path.join(f.profile, '.materialize-snapshots/plugins/@fixture/viewer/index.js');
  let hit = false;
  const result = await new ManagedSync(request, { checkpoint(point) {
    if (point !== 'live-verify') return;
    hit = true;
    if (kind === 'bytes') fs.writeFileSync(source, 'module.exports = "external drift";\n');
    if (kind === 'mode') fs.chmodSync(source, 0o755);
    if (kind === 'type') { fs.unlinkSync(source); fs.mkdirSync(source); }
    if (kind === 'extra') fs.writeFileSync(path.join(path.dirname(source), '.extra'), 'unapproved');
    if (kind === 'missing') fs.unlinkSync(source);
    assert.equal(fs.readFileSync(path.join(f.profile, 'node_modules/@fixture/viewer/index.js'), 'utf8'), 'module.exports = 839;\n');
  } }).run();
  assert.equal(hit, true);
  console.log('source-only result:', JSON.stringify(result));
  assert.notEqual(result.status, 'committed', JSON.stringify(result));
  assert.equal(result.status, 'recovery-required');
  assert.equal(result.code, 7);
  const directory = path.join(f.profile, '.materialize-transactions', result.transactionId);
  const journal = JSON.parse(fs.readFileSync(path.join(directory, 'journal.json')));
  assert.equal(journal.phase, 'RECOVERING');
  if (kind === 'bytes') assert.equal(fs.readFileSync(source, 'utf8'), 'module.exports = "external drift";\n');
  if (kind === 'mode') assert.equal(fs.statSync(source).mode & 0o777, 0o755);
  if (kind === 'type') assert.equal(fs.lstatSync(source).isDirectory(), true);
  if (kind === 'extra') assert.equal(fs.readFileSync(path.join(path.dirname(source), '.extra'), 'utf8'), 'unapproved');
  if (kind === 'missing') assert.equal(fs.existsSync(source), false);
  // Owner resolves the external edit; recovery must then restore the exact old generation.
  if (kind === 'type') fs.rmdirSync(source);
  if (kind === 'extra') fs.unlinkSync(path.join(path.dirname(source), '.extra'));
  fs.writeFileSync(source, 'module.exports = 839;\n');
  fs.chmodSync(source, 0o644);
  const recovered = await new ManagedSync({ ...request, recover: result.transactionId }).run();
  assert.equal(recovered.code, 0, JSON.stringify(recovered));
  assert.equal(fs.readFileSync(source, 'utf8'), 'module.exports = 778;\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'journal.json'))).phase, 'ROLLED_BACK');
});
