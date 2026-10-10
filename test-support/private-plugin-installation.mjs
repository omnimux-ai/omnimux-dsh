import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { redact } from '../scripts/composer-inline-bootstrap.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Task-only local file dependency preparation; no shared configuration or registry fetch.
 * Mechanically extracted from plugins/omnimux-viewer/test-support/media-mime-selection-3278/environment.mjs
 */
export function materializePackages(privateHome, packageNames, { root, repository }) {
  assert.ok(root && repository, 'root and repository are required');
  const allowedSource = source => source.startsWith(join(root, 'plugins') + '/') || source.startsWith(join(root, 'node_modules') + '/') || source.startsWith(join(root, 'packages') + '/') || source.startsWith(join(repository, 'node_modules') + '/') || source.startsWith(join(repository, 'packages') + '/');
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

/**
 * Prune top-level prepared package targets to exact published file lists when payloads is supplied.
 */
export function prunePublishedPayloads(privateHome, prepared, payloads) {
  const privateRoot = fs.realpathSync(privateHome);
  for (const target of prepared.targets) {
    const item = prepared.copied.find(item => item.target === target);
    assert.ok(item, 'Top-level plugin preparation is missing');
    const payload = payloads.find(payload => payload.source === item.source);
    if (!payload) continue;
    const targetRoot = fs.realpathSync(target);
    assert.ok(targetRoot.startsWith(join(privateRoot, 'task-packages') + '/'), 'Pruning is restricted to private prepared package roots');
    const admitted = new Set(payload.files);
    const excluded = [];
    function prune(dir, prefix = '') {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = prefix + entry.name;
        const path = join(dir, entry.name);
        assert.ok(!entry.isSymbolicLink(), 'Prepared payload must not contain symlinks');
        if (entry.isDirectory()) {
          prune(path, file + '/');
          if (!fs.readdirSync(path).length) fs.rmdirSync(path);
        } else if (!admitted.has(file)) { excluded.push(file); fs.unlinkSync(path); }
      }
    }
    prune(targetRoot);
    item.sources = item.sources.filter(file => admitted.has(file.path));
    assert.equal(item.sources.length + 1, admitted.size, 'Every published payload file must be copied');
    for (const file of item.sources) {
      const bytes = fs.readFileSync(join(targetRoot, file.path));
      assert.equal(hash(bytes), file.sha256, 'Copied source hash must remain unchanged');
      assert.ok(bytes.equals(fs.readFileSync(join(item.source, file.path))), 'Published payload must equal source bytes');
    }
    item.publishedPayload = { files: payload.files, excluded: excluded.sort(), manifestRewrite: 'dependencies/optionalDependencies rewritten to private file: graph; other manifest fields preserved', sourceManifestSha256: hash(fs.readFileSync(join(item.source, 'package.json'))) };
  }
}

/**
 * Formal task-private plugin installation and dependency verification.
 * Mechanically extracted from plugins/omnimux-viewer/test-support/media-mime-selection-3278/environment.mjs
 */
