import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installPrivatePluginPackages } from '../private-plugin-installation.mjs';
import { createTestEnvironmentStarter } from '../../scripts/test-env-bootstrap.mjs';
import { privateStarterFs, redact } from '../../scripts/composer-inline-bootstrap.mjs';
import { createAvatarStore } from '../../plugins/omnimux-avatar/src/store.js';
import { resolveAvatarPaths } from '../../plugins/omnimux-avatar/src/paths.js';
import { startAvatarProxy } from './proxy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
assert.equal(common.status, 0);
const repository = dirname(common.stdout.trim());
const executable = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const cli = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js';

export async function listPublishedPayloads(sources) {
  const require = createRequire('/Users/x/.nvm/versions/node/v25.8.0/lib/node_modules/npm/package.json');
  const packlist = require('npm-packlist');
  const Arborist = require('@npmcli/arborist');
  return Promise.all(sources.map(async source => {
    source = fs.realpathSync(source);
    const tree = await new Arborist({ path: source }).loadActual();
    const files = (await packlist(tree)).sort();
    assert.ok(files.includes('package.json'), 'Published manifest must be admitted');
    for (const file of files) assert.ok(file && !isAbsolute(file) && !file.split('/').includes('..'), 'Unsafe published payload path');
    return { source, files };
  }));
}

/** Formal packaged UI-only Host. Caller MUST await cleanup in the same invocation. */
export async function startPrivateAvatarEnvironment(evidence) {
  evidence = resolve(evidence);
  fs.mkdirSync(evidence, { recursive: true });
  const record = (kind, payload) => fs.appendFileSync(join(evidence, 'proxy-events.jsonl'), redact(JSON.stringify({ kind, ...payload })) + '\n');
  const configured = process.env.OMNIMUX_GENERATION_QA_SIDEBAR_PACKAGE;
  assert.equal(typeof configured, 'string', 'Explicit installed sidebar dependency path is required');
  const sidebarPackage = fs.realpathSync(configured);
  assert.ok(sidebarPackage.startsWith(join(repository, 'node_modules') + '/') || sidebarPackage.startsWith(join(root, 'node_modules') + '/'));
  assert.equal(JSON.parse(fs.readFileSync(join(sidebarPackage, 'package.json'), 'utf8')).name, 'dsh-better-sidebar');
  for (const name of ['omnimux', 'omnimux-avatar']) {
    if (!fs.existsSync(join(root, 'plugins', name, 'lib/client.js'))) {
      const error = new Error('Required task bundle missing: ' + name + '/lib/client.js; parent must build explicitly');
      fs.writeFileSync(join(evidence, 'preflight-failure.json'), JSON.stringify({ message: error.message, hostStarted: false, proxyStarted: false }) + '\n');
      throw error;
    }
  }
  fs.accessSync(executable, fs.constants.X_OK);
  fs.accessSync(cli.split('/app.asar/')[0] + '/app.asar', fs.constants.R_OK);
  const publishedPayloads = await listPublishedPayloads([join(root, 'plugins/omnimux'), join(root, 'plugins/omnimux-avatar'), sidebarPackage]);
  let processProof;
  const start = createTestEnvironmentStarter({
    fs: privateStarterFs(),
    repositoryRoot: repository,
    startupTimeoutMs: 180000,
    readCredential() { throw new Error('This UI-only task never reads real credentials'); },
    spawn(exe, args, options) {
      try {
        const settingsPath = join(options.env.DSH_HOME, 'settings.yaml');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        settings.locale = { preference: 'zh' };
        fs.writeFileSync(settingsPath, JSON.stringify(settings) + '\n', { mode: 0o600 });

        const { prepared, runtimeEnv, profile, manifest, installed, wholePackages } = installPrivatePluginPackages({
          root,
          repository,
          home: options.env.DSH_HOME,
          executable,
          cli,
          evidence,
          packageNames: ['omnimux', 'omnimux-avatar', sidebarPackage],
          requiredLayers: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'omnimux', 'omnimux-avatar', 'dsh-better-sidebar'],
          entryFiles: {
            omnimux: ['lib/client.js', 'src/catalog/generation-products.js', 'src/media/generation-mapping.js'],
            'omnimux-avatar': ['src/index.js', 'lib/client.js'],
          },
          payloads: publishedPayloads,
          options,
        });

        const paths = resolveAvatarPaths({ homeDir: options.env.DSH_HOME });
        const store = createAvatarStore({ paths });
        const avatar = store.create({ name: '渠道检查角色 · 合成验收' });
        const oldTask = store.addTask(avatar.id, {
          taskId: 'old-terminal-3280',
          kind: 'sheet',
          model: 'old-model-3280',
          group: 'old-wire-3280',
          taskRef: 'synthetic-old-taskref-3280',
          status: 'failed',
          error: '合成旧终态：未调用供应商',
          createdAt: '2026-10-01T00:00:00.000Z',
        });
        processProof = {
          root,
          avatarId: avatar.id,
          avatar: store.get(avatar.id),
          oldTask,
          libraryFile: paths.libraryFile,
          installation: 'formal-packaged-cli-offline',
          installed,
          wholePackages,
          dependencyCount: prepared.copied.length,
          credentialsRead: 0,
          privateProfile: profile,
          privateDir: dirname(options.env.DSH_HOME),
          layers: manifest.dsh.profile.bundles,
          fixtureOrigin: options.env.DEEPSEEK_BASE_URL,
        };
        fs.writeFileSync(join(evidence, 'installed-proof.json'), JSON.stringify(processProof, null, 2) + '\n');
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

  const originalEnvironment = await start({ root, mode: 'ui' });
  let proxy;
  try { proxy = await startAvatarProxy({ origin: originalEnvironment.origin, record }); }
  catch (cause) { await originalEnvironment.cleanup(); throw cause; }
  let cleanupPromise;
  const cleanup = () => cleanupPromise ??= (async () => {
    let hostResult, proxyResult, failure;
    try { proxyResult = await proxy.cleanup(); } catch (cause) { failure = cause; }
    try { hostResult = await originalEnvironment.cleanup(); } catch (cause) { failure ??= cause; }
    const receipt = { hostResult, proxyResult, privateDirRemoved: !fs.existsSync(processProof.privateDir), hostPidExited: false };
    try { process.kill(processProof.pid, 0); } catch (cause) { if (cause.code === 'ESRCH') receipt.hostPidExited = true; else failure ??= cause; }
    fs.writeFileSync(join(evidence, 'environment-cleanup.json'), JSON.stringify(receipt, null, 2) + '\n');
    if (failure) throw failure;
    assert.equal(receipt.privateDirRemoved, true);
    assert.equal(receipt.hostPidExited, true);
    assert.equal(proxyResult.closed, true);
    return receipt;
  })();
  const environment = { origin: proxy.origin, originalOrigin: originalEnvironment.origin, summary: originalEnvironment.summary, cleanup };
  Object.defineProperties(environment, {
    loginUrl: { value: proxy.mapLoginUrl(originalEnvironment.loginUrl), enumerable: false },
    originalLoginUrl: { value: originalEnvironment.loginUrl, enumerable: false },
  });
  processProof.originalOrigin = originalEnvironment.origin;
  processProof.proxyOrigin = proxy.origin;
  try { fs.writeFileSync(join(evidence, 'process.json'), JSON.stringify(processProof, null, 2) + '\n'); }
  catch (cause) { await cleanup(); throw cause; }
  return {
    environment,
    processProof,
    setScene: proxy.setScene,
    submissions: proxy.submissions,
    blocked: proxy.blocked,
    catalogResponses: proxy.catalogResponses,
  };
}
