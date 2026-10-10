import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createTestEnvironmentStarter } from '../../../../scripts/test-env-bootstrap.mjs';
import { privateStarterFs, redact } from '../../../../scripts/composer-inline-bootstrap.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const repository = resolve(root, '../..');
const executable = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const cli = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const allowedSource = source => source.startsWith(join(root, 'plugins') + '/') || source.startsWith(join(root, 'node_modules') + '/') || source.startsWith(join(root, 'packages') + '/') || source.startsWith(join(repository, 'node_modules') + '/') || source.startsWith(join(repository, 'packages') + '/');

/** Task-only local file dependency preparation; no shared configuration or registry fetch. */
function materializePackages(privateHome, packageNames) {
  const records = new Map();
  const copied = [];
  const packageRoot = join(privateHome, 'task-packages');
  fs.mkdirSync(packageRoot, { recursive: true });
  function dependencyDir(source, name) {
    const candidates = [join(source, 'node_modules', name), join(dirname(source), name)];
    if (dirname(source).split('/').at(-1)?.startsWith('@')) candidates.push(join(dirname(dirname(source)), name));
    for (const candidate of candidates) {
      if (!fs.existsSync(join(candidate, 'package.json'))) continue;
      const actual = fs.realpathSync(candidate);
      if (!allowedSource(actual)) throw new Error('Task dependency source is outside admitted package roots');
      return actual;
    }
    const require = createRequire(join(source, 'package.json'));
    let manifest;
    try { manifest = require.resolve(name + '/package.json'); }
    catch { throw new Error('Declared task dependency is not installed: ' + name); }
    const actual = fs.realpathSync(dirname(manifest));
    if (!allowedSource(actual)) throw new Error('Task dependency source is outside admitted package roots');
    return actual;
  }
  function copyPackage(source) {
    source = fs.realpathSync(source);
    if (!allowedSource(source)) throw new Error('Unadmitted package source');
    if (records.has(source)) return records.get(source);
    const original = JSON.parse(fs.readFileSync(join(source, 'package.json'), 'utf8'));
    const target = join(packageRoot, String(records.size));
    records.set(source, target);
    fs.cpSync(source, target, { recursive: true, dereference: false, filter: path => {
      const parts = relative(source, path).split('/');
      return !parts.some(part => ['node_modules', '.git', '.tmp', '.scratch', '.agent-reports'].includes(part));
    } });
    const manifest = { ...original };
    for (const kind of ['dependencies', 'optionalDependencies']) {
      if (!original[kind]) continue;
      manifest[kind] = {};
      for (const name of Object.keys(original[kind])) {
        const dependency = copyPackage(dependencyDir(source, name));
        manifest[kind][name] = 'file:' + dependency;
      }
    }
    fs.writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    const sources = [];
    function observe(dir, prefix = '') {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.name === 'node_modules' || name === 'package.json') continue;
        const path = join(dir, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Task package payload contains unadmitted symlink: ' + name);
        if (entry.isDirectory()) observe(path, name + '/');
        else if (entry.isFile()) {
          const bytes = fs.readFileSync(path);
          if (!bytes.equals(fs.readFileSync(join(source, name)))) throw new Error('Task package payload mismatch: ' + name);
          sources.push({ path: name, sha256: hash(bytes), bytes: bytes.length });
        } else throw new Error('Task package payload is not a regular file');
      }
    }
    observe(target);
    copied.push({ name: original.name, version: original.version, source, target, sources });
    return target;
  }
  return { targets: packageNames.map(name => copyPackage(name.startsWith('/') ? name : join(root, 'plugins', name))), copied };
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
        const prepared = materializePackages(options.env.DSH_HOME, ['omnimux', 'omnimux-workflow', sidebarPackage]);
        const runtimeEnv = { ...options.env, PATH: process.env.PATH,
          npm_config_store_dir: join(options.env.DSH_HOME, 'private-store'),
          npm_config_cache: join(options.env.DSH_HOME, 'private-cache'),
          npm_config_userconfig: join(options.env.DSH_HOME, 'private.npmrc'),
          npm_config_globalconfig: join(options.env.DSH_HOME, 'private-global.npmrc'),
          COREPACK_ENABLE_NETWORK: '0', PNPM_HOME: join(options.env.DSH_HOME, 'private-pnpm') };
        fs.writeFileSync(runtimeEnv.npm_config_userconfig, '', { flag: 'wx', mode: 0o600 });
        fs.writeFileSync(runtimeEnv.npm_config_globalconfig, '', { flag: 'wx', mode: 0o600 });
        const allLocalDependencyPaths = prepared.copied.map(item => item.target);
        const install = spawnSync(executable, ['--expose-internals', cli, 'plugin', '--profile', 'web', 'add', ...prepared.targets, ...allLocalDependencyPaths.filter(path => !prepared.targets.includes(path)), '--ignore-scripts', '--offline', '--prod', '--store-dir=' + runtimeEnv.npm_config_store_dir], {
          ...options, env: runtimeEnv, stdio: 'pipe', encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
        });
        fs.writeFileSync(join(evidence, 'install.log'), redact((install.stdout || '') + '\n' + (install.stderr || '')));
        if (install.error || install.status !== 0) throw new Error('Formal task-private offline installation failed: ' + (install.error?.code || install.status));
        const profile = join(options.env.DSH_HOME, 'profiles/web');
        const manifest = JSON.parse(fs.readFileSync(join(profile, 'package.json'), 'utf8'));
        if (!['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'omnimux', 'omnimux-workflow'].every(name => manifest.dsh?.profile?.bundles.includes(name))) throw new Error('Formal complete application layer missing');
        const installed = [];
        for (const name of ['omnimux', 'omnimux-workflow']) {
          const source = join(root, 'plugins', name);
          for (const file of name === 'omnimux' ? ['lib/client.js', 'src/catalog/generation-products.js', 'src/media/generation-mapping.js'] : ['dist/index.js', 'lib/client.js', 'lib/canvas.js']) {
            const bytes = fs.readFileSync(join(source, file));
            if (!bytes.equals(fs.readFileSync(join(profile, 'node_modules', name, file)))) throw new Error('Formal task installed payload mismatch');
            installed.push({ name, file, bytes: bytes.length, sha256: hash(bytes) });
          }
        }
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
        processProof = { root, workspaceId, workspacePath, fixtureOrigin: options.env.DEEPSEEK_BASE_URL, legacyUpstreamOrigin, legacy: { executionId, nodes: legacyNodes, mediaDirectory, records: legacyRecords, videoBytes: fixtureVideo.length, videoSha256: hash(fixtureVideo), syntheticCollectionOnly: true }, installation: 'formal-packaged-cli-offline', installed, dependencyCount: prepared.copied.length, credentialsRead: 0, privateProfile: profile, layers: manifest.dsh.profile.bundles };
        fs.writeFileSync(join(evidence, 'installed-proof.json'), JSON.stringify({ installed, packageSources: prepared.copied.map(({ name, version, source, target }) => ({ name, version, source, target })) }, null, 2) + '\n');
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

/** Explicit full-app browser test; synthetic collection never proves real generation. */
test('#3274 full application preserves complete drafts and original legacy collection', { timeout: 420000 }, async () => {
  const evidence = join(root, '.workbuddy/evidence/generation-consumer-' + randomUUID());
  fs.mkdirSync(evidence, { recursive: true });
  const files = [
    'specs/generation-consumer-preview.spec.md',
    'plugins/omnimux-workflow/tests/e2e/generation-consumer-preview.e2e.test.mjs',
    'plugins/omnimux-workflow/tests/e2e/generation-consumer-preview.journey.mjs',
    ...['HeaderControls.tsx', 'GenerationProductDraft.tsx', 'generationProductPreview.ts', 'generationProductDraft.test.mjs'].map(name => 'plugins/omnimux-workflow/src/canvas/editor/components/' + name),
    'plugins/omnimux-workflow/src/canvas/theme/components.css',
    'plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts', 'plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts',
    'plugins/omnimux-workflow/dist/index.js', 'plugins/omnimux-workflow/lib/client.js', 'plugins/omnimux-workflow/lib/canvas.js',
    'plugins/omnimux/lib/client.js', 'plugins/omnimux/lib/generation-core.js',
  ];
  const fingerprints = () => Object.fromEntries(files.map(path => [path, createHash('sha256').update(fs.readFileSync(join(root, path))).digest('hex')]));
  let environment, processProof, error;
  const result = { evidence, syntheticUiOnly: true, fullAcceptance: false, runtimeReady: false, browserInvoked: false, cleanup: null };
  try {
    const before = fingerprints();
    fs.writeFileSync(join(evidence, 'candidate-before.json'), JSON.stringify(before, null, 2) + '\n');
    ({ environment, processProof } = await startPrivateConsumerEnvironment(evidence));
    result.runtimeReady = true;
    result.origin = environment.origin;
    const code = `
      const fs = await import('node:fs');
      const { consumerJourney } = await import(${JSON.stringify('file://' + join(root, 'plugins/omnimux-workflow/tests/e2e/generation-consumer-preview.journey.mjs'))});
      const redact = ${redact.toString()};
      let task;
      try {
        task = await taskSpace('生成输入检查 #3274 · 隔离功能验收');
        fs.writeFileSync(${JSON.stringify(join(evidence, 'space.json'))}, JSON.stringify({ spaceId: task.spaceId, page: 'p1' }) + '\\n');
        const page = task.page('p1');
        await page.cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        await page.goto(${JSON.stringify(environment.loginUrl)});
        const record = (name,detail) => fs.appendFileSync(${JSON.stringify(join(evidence, 'observations.jsonl'))}, JSON.stringify({name,pass:true,detail}) + '\\n');
        const observed = await consumerJourney({page,evidenceDir:${JSON.stringify(evidence)},processProof:${JSON.stringify(processProof)},record});
        fs.writeFileSync(${JSON.stringify(join(evidence, 'journey-result.json'))}, JSON.stringify(observed,null,2) + '\\n');
      } catch(cause) {
        fs.writeFileSync(${JSON.stringify(join(evidence, 'browser-failure.json'))}, JSON.stringify({message:redact(cause?.message||cause), stack:redact(cause?.stack||'')},null,2) + '\\n');
        if(task) {
          const page=task.page('p1');
          try { fs.writeFileSync(${JSON.stringify(join(evidence, 'failure-snapshot.txt'))},redact(await page.snapshot())); await page.screenshot({path:${JSON.stringify(join(evidence, 'functional-failure.png'))}}); } catch {}
        }
        throw cause;
      } finally {
        if(task) {
          const receipt=await task.finish({keep:[]});
          fs.writeFileSync(${JSON.stringify(join(evidence, 'browser-cleanup.json'))},JSON.stringify({spaceId:task.spaceId,receipt},null,2)+'\\n');
        }
      }
    `;
    result.browserInvoked = true;
    const browser = await new Promise(resolve => {
      const child = spawn('ego-browser', ['nodejs'], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdio: 'pipe' });
      const output = { status: null, stdout: '', stderr: '', error: null };
      child.stdout.on('data', bytes => { output.stdout += bytes.toString(); }); child.stderr.on('data', bytes => { output.stderr += bytes.toString(); });
      const timeout = setTimeout(() => { output.error = { code: 'BROWSER_TIMEOUT' }; child.kill('SIGTERM'); }, 180000);
      child.once('error', error => { output.error = error; clearTimeout(timeout); resolve(output); });
      child.once('exit', status => { output.status = status; clearTimeout(timeout); resolve(output); });
      child.stdin.end(code);
    });
    fs.writeFileSync(join(evidence, 'browser.log'), redact((browser.stdout || '') + '\n' + (browser.stderr || '')));
    result.browserExit = browser.status;
    if (browser.error || browser.status !== 0) throw new Error('Functional ego invocation failed: ' + (browser.error?.code || browser.status));
    const after = fingerprints();
    fs.writeFileSync(join(evidence, 'candidate-after.json'), JSON.stringify(after, null, 2) + '\n');
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Candidate source or loaded artifact changed during browser verification');
    result.candidateUnchanged = true;
    result.journey = JSON.parse(fs.readFileSync(join(evidence, 'journey-result.json'), 'utf8'));
    result.fullAcceptance = result.journey.fullAcceptance === true;
    if (!result.fullAcceptance || result.journey.assertions.some(item => item.pass !== true)) throw new Error('Fresh functional journey did not complete');
    const space = JSON.parse(fs.readFileSync(join(evidence, 'space.json'), 'utf8'));
    const browserCleanup = JSON.parse(fs.readFileSync(join(evidence, 'browser-cleanup.json'), 'utf8'));
    if (browserCleanup.spaceId !== space.spaceId || browserCleanup.receipt.spaceId !== space.spaceId || browserCleanup.receipt.closedSpace !== true || browserCleanup.receipt.keptManagedLabels.length !== 0) throw new Error('Functional task space cleanup not confirmed');
  } catch (cause) {
    error = cause;
    result.error = redact(cause?.message || cause);
  } finally {
    if (environment) {
      try {
        const cleanup = await environment.cleanup();
        let alive = false;
        try { process.kill(processProof.pid, 0); alive = true; } catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
        const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + new URL(environment.origin).port, '-sTCP:LISTEN']);
        result.cleanup = { ...cleanup, alive, listenerPresent: listener.status === 0, listenerExit: listener.status, privateDirectoryExists: fs.existsSync(resolve(processProof.privateProfile, '../..')) };
        if (alive || listener.status !== 1 || result.cleanup.privateDirectoryExists || cleanup.cleaned !== true) throw new Error('Task-private runtime cleanup not confirmed');
      } catch (cause) { error ||= cause; result.cleanupError = redact(cause.message); }
    }
    fs.writeFileSync(join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify({ evidence, runtimeReady: result.runtimeReady, browserInvoked: result.browserInvoked, browserExit: result.browserExit, error: result.error || result.cleanupError || null, fullAcceptance: result.fullAcceptance }));
  assert.equal(error, undefined, result.error || result.cleanupError);
  assert.equal(result.runtimeReady, true); assert.equal(result.browserExit, 0); assert.equal(result.fullAcceptance, true);
  assert.equal(result.candidateUnchanged, true);
  assert.equal(result.cleanup.cleaned, true); assert.equal(result.cleanup.alive, false); assert.equal(result.cleanup.listenerPresent, false); assert.equal(result.cleanup.privateDirectoryExists, false);
  const legacyCleanup = JSON.parse(fs.readFileSync(join(evidence, 'legacy-upstream-cleanup.json'), 'utf8'));
  assert.equal(legacyCleanup.closed, true); assert.equal(legacyCleanup.requests.filter(item => item.method !== 'GET').length, 0);
  for (const origin of [processProof.fixtureOrigin, processProof.legacyUpstreamOrigin]) {
    const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + new URL(origin).port, '-sTCP:LISTEN']);
    assert.equal(listener.status, 1, 'Task-only fixture listener remains');
  }
});
