import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const archiveScript = fileURLToPath(new URL('./managed-tarball-archive.py', import.meta.url));
export const managedSpec = name => `file:.materialize-snapshots/plugins/${name}`;
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const digest = value => hash(stable(value));
export const inside = (root, entry) => entry === root || (!path.relative(root, entry).startsWith('..') && !path.isAbsolute(path.relative(root, entry)));

/** Reject symlinks in every existing component, including the leaf. */
export function assertPath(entry, missing = false) {
  if (!path.isAbsolute(entry) || path.normalize(entry) !== entry) throw new Error('non-canonical path');
  let cursor = path.parse(entry).root;
  for (const part of entry.slice(cursor.length).split('/').filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (!stat && !missing) throw new Error('missing path');
    if (stat?.isSymbolicLink()) throw new Error('symlink ancestor');
  }
  return entry;
}

/** Internal preparation operations share the archive helper's DirectoryAnchor. */
export function prepareFiles(request) {
  const result = spawnSync('python3', ['-B', archiveScript, 'prepareFiles'], {
    input: JSON.stringify(request), encoding: 'utf8', maxBuffer: 1 << 20,
  });
  if (result.status !== 0) throw Object.assign(new Error('anchored preparation rejected'), { code: 5 });
  return JSON.parse(result.stdout);
}

const globalJsonCache = new Map();

/** Decode strict JSON without executing package code. */
export function readJson(file, cache = null) {
  const store = cache || globalJsonCache;
  const stat = fs.statSync(file);
  const cached = store.get(file);
  if (cached && cached.mtime === stat.mtimeMs) return cached.data;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    const result = spawnSync('python3', [archiveScript, 'json'], {
      input: JSON.stringify({ path: file }), encoding: 'utf8', maxBuffer: 16 << 20,
    });
    if (result.status !== 0) throw new Error('invalid or ambiguous JSON');
    data = JSON.parse(result.stdout);
  }
  store.set(file, { mtime: stat.mtimeMs, data });
  return data;
}

export function readYaml(file) {
  const document = parseDocument(fs.readFileSync(file, 'utf8'), { uniqueKeys: true });
  if (document.errors.length) throw new Error('invalid or ambiguous YAML');
  return document.toJS({ maxAliasCount: 100 });
}

/** Hash a no-follow regular file with constant-size reads. */
export function hashFile(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const state = createHash('sha256');
  const buffer = Buffer.alloc(65536);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error('not a regular payload file');
    let count = 0;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) state.update(buffer.subarray(0, count));
    const after = fs.fstatSync(fd, { bigint: true });
    if (before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('payload changed while hashing');
    return state.digest('hex');
  } finally { fs.closeSync(fd); }
}

/** Full ordinary payload, including hidden/test files and POSIX modes. */
export function payloadManifest(root, { exclude = [], links = false } = {}) {
  const entries = [];
  function walk(directory, relative = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const rel = relative ? `${relative}/${name}` : name;
      if (exclude.some(item => rel === item || rel.startsWith(`${item}/`))) continue;
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      const record = { path: rel, type: '', size: 0, mode: stat.mode & 0o777, sha256: null };
      if (stat.isDirectory()) {
        record.type = 'directory';
        entries.push(record);
        walk(file, rel);
      } else if (stat.isFile()) {
        record.type = 'file';
        record.size = stat.size;
        record.sha256 = hashFile(file);
        entries.push(record);
      } else if (links && stat.isSymbolicLink()) {
        entries.push({ ...record, type: 'symlink', linkText: fs.readlinkSync(file) });
      } else throw new Error('unsupported payload entry');
    }
  }
  assertPath(root);
  walk(root);
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { entries, digest: digest(entries) };
}

const requireCache = new Map();
const resolveCache = new Map();
const realpathCache = new Map();

