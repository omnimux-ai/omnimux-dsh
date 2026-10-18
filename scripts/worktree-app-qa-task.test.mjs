import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAppQaRunner, validateTaskRuntimeBinding } from './worktree-app-qa.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const expectedAssertions = {
  'app-environment': ['app-runtime-ready', 'same-origin-login', 'task-source-installed-loaded'],
  'app-browser': ['chrome-cdp-listen', 'auth-cookie-applied', 'app-dom-mounted', 'visible-geometry-positive',
    'runtime-modal-bypassed', 'blank-session-guide-visible', 'explore-section-visible', 'explore-cards-present',
    'asset-hub-reachable-via-library', 'screenshot-png-verified'],
};
const request = { root, repo, taskId: '3409', base: 'HEAD', head: 'HEAD', scope: 'smoke',
  taskPlugins: ['omnimux-inspiration'], requiredChecks: Object.keys(expectedAssertions), expectedAssertions };
const resources = ['app-child', 'mock-server', 'app-private-directory'].map(name => ({
  name, owner: 'app-environment', status: 'not-applicable', reason: 'not-created',
}));

test('fresh request forwards its fixed candidate and targets; failed installation remains a sealed failure', async () => {
  let received;
  const runId = randomUUID();
  const run = createAppQaRunner({ uuid: () => runId, startEnv: async options => {
    received = options;
    throw Object.assign(new Error('classified install failure'), { code: 'TEST_ENV_INSTALL_FAILED',
      cleanup: { cleaned: true, resources } });
  } });
  const report = await run(request);
  assert.deepEqual(received.evidenceContext, { taskId: '3409', runId });
  assert.deepEqual(received.taskPlugins, ['omnimux-inspiration']);
  assert.equal(received.candidate.base, 'HEAD');
  assert.equal(received.candidate.head, 'HEAD');
  assert.ok(received.candidate.outputs.every(path => path.startsWith(`.workbuddy/evidence/contract/3409/${runId}/`)));
  assert.deepEqual(received.candidate.extraInputs, []);
  assert.equal(report.pass, false);
  assert.equal(report.evidence.valid, true);
  assert.equal(report.evidence.pass, false);
  assert.deepEqual(report.errors, ['TEST_ENV_INSTALL_FAILED']);
  assert.equal(report.taskBinding, 'unknown');
  assert.equal(report.userFresh, 'unknown');
  assert.equal(report.checks[0].assertions.find(item => item.name === 'task-source-installed-loaded').pass, false);
});

test('task target input rejects duplicates, arbitrary paths and missing binding assertions before starting', async () => {
  let starts = 0;
  const run = createAppQaRunner({ startEnv: async () => { starts++; } });
  for (const taskPlugins of [[], ['omnimux-inspiration', 'omnimux-inspiration'], ['../omnimux'], ['omnimux; env'], [null]]) {
    await assert.rejects(run({ ...request, taskPlugins }), { code: 'TEST_APP_QA_TASK_PLUGINS' });
  }
  await assert.rejects(run({ ...request, expectedAssertions: { ...expectedAssertions,
    'app-environment': ['app-runtime-ready', 'same-origin-login'] } }), { code: 'TEST_APP_QA_EXPECTED_POLICY' });
  assert.equal(starts, 0);
});

test('self-reported installed and fresh flags cannot become task proof', async () => {
  let browsers = 0;
  const run = createAppQaRunner({ startEnv: async () => ({
    origin: 'http://127.0.0.1:12345', loginUrl: 'http://127.0.0.1:12345/?token=synthetic',
    userFresh: true, taskBinding: 'installed-loaded',
    summary: { evidenceLevel: 'full', taskPluginsInstalled: true },
    cleanup: async () => ({ cleaned: true, resources }),
  }), fetchImpl: async () => ({ status: 303, headers: { getSetCookie: () => ['qa=synthetic; Path=/'] } }),
  driveBrowser: async () => { browsers++; } });
  const report = await run(request);
  assert.equal(report.pass, false);
  assert.deepEqual(report.errors, ['TEST_APP_QA_TASK_BINDING']);
  assert.equal(report.userFresh, 'unknown');
  assert.equal(report.taskBinding, 'unknown');
  assert.equal(browsers, 0);
});

