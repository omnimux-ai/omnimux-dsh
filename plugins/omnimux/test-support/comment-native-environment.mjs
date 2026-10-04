// Private test staging; declared dependencies are read-only, never user profiles.
import { constants } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, realpath, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

export const hashFile = async path => createHash('sha256').update(await readFile(path)).digest('hex');
export async function resolveHost(_root, env = process.env) {
  const executable = env.OMNIMUX_E2E_EXECUTABLE || '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
  const cli = env.OMNIMUX_E2E_CLI || '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/lib/desktop-cli.js';
  await access(executable, constants.R_OK | constants.X_OK);
  await access(cli.includes('.asar/') ? cli.slice(0, cli.indexOf('.asar/') + 5) : cli, constants.R_OK);
  let version = 'unknown';
  try {
    const plist = await readFile(resolve(executable, '../../Info.plist'), 'utf8');
    version = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || 'unknown';
  } catch { /* Version metadata is optional; executable and CLI readability is mandatory. */ }
  return { executable, cli, version };
}
export async function resolveSidebarBridge(root, env = process.env, staging) {
  if (env.OMNIMUX_E2E_SIDEBAR) {
    const input = await realpath(env.OMNIMUX_E2E_SIDEBAR);
    let dir = input;
    let archiveSha256;
    const dependencyVersions = {};
    if (input.endsWith('.tgz')) {
      if (!staging || !resolve(staging).startsWith(resolve(root, '.tmp') + '/')) throw new Error('Archive inputs require task-private sidebar staging');
      await mkdir(staging, { recursive: true });
      archiveSha256 = await hashFile(input);
      await boundedCommand('tar', ['-xzf', input, '-C', staging]);
      dir = join(staging, 'package');
      // Node-half external imports resolve only through already installed task cache.
      const store = join(root, 'node_modules/.pnpm');
      const entries = await readdir(store);
      await mkdir(join(dir, 'node_modules'), { recursive: true });
      for (const name of ['schemastery', 'ws', 'parse5', 'css-tree', 'es-module-lexer', 'saxes', 'acorn']) {
        const candidates = entries.filter(entry => entry.startsWith(name + '@'));
        candidates.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        if (!candidates.length) throw new Error(`Existing task cache dependency missing: ${name}`);
        const target = await realpath(join(store, candidates[0], 'node_modules', name));
        dependencyVersions[name] = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).version;
        await symlink(target, join(dir, 'node_modules', name));
      }
    }
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    if (pkg.name !== 'dsh-better-sidebar') throw new Error('Explicit sidebar input is not the public sidebar package');
    return { dir, input, archiveSha256, dependencyVersions, name: pkg.name, version: pkg.version, source: 'explicit', hashes: { manifest: await hashFile(join(dir, 'package.json')), client: await hashFile(join(dir, 'lib/client.js')), host: await hashFile(join(dir, 'lib/index.js')) } };
  }
  for (const entry of await readdir(join(root, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, 'plugins', entry.name, 'package.json');
    let pkg;
    try { pkg = JSON.parse(await readFile(manifestPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const wanted = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }['dsh-better-sidebar'];
    if (!wanted) continue;
    const require = createRequire(manifestPath);
    let dir;
    try { dir = await realpath(dirname(require.resolve('dsh-better-sidebar/package.json'))); }
    catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      const store = join(root, 'node_modules/.pnpm');
      const candidates = (await readdir(store)).filter(name => name.startsWith(`dsh-better-sidebar@${wanted}_`) || name === `dsh-better-sidebar@${wanted}`);
      if (candidates.length !== 1) throw new Error(`Expected one installed cache entry for declared sidebar ${wanted}; found ${candidates.length}`);
      dir = await realpath(join(store, candidates[0], 'node_modules/dsh-better-sidebar'));
    }
    const installed = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    if (installed.version !== wanted) throw new Error(`Declared sidebar ${wanted} differs from installed ${installed.version}`);
    return { dir, name: installed.name, version: installed.version, source: 'declared-dependency', declaredBy: entry.name, hashes: { manifest: await hashFile(join(dir, 'package.json')), client: await hashFile(join(dir, 'lib/client.js')), host: await hashFile(join(dir, 'lib/index.js')) } };
  }
  throw new Error('No declared sidebar dependency; supply OMNIMUX_E2E_SIDEBAR explicitly');
}
async function linkDependencies(src, dst) {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const from = join(src, entry.name), to = join(dst, entry.name);
    if (entry.isDirectory() && entry.name.startsWith('@')) {
      await mkdir(to, { recursive: true });
      for (const name of await readdir(from)) await symlink(await realpath(join(from, name)), join(to, name));
    } else await symlink(await realpath(from), to);
  }
}
export async function stagePlugins(root, staging, sidebar = { dir: '' }) {
  const pluginsDir = join(staging, 'plugins');
  await mkdir(pluginsDir, { recursive: true });
  const staged = {};
  for (const name of ['omnimux', 'omnimux-viewer']) {
    const src = join(root, 'plugins', name), dst = join(pluginsDir, name);
    await cp(src, dst, { recursive: true, filter: path => !['node_modules', 'lib', '.git', 'test-support'].includes(path.split('/').pop()) });
    await linkDependencies(join(src, 'node_modules'), join(dst, 'node_modules'));
    staged[name] = dst;
  }
  for (const entry of await readdir(join(root, 'plugins'), { withFileTypes: true })) {
    if (entry.isDirectory() && !staged[entry.name]) await symlink(join(root, 'plugins', entry.name), join(pluginsDir, entry.name));
  }
  await symlink(await realpath(join(root, 'node_modules')), join(staging, 'node_modules'));
  await symlink(join(root, 'packages'), join(staging, 'packages'));
  return { hub: staged.omnimux, viewer: staged['omnimux-viewer'], sidebar: sidebar.dir,
    buildScripts: { hub: join(staged.omnimux, 'scripts/build-client.mjs'), viewer: join(staged['omnimux-viewer'], 'scripts/build.mjs') } };
}
export function boundedCommand(binary, args, options = {}) {
  const { deadlineMs = 120000, killGraceMs = 5000, input = '', ...spawnOptions } = options;
  return new Promise((accept, reject) => {
    const child = spawn(binary, args, { ...spawnOptions, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', settled = false, timedOut = false, killer, finalDeadline;
    const cleanup = () => {
      clearTimeout(timer); clearTimeout(killer); clearTimeout(finalDeadline);
      child.removeListener('error', onError); child.removeListener('close', onClose);
      child.stdout.removeListener('data', onData); child.stderr.removeListener('data', onData);
      child.stdin.removeListener('error', onInputError);
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else accept(output);
    };
    const onData = data => { output += data; };
    const onError = error => finish(error);
    const onInputError = error => { if (error.code !== 'EPIPE') finish(error); };
    const onClose = (code, signal) => {
      if (code === 0 && !timedOut) finish();
      else finish(new Error(`exit=${code} signal=${signal} timedOut=${timedOut}\n${output.replace(/([?&]token=)\S+/g, '$1[REDACTED]')}`));
    };
    const signalOwnedChild = signal => {
      try { child.kill(signal); } catch { /* Only observed close completes cleanup. */ }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signalOwnedChild('SIGTERM');
      if (settled) return;
      killer = setTimeout(() => {
        signalOwnedChild('SIGKILL');
        if (settled) return;
        finalDeadline = setTimeout(() => finish(new Error(`timedOut=true; owned child close not observed before final deadline\n${output.replace(/([?&]token=)\S+/g, '$1[REDACTED]')}`)), killGraceMs);
      }, killGraceMs);
    }, deadlineMs);
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.once('error', onError); child.once('close', onClose);
    child.stdin.on('error', onInputError);
    child.stdin.end(input);
  });
}
export async function stopOwnedHost(host, { termWaitMs = 8000, killWaitMs = 3000 } = {}) {
  if (!host || host.exitCode !== null || host.signalCode !== null) return { hostStopped: true, exitCode: host?.exitCode, signalCode: host?.signalCode };
  const wait = (signal, ms) => new Promise(resolveWait => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); host.removeListener('exit', onExit);
      resolveWait(value);
    };
    const onExit = (exitCode, signalCode) => finish({ hostStopped: true, exitCode, signalCode });
    const timer = setTimeout(() => finish(null), ms);
    host.once('exit', onExit);
    try { host.kill(signal); } catch { /* Only observed exit proves the host stopped. */ }
  });
  const terminated = await wait('SIGTERM', termWaitMs);
  if (terminated) return terminated;
  const killed = await wait('SIGKILL', killWaitMs);
  return killed ? { ...killed, escalated: true }
    : { hostStopped: false, escalated: true, cleanupError: 'owned host exit not observed before final deadline' };
}
