import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { hashFile, stable } from './materialize-graph.mjs';
import { captureCandidate } from './evidence-contract.mjs';
import { privatePnpmEnvironment } from './materialize-cache.mjs';
import { runPnpm } from './managed-tarball.mjs';
import semver from 'semver';
import { createRequire } from 'node:module';

const fail = code => { throw Object.assign(new Error(`TEST_ENV_${code}`), { code: `TEST_ENV_${code}` }); };
const inside = (root, path) => path === root || path.startsWith(root + sep);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(fs.readFileSync(path, 'utf8'));

export function matchesTaskPeerVersion(version, spec) {
  if (typeof spec !== 'string' || !semver.validRange(spec)) return false;
  const includesPrereleaseBound = /\d+\.\d+\.\d+-[0-9A-Za-z]/.test(spec);
  return semver.satisfies(version, spec, { includePrerelease: includesPrereleaseBound });
}

export function assertTaskPeerSearchBoundary({ installedRoot, privateRoot, name }) {
  for (const searchRoot of createRequire(join(installedRoot, 'package.json')).resolve.paths(name) || []) {
    if (!inside(privateRoot, searchRoot) && fs.existsSync(join(searchRoot, name))) fail('INSTALL_PEER_ANCESTOR_UNSAFE');
  }
}