/** Resolve by Node's search paths without loading the package or its code. */
export function resolvePackage(consumer, name, modules) {
  const key = consumer + '\0' + name;
  if (resolveCache.has(key)) {
    const cached = resolveCache.get(key);
    if (!cached) throw new Error(`unresolved dependency: ${name}`);
    return cached;
  }
  let require = requireCache.get(consumer);
  if (!require) {
    require = createRequire(path.join(consumer, 'package.json'));
    requireCache.set(consumer, require);
  }
  for (const search of require.resolve.paths(name) || []) {
    if (!inside(modules, search)) continue;
    const entry = path.join(search, name);
    if (!fs.existsSync(path.join(entry, 'package.json'))) continue;
    let real = realpathCache.get(entry);
    if (real === undefined) {
      real = fs.realpathSync(entry);
      realpathCache.set(entry, real);
    }
    if (!inside(modules, real)) throw new Error('dependency resolution escapes installation');
    resolveCache.set(key, real);
    return real;
  }
  resolveCache.set(key, null);
  throw new Error(`unresolved dependency: ${name}`);
}

/** Resolve a pnpm dependency reference to one exact snapshot, including peers. */
export function lockLocator(lock, name, reference) {
  const version = typeof reference === 'object' ? reference?.version : reference;
  if (typeof version !== 'string') throw new Error('missing lock dependency reference');
  const matches = [version, `${name}@${version}`].filter(key => Object.hasOwn(lock.snapshots || {}, key));
  if (new Set(matches).size !== 1) throw new Error(`ambiguous or missing lock locator: ${name}`);
  return matches[0];
}

const peerCompatible = (locA, locB) => {
  if (locA === locB) return true;
  const pA = locA.includes('(') ? locA.slice(locA.indexOf('(')) : '';
  const pB = locB.includes('(') ? locB.slice(locB.indexOf('(')) : '';
  if (pA !== pB) return false;
  const bA = locA.split('(')[0];
  const bB = locB.split('(')[0];
  return bA.includes('@file:') || bB.includes('@file:');
};

/** Cross-check list paths and consumer edges against the exact lock snapshots. */
function mapListOccurrences(list, lock, profile, modules, metadata) {
  const occurrences = new Map();
  const walk = (consumer, consumerPath, dependencies) => {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [alias, item] of Object.entries(consumer[section] || {})) {
        const reference = dependencies[section]?.[alias] ?? dependencies.dependencies?.[alias] ?? dependencies.optionalDependencies?.[alias];
        const locator = lockLocator(lock, alias, reference);
        let resolved;
        try { resolved = resolvePackage(consumerPath, alias, modules); } catch { resolved = null; }
        let root;
        let candidates = metadata.hoistedLocations?.[locator];
        if (!candidates) {
          const matchingKey = Object.keys(metadata.hoistedLocations || {}).find(k => {
            const base = k.split('(')[0];
            return base.startsWith(`${alias}@`) || base.startsWith(`${item.name || alias}@`);
          });
          if (matchingKey) candidates = metadata.hoistedLocations[matchingKey];
        }
        if (metadata.nodeLinker === 'hoisted' && candidates && candidates.length > 0) {
          if (resolved && candidates.some(relative => path.resolve(profile, relative) === resolved)) {
            root = resolved;
          } else {
            const list = candidates.map(rel => path.resolve(profile, rel));
            const best = list.find(candidate => {
              try {
                const p = readJson(path.join(candidate, 'package.json'));
                return locator.startsWith(`${p.name}@`) && (!p.version || locator.split('(')[0] === `${p.name}@${p.version}` || locator.includes('@file:'));
              } catch { return false; }
            });
            root = best || (resolved || (item.path && fs.existsSync(item.path) ? fs.realpathSync(item.path) : null));
          }
        } else if (item.path && fs.existsSync(item.path)) {
          root = fs.realpathSync(item.path);
        } else {
          root = resolved;
        }
        if (!root || !inside(modules, root) || (!candidates && resolved !== root)) throw new Error('list/disk resolution mismatch');
        const pkg = readJson(path.join(root, 'package.json'));
        const base = locator.split('(')[0];
        const resolution = lock.packages?.[base];
        if (!resolution || !locator.startsWith(`${pkg.name}@`) || (resolution.version && resolution.version !== pkg.version)
            || !base.includes('@file:') && base !== `${pkg.name}@${pkg.version}`) throw new Error('list/lock/package identity mismatch');
        const referenceVersion = typeof reference === 'object' ? reference.version : reference;
        if (item.version !== referenceVersion && item.version !== pkg.version && item.version !== locator) throw new Error('list lock version mismatch');
        const previous = occurrences.get(root);
        if (previous && !peerCompatible(previous.locator, locator)) throw new Error('one occurrence has conflicting peer locators');
        if (!previous) occurrences.set(root, { locator, name: pkg.name, version: pkg.version, integrity: resolution.resolution?.integrity || null });
        if (item.dependencies || item.optionalDependencies || item.devDependencies) walk(item, root, lock.snapshots[locator]);
      }
    }
  };
  walk(list, profile, lock.importers['.']);
  return occurrences;
}

