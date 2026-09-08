import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { assertPath, candidateConfig, compareLocks, hashFile, inside, managedSpec, prepareFiles, readJson, readYaml, stable, validateConfigurationSources } from './materialize-graph.mjs';

const registry = 'https://registry.npmjs.org/';
const reject = message => { throw Object.assign(new Error(message), { code: 5 }); };

/** Reject every acquisition source except managed directories and locked npm bytes. */
export function validateAcquisitionLock(lock, request, { before = false } = {}) {
  if (String(lock?.lockfileVersion) !== '9.0' || stable(Object.keys(lock.importers || {})) !== '["."]') reject('unsupported acquisition lock');
  const target = lock.importers['.'].dependencies?.[request.name];
  if (!target || ![managedSpec(request.name), ...(before ? [`file:${request.tarball}`] : [])].includes(target.specifier)) reject('target must remain authorized local input');
  const packages = [];
  for (const [locator, item] of Object.entries(lock.packages || {})) {
    const base = locator.split('(')[0];
    const resolution = item.resolution || {};
    const isTarget = base === `${request.name}@${target.version.split('(')[0]}` || base === target.version.split('(')[0];
    if (isTarget && before && target.specifier === `file:${request.tarball}`) {
      const tarball = resolution.tarball;
      if (typeof tarball !== 'string' || !tarball.startsWith('file:') || !request.profile
          || path.resolve(request.profile, tarball.slice(5)) !== request.tarball) reject('unauthorized target archive');
      continue;
    }
    if (resolution.type === 'directory') {
      if (!/^\.materialize-snapshots\/plugins\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(resolution.directory || '')) reject('unmanaged directory acquisition');
      continue;
    }
    if (isTarget || base.startsWith(`${request.name}@`)) reject('remote target substitution forbidden');
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(base)) reject('unknown package locator');
    if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(resolution.integrity || '')) reject('locked SHA512 integrity required');
    if (Object.keys(resolution).some(key => !['integrity', 'tarball'].includes(key))) reject('unknown package source');
    if (resolution.tarball) {
      const url = new URL(resolution.tarball);
      if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password || url.search || url.hash
          || !url.pathname.endsWith('.tgz')) reject('unknown or authenticated registry');
    }
    packages.push(base);
  }
  return packages.sort();
}

/** Build an environment from an allowlist; no inherited Node/config/proxy hooks. */
export function privatePnpmEnvironment(privateRoot) {
  assertPath(privateRoot);
  const env = { PATH: process.env.PATH, HOME: path.join(privateRoot, 'home'), CI: 'true',
    COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_PROJECT_SPEC: '0', COREPACK_ENABLE_AUTO_PIN: '0',
    COREPACK_DEFAULT_TO_LATEST: '0', npm_config_manage_package_manager_versions: 'false',
    npm_config_ignore_scripts: 'true', npm_config_ignore_pnpmfile: 'true',
    npm_config_verify_deps_before_run: 'false', npm_config_update_notifier: 'false',
    npm_config_registry: registry, npm_config_side_effects_cache: 'false',
    npm_config_optimistic_repeat_install: 'false' };
  for (const [key, relative] of Object.entries({ TMPDIR: 'tmp', TMP: 'tmp', TEMP: 'tmp',
    XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state',
    XDG_DATA_HOME: 'data', COREPACK_HOME: 'corepack', PNPM_HOME: 'pnpm-home',
    npm_config_cache: 'cache/npm', npm_config_store_dir: 'store', npm_config_global_dir: 'global',
    npm_config_state_dir: 'state', npm_config_cache_dir: 'cache/pnpm' })) env[key] = path.join(privateRoot, relative);
  const operations = [];
  for (const value of new Set([env.HOME, ...Object.entries(env).filter(([key]) => /^(XDG_|COREPACK_HOME|PNPM_HOME|TMP|TEMP)|npm_config_(cache|store_dir|global_dir|state_dir|cache_dir)$/.test(key)).map(([, value]) => value)])) {
    operations.push({ operation: 'mkdir', path: value });
  }
  for (const [key, name] of [['npm_config_userconfig', 'user.npmrc'], ['npm_config_globalconfig', 'global.npmrc']]) {
    env[key] = path.join(privateRoot, name);
    operations.push({ operation: 'write', path: env[key], text: '', emptyOnly: true });
  }
  prepareFiles({ operation: 'batch', root: privateRoot, operations });
  return env;
}

