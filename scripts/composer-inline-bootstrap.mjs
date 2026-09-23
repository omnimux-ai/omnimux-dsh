import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTestEnvironmentStarter } from './test-env-bootstrap.mjs';

export const taskRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const workspaceTitle = 'Composer inline QA';
const executable = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const cli = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js';
export function redact(text) {
  return String(text)
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1REDACTED@')
    .replace(/([?&](?:token|access_token|refresh_token|api_key|apikey|key|authorization)=)[^\s&#"'<>]*/gi, '$1REDACTED')
    .replace(/(\b(?:Bearer|Basic)\s+)[^\s,"'<>]+/gi, '$1REDACTED')
    .replace(/(["'](?:token|access_token|refresh_token|api_key|apikey|authorization|cookie|set-cookie)["']\s*:\s*)["'][^\r\n]*?["'](?=\s*[,}\n])/gi, '$1"REDACTED"')
    .replace(/(\b(?:authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, '$1REDACTED')
    .replace(/(\btoken=)[^\s&#"'<>]+/gi, '$1REDACTED');
}
const hash = content => createHash('sha256').update(content).digest('hex');

/** Limited filesystem seam for the current starter, not a process security sandbox. */
export function privateStarterFs(io = fs, home = process.env.HOME || '') {
  const forbidden = ['.omnimux-dev', '.omnimux'].map(name => resolve(home, name));
  const forbiddenPath = path => forbidden.some(root => path === root || path.startsWith(root + sep));
  const pathValue = value => {
    if (typeof value !== 'string' && !(value instanceof URL)) throw new Error('Private QA requires string or file URL paths');
    return value instanceof URL ? fileURLToPath(value) : value;
  };
  const blocked = value => {
    const path = resolve(pathValue(value));
    if (forbiddenPath(path)) return true;
    // This starter does not require symlink paths. Refuse ambiguous ancestors,
    // including dangling links, instead of following aliases into shared state.
    let ancestor = path;
    for (;;) {
      try {
        if (io.lstatSync(ancestor).isSymbolicLink()) throw new Error('Private QA forbids symlink path ancestors');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    return false;
  };
  const counts = { accessSync: 1, realpathSync: 1, statSync: 1, lstatSync: 1, existsSync: 1, readFileSync: 1, readdirSync: 1,
    mkdtempSync: 1, chmodSync: 1, mkdirSync: 1, writeFileSync: 1, rmSync: 1, cpSync: 2, symlinkSync: 2 };
  return new Proxy({}, { get(_target, key) {
    if (key === 'constants') return io.constants;
    if (!(key in counts)) throw new Error(`Private QA filesystem method not admitted: ${String(key)}`);
    return (...args) => {
      const paths = key === 'symlinkSync'
        ? [resolve(dirname(resolve(pathValue(args[1]))), pathValue(args[0])), args[1]]
        : args.slice(0, counts[key]);
      if (paths.some(blocked)) {
        if (key === 'existsSync') return false;
        throw new Error(`Private QA forbids shared profile access: ${key}`);
      }
      return io[key](...args);
    };
  } });
}

/** Formal private installation using the existing macOS packaged runtime contract. */
export async function startComposerInlineEnvironment({ evidence }) {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [path, mode] of [[executable, fs.constants.X_OK], [cli.split('/app.asar/')[0] + '/app.asar', fs.constants.R_OK]]) {
    try { fs.accessSync(path, mode); } catch { throw new Error(`Composer QA requires installed macOS packaged runtime: ${path}`); }
  }
  const plans = ['omnimux', 'omnimux-market'].map(name => {
    const source = join(taskRoot, 'plugins', name);
    const bundle = join(source, 'lib/client.js');
    if (!fs.existsSync(bundle)) throw new Error(`Build ${name} in this task worktree before QA: missing ${bundle}`);
    const manifest = JSON.parse(fs.readFileSync(join(source, 'package.json'), 'utf8'));
    const dependencies = Object.keys(manifest.dependencies || {}).map(dependency => {
      try { return [dependency, fs.realpathSync(join(source, 'node_modules', dependency))]; }
      catch { throw new Error(`Composer QA missing declared dependency ${name}/${dependency}; prepare this worktree dependencies first`); }
    });
    return { name, source, dependencies, clientHash: hash(fs.readFileSync(bundle)) };
  });
  let processProof;
  const start = createTestEnvironmentStarter({ fs: privateStarterFs(), startupTimeoutMs: 120000,
    spawn(exe, args, options) {
      const installed = [];
      const packages = plans.map(({ name, source, dependencies, clientHash }) => {
        const target = join(options.env.DSH_HOME, 'task-packages', name);
        fs.cpSync(source, target, { recursive: true, filter: path => !path.split('/').includes('node_modules') });
        fs.mkdirSync(join(target, 'node_modules'), { recursive: true });
        for (const [dependency, realPath] of dependencies) {
          const destination = join(target, 'node_modules', dependency);
          fs.mkdirSync(dirname(destination), { recursive: true });
          fs.symlinkSync(realPath, destination);
        }
        const installedHash = hash(fs.readFileSync(join(target, 'lib/client.js')));
        if (installedHash !== clientHash) throw new Error(`Private installed bundle mismatch: ${name}`);
        installed.push({ name, sourceHash: clientHash, installedHash, equalsWorktree: true });
        return target;
      });
      fs.writeFileSync(join(evidence, 'installed-proof.json'), JSON.stringify(installed, null, 2));
      const install = spawnSync(executable, ['--expose-internals', cli, 'plugin', '--profile', 'web', 'add', ...packages, '--ignore-scripts'], {
        ...options, env: { ...options.env, PATH: process.env.PATH }, encoding: 'utf8', timeout: 120000, stdio: 'pipe',
      });
      fs.writeFileSync(join(evidence, 'install.log'), redact(`${install.stdout || ''}\n${install.stderr || ''}`));
      if (install.error || install.status !== 0) throw new Error(`Private plugin installation failed (${install.status})`);
      const workspaceId = randomUUID();
      const workspacePath = join(options.env.HOME, 'composer-inline-workspace');
      fs.mkdirSync(workspacePath, { recursive: true });
      const storage = join(options.env.DSH_HOME, 'storages');
      fs.mkdirSync(storage, { recursive: true });
      const timestamp = new Date().toISOString();
      fs.writeFileSync(join(storage, 'workspace.json'), JSON.stringify({
        unit: { name: 'workspace', version: 2 },
        global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [] },
        tables: { workspaces: { [workspaceId]: { path: workspacePath, title: workspaceTitle, sessionIds: [], createdAt: timestamp, updatedAt: timestamp } } },
      }), { flag: 'wx', mode: 0o600 });
      processProof = { root: taskRoot, clientHash: plans[0].clientHash, workspaceId, workspacePath, workspaceTitle, installation: 'packaged-cli-private' };
      const child = spawn(exe, args, options);
      processProof.pid = child.pid;
      return child;
    },
  });
  const environment = await start({ root: taskRoot, mode: 'ui' });
  try {
    fs.writeFileSync(join(evidence, 'process.json'), JSON.stringify(processProof, null, 2));
    fs.writeFileSync(join(evidence, 'environment.json'), JSON.stringify({ ...environment.summary, taskPluginsInstalled: true, evidenceLevel: 'task-private-install', workspaceTitle }, null, 2));
    return environment;
  } catch (error) {
    await environment.cleanup();
    throw error;
  }
}