/** Enumerate exact lock occurrences by consumer resolution, without a pnpm process.
 * The complete disk inventory below rejects unreachable/unknown occurrences; the
 * same map is also cross-checked against pnpm list in ordinary captures.
 */
function mapLockOccurrences(lock, manifest, profile, modules, metadata) {
  const occurrences = new Map();
  const cache = new Map();
  const walk = (consumer, dependencies) => {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, reference] of Object.entries(dependencies[section] || {})) {
        const locator = lockLocator(lock, name, reference);
        const locations = metadata.hoistedLocations?.[locator];
        let root;
        try {
          if (metadata.nodeLinker === 'hoisted' && locations && locations.length > 0) {
            const resolved = resolvePackage(consumer, name, modules);
            if (locations.some(rel => path.resolve(profile, rel) === resolved)) {
              root = resolved;
            } else {
              const candidates = locations.map(rel => path.resolve(profile, rel));
              const best = candidates.find(candidate => {
                try {
                  const p = readJson(path.join(candidate, 'package.json'), cache);
                  return locator.startsWith(`${p.name}@`) && (!p.version || locator.split('(')[0] === `${p.name}@${p.version}` || locator.includes('@file:'));
                } catch { return false; }
              });
              root = best || resolved;
            }
          } else {
            root = resolvePackage(consumer, name, modules);
          }
        }
        catch (error) {
          if (section === 'optionalDependencies' && error.message.startsWith('unresolved dependency:')) continue;
          throw error;
        }
        const pkg = readJson(path.join(root, 'package.json'), cache);
        const base = locator.split('(')[0];
        const item = lock.packages?.[base];
        if (!item || !locator.startsWith(`${pkg.name}@`) || item.version && item.version !== pkg.version
            || !base.includes('@file:') && base !== `${pkg.name}@${pkg.version}`) throw new Error('lock/disk package identity mismatch');
        if (metadata.nodeLinker === 'hoisted' && locations
            && !locations.some(relative => path.resolve(profile, relative) === root)) throw new Error('hoisted lock/disk location mismatch');
        const previous = occurrences.get(root);
        if (previous && !peerCompatible(previous.locator, locator)) throw new Error('one occurrence has conflicting peer locators');
        if (previous) continue;
        occurrences.set(root, { locator, name: pkg.name, version: pkg.version, integrity: item.resolution?.integrity || null });
        walk(root, lock.snapshots[locator]);
      }
    }
  };
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const declared = manifest[section] || {};
    const locked = lock.importers['.'][section] || {};
    if (stable(Object.keys(declared).sort()) !== stable(Object.keys(locked).sort())) throw new Error('manifest/lock importer names mismatch');
    for (const [name, specifier] of Object.entries(declared)) {
      if (locked[name].specifier !== specifier && locked[name].specifier !== lock.overrides?.[name]) throw new Error('manifest/lock importer specifier mismatch');
    }
  }
  walk(profile, lock.importers['.']);
  return occurrences;
}

