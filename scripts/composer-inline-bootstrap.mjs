import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTestEnvironmentStarter } from './test-env-bootstrap.mjs';
import { resolveHostRuntimeLayout, appPackageRootFor, readAsarTree, asarEntry } from './host-runtime-layout.mjs';

export const taskRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const workspaceTitle = 'Composer inline QA';

/**
 * CLI 入口按实际安装布局推导（Issue #3891）。
 *
 * 旧实现写死 `Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js`；
 * 壳改成 `asar: false` 后该路径不存在，这条通道在新版 Dev App 上前置必失败。
 * 这里复用 #3871 的布局探测，`app` 优先、`app.asar` 回退，缺件时给出可读错误。
 */
export function resolveComposerCli(layout) {
  return join(appPackageRootFor(layout.wrapper), 'lib', 'bin.js');
}

export function composerRuntimePaths(options = {}) {
  const layout = options.layout ?? resolveHostRuntimeLayout(options.layoutOptions);
  const cli = resolveComposerCli(layout);
  return { layout, executable: layout.executable, cli, appPackageRoot: appPackageRootFor(layout.wrapper) };
}
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
/**
 * 前置检查：可执行文件可执行、CLI 入口可读。
 *
 * 抽成独立函数以便单测覆盖——先前这段内联在 startComposerInlineEnvironment 里，
 * 改回旧写法测试也不会红（评审建议 1）。
 *
 * 归档布局（`runtime.layout.layout === 'app.asar'`）下 CLI 在 asar 内部，
 * 普通 Node 的 `accessSync` 必 `ENOTDIR`，因此该分支改为查归档目录表；
 * 调用方必须传完整的 `runtime`（含 `layout`），否则会退回 `accessSync` 并误报缺失。
 *
 * @param {{ executable: string, cli: string, layout?: { layout: string, appRoot: string } }} runtime
 * @param {{ accessSync?: Function, constants?: object }} [io]
 * @param {{ readAsarTree?: Function, asarEntry?: Function }} [deps]
 */
export function assertComposerRuntimeReadable(runtime, io = fs, deps = {}) {
  // 注入 io/deps 时不得回落到模块内实现（那会读真实 fs，绕过注入方）：
  // 与 probeArchive 同一条原则（评审建议 1）。
  const readTree = deps.readAsarTree ?? (io === fs ? readAsarTree : undefined);
  const lookup = deps.asarEntry ?? (io === fs ? asarEntry : undefined);
  const archiveLayout = runtime.layout?.layout === 'app.asar';
  for (const [path, mode] of [[runtime.executable, io.constants.X_OK], [runtime.cli, io.constants.R_OK]]) {
    // 归档布局下 CLI 在 asar 内部，普通 Node 的 accessSync 必 ENOTDIR；
    // 改为查归档目录表，语义等价于「这个文件在不在」。
    if (archiveLayout && path === runtime.cli) {
      let present = false;
      try {
        const relative = path.slice(runtime.layout.appRoot.length + 1);
        present = Boolean(lookup(readTree(runtime.layout.appRoot), relative));
      } catch {
        present = false;
      }
      if (!present) {
        throw Object.assign(new Error(`Composer QA requires installed macOS packaged runtime: ${path}`), {
          code: 'COMPOSER_RUNTIME_MISSING',
          detail: { path, via: 'asar-index' },
        });
      }
      continue;
    }
    try { io.accessSync(path, mode); } catch {
      throw Object.assign(new Error(`Composer QA requires installed macOS packaged runtime: ${path}`), {
        code: 'COMPOSER_RUNTIME_MISSING',
        detail: { path },
      });
    }
  }
}

export async function startComposerInlineEnvironment({ evidence }) {
  fs.mkdirSync(evidence, { recursive: true });
  // 前置检查按实际布局：可执行文件 X_OK、CLI 入口 R_OK（不再把归档当目录）。
  let runtime;
  try {
    runtime = composerRuntimePaths();
  } catch (error) {
    // 保留 code/hint/detail：调用方按 code 分类，契约也要求统一报 TEST_ENV_RUNTIME_MISSING。
    throw Object.assign(new Error(`Composer QA requires installed macOS packaged runtime: ${error?.message ?? error}`), {
      code: error?.code ?? 'COMPOSER_RUNTIME_UNAVAILABLE',
      hint: error?.hint,
      detail: error?.detail,
      cause: error,
    });
  }
  assertComposerRuntimeReadable(runtime);
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
      const install = spawnSync(runtime.executable, ['--expose-internals', runtime.cli, 'plugin', '--profile', 'web', 'add', ...packages, '--ignore-scripts'], {
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