// These are consistency tests for captured facts, not installation or browser acceptance.
function bindingFixture() {
  const privateRoot = join(root, '.test-env-binding-unit');
  const candidate = { base: { resolvedSha: 'a'.repeat(40) }, head: { resolvedSha: 'b'.repeat(40) },
    candidate: { contentDigest: 'c'.repeat(64) }, inputs: { contentDigest: 'd'.repeat(64) } };
  const shared = { taskId: '3409', runId: 'unit', origin: 'http://127.0.0.1:12345', pid: 123,
    base: candidate.base.resolvedSha, head: candidate.head.resolvedSha,
    candidateDigest: candidate.candidate.contentDigest, inputsDigest: candidate.inputs.contentDigest };
  const packages = ['omnimux', 'omnimux-inspiration'].map((name, index) => {
    const installedRoot = join(privateRoot, 'packages', name);
    const serverHash = String(index + 1).repeat(64), clientHash = String(index + 3).repeat(64);
    return { name, installedRoot, payload: [{ path: 'src/index.js', sha256: serverHash, size: 10 },
      { path: 'lib/client.js', sha256: clientHash, size: 20 }],
    serverEntry: { path: 'src/index.js', sha256: serverHash },
    clientBundle: { path: 'lib/client.js', sha256: clientHash, bytes: 20 } };
  });
  const installation = { ...shared, sourceRoot: root, privateRoot, profile: join(privateRoot, 'dsh/profiles/web'), packages };
  const serverLoading = { ...shared, kind: 'task-server-loading', modules: packages.map(pkg => ({ name: pkg.name,
    path: pkg.serverEntry.path, sha256: pkg.serverEntry.sha256, loadedScriptSha256: pkg.serverEntry.sha256,
    loadedScriptUrl: pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href, matchingScriptCount: 1 })) };
  const clientLoading = { ...shared, kind: 'task-client-loading', bundles: packages.map(pkg => ({ plugin: pkg.name,
    bundlePath: pkg.clientBundle.path, bundleSha256: pkg.clientBundle.sha256, bundleBytes: pkg.clientBundle.bytes, bundleCodeSha256: 'e'.repeat(64),
    loadedRegistrationCodeSha256: 'e'.repeat(64), matchingRegistrationCount: 1,
    loadedScriptUrl: `${shared.origin}/plugins/all.js`, loadedScriptSha256: 'f'.repeat(64) })) };
  return { root, taskId: shared.taskId, runId: shared.runId, taskPlugins: ['omnimux-inspiration'],
    candidate, origin: shared.origin, installation, serverLoading, clientLoading };
}

test('binding comparison requires exact task, candidate, installed payload, process and client observations', async t => {
  assert.deepEqual(validateTaskRuntimeBinding(bindingFixture()).installation.packages.map(pkg => pkg.name), ['omnimux', 'omnimux-inspiration']);
  const changes = [
    ['wrong source tree', value => { value.installation.sourceRoot += '-other'; }],
    ['different candidate', value => { value.installation.candidateDigest = '0'.repeat(64); }],
    ['different input', value => { value.clientLoading.inputsDigest = '0'.repeat(64); }],
    ['different process', value => { value.serverLoading.pid++; }],
    ['different task', value => { value.serverLoading.taskId = 'other'; }],
    ['outside private installation', value => { value.installation.packages[0].installedRoot = '/outside'; }],
    ['duplicate installation roots', value => { value.installation.packages[1].installedRoot = value.installation.packages[0].installedRoot; }],
    ['missing server module', value => { value.serverLoading.modules.pop(); }],
    ['old server bytes', value => { value.serverLoading.modules[0].loadedScriptSha256 = '0'.repeat(64); }],
    ['ambiguous server modules', value => { value.serverLoading.modules[0].matchingScriptCount = 2; }],
    ['missing client', value => { value.clientLoading.bundles.pop(); }],
    ['old client bytes', value => { value.clientLoading.bundles[0].loadedRegistrationCodeSha256 = '0'.repeat(64); }],
    ['ambiguous client registration', value => { value.clientLoading.bundles[0].matchingRegistrationCount = 2; }],
    ['another browser host', value => { value.clientLoading.bundles[0].loadedScriptUrl = 'http://127.0.0.1:54321/plugins/all.js'; }],
    ['unpublished bundle', value => { value.installation.packages[0].payload.pop(); }],
  ];
  for (const [name, change] of changes) await t.test(name, () => {
    const value = bindingFixture(); change(value);
    assert.throws(() => validateTaskRuntimeBinding(value), { code: 'TEST_APP_QA_TASK_BINDING' });
  });
});

test('ordinary dependency instances may share a name without merging their actual installed roots', () => {
  const value = bindingFixture();
  value.installation.packages.push(...['1.0.0', '2.0.0'].map(version => ({ name: 'dependency', version,
    installedRoot: join(value.installation.privateRoot, 'deps', version), payload: [{ path: 'package.json', sha256: '1'.repeat(64), size: 2 }] })));
  assert.equal(validateTaskRuntimeBinding(value).installation.dependencyCount, 2);
});