/** Separate approved embedded bytes from pnpm-created dependency topology. */
function occurrencePayload(root, roots, approval) {
  const entries = payloadManifest(root, { links: true }).entries;
  const expected = new Map((approval?.entries || []).map(entry => [entry.path, entry]));
  const topologyRoots = [...roots].filter(other => other !== root && inside(path.join(root, 'node_modules'), other));
  const result = entries.filter(entry => {
    if (!entry.path.startsWith('node_modules/') && entry.path !== 'node_modules') return true;
    const file = path.join(root, entry.path);
    if (entry.type === 'symlink' || entry.path === 'node_modules/.bin' || entry.path.startsWith('node_modules/.bin/')) return false;
    if (topologyRoots.some(other => inside(other, file) || inside(file, other))) return false;
    if (expected.has(entry.path)) return true;
    if (entry.path === 'node_modules' && !expected.has(entry.path)) return false;
    throw new Error('ambiguous embedded node_modules payload');
  });
  if (result.some(entry => entry.type === 'symlink')) throw new Error('package payload contains unapproved link');
  if (approval) {
    const approvalMap = new Map((approval.entries || []).map(e => [e.path, e]));
    for (const entry of result) {
      const source = approvalMap.get(entry.path);
      if (!source || source.sha256 !== entry.sha256) {
        throw new Error(`approved archive/source payload drift in root=${root} path=${entry.path}: found ${source?.sha256} vs ${entry.sha256}`);
      }
    }
    if (approval.exact) {
      const filteredApprovalEntries = approval.entries.filter(e => {
        const file = path.join(root, e.path);
        return !topologyRoots.some(other => inside(other, file) || inside(file, other));
      });
      if (stable(result) !== stable(filteredApprovalEntries)) throw new Error('approved archive/source payload drift');
    }
  }
  return { entries: result, digest: digest(result) };
}

/** Strict read-only graph capture. Unknown config is rejected, never discarded. */
export class GraphInspector {
  constructor(profile) { this.profile = assertPath(profile); }

