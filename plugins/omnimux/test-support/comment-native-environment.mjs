// Issue #3043 test-environment assembler for the native comment E2E.
//
// Goals enforced here (specs/host-e2e-environment-3043.spec.md):
// - Every assembled input comes from the task-private temp directory or from
//   declared, readable dependency paths — never a user profile, never
//   ~/.omnimux-dev, never a guessed default.
// - Plugin builds run against a private copy of the real plugin sources: the
//   shared builders are reused unchanged (no copied build logic) but write
//   lib/ inside the staging copy only, so concurrent runs and sibling
//   worktrees never race on plugins/*/lib.
// - The sidebar bridge resolves to the version declared in this workspace's
//   dependency graph (omnimux-studio's `dsh-better-sidebar` package dep via
//   the pnpm importer), or to an explicit OMNIMUX_E2E_SIDEBAR path. If a
//   patched sidebar is required, the caller must name it explicitly; its
//   content hash is recorded so the installed input is auditable.
//
// The module is a pure library: it touches the filesystem only inside the
// `staging` directory the caller hands in, plus read-only resolution of
// declared dependencies. Host/CLI resolution is an explicit-input contract:
// `OMNIMUX_E2E_EXECUTABLE` and `OMNIMUX_E2E_CLI` override everything; without
// them the app-dir convention under /Applications is *verified* (readable +
// version read), not assumed, and any miss fails with a readable error that
// names the override variables.

import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, realpath, stat, symlink, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';