/** A bounded lifetime CONNECT gate prevents pnpm redirects to unapproved hosts. */
export async function registryGate({ online = true } = {}) {
  const sockets = new Set();
  const server = http.createServer((_, response) => { response.writeHead(403); response.end(); });
  const track = socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => socket.destroy()); };
  server.on('connection', track);
  server.on('connect', (request, client, head) => {
    if (!online || request.url !== 'registry.npmjs.org:443' || request.headers['proxy-authorization']) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const upstream = net.connect({ host: 'registry.npmjs.org', port: 443 });
    track(upstream);
    upstream.setTimeout(30000, () => upstream.destroy());
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client); client.pipe(upstream);
    });
    client.once('close', () => upstream.destroy());
    upstream.once('close', () => client.destroy());
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  } };
}

/**
 * Prepare one candidate using the injected T03 runner (argv starts with pnpm command).
 * config is candidateConfig's {workspace, config}; optional offlineOnly and signal
 * are control fields, never forwarded as pnpm configuration. No live paths are written.
 */
export async function prepareCandidateDependencies(options) {
  try { return await prepareDependencies(options); }
  catch (error) { throw Object.assign(new Error(error.code === 5 ? error.message : 'candidate dependency preparation rejected'), { code: 5 }); }
}

async function prepareDependencies({ candidate, privateRoot, beforeLock, request, config, runPnpm }) {
  assertPath(candidate); assertPath(privateRoot);
  if (candidate === privateRoot || inside(candidate, privateRoot)) reject('cache root must be outside candidate');
  if (typeof runPnpm !== 'function') reject('owned pnpm runner required');
  const manifest = readJson(path.join(candidate, 'package.json'));
  if (manifest.dependencies?.[request.name] !== managedSpec(request.name) || manifest.pnpm || manifest.workspaces || manifest.devEngines
      || Object.keys(manifest.scripts || {}).length) reject('unsafe candidate manifest');
  const actualConfig = candidateConfig(candidate);
  if (!config || stable(actualConfig) !== stable({ workspace: config.workspace, config: config.config })) reject('candidate configuration mismatch');
  validateConfigurationSources(actualConfig.workspace, manifest);
  const approvedPackages = validateAcquisitionLock(beforeLock, request, { before: true });
  const initialLock = readYaml(path.join(candidate, 'pnpm-lock.yaml'));
  if (stable(initialLock) !== stable(beforeLock)) reject('candidate initial lock differs from verified before lock');
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const declared = manifest[section] || {};
    const locked = beforeLock.importers['.'][section] || {};
    if (stable(Object.keys(declared).sort()) !== stable(Object.keys(locked).sort())) reject('candidate importer names drift');
    for (const [name, specifier] of Object.entries(declared)) {
      // pnpm records a direct override, not the manifest range, as importer specifier.
      const override = actualConfig.workspace.overrides?.[name];
      const lockedOverride = typeof override === 'string' && override === beforeLock.overrides?.[name]
        && override === locked[name].specifier;
      if (name !== request.name && specifier !== locked[name].specifier && !lockedOverride) reject('candidate non-target specifier drift');
    }
  }
  const sourcePaths = new Set([managedSpec(request.name).slice(5), ...Object.values(initialLock.packages || {})
    .filter(item => item.resolution?.type === 'directory').map(item => item.resolution.directory)]);
  for (const relative of sourcePaths) {
    const source = assertPath(path.join(candidate, relative));
    const pkg = readJson(path.join(source, 'package.json'));
    for (const section of ['dependencies', 'optionalDependencies']) {
      for (const [name, spec] of Object.entries(pkg[section] || {})) {
        if (name === request.name) reject('nested target substitution forbidden');
        const managed = Object.values(initialLock.packages || {}).some(item => item.resolution?.type === 'directory'
          && item.resolution.directory === managedSpec(name).slice(5));
        if (/^(?:file|link|git|https?|npm):/.test(spec) || spec.includes('://')) {
          if (!managed || spec !== managedSpec(name)) reject('unapproved nested dependency source');
        } else if (!managed && !approvedPackages.some(locator => locator.startsWith(`${name}@`))) reject('source dependency absent from approved lock');
      }
    }
  }
  const env = privatePnpmEnvironment(privateRoot);
  const safety = ['--ignore-scripts', '--ignore-pnpmfile', '--package-import-method=copy',
    `--store-dir=${env.npm_config_store_dir}`, '--config.manage-package-manager-versions=false',
    '--config.verify-store-integrity=true', '--config.side-effects-cache=false',
    '--config.optimistic-repeat-install=false', '--config.update-notifier=false',
    '--fetch-retries=1', '--fetch-retry-mintimeout=100', '--fetch-retry-maxtimeout=100', '--fetch-timeout=10000'];
  const paths = [...new Set([candidate, privateRoot, ...sourcePaths].map(value => path.isAbsolute(value) ? value : path.join(candidate, value)))];
  const expected = prepareFiles({ operation: 'identities', paths }).identities;
  const recheck = () => prepareFiles({ operation: 'identities', paths, expected });
  const run = async argv => {
    recheck();
    const result = await runPnpm(argv, { cwd: candidate, env, signal: config.signal, directoryIdentities: expected });
    recheck();
    if (result?.code !== 0 || result.signal) reject(`candidate pnpm ${argv[0]} failed`);
    return result.stdout;
  };
  if ((await run(['--version'])).trim() !== '11.7.0') reject('pnpm 11.7.0 required');
  const withRegistry = async (argv, online = true) => {
    const gate = await registryGate({ online });
    try {
      env.https_proxy = gate.url; env.http_proxy = gate.url; env.no_proxy = 'invalid.invalid';
      env.HTTPS_PROXY = gate.url; env.HTTP_PROXY = gate.url; env.NO_PROXY = 'invalid.invalid';
      return await run([...argv, `--registry=${registry}`, `--config.https-proxy=${gate.url}`,
        `--config.proxy=${gate.url}`, '--config.noproxy=invalid.invalid']);
    } finally {
      await gate.close();
      for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy']) delete env[key];
    }
  };
  const lockArgs = ['install', '--lockfile-only', '--no-frozen-lockfile', ...safety];
  if (!config.offlineOnly && validateAcquisitionLock(beforeLock, request, { before: true }).length) await withRegistry(lockArgs);
  else await withRegistry([...lockArgs, '--offline'], false);
  const lockPath = path.join(candidate, 'pnpm-lock.yaml');
  const generated = readYaml(lockPath);
  try { compareLocks(beforeLock, generated, request); }
  catch { reject('candidate lock nodes or dependency edges drift'); }
  const packages = validateAcquisitionLock(generated, request);
  if (stable(readJson(path.join(candidate, 'package.json'))) !== stable(manifest) || stable(candidateConfig(candidate)) !== stable(actualConfig)) reject('candidate manifest/configuration drift');
  const lockDigest = hashFile(lockPath);
  const assertFrozen = () => { if (hashFile(lockPath) !== lockDigest) reject('candidate lock changed before acquisition'); };
  let acquisition = 'offline';
  if (!config.offlineOnly && packages.length) {
    assertFrozen();
    await withRegistry(['install', '--frozen-lockfile', ...safety]);
    acquisition = 'public-registry';
  }
  assertFrozen();
  await withRegistry(['install', '--frozen-lockfile', '--offline', ...safety], false);
  if (hashFile(lockPath) !== lockDigest) reject('frozen installation changed lock');
  return { lockDigest, storeRef: env.npm_config_store_dir,
    acquisition: { mode: acquisition, packages, registry: packages.length ? registry : null, frozenOffline: true } };
}