  capture({ listJson, approvedPayloads = {}, withoutPnpm = false } = {}) {
    // A transaction can replace the whole installation at the same path.
    resolveCache.clear();
    realpathCache.clear();
    requireCache.clear();
    const profile = this.profile;
    const manifest = readJson(path.join(profile, 'package.json'));
    const lock = readYaml(path.join(profile, 'pnpm-lock.yaml'));
    if (String(lock.lockfileVersion) !== '9.0') throw new Error('unsupported lock schema');
    if (stable(Object.keys(lock.importers || {})) !== '["."]') throw new Error('unsupported workspace importers');
    const modules = assertPath(path.join(profile, 'node_modules'));
    const metadata = readYaml(path.join(modules, '.modules.yaml'));
    if (!['hoisted', 'isolated'].includes(metadata.nodeLinker)) throw new Error('unsupported node linker');
    if (withoutPnpm && listJson !== undefined) throw new Error('ambiguous graph evidence mode');
    if (!withoutPnpm && (!Array.isArray(listJson) || listJson.length !== 1 || path.resolve(listJson[0].path || '') !== profile)) throw new Error('controlled pnpm list JSON required');
    const listed = mapLockOccurrences(lock, manifest, profile, modules, metadata);
    if (!withoutPnpm) {
      const fromList = mapListOccurrences(listJson[0], lock, profile, modules, metadata);
      for (const root of listed.keys()) {
        if (!fromList.has(root)) {
          const missing = [...listed.keys()].filter(r => !fromList.has(r));
          throw new Error(`disk package occurrence missing from pnpm list (total missing: ${missing.length}, first: ${missing[0]}, locator: ${listed.get(missing[0]).locator})`);
        }
      }
      const normalized = map => stable([...map].sort(([a], [b]) => a.localeCompare(b)));
      if (normalized(fromList) !== normalized(listed)) throw new Error('pnpm list/lock occurrence mismatch');
    }
    const owned = new Map();
    for (const [root, occurrence] of listed) {
      const spec = manifest.dependencies?.[occurrence.name];
      let approval = approvedPayloads[occurrence.locator] || approvedPayloads[occurrence.name];
      if (approval) approval = { ...approval, exact: true };
      else if (spec === managedSpec(occurrence.name) && occurrence.locator.includes(spec)) {
        const sourceDir = path.join(profile, spec.slice(5));
        approval = payloadManifest(sourceDir);
        let pkgJson;
        try { pkgJson = readJson(path.join(sourceDir, 'package.json')); } catch {}
        if (!pkgJson?.files) approval = { ...approval, exact: true };
      }
      if (approval) owned.set(root, approval);
    }
    const packageRoots = new Set();
    const topology = [];
    const bins = [];
    const visit = directory => {
      for (const name of fs.readdirSync(directory).sort()) {
        const file = path.join(directory, name);
        const info = fs.lstatSync(file);
        const rel = path.relative(modules, file);
        if (rel.split(path.sep).includes('.bin') && !info.isDirectory()) {
          bins.push({ path: rel, mode: info.mode & 0o777, type: info.isSymbolicLink() ? 'symlink' : 'file',
            value: info.isSymbolicLink() ? fs.readlinkSync(file) : hashFile(file) });
        }
        if (info.isSymbolicLink()) {
          const real = fs.realpathSync(file);
          if (!inside(modules, real)) throw new Error('installation link escapes node_modules');
          topology.push([rel, fs.readlinkSync(file)]);
          continue;
        }
        if (info.isDirectory()) {
          if (fs.existsSync(path.join(file, 'package.json')) && (path.basename(directory) === 'node_modules' || name.startsWith('@') === false && path.basename(directory).startsWith('@'))) {
            packageRoots.add(file);
          }
          visit(file);
        } else if (!info.isFile()) throw new Error('special installation entry');
      }
    };
    visit(modules);
    for (const name of Object.keys(manifest.dependencies || {})) packageRoots.add(resolvePackage(profile, name, modules));
    for (const root of packageRoots) {
      if (listed.has(root)) continue;
      const owner = [...owned].find(([parent, approval]) => inside(parent, root)
        && approval.entries.some(entry => entry.path === path.relative(parent, path.join(root, 'package.json'))));
      if (!owner) throw new Error('disk package occurrence missing from pnpm list');
      packageRoots.delete(root);
    }
    for (const root of listed.keys()) if (!packageRoots.has(root)) throw new Error('listed package missing from disk enumeration');
    const nodes = {};
    const locations = {};
    const counts = new Map();
    for (const root of [...packageRoots].sort()) {
      const occurrence = listed.get(root);
      const payload = occurrencePayload(root, packageRoots, owned.get(root));
      const ordinal = counts.get(occurrence.locator) || 0;
      counts.set(occurrence.locator, ordinal + 1);
      const key = `${occurrence.locator}#${ordinal}`;
      locations[root] = key;
      nodes[key] = { ...occurrence, occurrence: ordinal, payload };
    }
    const edges = [];
    const visibleNames = new Set(Object.values(nodes).map(node => node.name));
    for (const [root, key] of Object.entries(locations)) {
      const pkg = readJson(path.join(root, 'package.json'));
      const declared = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies };
      for (const name of Object.keys(declared).sort()) {
        let destination;
        const snapshot = lock.snapshots[nodes[key].locator];
        const reference = snapshot?.dependencies?.[name] ?? snapshot?.optionalDependencies?.[name];
        let expectedLocator = null;
        if (reference) {
          try { expectedLocator = lockLocator(lock, name, reference); } catch {}
        }
        try {
          if (metadata.nodeLinker === 'hoisted' && expectedLocator && metadata.hoistedLocations?.[expectedLocator]?.length > 0) {
            const resolved = resolvePackage(root, name, modules);
            const locs = metadata.hoistedLocations[expectedLocator];
            if (locs.some(rel => path.resolve(profile, rel) === resolved)) {
              destination = resolved;
            } else {
              const candidates = locs.map(rel => path.resolve(profile, rel));
              const best = candidates.find(candidate => {
                try {
                  const p = readJson(path.join(candidate, 'package.json'));
                  return expectedLocator.startsWith(`${p.name}@`) && (!p.version || expectedLocator.split('(')[0] === `${p.name}@${p.version}` || expectedLocator.includes('@file:'));
                } catch { return false; }
              });
              destination = best || resolved;
            }
          } else {
            destination = resolvePackage(root, name, modules);
          }
        }
        catch (error) {
          if (error.message.startsWith('unresolved dependency:') && (pkg.optionalDependencies?.[name] || pkg.peerDependenciesMeta?.[name]?.optional || pkg.peerDependencies?.[name])) {
            const reference = lock.snapshots[nodes[key].locator]?.optionalDependencies?.[name];
            if (reference) {
              const locator = lockLocator(lock, name, reference);
              const item = lock.packages[locator.split('(')[0]];
              const incompatible = (item.os?.length && !item.os.includes(process.platform) && !item.os.every(value => value.startsWith('!')))
                || item.os?.includes(`!${process.platform}`) || (item.cpu?.length && !item.cpu.includes(process.arch) && !item.cpu.every(value => value.startsWith('!')))
                || item.cpu?.includes(`!${process.arch}`);
              if (!item.optional || !incompatible) throw new Error('optional package absent without platform evidence');
              edges.push([key, name, 'absent-optional']);
              continue;
            } else if (pkg.peerDependencies?.[name]) {
              edges.push([key, name, 'peer-host-provided']);
              continue;
            } else if (!pkg.peerDependenciesMeta?.[name]?.optional) throw new Error('optional dependency absent from lock');
            edges.push([key, name, 'absent-optional']);
            continue;
          }
          throw error;
        }
        if (!locations[destination]) throw new Error('unmapped dependency node');
        if (reference && lockLocator(lock, name, reference) !== nodes[locations[destination]].locator) {
          throw new Error(`lock/disk consumer edge mismatch for key=${key} name=${name} expected=${lockLocator(lock, name, reference)} actual=${nodes[locations[destination]].locator} dest=${destination}`);
        }
        if (!reference && !pkg.peerDependencies?.[name]) throw new Error('declared dependency missing from lock');
        edges.push([key, name, locations[destination], pkg.peerDependencies?.[name] ? 'peer' : 'dependency']);
      }
      // Resolve every installed package name too: hoist/phantom visibility must not drift.
      for (const name of visibleNames) {
        let resolved = null;
        try { resolved = locations[resolvePackage(root, name, modules)] || null; } catch {}
        edges.push([key, `visible:${name}`, resolved]);
      }
    }
    for (const [root, key] of Object.entries(locations)) {
      for (const name of visibleNames) {
        try {
          const destination = resolvePackage(root, name, modules);
          if (locations[destination]) edges.push([key, name, locations[destination], 'visible']);
          else if (!owned.get(root)?.entries.some(entry => entry.path === path.relative(root, path.join(destination, 'package.json')))) throw new Error('unmapped visible dependency');
        } catch (error) {
          if (!error.message.startsWith('unresolved dependency:')) throw error;
        }
      }
    }
    const absent = [];
    const presentLocators = new Set([...listed.values()].map(item => item.locator));
    for (const locator of Object.keys(lock.snapshots || {})) {
      if (presentLocators.has(locator)) continue;
      const item = lock.packages?.[locator.split('(')[0]];
      const supported = (values, actual) => !Array.isArray(values) || (!values.includes(`!${actual}`)
        && (!values.some(value => !value.startsWith('!')) || values.includes(actual)));
      if (!item?.optional || supported(item.os, process.platform) && supported(item.cpu, process.arch)) throw new Error('unexplained absent lock occurrence');
      absent.push({ locator, reason: 'platform-optional', os: item.os || [], cpu: item.cpu || [] });
    }
    const roots = {};
    for (const name of Object.keys(manifest.dependencies || {}).sort()) roots[name] = locations[resolvePackage(profile, name, modules)];
    const protectedTree = payloadManifest(profile, {
      exclude: ['node_modules', 'package.json', 'pnpm-lock.yaml', '.materialize-transactions', '.materialize.lock'], links: true,
    });
    return {
      manifest, lock, metadata, roots, nodes, absent, bins,
      resolutionGraph: [...new Set(edges.map(stable))].sort(), topology,
      raw: { manifest: hash(fs.readFileSync(path.join(profile, 'package.json'))), lock: hash(fs.readFileSync(path.join(profile, 'pnpm-lock.yaml'))) },
      protectedDigests: protectedTree, fullInstall: payloadManifest(modules, { links: true }).digest,
    };
  }

  compare(before, candidate, request) {
    const expected = structuredClone(before.manifest);
    expected.dependencies[request.name] = managedSpec(request.name);
    if (stable(expected) !== stable(candidate.manifest)) throw new Error('non-target manifest drift');
    if (request.transition) {
      compareTransitionGraphs(before, candidate, request);
      compareLocks(before.lock, candidate.lock, request);
      return;
    }
    const canonical = state => {
      const root = state.lock.importers['.'].dependencies[request.name].version.split('(')[0];
      const normalize = value => typeof value === 'string' ? value.split(root).join('<target>')
        : Array.isArray(value) ? value.map(normalize)
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [normalize(key), normalize(item)])) : value;
      const nodes = structuredClone(state.nodes);
      for (const node of Object.values(nodes)) {
        if (node.name === request.name) node.integrity = null;
        if (node.payload) {
          for (const entry of node.payload.entries || []) entry.mode = null;
          node.payload.digest = null;
        }
      }
      return stable(normalize({ nodes, roots: state.roots, edges: state.resolutionGraph.map(JSON.parse), absent: state.absent, bins: state.bins }));
    };
    if (canonical(before) !== canonical(candidate)) throw new Error('installed payload or resolution graph drift');
    compareLocks(before.lock, candidate.lock, request);
  }

  assertRelocatable(candidate) {
    const serialized = stable(candidate.lock);
    if (serialized.includes(this.profile) || /file:(?!\.materialize-snapshots\/plugins\/)/.test(serialized)
        || /link:/.test(serialized)) throw new Error('non-relocatable lock');
    for (const [, link] of candidate.topology) if (path.isAbsolute(link)) throw new Error('absolute installation link');
  }
}