/** Resolve an already installed pinned tool without package-manager auto acquisition. */
export function createTaskPnpmTool(privateRoot) {
  fs.mkdirSync(join(privateRoot, 'toolchain'), { recursive: true, mode: 0o700 });
  const env = privatePnpmEnvironment(join(privateRoot, 'toolchain'));
  const candidates = [...(process.env.PATH || '').split(sep === '/' ? ':' : ';').filter(Boolean).map(directory => join(directory, 'pnpm')),
    join(homedir(), 'Library/pnpm/.tools/pnpm/11.7.0/node_modules/pnpm/bin/pnpm.cjs'),
    join(homedir(), '.cache/node/corepack/v1/pnpm/11.7.0/bin/pnpm.cjs')];
  let pnpm;
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const path = fs.realpathSync(candidate);
    const result = spawnSync(process.execPath, [path, '--version'], { cwd: privateRoot, env, encoding: 'utf8', timeout: 10000 });
    if (!result.error && result.status === 0 && result.stdout.trim() === '11.7.0') { pnpm = path; break; }
  }
  if (!pnpm) fail('INSTALL_TOOLCHAIN_REQUIRED');
  const toolRoot = join(privateRoot, 'installer-bin');
  fs.mkdirSync(toolRoot, { mode: 0o700 });
  const executable = join(toolRoot, 'pnpm');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(pnpm)} "$@"\n`, { mode: 0o700 });
  return { executable, toolRoot, pnpm, sha256: hashFile(pnpm), version: '11.7.0' };
}

/** Every published byte is an ordinary private file, including the rewritten manifest. */
export function taskPackagePayload(root) {
  const files = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      if (name === 'node_modules') continue;
      const path = join(directory, name), stat = fs.lstatSync(path);
      if (stat.isSymbolicLink()) fail('INSTALL_PAYLOAD_UNSAFE');
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) files.push({ path: relative(root, path), sha256: hashFile(path), size: stat.size });
      else fail('INSTALL_PAYLOAD_UNSAFE');
    }
  }
  walk(root);
  return files;
}

/** Build a production-only local graph from verified archives and repository-installed libraries.
 * No peer is acquired: official host peers are supplied by the packaged runtime resolver.
 */
export function preparePrivateTaskPackages({ preparation, root, repository, privateRoot }) {
  const records = new Map(), byName = new Map(preparation.packages.map(item => [item.name, item]));
  const graphRoot = join(privateRoot, 'task-packages');
  fs.mkdirSync(graphRoot, { recursive: true, mode: 0o700 });
  const admitted = source => inside(join(root, 'node_modules'), source) || inside(join(repository, 'node_modules'), source)
    || inside(preparation.preparationPath, source);
  function dependency(source, name) {
    if (byName.has(name)) return { source: byName.get(name).extractedRoot, resolveRoot: join(preparation.stageRoot, byName.get(name).sourcePath), archive: byName.get(name) };
    let directory = source;
    while (true) {
      const candidate = join(directory, 'node_modules', name);
      if (fs.existsSync(join(candidate, 'package.json'))) {
        const actual = fs.realpathSync(candidate);
        if (!admitted(actual)) fail('INSTALL_DEPENDENCY_UNSAFE');
        return { source: actual, resolveRoot: actual };
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    // Package export maps can hide package.json; only the explicit ancestor lookup above is used.
    fail('INSTALL_DEPENDENCY_REQUIRED');
  }
  function copy(source, destination) {
    for (const name of fs.readdirSync(source)) {
      if (['node_modules', '.git', '.scratch', '.tmp', '.agent-reports'].includes(name)) continue;
      const from = join(source, name), to = join(destination, name), stat = fs.lstatSync(from);
      if (stat.isSymbolicLink()) fail('INSTALL_PAYLOAD_UNSAFE');
      if (stat.isDirectory()) { fs.mkdirSync(to, { recursive: true }); copy(from, to); }
      else if (stat.isFile()) fs.copyFileSync(from, to);
      else fail('INSTALL_PAYLOAD_UNSAFE');
    }
  }
  function visit(item) {
    const source = fs.realpathSync(item.source);
    if (!admitted(source)) fail('INSTALL_DEPENDENCY_UNSAFE');
    if (records.has(source)) return records.get(source);
    const original = json(join(source, 'package.json'));
    if (original.name === '@deepseek-ai/dsh-base' || original.name === '@deepseek-ai/dsh-web-app') fail('INSTALL_HOST_OVERRIDE');
    const target = join(graphRoot, String(records.size));
    fs.mkdirSync(target, { mode: 0o700 });
    const record = { name: original.name, version: original.version, source, target, dependencies: [], peers: original.peerDependencies || {}, peerMeta: original.peerDependenciesMeta || {}, archive: item.archive };
    records.set(source, record);
    copy(source, target);
    const manifest = structuredClone(original);
    for (const kind of ['dependencies', 'optionalDependencies']) {
      if (!original[kind]) continue;
      manifest[kind] = {};
      for (const [name, spec] of Object.entries(original[kind])) {
        const resolved = dependency(item.resolveRoot, name);
        const dependencyManifest = json(join(resolved.source, 'package.json'));
        if (typeof spec !== 'string') fail('INSTALL_DEPENDENCY_SPEC_UNSUPPORTED');
        if (spec.startsWith('file:')) {
          const expected = resolve(item.resolveRoot, spec.slice(5));
          if (!fs.existsSync(expected) || !fs.statSync(expected).isDirectory() || fs.realpathSync(expected) !== fs.realpathSync(resolved.resolveRoot)) fail('INSTALL_DEPENDENCY_SPEC_MISMATCH');
        } else if (!semver.validRange(spec)) fail('INSTALL_DEPENDENCY_SPEC_UNSUPPORTED');
        else if (!semver.satisfies(dependencyManifest.version, spec)) fail('INSTALL_DEPENDENCY_SPEC_MISMATCH');
        const child = visit(resolved);
        if (child.name !== name) fail('INSTALL_DEPENDENCY_IDENTITY');
        manifest[kind][name] = `file:${child.target}`;
        record.dependencies.push({ name, target: child.target });
      }
    }
    // Never execute a package lifecycle during installation. The graph alone is transformed.
    for (const name of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly']) if (manifest.scripts) delete manifest.scripts[name];
    fs.writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    record.manifestTransform = { originalSha256: hash(fs.readFileSync(join(source, 'package.json'))), installedSha256: hashFile(join(target, 'package.json')), policy: 'private-file-dependencies-and-disabled-install-lifecycle' };
    record.payload = taskPackagePayload(target);
    return record;
  }
  const targets = preparation.packages.map(item => visit({ source: item.extractedRoot, resolveRoot: join(preparation.stageRoot, item.sourcePath), archive: item }));
  const support = [];
  if (byName.has('omnimux-assets')) {
    const source = join(root, 'plugins/omnimux-studio/node_modules/dsh-better-sidebar');
    if (!fs.existsSync(join(source, 'package.json'))) fail('INSTALL_SUPPORT_REQUIRED');
    const actual = fs.realpathSync(source), manifest = json(join(actual, 'package.json'));
    if (manifest.name !== 'dsh-better-sidebar' || manifest.version !== '0.18.0') fail('INSTALL_SUPPORT_REQUIRED');
    support.push(visit({ source: actual, resolveRoot: actual }));
  }
  return { targets, support, records: [...records.values()] };
}

export function assertPreparedTaskArchives(preparation) {
  for (const item of preparation.packages) {
    if (hashFile(item.tarball) !== item.sha256) fail('INSTALL_ARCHIVE_CHANGED');
    const archived = item.inspection.entries.filter(entry => entry.type === 'file').map(({ path, sha256, size }) => ({ path, sha256, size })).sort((a, b) => a.path.localeCompare(b.path));
    const extracted = taskPackagePayload(item.extractedRoot).sort((a, b) => a.path.localeCompare(b.path));
    if (stable(archived) !== stable(extracted)) fail('INSTALL_ARCHIVE_CHANGED');
  }
}

/** Install through the shipping CLI, then verify every private payload against its archive graph. */
export async function installTaskRuntime({ root, repository, privateRoot, ownerIdentity, preparation, evidenceContext, candidate, executable, wrapper, env }) {
  assertPreparedTaskArchives(preparation);
  const graph = preparePrivateTaskPackages({ preparation, root, repository, privateRoot });
  const hostPeerExpectations = [];
  for (const item of graph.records) for (const [name, spec] of Object.entries(item.peers)) {
    if (typeof spec !== 'string' || !semver.validRange(spec)) fail('INSTALL_PEER_SPEC_UNSUPPORTED');
    const matching = graph.records.filter(candidate => candidate.name === name && matchesTaskPeerVersion(candidate.version, spec));
    const direct = item.dependencies.find(dependency => dependency.name === name);
    const selected = direct ? graph.records.find(candidate => candidate.target === direct.target) : matching.length === 1 ? matching[0] : null;
    if (direct && !matchesTaskPeerVersion(selected.version, spec)) fail('INSTALL_PEER_VERSION_MISMATCH');
    if (!direct && matching.length > 1) fail('INSTALL_PEER_AMBIGUOUS');
    if (!direct && selected) item.dependencies.push({ name, target: selected.target, peer: true });
    assertTaskPeerSearchBoundary({ installedRoot: item.target, privateRoot, name });
    hostPeerExpectations.push({ parentName: item.name, parentRoot: item.target, name, spec, optional: item.peerMeta[name]?.optional === true,
      versionPolicy: /\d+\.\d+\.\d+-[0-9A-Za-z]/.test(spec) ? 'explicit-prerelease-bounds' : 'semver', ...(selected ? { privateRoot: selected.target } : {}) });
  }
  fs.mkdirSync(join(privateRoot, 'installer'), { recursive: true, mode: 0o700 });
  const installEnv = { ...env, ...privatePnpmEnvironment(join(privateRoot, 'installer')), ELECTRON_RUN_AS_NODE: '1', DSH_HOME: env.DSH_HOME, DSH_AGENTS_HOME: env.DSH_AGENTS_HOME,
    npm_config_auto_install_peers: 'false', npm_config_strict_peer_dependencies: 'false', npm_config_engine_strict: 'false' };
  // Only this reviewed local pnpm executable is available to the official plugin command.
  const tool = preparation.toolchain;
  if (!tool || hashFile(tool.pnpm) !== tool.sha256) fail('INSTALL_TOOLCHAIN_REQUIRED');
  installEnv.PATH = `${tool.toolRoot}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`;
  const topLevel = [...graph.targets, ...graph.support];
  const installCommand = join(tool.toolRoot, 'dsh-install');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(installCommand, `#!/bin/sh\nexec ${quote(executable)} --expose-internals ${quote(wrapper)} "$@"\n`, { mode: 0o700 });
  const result = await runPnpm(['plugin', '--profile', 'web', 'add', ...topLevel.map(item => item.target), '--ignore-scripts', '--offline', '--prod', '--config.auto-install-peers=false', '--config.strict-peer-dependencies=false', `--store-dir=${installEnv.npm_config_store_dir}`],
    { cwd: installEnv.HOME, env: installEnv, executable: installCommand, timeoutMs: 120000, maxOutput: 8 << 20 });
  if (result.code !== 0 || result.signal) {
    const error = Object.assign(new Error('TEST_ENV_INSTALL_FAILED'), { code: 'TEST_ENV_INSTALL_FAILED', rootReason: `exit-${result.code}` });
    // Fixed configuration contains no credentials; retain only the tail of installer diagnostics.
    error.installDiagnostic = ((result.stdout || '') + '\n' + (result.stderr || '')).slice(-8000);
    throw error;
  }
  const profile = join(env.DSH_HOME, 'profiles', 'web');
  const manifest = json(join(profile, 'package.json'));
  const pluginNames = graph.targets.filter(item => item.archive.name !== 'dsh-ui-kit').map(item => item.name);
  const requiredBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...pluginNames, ...graph.support.map(item => item.name)].sort();
  if (stable(manifest.dsh?.profile?.bundles?.slice().sort()) !== stable(requiredBundles)) fail('INSTALL_REGISTRATION_MISSING');
  const packages = graph.records.map(item => {
    const installedRoot = fs.realpathSync(topLevel.includes(item) ? join(profile, 'node_modules', item.name) : item.target);
    if (!inside(privateRoot, installedRoot) || installedRoot !== item.target) fail('INSTALL_LOCATION_UNSAFE');
    if (stable(taskPackagePayload(installedRoot)) !== stable(item.payload)) fail('INSTALL_BYTES_MISMATCH');
    // pnpm file-directory installs preserve private realpaths. Explicit local production links
    // make Node's resolution follow the exact declared graph, never ancestor repository modules.
    for (const dependency of item.dependencies) {
      const link = join(installedRoot, 'node_modules', dependency.name);
      fs.mkdirSync(dirname(link), { recursive: true });
      if (!fs.existsSync(link)) fs.symlinkSync(dependency.target, link, 'dir');
      if (fs.realpathSync(link) !== dependency.target) fail('INSTALL_DEPENDENCY_IDENTITY');
    }
    const entry = { name: item.name, version: item.version, installedRoot, payload: item.payload, manifestTransform: item.manifestTransform,
      ...(graph.support.includes(item) ? { role: 'packaged-support' } : {}),
      ...(item.archive ? { archive: { sha256: item.archive.sha256, payloadDigest: item.archive.archiveDigest } } : {}) };
    if (pluginNames.includes(item.name)) {
      const installedManifest = json(join(installedRoot, 'package.json'));
      const path = installedManifest.main.replace(/^\.\//, '');
      if (!inside(installedRoot, resolve(installedRoot, path))) fail('INSTALL_ENTRY_UNSAFE');
      entry.serverEntry = { path, sha256: hashFile(join(installedRoot, path)) };
      if (typeof installedManifest.exports?.['./client'] === 'string') {
        const path = installedManifest.exports['./client'].replace(/^\.\//, '');
        const bytes = fs.statSync(join(installedRoot, path)).size;
        entry.clientBundle = { path, sha256: hashFile(join(installedRoot, path)), bytes };
      }
    }
    return entry;
  });
  const before = preparation.candidateBefore;
  const installation = { taskId: evidenceContext.taskId, runId: evidenceContext.runId, sourceRoot: root, privateRoot, profile,
    ownerIdentity, hostPeerExpectations, appAnchor: resolve(dirname(wrapper), '../node_modules/@deepseek-ai/dsh/package.json'),
    base: before.base.resolvedSha, head: before.head.resolvedSha, candidateDigest: before.candidate.contentDigest, inputsDigest: before.inputs.contentDigest, packages };
  const assertInstalledIntegrity = () => {
    const identity = fs.statSync(privateRoot, { bigint: true });
    if (fs.lstatSync(privateRoot).isSymbolicLink() || fs.realpathSync(privateRoot) !== privateRoot
      || String(identity.dev) !== ownerIdentity[0] || String(identity.ino) !== ownerIdentity[1]) fail('INSTALL_LOCATION_UNSAFE');
    const now = captureCandidate({ root, ...candidate, ...evidenceContext });
    if (now.candidate.contentDigest !== installation.candidateDigest || now.inputs.contentDigest !== installation.inputsDigest || now.head.resolvedSha !== installation.head) fail('INSTALL_CANDIDATE_CHANGED');
    const registry = json(join(profile, 'package.json'));
    if (stable(registry.dsh?.profile?.bundles?.slice().sort()) !== stable(requiredBundles)) fail('INSTALL_REGISTRATION_MISSING');
    for (const item of packages) {
      if (stable(taskPackagePayload(item.installedRoot)) !== stable(item.payload)) fail('INSTALL_BYTES_MISMATCH');
    }
    for (const item of topLevel) if (fs.realpathSync(join(profile, 'node_modules', item.name)) !== item.target) fail('INSTALL_LOCATION_UNSAFE');
    for (const item of graph.records) for (const dependency of item.dependencies) {
      if (fs.realpathSync(join(item.target, 'node_modules', dependency.name)) !== dependency.target) fail('INSTALL_DEPENDENCY_IDENTITY');
    }
    return installation;
  };
  assertInstalledIntegrity();
  return { installation, assertInstalledIntegrity };
}