export function installPrivatePluginPackages({
  root,
  repository,
  home,
  executable,
  cli,
  evidence,
  packageNames,
  requiredLayers,
  entryFiles,
  payloads,
  options,
}) {
  assert.ok(root && repository && home && executable && cli && evidence, 'Missing required install parameters');
  const prepared = materializePackages(home, packageNames, { root, repository });
  if (payloads && Array.isArray(payloads)) {
    prunePublishedPayloads(home, prepared, payloads);
  }

  const runtimeEnv = {
    ...options.env,
    PATH: process.env.PATH,
    npm_config_store_dir: join(home, 'private-store'),
    npm_config_cache: join(home, 'private-cache'),
    npm_config_userconfig: join(home, 'private.npmrc'),
    npm_config_globalconfig: join(home, 'private-global.npmrc'),
    COREPACK_ENABLE_NETWORK: '0',
    PNPM_HOME: join(home, 'private-pnpm'),
  };
  fs.writeFileSync(runtimeEnv.npm_config_userconfig, '', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(runtimeEnv.npm_config_globalconfig, '', { flag: 'wx', mode: 0o600 });

  const allLocalDependencyPaths = prepared.copied.map(item => item.target);
  const install = spawnSync(
    executable,
    [
      '--expose-internals', cli, 'plugin', '--profile', 'web', 'add',
      ...prepared.targets,
      ...allLocalDependencyPaths.filter(path => !prepared.targets.includes(path)),
      '--ignore-scripts', '--offline', '--prod',
      '--store-dir=' + runtimeEnv.npm_config_store_dir,
    ],
    {
      ...options,
      env: runtimeEnv,
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  fs.writeFileSync(join(evidence, 'install.log'), redact((install.stdout || '') + '\n' + (install.stderr || '')));
  if (install.error || install.status !== 0) {
    throw new Error('Formal task-private offline installation failed: ' + (install.error?.code || install.status));
  }

  const profile = join(home, 'profiles/web');
  const manifest = JSON.parse(fs.readFileSync(join(profile, 'package.json'), 'utf8'));
  if (requiredLayers && !requiredLayers.every(name => manifest.dsh?.profile?.bundles.includes(name))) {
    throw new Error('Formal complete application layer missing');
  }

  const installed = [];
  if (entryFiles && typeof entryFiles === 'object') {
    for (const [name, files] of Object.entries(entryFiles)) {
      const source = join(root, 'plugins', name);
      for (const file of files) {
        const bytes = fs.readFileSync(join(source, file));
        if (!bytes.equals(fs.readFileSync(join(profile, 'node_modules', name, file)))) {
          throw new Error('Formal task installed payload mismatch');
        }
        installed.push({ name, file, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }

  const wholePackages = [];
  for (const item of prepared.copied) {
    const references = prepared.copied.flatMap(parent => {
      const parentManifest = JSON.parse(fs.readFileSync(join(parent.target, 'package.json'), 'utf8'));
      return ['dependencies', 'optionalDependencies'].flatMap(kind =>
        Object.entries(parentManifest[kind] || {})
          .filter(([, value]) => value === 'file:' + item.target)
          .map(([name]) => ({ parent: parent.name, parentTarget: parent.target, name, entry: join(parent.target, 'node_modules', name) }))
      );
    });
    const admittedRoots = references.map(reference => {
      if (!fs.existsSync(reference.entry)) {
        fs.mkdirSync(dirname(reference.entry), { recursive: true });
        fs.symlinkSync(item.target, reference.entry, 'dir');
        fs.appendFileSync(join(evidence, 'private-dependency-graph-links.jsonl'), JSON.stringify({ parent: reference.parent, dependency: reference.name, declaredTarget: item.target, entry: reference.entry, created: true }) + '\n');
      }
      const actualRoot = fs.realpathSync(reference.entry);
      if (actualRoot !== fs.realpathSync(item.target)) {
        throw new Error('Declared nested dependency resolves to a different package: ' + reference.parent + '/' + reference.name);
      }
      return actualRoot;
    });
    if (prepared.targets.includes(item.target)) {
      const actualRoot = fs.realpathSync(join(profile, 'node_modules', item.name));
      if (actualRoot !== fs.realpathSync(item.target)) {
        throw new Error('Top-level plugin resolves to a different package: ' + item.name);
      }
      admittedRoots.push(actualRoot);
    }
    if (!admittedRoots.length) {
      throw new Error('Package is not reachable from its declared dependency graph: ' + item.name);
    }
    const installedRoot = admittedRoots[0];
    const files = [{ path: 'package.json', sha256: hash(fs.readFileSync(join(item.target, 'package.json'))) }, ...item.sources];
    for (const file of files) {
      const expected = fs.readFileSync(join(item.target, file.path));
      const actual = fs.readFileSync(join(installedRoot, file.path));
      if (!expected.equals(actual)) {
        fs.writeFileSync(join(evidence, 'package-byte-mismatch.json'), JSON.stringify({ name: item.name, file: file.path, source: item.source, target: item.target, installedRoot, actualRoot: fs.realpathSync(installedRoot), expected: file.path === 'package.json' ? JSON.parse(expected) : hash(expected), actual: file.path === 'package.json' ? JSON.parse(actual) : hash(actual) }, null, 2) + '\n');
        throw new Error('Formal whole package payload mismatch: ' + item.name + '/' + file.path);
      }
    }
    wholePackages.push({
      name: item.name,
      source: item.source,
      target: item.target,
      installedRoot,
      references,
      admittedRoots,
      files,
      payloadScope: item.publishedPayload ? 'source-npm-packlist' : 'original-library-copy',
      publishedPayload: item.publishedPayload,
    });
  }

  return { prepared, runtimeEnv, profile, manifest, installed, wholePackages };
}