/** Compare a single approved occurrence without rewriting unrelated strings. */
function compareTransitionGraphs(before, after, request) {
  const project = (state, approved) => {
    const key = state.roots[request.name];
    const target = state.nodes[key];
    if (!target || Object.values(state.nodes).filter(node => node.name === request.name).length !== 1
        || target.version !== approved.version || target.payload.digest !== approved.payloadDigest) {
      throw new Error('transition target occurrence or payload mismatch');
    }
    const mapKey = value => value === key ? '<target>' : value;
    const nodes = Object.fromEntries(Object.entries(state.nodes).map(([id, node]) => [mapKey(id), id === key
      ? { ...node, locator: '<target>', version: '<approved>', integrity: null, payload: '<approved>' } : node]));
    return stable({ nodes, roots: Object.fromEntries(Object.entries(state.roots).map(([name, id]) => [name, mapKey(id)])),
      edges: state.resolutionGraph.map(value => JSON.parse(value).map(mapKey)).map(stable).sort(),
      absent: state.absent, bins: state.bins, topology: state.topology });
  };
  if (project(before, request.transition.before) !== project(after, request.transition.after)) {
    throw new Error('transition non-target payload or resolution drift');
  }
}

/** Allow only the target locator change; preserve every peer context and edge. */
export function compareLocks(before, after, request) {
  const a = structuredClone(before);
  const b = structuredClone(after);
  if (request.transition) {
    const spec = managedSpec(request.name);
    for (const [lock, approved] of [[a, request.transition.before], [b, request.transition.after]]) {
      const root = lock.importers?.['.']?.dependencies?.[request.name];
      if (root?.specifier !== spec || typeof root.version !== 'string') throw new Error('transition managed importer required');
      const keys = Object.keys(lock.packages || {}).filter(key => key === `${request.name}@${spec}` || key === spec);
      if (keys.length !== 1) throw new Error('ambiguous transition lock occurrence');
      const item = lock.packages[keys[0]];
      if (item.version !== undefined && item.version !== approved.version
          || stable(item.peerDependencies || {}) !== stable(approved.peerDependencies || {})) {
        throw new Error('transition lock identity mismatch');
      }
      item.version = '<approved>';
      item.peerDependencies = '<approved>';
    }
    if (stable(a) !== stable(b)) throw new Error('transition lock nodes or dependency edges drift');
    return;
  }
  const oldRoot = a.importers?.['.']?.dependencies?.[request.name];
  const newRoot = b.importers?.['.']?.dependencies?.[request.name];
  if (!oldRoot || !newRoot || newRoot.specifier !== managedSpec(request.name)) throw new Error('target importer mismatch');
  const oldLocator = oldRoot.version;
  const newLocator = newRoot.version;
  const oldBase = oldLocator.split('(')[0];
  const newBase = newLocator.split('(')[0];
  if (oldLocator.slice(oldBase.length) !== newLocator.slice(newBase.length)) throw new Error('target peer context drift');
  const normalize = (lock, locator) => {
    lock.importers['.'].dependencies[request.name] = { specifier: '<target>', version: '<target>' };
    for (const section of ['packages', 'snapshots']) {
      const table = lock[section] || {};
      for (const key of Object.keys(table)) {
        const targetKey = `${request.name}@${locator}`;
        if (key === locator || key.startsWith(`${locator}(`) || key === targetKey || key.startsWith(`${targetKey}(`)) {
          const value = table[key];
          if (section === 'packages') {
            // Payload comparison verifies equivalent content when directory locators omit integrity.
            if (value.version && value.version !== request.version) throw new Error('target lock version mismatch');
            delete value.resolution;
            delete value.version;
          }
          delete table[key];
          table[`<target>${key.slice(key.startsWith(targetKey) ? targetKey.length : locator.length)}`] = value;
        }
      }
    }
    return stable(lock).split(locator).join('<target>');
  };
  if (normalize(a, oldBase) !== normalize(b, newBase)) throw new Error('lock nodes or dependency edges drift');
}