/** SHA-256 of one file, as `sha256:<hex>`; fails loudly on unreadable input. */
export async function hashFile(path) {
  return `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
}

/**
 * SHA-256 over a directory tree, sorted for determinism. Symlinks hash as
 * their (read-only) target bytes so a pnpm store copy is fingerprinted the
 * same as a real copy.
 */
export async function hashTree(path) {
  const hash = createHash('sha256');
  const walk = async dir => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const full = join(dir, entry.name);
      hash.update(entry.name + '\0');
      if (entry.isSymbolicLink()) {
        const target = await realpath(full);
        if ((await stat(target)).isDirectory()) {
          hash.update('L' + target + '\0');
          await walk(target);
        } else {
          hash.update('F' + await hashFile(target));
        }
        continue;
      }
      if (entry.isDirectory()) { hash.update('D'); await walk(full); continue; }
      hash.update('F' + await hashFile(full));
    }
  };
  await walk(path);
  return `sha256:${hash.digest('hex')}`;
}

export class EnvironmentError extends Error {}

async function readableFile(path, what, mode = constants.R_OK) {
  // CLI entries may live inside an Electron asar archive; the OS cannot see
  // the inner path, so check the readable archive file instead.
  const asarAt = path.indexOf('.asar/');
  const target = asarAt >= 0 ? path.slice(0, asarAt + 5) : path;
  try {
    await access(target, mode);
  } catch {
    throw new EnvironmentError(`${what} is not readable: ${path}`);
  }
}

/**
 * Resolve the official host executable + embedded CLI.
 * Order: OMNIMUX_E2E_EXECUTABLE / OMNIMUX_E2E_CLI (explicit overrides) → the
 * standard OmniMux Dev app bundle, which must actually exist. Anything else
 * fails with a readable message; there is no user-profile fallback.
 */
export async function resolveHost(root, env = process.env) {
  const executable = env.OMNIMUX_E2E_EXECUTABLE || '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
  const cli = env.OMNIMUX_E2E_CLI || '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/lib/desktop-cli.js';
  await readableFile(executable, 'host executable (set OMNIMUX_E2E_EXECUTABLE to override)', constants.R_OK | constants.X_OK);
  await readableFile(cli, 'host CLI entry (set OMNIMUX_E2E_CLI to override)');
  // Report the shipped host version from the app bundle's Info.plist (public
  // product surface, no credentials); asar-internal package.json is not
  // visible to fs, so 'unknown' is reported rather than guessed.
  let version = 'unknown';
  try {
    const plist = await readFile(resolve(executable, '../../Info.plist'), 'utf8');
    const match = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
    if (match) version = match[1];
  } catch { /* version stays 'unknown' */ }
  return { executable: resolve(executable), cli: resolve(cli), version };
}

/**
 * Resolve the sidebar bridge package:
 *  1. OMNIMUX_E2E_SIDEBAR — required whenever a *patched* sidebar is needed;
 *     the env var is mandatory in that case, never a default.
 *  2. The `dsh-better-sidebar` version declared in this workspace's
 *     dependency graph. Importer scanning reads plugin package.json manifests only
 *     and resolves through the real dependency links (pnpm store), so the
 *     bridge is the declared 0.18.x artifact, not a shared profile snapshot.
 * Fails (readable error, names the env var) when neither resolves.
 */
/** x.y.z 三个数字的精确相等；不带 semver 库的范围内最小校验。 */
function exactVersionSatisfies(installed, declared) {
  return String(declared).trim() === installed;
}

export async function resolveSidebarBridge(root, env = process.env) {
  if (env.OMNIMUX_E2E_SIDEBAR) {
    const dir = resolve(env.OMNIMUX_E2E_SIDEBAR);
    await readableFile(join(dir, 'package.json'), 'OMNIMUX_E2E_SIDEBAR package');
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    if (pkg.name !== 'dsh-better-sidebar') throw new EnvironmentError('OMNIMUX_E2E_SIDEBAR must name the formal dsh-better-sidebar package');
    return { dir, version: pkg.version || 'unknown', source: 'env', hash: await hashTree(dir) };
  }
  // Find the importer that declares dsh-better-sidebar: read plugins'
  // package.json manifests only (no user data, no profile).
  const pluginsDir = join(root, 'plugins');
  let declaredBy = null;
  let wanted = null;
  for (const entry of await readdir(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(pluginsDir, entry.name, 'package.json');
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { continue; }
    const declared = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}), ...(manifest.peerDependencies || {}) };
    if (!('dsh-better-sidebar' in declared)) continue;
    declaredBy = `plugins/${entry.name}@${declared['dsh-better-sidebar']}`;
    wanted = String(declared['dsh-better-sidebar']);
    // Prefer the importer's own node_modules link when it exists (worktrees
    // may lack per-plugin links while sharing the root store).
    try {
      const require = createRequire(manifestPath);
      const dir = dirname(require.resolve('dsh-better-sidebar/package.json'));
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      return { dir, version: pkg.version || 'unknown', declaredBy, source: 'declared-dependency', hash: await hashTree(dir) };
    } catch { /* fall through to the shared store probe below */ }
    break;
  }
  if (!declaredBy) {
    throw new EnvironmentError(
      'sidebar bridge not found: no workspace plugin declares dsh-better-sidebar. ' +
      'Install it as a declared dependency or pass OMNIMUX_E2E_SIDEBAR=<dir> explicitly.'
    );
  }
  // pnpm public store probe: root/node_modules may itself be a symlink into a
  // shared checkout — resolved read-only, never installed or written.
  const storeDir = join(root, 'node_modules', '.pnpm', 'node_modules', 'dsh-better-sidebar');
  try {
    const pkg = JSON.parse(await readFile(join(storeDir, 'package.json'), 'utf8'));
    const realDir = await realpath(storeDir);
    if (wanted && !exactVersionSatisfies(pkg.version, wanted)) {
      throw new EnvironmentError(
        `declared sidebar ${wanted} (${declaredBy}) does not match installed ${pkg.version}; ` +
        'declare the right version or pass OMNIMUX_E2E_SIDEBAR=<dir> explicitly.'
      );
    }
    return { dir: realDir, version: pkg.version || 'unknown', declaredBy, source: 'declared-dependency', hash: await hashTree(realDir) };
  } catch (error) {
    if (error instanceof EnvironmentError) throw error;
    throw new EnvironmentError(
      `sidebar bridge declared by ${declaredBy} but not materialized in the shared store; ` +
      'run the dependency install or pass OMNIMUX_E2E_SIDEBAR=<dir> explicitly.'
    );
  }
}

/**
 * Link one plugin's real node_modules *entries* into a private staging dir:
 * the staging node_modules is a real directory whose entries are symlinks to
 * the workspace's existing links (pnpm store targets stay read-only). A whole
 * -dir symlink is avoided so `plugin add` never treats shared state as part of
 * the staged package; no install runs and nothing in the store is written.
 */
async function linkNodeModules(srcDir, dstDir) {
  const srcNm = join(srcDir, 'node_modules');
  const dstNm = join(dstDir, 'node_modules');
  let entries;
  try { entries = await readdir(srcNm, { withFileTypes: true }); }
  catch { return; }
  await mkdir(dstNm, { recursive: true });
  for (const entry of entries) {
    const dst = join(dstNm, entry.name);
    const src = join(srcNm, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink() && entry.name.startsWith('@')) {
      await mkdir(dst, { recursive: true });
      for (const sub of await readdir(src)) {
        await symlink(join(src, sub), join(dst, sub)).catch(e => { if (e.code !== 'EEXIST') throw e; });
      }
      continue;
    }
    await symlink(src, dst).catch(e => { if (e.code !== 'EEXIST') throw e; });
  }
}

/**
 * Copy the real plugin sources needed by the shared builders into a private
 * staging tree. No build logic is duplicated: the copied build scripts are
 * byte-identical to the official ones and are executed in place, so
 * `import.meta.url`-relative outputs land inside the private tree only.
 * Sibling plugin dirs are symlinked read-only because the hub bundle resolves
 * cross-plugin relative imports (e.g. omnimux-inspiration, omnimux-market,
 * omnimux-workflow sources) at build time.
 */
export async function stagePlugins(root, staging, sidebar) {
  const pluginsDir = join(staging, 'plugins');
  await mkdir(pluginsDir, { recursive: true });

  const stageOne = async (name, entries) => {
    const srcDir = join(root, 'plugins', name);
    const dstDir = join(pluginsDir, name);
    await mkdir(dstDir, { recursive: true });
    for (const item of entries) {
      const target = join(srcDir, item);
      await access(target, constants.R_OK);
      await cp(target, join(dstDir, item), { recursive: true, dereference: false });
    }
    await linkNodeModules(srcDir, dstDir);
    return dstDir;
  };

  const hub = await stageOne('omnimux', [
    'package.json', 'dsh.manifest.json', 'cordis.patch.yml',
    'src', 'apps', 'assets', 'scripts',
  ]);
  const viewer = await stageOne('omnimux-viewer', [
    'package.json', 'dsh.manifest.json', 'cordis.patch.yml', 'screenshots.json',
    'src', 'assets', 'scripts', 'tests', 'tsconfig.json', 'tsconfig.client.json',
  ]);

  // Every other plugin dir is a read-only symlink: the hub client bundle
  // imports sibling sources by relative path. The staged hub/viewer are real
  // copies, so builds never write into these links.
  for (const entry of await readdir(join(root, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'omnimux' || entry.name === 'omnimux-viewer') continue;
    const dst = join(pluginsDir, entry.name);
    try { await symlink(join(root, 'plugins', entry.name), dst); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }

  // The hub's file: dependency `dsh-ui-kit` must resolve two levels up, same
  // as in the real worktree: staging/plugins/omnimux/../../packages.
  const packagesDir = join(staging, 'packages');
  await mkdir(packagesDir, { recursive: true });
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try { await symlink(join(root, 'packages', entry.name), join(packagesDir, entry.name)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }

  return {
    hub,
    viewer,
    sidebar: sidebar.dir,
    buildScripts: {
      hub: join(hub, 'scripts', 'build-client.mjs'),
      viewer: join(viewer, 'scripts', 'build.mjs'),
    },
  };
}

/**
 * Run a child process with a hard deadline. On timeout the *owned* child is
 * killed with SIGTERM, escalated to SIGKILL after `killGraceMs`, and the
 * promise rejects — the caller's finally block still runs. Only PIDs this
 * call spawned are signalled.
 */
export function boundedCommand(binary, args, options = {}) {
  const { deadlineMs = 60000, killGraceMs = 5000, input = '', ...spawnOptions } = options;
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, { ...spawnOptions, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let settled = false;
    let timedOut = false;
    let killer;
    let finalDeadline;
    const fail = error => { if (!settled) { settled = true; clearTimeout(killer); clearTimeout(finalDeadline); reject(error); } };
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      output += `\n[boundedCommand] deadline ${deadlineMs}ms reached; SIGTERM to owned pid ${child.pid}`;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      killer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        finalDeadline = setTimeout(() => fail(new Error((output + '\nowned child close not observed before final deadline').replace(/([?&]token=)\S+/g, '$1[REDACTED]'))), killGraceMs);
      }, killGraceMs);
    }, deadlineMs);
    child.stdout.on('data', b => { output += b; });
    child.stderr.on('data', b => { output += b; });
    child.on('error', error => { clearTimeout(timer); fail(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (settled) return;
      clearTimeout(killer);
      clearTimeout(finalDeadline);
      settled = true;
      if (code === 0 && !timedOut) resolveRun(output);
      else reject(new Error(output.replace(/([?&]token=)\S+/g, '$1[REDACTED]') || `exit ${code}`));
    });
    child.stdin.end(input);
  });
}

/**
 * Stop an owned host process with a bounded escalation: SIGTERM, wait up to
 * `termWaitMs`, then SIGKILL the same PID only. Returns the observed exit
 * description for the evidence manifest. Never touches other processes.
 */
export async function stopOwnedHost(host, { termWaitMs = 8000, killWaitMs = 3000 } = {}) {
  if (!host) return { hostStopped: true, note: 'host never spawned' };
  if (host.exitCode !== null || host.signalCode !== null) {
    return { hostStopped: true, exitCode: host.exitCode, signalCode: host.signalCode };
  }
  const wait = (signal, ms) => new Promise(resolveWait => {
    const finish = value => { clearTimeout(timer); host.removeListener('exit', onExit); resolveWait(value); };
    const onExit = (code, signalCode) => finish({ hostStopped: true, exitCode: code, signalCode });
    const timer = setTimeout(() => finish(null), ms);
    host.once('exit', onExit);
    try { host.kill(signal); } catch { /* the observed exit, not kill(), is the receipt */ }
  });
  const terminated = await wait('SIGTERM', termWaitMs);
  if (terminated) return terminated;
  const killed = await wait('SIGKILL', killWaitMs);
  return killed ? { ...killed, escalated: true }
    : { hostStopped: false, escalated: true, cleanupError: 'owned host exit not observed before final deadline' };
}
