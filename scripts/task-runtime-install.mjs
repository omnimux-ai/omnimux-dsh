import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile, stable } from './materialize-graph.mjs';
import { captureCandidate } from './evidence-contract.mjs';
import { privatePnpmEnvironment } from './materialize-cache.mjs';
import { runPnpm } from './managed-tarball.mjs';
import semver from 'semver';
import { createRequire } from 'node:module';

const fail = code => { throw Object.assign(new Error(`TEST_ENV_${code}`), { code: `TEST_ENV_${code}` }); };
const failDetail = (code, detail) => { throw Object.assign(new Error(`TEST_ENV_${code}: ${detail}`), { code: `TEST_ENV_${code}`, detail }); };
const inside = (root, path) => path === root || path.startsWith(root + sep);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * Single source of truth for the optional sidebar support package (Issue #3766).
 *
 * The sidebar ships from the shipping shell fork's preset build, so this repository only records
 * the identity it must agree with: version, upstream revision, and the shipped build it was
 * verified against. Nothing here may fall back to a dev-machine path.
 */
export function readSidebarSupportIdentity() {
  try {
    return json(join(scriptDirectory, 'sidebar-support-identity.json'));
  } catch {
    // Missing or unparsable identity is a coded failure, never a silent fallback to a literal.
    fail('INSTALL_SUPPORT_IDENTITY_REQUIRED');
  }
}

/** Reject any support package that is not the identity's package at the identity's version. */
export function assertSidebarSupportIdentity(manifest, identity = readSidebarSupportIdentity()) {
  if (!manifest || manifest.name !== identity.name || manifest.version !== identity.version) fail('INSTALL_SUPPORT_REQUIRED');
  return manifest;
}

export function matchesTaskPeerVersion(version, spec) {
  if (typeof spec !== 'string' || !semver.validRange(spec)) return false;
  const includesPrereleaseBound = /\d+\.\d+\.\d+-[0-9A-Za-z]/.test(spec);
  return semver.satisfies(version, spec, { includePrerelease: includesPrereleaseBound });
}

// ---------------------------------------------------------------- 精确版本豁免（宿主 compatibility.json）

/**
 * The host's own profile-local exemption file name (`PROFILE_COMPATIBILITY_FILENAME`).
 *
 * Exemptions live in the profile's `compatibility.json`, never in its `package.json`; the host
 * reads it before any Cordis plugin loads, both for `dsh plugin add` preflight and for profile
 * bundle admission. Verified against `lib/types/profile-compatibility.js` inside both
 * `DeepSeek Harness.app` and `OmniMux Dev.app`.
 */
const PROFILE_COMPATIBILITY_FILENAME = 'compatibility.json';

/** A declared peer exemption must be re-reviewed at least this often, in days. */
export const SUPPORT_EXEMPTION_REVIEW_WINDOW_DAYS = 90;

/** Published and scoped npm package names, exactly as the host accepts them in an exemption key. */
const EXEMPTION_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/**
 * Whether a value is the canonical exact semver the host accepts as an exemption identity.
 * Ranges, prefixes, whitespace and build-metadata drift are all rejected, mirroring the host's
 * `isExactPluginVersion`.
 */
export function isExactPluginVersion(value) {
  return typeof value === 'string' && semver.valid(value) === value;
}

/** Whether a value is an npm package name an exemption key may carry. */
export function isExemptionPackageName(value) {
  return typeof value === 'string' && EXEMPTION_PACKAGE_NAME.test(value);
}

/** The exact `package@version` key the host looks up, or null when either half is not canonical. */
export function exemptionKey(name, version) {
  return isExemptionPackageName(name) && isExactPluginVersion(version) ? `${name}@${version}` : null;
}

/** Whether a declaration carries a real `YYYY-MM-DD` review date. */
export function isReviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Whether a declared review date is still inside the agreed re-review window. */
export function isReviewFresh(reviewedAt, now = new Date(), windowDays = SUPPORT_EXEMPTION_REVIEW_WINDOW_DAYS) {
  const age = now.getTime() - Date.parse(`${reviewedAt}T00:00:00.000Z`);
  return Number.isFinite(age) && age >= 0 && age <= windowDays * 86400000;
}

/**
 * Declared exact-version exemptions from the identity file.
 *
 * The declaration is the only place an exemption may come from. A missing list authorizes nothing;
 * a malformed one is a coded failure rather than a silently dropped record, because dropping it
 * would turn an explicit decision into an invisible one.
 */
export function readSupportPeerExemptions(identity = readSidebarSupportIdentity()) {
  const rows = identity.peerExemptions;
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', 'peerExemptions must be a list');
  return rows.map((row, index) => {
    const at = `peerExemptions[${index}]`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', `${at} must be an object`);
    if (!isExemptionPackageName(row.package)) failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', `${at}.package must be an exact npm package name`);
    if (!isExactPluginVersion(row.version)) failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', `${at}.version must be an exact semver, not a range`);
    if (!isExactPluginVersion(row.hostSpec)) failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', `${at}.hostSpec must be an exact semver, not a range`);
    if (typeof row.reason !== 'string' || row.reason.trim() === '') failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', `${at}.reason must record why the risk was accepted`);
    if (!isReviewDate(row.reviewedAt)) failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', `${at}.reviewedAt must be a real YYYY-MM-DD date`);
    return { package: row.package, version: row.version, hostSpec: row.hostSpec, reason: row.reason.trim(), reviewedAt: row.reviewedAt };
  });
}

/** Whether a declared range admits the running host, mirroring the host's own `satisfies` helper. */
function hostSatisfies(hostVersion, range) {
  return typeof range === 'string' && range.trim() !== '' && semver.satisfies(hostVersion, range, { includePrerelease: true });
}

/**
 * Host requirements a manifest leaves unmet, mirroring the host's own rule: `engines.dsh` decides
 * alone when present, otherwise every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer must admit the
 * running generation with prereleases participating.
 */
export function unmetHostRequirements(manifest, hostVersion) {
  const engines = manifest?.engines;
  if (engines && typeof engines === 'object' && !Array.isArray(engines) && Object.hasOwn(engines, 'dsh')) {
    return hostSatisfies(hostVersion, engines.dsh) ? {} : { 'engines.dsh': String(engines.dsh) };
  }
  const peers = manifest?.peerDependencies;
  if (!peers || typeof peers !== 'object' || Array.isArray(peers)) return {};
  const unmet = {};
  for (const [name, range] of Object.entries(peers)) {
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue;
    if (!hostSatisfies(hostVersion, range)) unmet[name] = range;
  }
  return unmet;
}

/**
 * What the identity authorizes for one admitted support manifest on one host generation.
 *
 * @returns {{ status: 'not-needed' | 'undeclared' | 'stale' | 'expired' | 'granted', key?: string,
 *   row?: object, unmet?: object, detail?: string }}
 */
export function supportPeerExemptionDecision({ manifest, hostVersion, exemptions, now = new Date() }) {
  const unmet = unmetHostRequirements(manifest, hostVersion);
  if (Object.keys(unmet).length === 0) return { status: 'not-needed' };
  const key = exemptionKey(manifest?.name, manifest?.version);
  if (key === null) failDetail('INSTALL_SUPPORT_EXEMPTION_INVALID', 'the support manifest has no exact package-name@version identity to exempt');
  const row = exemptions.find(item => item.package === manifest.name && item.version === manifest.version);
  if (row === undefined) return { status: 'undeclared', key, unmet };
  if (row.hostSpec !== hostVersion) return { status: 'stale', key, row, unmet, detail: `declared for dsh ${row.hostSpec}, running dsh ${hostVersion}` };
  if (!isReviewFresh(row.reviewedAt, now)) return { status: 'expired', key, row, unmet, detail: `reviewed ${row.reviewedAt}, outside the ${SUPPORT_EXEMPTION_REVIEW_WINDOW_DAYS}-day window` };
  return { status: 'granted', key, row, unmet };
}

/**
 * Write the profile-local `compatibility.json` the host reads, granting only the exemptions the
 * identity explicitly declares for this exact host generation.
 *
 * Every manifest is re-asserted against the identity first, so this path cannot mint a permission
 * for anything but the declared support package; identity, archive and byte checks stay untouched.
 * A missing declaration writes nothing and returns a loud warning instead of a silent grant.
 */
export function applySupportPeerExemptions({ profile, manifests, hostVersion, identity = readSidebarSupportIdentity(), now = new Date() }) {
  if (!isExactPluginVersion(hostVersion)) failDetail('INSTALL_HOST_GENERATION_REQUIRED', `host generation ${JSON.stringify(hostVersion)} is not an exact semver`);
  const exemptions = readSupportPeerExemptions(identity);
  const grants = {}, applied = [], warnings = [];
  for (const manifest of manifests) {
    assertSidebarSupportIdentity(manifest, identity);
    const decision = supportPeerExemptionDecision({ manifest, hostVersion, exemptions, now });
    if (decision.status === 'not-needed') continue;
    if (decision.status === 'stale' || decision.status === 'expired') {
      failDetail('INSTALL_SUPPORT_EXEMPTION_STALE', `${decision.key} is declared but does not cover this host (${decision.detail}); `
        + 're-review scripts/sidebar-support-identity.json peerExemptions instead of falling back silently');
    }
    if (decision.status === 'undeclared') {
      warnings.push({ code: 'support_exemption_undeclared', package: manifest.name, version: manifest.version, unmet: decision.unmet,
        detail: `${decision.key} has unmet host requirements on dsh ${hostVersion} and no declared exemption; the host will refuse it` });
      continue;
    }
    grants[decision.key] = [hostVersion];
    applied.push({ key: decision.key, hostSpec: hostVersion, reason: decision.row.reason, reviewedAt: decision.row.reviewedAt });
  }
  if (applied.length === 0) return { hostVersion, filename: null, sha256: null, grants, applied, warnings };
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
  const filename = join(profile, PROFILE_COMPATIBILITY_FILENAME);
  if (fs.existsSync(filename)) failDetail('INSTALL_SUPPORT_EXEMPTION_CONFLICT', `${filename} already exists; refusing to overwrite a decision this installer did not write`);
  fs.writeFileSync(filename, JSON.stringify(grants, undefined, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { hostVersion, filename, sha256: hashFile(filename), grants, applied, warnings };
}

/** `<App>/Contents/Resources` reached from the launcher wrapper, or null when the layout differs. */
function appResourcesDirectory(wrapper) {
  let directory = dirname(wrapper);
  for (let depth = 0; depth < 4; depth += 1) {
    if (basename(directory) === 'Resources' && fs.existsSync(join(directory, 'build-info.json'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
  return null;
}

/**
 * The DSH runtime version this host itself enforces, read from the host instead of restated here.
 *
 * `dsh --version` is documented as the runtime version the launcher checks, and
 * `getDshRuntimeVersion()` reads `@deepseek-ai/dsh-app-boot`'s own version, so the launcher's own
 * answer is the key the host will look up. When the bundle also ships `build-info.json`, its
 * `dsh.packageSpec` must agree; a mismatch fails instead of minting a wrong exemption key.
 */
export function readHostRuntimeVersion({ executable, wrapper, env, run = spawnSync, timeoutMs = 30000 }) {
  const result = run(executable, ['--expose-internals', wrapper, '--version'], { cwd: env.HOME, env, encoding: 'utf8', timeout: timeoutMs });
  if (result.error || result.status !== 0) failDetail('INSTALL_HOST_GENERATION_REQUIRED', `dsh --version failed (${result.error?.code ?? `exit-${result.status}`})`);
  const version = String(result.stdout ?? '').trim();
  if (!isExactPluginVersion(version)) failDetail('INSTALL_HOST_GENERATION_REQUIRED', `dsh --version printed ${JSON.stringify(version)}, not an exact semver`);
  const resources = appResourcesDirectory(wrapper);
  if (resources !== null) {
    let declared = null;
    try {
      const spec = JSON.parse(fs.readFileSync(join(resources, 'build-info.json'), 'utf8'))?.dsh?.packageSpec;
      declared = typeof spec === 'string' && spec.trim() !== '' ? spec.trim() : null;
    } catch {
      // An unreadable build record is not a generation: the launcher's own answer stands alone.
      declared = null;
    }
    if (declared !== null && declared !== version) failDetail('INSTALL_HOST_GENERATION_MISMATCH', `build-info.json declares ${declared} but dsh --version reports ${version}`);
  }
  return version;
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
    const record = { name: original.name, version: original.version, source, target, manifest: original, dependencies: [], peers: original.peerDependencies || {}, peerMeta: original.peerDependenciesMeta || {}, archive: item.archive };
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
        else if (!semver.satisfies(dependencyManifest.version, spec)) {
          // Packages that declare the same name as both a dependency and a peer (the common
          // three.js ecosystem pattern) are resolved by pnpm through the peer injection. Keep the
          // dependency honest only when the package's own peer range accepts that exact version.
          const peerSpec = original.peerDependencies?.[name];
          if (typeof peerSpec !== 'string' || !semver.validRange(peerSpec)
            || !semver.satisfies(dependencyManifest.version, peerSpec)) fail('INSTALL_DEPENDENCY_SPEC_MISMATCH');
          record.dependencySpecExceptions ??= [];
          record.dependencySpecExceptions.push({ name, declared: spec, resolved: dependencyManifest.version, acceptedByPeer: peerSpec });
        }
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
  // The packaged host does not ship the optional sidebar seam; first-party workbench plugins
  // (assets, workflow) register their tabs through ctx.inject(['betterSidebar']), so the
  // reviewed support package must be installed whenever any of them is part of the task graph.
  // The accepted identity comes from scripts/sidebar-support-identity.json, never a literal here.
  if (['omnimux-assets', 'omnimux-workflow'].some(name => byName.has(name))) {
    const source = join(root, 'plugins/omnimux-studio/node_modules/dsh-better-sidebar');
    if (!fs.existsSync(join(source, 'package.json'))) fail('INSTALL_SUPPORT_REQUIRED');
    const actual = fs.realpathSync(source), manifest = json(join(actual, 'package.json'));
    assertSidebarSupportIdentity(manifest);
    support.push(visit({ source: actual, resolveRoot: actual }));
  }
  const peerSupport = [];
  // The packaged host supplies React but has no Node react-dom package. This one
  // admitted pure-library support is copied locally; it is never a plugin bundle.
  const needsReactDOM = [...records.values()].some(parent => typeof parent.peers['react-dom'] === 'string'
    && ![...records.values()].some(item => item.name === 'react-dom' && matchesTaskPeerVersion(item.version, parent.peers['react-dom'])));
  if (needsReactDOM) {
    const source = join(root, 'node_modules/react-dom');
    if (!fs.existsSync(join(source, 'package.json'))) fail('INSTALL_PEER_SUPPORT_REQUIRED');
    const actual = fs.realpathSync(source), manifest = json(join(actual, 'package.json'));
    if (manifest.name !== 'react-dom' || manifest.version !== '18.3.1') fail('INSTALL_PEER_SUPPORT_REQUIRED');
    peerSupport.push(visit({ source: actual, resolveRoot: actual }));
  }
  return { targets, support, peerSupport, records: [...records.values()] };
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
  // The task profile gets exactly the exact-version exemptions the identity declares for the
  // running host generation. Without a declaration nothing is written, so the host's own
  // compatibility refusal ends the install instead of a silent grant; the generation itself is
  // read from the host that will enforce it, never from a literal here.
  const profile = join(env.DSH_HOME, 'profiles', 'web');
  let supportPeerExemption = { hostVersion: null, filename: null, sha256: null, grants: {}, applied: [], warnings: [] };
  if (graph.support.length > 0) {
    const hostVersion = readHostRuntimeVersion({ executable, wrapper, env: installEnv });
    supportPeerExemption = applySupportPeerExemptions({ profile, manifests: graph.support.map(item => item.manifest), hostVersion });
    for (const warning of supportPeerExemption.warnings) process.stderr.write(`dsh: ${warning.code}: ${warning.detail}\n`);
  }
  const result = await runPnpm(['plugin', '--profile', 'web', 'add', ...topLevel.map(item => item.target), '--ignore-scripts', '--offline', '--prod', '--config.auto-install-peers=false', '--config.strict-peer-dependencies=false', `--store-dir=${installEnv.npm_config_store_dir}`],
    { cwd: installEnv.HOME, env: installEnv, executable: installCommand, timeoutMs: 120000, maxOutput: 8 << 20 });
  if (result.code !== 0 || result.signal) {
    const error = Object.assign(new Error('TEST_ENV_INSTALL_FAILED'), { code: 'TEST_ENV_INSTALL_FAILED', rootReason: `exit-${result.code}` });
    // Fixed configuration contains no credentials; retain only the tail of installer diagnostics.
    error.installDiagnostic = ((result.stdout || '') + '\n' + (result.stderr || '')).slice(-8000);
    throw error;
  }
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
      ...(graph.peerSupport.includes(item) ? { role: 'local-peer-support' } : {}),
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
    ownerIdentity, hostPeerExpectations, supportPeerExemption, runtimeExecutable: executable, runtimeExecutableSha256: hashFile(executable), appAnchor: resolve(dirname(wrapper), '../node_modules/@deepseek-ai/dsh/package.json'),
    base: before.base.resolvedSha, head: before.head.resolvedSha, candidateDigest: before.candidate.contentDigest, inputsDigest: before.inputs.contentDigest, packages };
  const assertInstalledIntegrity = () => {
    const identity = fs.statSync(privateRoot, { bigint: true });
    if (fs.lstatSync(privateRoot).isSymbolicLink() || fs.realpathSync(privateRoot) !== privateRoot
      || String(identity.dev) !== ownerIdentity[0] || String(identity.ino) !== ownerIdentity[1]) fail('INSTALL_LOCATION_UNSAFE');
    if (fs.realpathSync(executable) !== executable || hashFile(executable) !== installation.runtimeExecutableSha256) fail('INSTALL_RUNTIME_CHANGED');
    const now = captureCandidate({ root, ...candidate, ...evidenceContext });
    if (now.candidate.contentDigest !== installation.candidateDigest || now.inputs.contentDigest !== installation.inputsDigest || now.head.resolvedSha !== installation.head) fail('INSTALL_CANDIDATE_CHANGED');
    const registry = json(join(profile, 'package.json'));
    if (stable(registry.dsh?.profile?.bundles?.slice().sort()) !== stable(requiredBundles)) fail('INSTALL_REGISTRATION_MISSING');
    for (const item of packages) {
      if (stable(taskPackagePayload(item.installedRoot)) !== stable(item.payload)) fail('INSTALL_BYTES_MISMATCH');
    }
    for (const item of topLevel) if (fs.realpathSync(join(profile, 'node_modules', item.name)) !== item.target) fail('INSTALL_LOCATION_UNSAFE');
    // An exemption is a profile-local decision the host reads at every composition: it must be the
    // exact file this installer wrote, not one the installation rewrote behind its back.
    const exemption = installation.supportPeerExemption;
    if (exemption?.filename && (fs.lstatSync(exemption.filename).isSymbolicLink() || hashFile(exemption.filename) !== exemption.sha256)) fail('INSTALL_SUPPORT_EXEMPTION_CHANGED');
    if (installation.peerProbe) {
      const probe = installation.peerProbe;
      if (probe.path !== join(profile, 'task-peer-probe.mjs') || fs.lstatSync(probe.path).isSymbolicLink() || hashFile(probe.path) !== probe.sha256) fail('INSTALL_BYTES_MISMATCH');
    }
    for (const item of graph.records) for (const dependency of item.dependencies) {
      if (fs.realpathSync(join(item.target, 'node_modules', dependency.name)) !== dependency.target) fail('INSTALL_DEPENDENCY_IDENTITY');
    }
    return installation;
  };
  assertInstalledIntegrity();
  return { installation, assertInstalledIntegrity };
}