/** Reject source redirects in allowed resolution settings without changing semver rules. */
export function validateConfigurationSources(workspace, manifest = {}) {
  const visit = (value, references = new Set()) => {
    if (typeof value === 'string') {
      if (value.startsWith('$')) {
        const name = value.slice(1);
        const specifier = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] ?? manifest.optionalDependencies?.[name];
        if (typeof specifier !== 'string' || references.has(name)) throw new Error('unapproved configuration dependency reference');
        visit(specifier, new Set([...references, name]));
        return;
      }
      // Scoped names/references are not git shorthands or filesystem paths.
      const scopedName = /^\$?@[a-z0-9._*-]+\/[a-z0-9._*-]+$/i.test(value);
      if (/[a-z][a-z0-9+.-]*:/i.test(value) || /[/\\\\]/.test(value) && !scopedName || /^\s*\./.test(value)) {
        throw new Error('unapproved configuration dependency source');
      }
    } else if (Array.isArray(value)) value.forEach(item => visit(item, references));
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        // Scoped package selectors contain '/', but protocol-bearing keys can redirect too.
        if (/[a-z][a-z0-9+.-]*:/i.test(key)) throw new Error('unapproved configuration dependency source');
        visit(item);
      }
    }
  };
  for (const key of ['overrides', 'peerDependencyRules']) visit(workspace[key]);
}

