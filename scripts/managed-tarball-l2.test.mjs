import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash } from './materialize-graph.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = fs.mkdtempSync(path.join(tmpdir(), 'managed-l2-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }

test('unchanged dev-env rejects external tarball seed before L2 installation', () => {
  const launcher = path.join(root, 'scripts/dev-env.sh');
  const before = hash(fs.readFileSync(launcher));
  const home = path.join(scratch, 'home');
  const seed = path.join(home, 'synthetic-seed');
  const host = path.join(home, 'fake-host');
  const cli = path.join(host, 'apps/cli');
  write(path.join(cli, 'package.json'), '{"name":"synthetic-cli"}');
  write(path.join(cli, 'lib/bin.js'), 'throw new Error("negative test must not start Host");');
  const web = path.join(cli, 'node_modules/@deepseek-ai/dsh-web-app');
  write(path.join(web, 'package.json'), '{"name":"@deepseek-ai/dsh-web-app"}');
  const chat = path.join(web, 'node_modules/@deepseek-ai/dsh-client-ui-chat');
  write(path.join(chat, 'package.json'), '{"name":"@deepseek-ai/dsh-client-ui-chat"}');
  write(path.join(chat, 'lib/index.js'), '// fake install closure, not runtime evidence');
  write(path.join(seed, '.materialize-snapshots/plugins/example/package.json'), '{"name":"example","version":"1.0.0"}');
  write(path.join(seed, 'package.json'), '{"name":"synthetic-seed","dependencies":{"example":"file:/external.tgz"}}');
  write(path.join(seed, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  write(path.join(seed, 'pnpm-workspace.yaml'), 'packages:\n  - .\n');
  write(path.join(seed, 'cordis.patch.yml'), '[]\n');
  const task = path.join(home, '.dsh-dev/tasks/managed-negative');
  write(path.join(task, 'settings.yaml'), '{}\n');
  const result = spawnSync('bash', [launcher, 'start', 'managed-negative', 'omnimux-video', `--source=${root}`], {
    env: { ...process.env, HOME: home, DSH_DEV_HOME: path.join(home, '.dsh-dev'), DSH_HOME: path.join(home, 'unused'),
      OMNIMUX_L2_SEED_PROFILE: seed, DSH_SRC: host, ALLOW_SEED_FROM_PROD: '0' }, encoding: 'utf8', timeout: 15000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未受管 file: 依赖/);
  assert.equal(fs.existsSync(path.join(task, 'profiles/omnimux-dev-managed-negative/node_modules')), false);
  assert.equal(hash(fs.readFileSync(launcher)), before);
});
