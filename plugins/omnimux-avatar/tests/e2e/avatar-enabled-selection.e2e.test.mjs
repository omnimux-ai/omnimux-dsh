import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPrivateAvatarEnvironment } from '../../../../test-support/avatar-enabled-selection-3280/environment.mjs';
import { redact } from '../../../../scripts/composer-inline-bootstrap.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('#3280 role enabled group selection and disabled blocking E2E', { timeout: 420000 }, async () => {
  const evidence = join(root, '.workbuddy/evidence/avatar-enabled-' + randomUUID());
  fs.mkdirSync(evidence, { recursive: true });

  const files = [
    'specs/avatar-enabled-selection.spec.md',
    'plugins/omnimux-avatar/src/client/AvatarStage.jsx',
    'plugins/omnimux-avatar/src/client/lib/catalog.js',
    'plugins/omnimux-avatar/src/client/locales.js',
    'plugins/omnimux-avatar/src/client/catalog.test.mjs',
    'plugins/omnimux-avatar/src/client/avatar-enabled-selection.test.mjs',
    'plugins/omnimux-avatar/lib/client.js',
    'plugins/omnimux/lib/client.js',
  ];
  const fingerprints = () => Object.fromEntries(files.map(path => [path, hash(fs.readFileSync(join(root, path)))]));

  let env, control, error;
  const result = { evidence, syntheticConsumerOnly: true, fullAcceptance: false, runtimeReady: false, browserInvoked: false, cleanup: null };

  try {
    const before = fingerprints();
    fs.writeFileSync(join(evidence, 'candidate-before.json'), JSON.stringify(before, null, 2) + '\n');

    env = await startPrivateAvatarEnvironment(evidence);
    result.runtimeReady = true;

    const capability = randomUUID();
    control = createServer((req, res) => {
      if (req.headers['x-task-capability'] !== capability) { res.writeHead(403); res.end(); return; }
      if (req.method === 'POST' && req.url === '/scene/B') env.setScene('B');
      else if (!(req.method === 'GET' && req.url === '/state')) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ submissions: env.submissions, blocked: env.blocked, catalogResponses: env.catalogResponses }));
    });
    await new Promise((yes, no) => { control.once('error', no); control.listen(0, '127.0.0.1', yes); });
    const rpcOrigin = 'http://127.0.0.1:' + control.address().port;

    const code = `
      const fs = await import('node:fs');
      const { avatarJourney } = await import(${JSON.stringify('file://' + join(root, 'test-support/avatar-enabled-selection-3280/journey.mjs'))});
      const assert = (await import('node:assert/strict')).default;
      let task;
      try {
        task = await taskSpace('角色渠道可用性 #3280 · 隔离功能验收');
        fs.writeFileSync(${JSON.stringify(join(evidence, 'space.json'))}, JSON.stringify({ spaceId: task.spaceId, page: 'p1' }) + '\\n');
        const page = task.page('p1');
        const rpc = async (path, method='GET') => {
          const res = await fetch(${JSON.stringify(rpcOrigin)} + path, { method, headers: { 'x-task-capability': ${JSON.stringify(capability)} } });
          assert.equal(res.status, 200);
          return res.json();
        };
        const envRpc = {
          originalLoginUrl: ${JSON.stringify(env.environment.originalLoginUrl.replace('127.0.0.1', 'localhost'))},
          loginUrl: ${JSON.stringify(env.environment.loginUrl.replace('127.0.0.1', 'localhost'))},
          avatarId: ${JSON.stringify(env.processProof.avatarId)},
          libraryFile: ${JSON.stringify(env.processProof.libraryFile)},
          submissions: [],
          blocked: [],
          catalogResponses: [],
          async refreshState() {
            const state = await rpc('/state');
            Object.assign(this, state);
          },
          async setScene(scene) {
            await rpc('/scene/' + scene, 'POST');
            await this.refreshState();
          },
        };
        const observed = await avatarJourney({
          page,
          evidenceDir: ${JSON.stringify(evidence)},
          envRpc,
          root: ${JSON.stringify(root)},
          record: (kind, detail) => fs.appendFileSync(${JSON.stringify(join(evidence, 'observations.jsonl'))}, JSON.stringify({ kind, detail }) + '\\n'),
        });
        fs.writeFileSync(${JSON.stringify(join(evidence, 'journey-result.json'))}, JSON.stringify(observed, null, 2) + '\\n');
      } finally {
        if (task) {
          const receipt = await task.finish({ keep: [] });
          fs.writeFileSync(${JSON.stringify(join(evidence, 'browser-cleanup.json'))}, JSON.stringify({ spaceId: task.spaceId, receipt }, null, 2) + '\\n');
          assert.equal(receipt.closedSpace, true);
          assert.deepEqual(receipt.keptManagedLabels, []);
        }
      }
    `;

    result.browserInvoked = true;
    const outcome = await new Promise((yes, no) => {
      const child = spawn('ego-browser', ['nodejs'], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdio: 'pipe' });
      let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; });
      child.stderr.on('data', b => { stderr += b; });
      child.once('error', no);
      child.once('exit', status => yes({ status, stdout, stderr }));
      child.stdin.end(code);
    });

    result.browserExit = outcome.status;
    fs.writeFileSync(join(evidence, 'browser.log'), redact(outcome.stdout + '\n' + outcome.stderr));
    assert.equal(outcome.status, 0, 'Browser child process failed');

    const after = fingerprints();
    assert.deepEqual(after, before, 'Candidate files must remain unchanged');
    result.candidateUnchanged = true;
    result.fullAcceptance = true;
  } catch (cause) {
    error = cause;
    result.error = redact(cause?.message || cause);
  } finally {
    if (control) {
      control.closeAllConnections();
      await new Promise(yes => control.close(yes));
    }
    if (env) {
      try {
        result.cleanup = await env.environment.cleanup();
      } catch (cleanupErr) {
        result.cleanupError = redact(cleanupErr?.message || cleanupErr);
      }
    }
    fs.writeFileSync(join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  }

  assert.equal(error, undefined, result.error || result.cleanupError);
  assert.equal(result.runtimeReady, true);
  assert.equal(result.browserExit, 0);
  assert.equal(result.fullAcceptance, true);
  assert.equal(result.candidateUnchanged, true);
  assert.equal(result.cleanup.hostResult.cleaned, true);
  assert.equal(result.cleanup.hostPidExited, true);
  assert.equal(result.cleanup.privateDirRemoved, true);
  assert.equal(result.cleanup.proxyResult.closed, true);
});