/** Return a supported non-secret workspace configuration; fail on executable hooks. */
export function candidateConfig(profile) {
  const workspace = readYaml(path.join(profile, 'pnpm-workspace.yaml'));
  const allowed = new Set(['packages', 'nodeLinker', 'hoist', 'hoistPattern', 'publicHoistPattern', 'shamefullyHoist',
    'autoInstallPeers', 'strictPeerDependencies', 'resolvePeersFromWorkspaceRoot', 'dedupePeerDependents',
    'overrides', 'peerDependencyRules', 'onlyBuiltDependencies', 'ignoredBuiltDependencies', 'allowBuilds', 'minimumReleaseAge']);
  if (!workspace || Object.keys(workspace).some(key => !allowed.has(key))) throw new Error('unsupported workspace configuration');
  if (workspace.packages && stable(workspace.packages) !== '["."]') throw new Error('workspace escapes candidate');
  if (['.pnpmfile.cjs', 'pnpmfile.cjs'].some(name => fs.existsSync(path.join(profile, name)))) throw new Error('pnpm config hook forbidden');
  const npmrc = path.join(profile, '.npmrc');
  const config = {};
  if (fs.existsSync(npmrc)) {
    for (const line of fs.readFileSync(npmrc, 'utf8').split('\n')) {
      if (!line.trim() || /^\s*[#;]/.test(line)) continue;
      const pair = /^([a-z-]+)=(.*)$/.exec(line.trim());
      if (!pair) throw new Error('unsupported npmrc configuration');
      if (pair[1] === 'store-dir') continue;
      if (!['node-linker', 'hoist', 'shamefully-hoist', 'auto-install-peers', 'strict-peer-dependencies'].includes(pair[1])) throw new Error('unsupported npmrc configuration');
      if (!/^(true|false|hoisted|isolated)$/.test(pair[2])) throw new Error('unsupported npmrc value');
      config[pair[1]] = pair[2];
    }
  }
  return { workspace, config };
}
