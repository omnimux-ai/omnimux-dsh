import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { createServer } from 'node:http';
import { createTestEnvironmentStarter } from '../../../../scripts/test-env-bootstrap.mjs';
import { privateStarterFs, redact } from '../../../../scripts/composer-inline-bootstrap.mjs';
import { fileURLToPath } from 'node:url';
import { materializePackages as materializePackagesBase, installPrivatePluginPackages } from '../../../../test-support/private-plugin-installation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
assert.equal(common.status, 0, 'Repository dependency root must resolve explicitly');
const repository = dirname(common.stdout.trim());
const executable = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const cli = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Task-only local file dependency preparation; delegates to repository test-support helper. */
export function materializePackages(privateHome, packageNames) {
  return materializePackagesBase(privateHome, packageNames, { root, repository });
}

export async function startPrivateConsumerEnvironment(evidence) {
  fs.mkdirSync(evidence, { recursive: true });
  const configured = process.env.OMNIMUX_GENERATION_QA_SIDEBAR_PACKAGE;
  assert.equal(typeof configured, 'string', 'Explicit installed sidebar dependency path is required');
  const sidebarPackage = fs.realpathSync(configured);
  assert.equal(sidebarPackage.startsWith(join(repository, 'node_modules') + '/') || sidebarPackage.startsWith(join(root, 'node_modules') + '/'), true, 'Sidebar must be an installed dependency in this repository');
  assert.equal(JSON.parse(fs.readFileSync(join(sidebarPackage, 'package.json'), 'utf8')).name, 'dsh-better-sidebar');
  fs.accessSync(executable, fs.constants.X_OK); fs.accessSync(cli.split('/app.asar/')[0] + '/app.asar', fs.constants.R_OK);
  let processProof;
  const originalOperations = ['edit', 'extend', 'digital_human'];
  const upstreamRequests = [];
  const fixtureVideo = fs.readFileSync(join(root, 'tests/fixtures/qa-workspace-media/assets/imported/fixture-video.mp4'));
  const legacyUpstream = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const entry = { method: request.method, path, group: String(request.headers['x-omnimux-group'] || '') };
    upstreamRequests.push(entry); fs.appendFileSync(join(evidence, 'legacy-upstream-requests.jsonl'), JSON.stringify(entry) + '\n');
    const task = /^\/v1\/video\/generations\/(original-(?:edit|extend|digital_human))$/.exec(path);
    if (request.method === 'GET' && task) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'completed', data: { url: `http://127.0.0.1:${legacyUpstream.address().port}/original-video/${task[1]}.mp4` } }));
    } else if (request.method === 'GET' && /^\/original-video\/original-(?:edit|extend|digital_human)\.mp4$/.test(path)) {
      response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': fixtureVideo.length, 'cache-control': 'no-store' }); response.end(fixtureVideo);
    } else { response.writeHead(405, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'synthetic_collection_only_no_generation' })); }
  });
  await new Promise((resolve, reject) => { legacyUpstream.once('error', reject); legacyUpstream.listen(0, '127.0.0.1', resolve); });
  const legacyUpstreamOrigin = `http://127.0.0.1:${legacyUpstream.address().port}`;
  const start = createTestEnvironmentStarter({
    fs: privateStarterFs(), repositoryRoot: repository, startupTimeoutMs: 180000,
    readCredential() { throw new Error('This UI-only task never reads real credentials'); },
    spawn(exe, args, options) {
      try {
        const settingsPath = join(options.env.DSH_HOME, 'settings.yaml');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        settings.locale = { preference: 'zh' };
        fs.writeFileSync(settingsPath, JSON.stringify(settings) + '\n', { mode: 0o600 });
        const { prepared, runtimeEnv, installed, wholePackages } = installPrivatePluginPackages({
          root, repository, home: options.env.DSH_HOME, executable, cli, evidence,
          packageNames: ['omnimux', 'omnimux-workflow', 'omnimux-viewer', sidebarPackage],
          requiredLayers: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'omnimux', 'omnimux-workflow', 'omnimux-viewer', 'dsh-better-sidebar'],
          entryFiles: {
            omnimux: ['lib/client.js', 'src/catalog/generation-products.js', 'src/media/generation-mapping.js'],
            'omnimux-viewer': ['lib/index.js', 'lib/client.js'],
            'omnimux-workflow': ['dist/index.js', 'lib/client.js', 'lib/canvas.js'],
          },
          options,
        });
        const profile = join(options.env.DSH_HOME, 'profiles/web');
        const manifest = JSON.parse(fs.readFileSync(join(profile, 'package.json'), 'utf8'));
        const workspaceId = randomUUID();
        const workspacePath = join(options.env.HOME, 'generation-preview-synthetic-project');
        fs.mkdirSync(workspacePath, { recursive: true });
        const storage = join(options.env.DSH_HOME, 'storages');
        fs.mkdirSync(storage, { recursive: true });
        const timestamp = new Date().toISOString();
        const workspaceLedger = join(storage, 'workspace.json');
        const ledger = fs.existsSync(workspaceLedger) ? JSON.parse(fs.readFileSync(workspaceLedger, 'utf8')) : { unit: { name: 'workspace', version: 2 }, global: { initialized: true, workspaceIds: [], archivedSessionIds: [] }, tables: { workspaces: {} } };
        ledger.global.workspaceIds.push(workspaceId);
        ledger.tables.workspaces[workspaceId] = { path: workspacePath, title: '生成输入检查 · 合成验收', sessionIds: [], createdAt: timestamp, updatedAt: timestamp };
        fs.writeFileSync(workspaceLedger, JSON.stringify(ledger) + '\n', { mode: 0o600 });
        fs.mkdirSync(join(workspacePath, 'assets'), { recursive: true });
        fs.copyFileSync(join(root, 'tests/fixtures/qa-workspace-media/assets/imported/fixture-video.mp4'), join(workspacePath, 'assets/fixture-video.mp4'));
        const submittedAt = Date.now(), executionId = 'exec_legacy3274';
        const legacyNodes = originalOperations.map((operation, index) => ({ id: 'old-' + operation, type: 'material', position: { x: 40 + index * 330, y: 90 }, data: {
          nodeKind: 'generate', materialType: 'video', label: '旧任务 ' + operation + ' · 合成测试', prompt: ' 原请求 ', params: { model: 'original-model', operation, sound: false, seed: 0 }, executionStatus: 'paused', status: 'pending',
        } }));
        const nodeStates = Object.fromEntries(legacyNodes.map((node, index) => [node.id, { status: 'running', startedAt: submittedAt, completedAt: null, error: null,
          upstreamTask: { taskId: 'original-' + originalOperations[index], taskRef: 'mtask_legacy_' + originalOperations[index] + '3274', capability: 'video', submittedAt, owner: 'omnimux' } }]));
        const executionRecord = { schemaVersion: 1, id: executionId, workspaceId: 'ws_generation_old', status: 'paused', createdAt: new Date(submittedAt).toISOString(), startedAt: submittedAt, completedAt: null, error: null, totalNodes: 3, completedNodes: 0, variables: {}, nodeStates, nodeOutputs: {}, mediaAssets: {}, breakpoints: [], maxParallel: 1, nodes: legacyNodes, edges: [], progress: { total: 3, completed: 0, percentage: 0 }, eventLog: [] };
        const executionDirectory = join(options.env.DSH_HOME, 'omnimux/workflow/executions', executionId);
        fs.mkdirSync(executionDirectory, { recursive: true, mode: 0o700 });
        fs.writeFileSync(join(executionDirectory, 'execution.json'), JSON.stringify(executionRecord) + '\n', { mode: 0o600, flag: 'wx' });
        fs.writeFileSync(join(executionDirectory, 'dag-state.json'), JSON.stringify({ pendingNodes: [], completedNodes: [], runningNodes: legacyNodes.map(node => node.id) }) + '\n', { mode: 0o600, flag: 'wx' });
        const mediaDirectory = join(options.env.DSH_HOME, 'omnimux/media-tasks'); fs.mkdirSync(mediaDirectory, { recursive: true, mode: 0o700 });
        const legacyRecords = originalOperations.map(operation => ({ schemaVersion: 1, taskRef: 'mtask_legacy_' + operation + '3274', requestKey: 'req_legacy_' + operation + '3274', capability: 'video', model: 'original-model', operation, providerId: 'omnimux', protocol: 'openai-media', baseUrl: legacyUpstreamOrigin + '/v1', wireModel: 'original-model', group: 'original-group', taskPath: 'video/generations', credentialRef: 'OMNIMUX_API_KEY', submittedAt, updatedAt: submittedAt, deadlineMs: 1800000, status: 'submitted', upstreamTaskId: 'original-' + operation }));
        for (const record of legacyRecords) fs.writeFileSync(join(mediaDirectory, record.taskRef + '.json'), JSON.stringify(record) + '\n', { mode: 0o600, flag: 'wx' });
        processProof = { root, workspaceId, workspacePath, fixtureOrigin: options.env.DEEPSEEK_BASE_URL, legacyUpstreamOrigin, legacy: { executionId, nodes: legacyNodes, mediaDirectory, records: legacyRecords, videoBytes: fixtureVideo.length, videoSha256: hash(fixtureVideo), syntheticCollectionOnly: true }, installation: 'formal-packaged-cli-offline', installed, wholePackages, dependencyCount: prepared.copied.length, credentialsRead: 0, privateProfile: profile, layers: manifest.dsh.profile.bundles };
        fs.writeFileSync(join(evidence, 'installed-proof.json'), JSON.stringify({ installed, wholePackages, packageSources: prepared.copied.map(({ name, version, source, target }) => ({ name, version, source, target })) }, null, 2) + '\n');
        const child = spawn(exe, args, { ...options, env: runtimeEnv });
        let diagnostic = '', standardOutput = '';
        child.stderr.on('data', bytes => { diagnostic = (diagnostic + bytes.toString()).slice(-60000); });
        child.stdout.on('data', bytes => { standardOutput = (standardOutput + bytes.toString()).slice(-60000); });
        child.once('exit', (code, signal) => fs.writeFileSync(join(evidence, 'runtime-exit.json'), JSON.stringify({ code, signal, diagnostic: redact(diagnostic), standardOutput: redact(standardOutput) }, null, 2) + '\n'));
        processProof.pid = child.pid;
        return child;
      } catch (cause) {
        fs.writeFileSync(join(evidence, 'private-prepare-failure.json'), JSON.stringify({ message: redact(cause?.message || cause), stack: redact(cause?.stack || '') }, null, 2) + '\n');
        throw cause;
      }
    },
  });
  let environment;
  try { environment = await start({ root, mode: 'ui' }); }
  catch (cause) { legacyUpstream.closeAllConnections(); await new Promise(resolve => legacyUpstream.close(resolve)); throw cause; }
  const cleanup = environment.cleanup;
  environment.cleanup = async () => {
    try { return await cleanup(); }
    finally { legacyUpstream.closeAllConnections(); await new Promise(resolve => legacyUpstream.close(resolve)); fs.writeFileSync(join(evidence, 'legacy-upstream-cleanup.json'), JSON.stringify({ closed: !legacyUpstream.listening, requests: upstreamRequests, origin: legacyUpstreamOrigin, synthetic: true }) + '\n'); }
  };
  try {
    fs.writeFileSync(join(evidence, 'process.json'), JSON.stringify(processProof, null, 2) + '\n');
    return { environment, processProof };
  } catch (cause) {
    await environment.cleanup();
    throw cause;
  }
}
