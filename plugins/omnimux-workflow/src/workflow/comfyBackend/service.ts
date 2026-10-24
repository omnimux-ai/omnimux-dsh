/**
 * ComfyUI 托管后端安装/启动服务（Issue #3690 M2a）。
 *
 * 目标（用户已拍板）：从**上游固定版本**装到插件数据目录，与我们的源码分离；
 * 装完在固定端口 18188 上起来，画布节点指过去就是真 ComfyUI 编辑器。
 *
 * 设计要点：
 * - 安装是**宿主进程内的异步任务**（重活交给子进程：tar / venv / pip），进度写
 *   `<root>/install-state.json`，前端只读状态、不参与安装；
 * - 每个下载都校验 sha256（错一个字节就失败，不留半成品可用状态）；
 * - 启动用 detached 子进程，只记我们自己的 pid，停止只结束这个 pid；
 * - `userdata/` 与源码目录分离，升级/重装不碰用户数据。
 */

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import {
  COMFY_BACKEND_READY_PATH,
  installPercent,
  resolveLocalComfyBackendTarget,
  stageLabel,
  type ComfyBackendState,
  type ComfyBackendStatus,
  type ComfyBackendTarget,
  type InstallStageId,
} from './plan.ts';

export interface ComfyBackendServiceOptions {
  /** 插件数据目录（安装根 `<root>/comfyui-backend` 建在这里）。 */
  dataRoot: string;
  target?: ComfyBackendTarget;
  /** 注入点：测试用假实现，生产用 globalThis.fetch。 */
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
  now?: () => number;
  /** 安装/启动过程中的日志行（同时写 `<root>/logs/install.log`）。 */
  onLog?: (line: string) => void;
}

export interface ComfyBackendService {
  paths: { root: string; state: string; log: string; userdata: string; comfyui: string; venv: string };
  status: () => Promise<ComfyBackendStatus>;
  install: () => Promise<ComfyBackendStatus>;
  start: () => Promise<ComfyBackendStatus>;
  stop: () => Promise<ComfyBackendStatus>;
  probeReady: () => Promise<boolean>;
}

const READY_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 2_000;

function sha256OfFile(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

export function createComfyBackendService(options: ComfyBackendServiceOptions): ComfyBackendService {
  const dataRoot = options.dataRoot;
  const root = join(dataRoot, 'comfyui-backend');
  const paths = {
    root,
    state: join(root, 'install-state.json'),
    log: join(root, 'logs', 'install.log'),
    userdata: join(root, 'userdata'),
    comfyui: join(root, 'ComfyUI'),
    venv: join(root, 'venv'),
  };
  const downloads = join(root, 'downloads');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const spawnImpl = options.spawnImpl ?? spawn;
  const now = options.now ?? Date.now;

  const targetResult = options.target
    ? ({ ok: true, target: options.target } as const)
    : resolveLocalComfyBackendTarget();
  const target = targetResult.ok ? targetResult.target : null;

  mkdirSync(dirname(paths.log), { recursive: true });
  mkdirSync(downloads, { recursive: true });
  mkdirSync(paths.userdata, { recursive: true });

  const log = (line: string) => {
    const stamped = `[${new Date(now()).toISOString()}] ${line}\n`;
    try {
      writeFileSync(paths.log, stamped, { flag: 'a' });
    } catch (error) {
      // 日志写不进去不影响安装，但失败必须可见（不静默吞掉）。
      process.stderr.write(`[comfy-backend] 日志写入失败：${error instanceof Error ? error.message : String(error)}\n`);
    }
    options.onLog?.(line);
  };

  const readState = (): ComfyBackendStatus => {
    const base: ComfyBackendStatus = {
      state: 'not-installed',
      stage: null,
      percent: 0,
      message: '',
      error: null,
      pid: null,
      updatedAt: now(),
      target,
    };
    if (!existsSync(paths.state)) return base;
    try {
      const parsed = JSON.parse(readFileSync(paths.state, 'utf8')) as Partial<ComfyBackendStatus>;
      return { ...base, ...parsed, target, updatedAt: parsed.updatedAt ?? now() };
    } catch {
      return base;
    }
  };

  const writeState = (patch: Partial<ComfyBackendStatus>): ComfyBackendStatus => {
    const next: ComfyBackendStatus = { ...readState(), ...patch, updatedAt: now(), target };
    try {
      writeFileSync(paths.state, JSON.stringify(next, null, 2));
    } catch (error) {
      // 状态文件写不进去时仍返回内存值（调用方拿到的是最新事实），但把失败说出来。
      process.stderr.write(`[comfy-backend] 状态写入失败：${error instanceof Error ? error.message : String(error)}\n`);
    }
    return next;
  };

  const progress = (stage: InstallStageId | 'done', message: string, ratio = 0) =>
    writeState({ state: stage === 'done' ? 'installed' : 'installing', stage, percent: installPercent(stage, ratio), message, error: null });

  const run = (command: string, args: string[], cwd = root): Promise<void> =>
    new Promise((resolvePromise, rejectPromise) => {
      log(`$ ${command} ${args.join(' ')}`);
      const child = spawnImpl(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let tail = '';
      const collect = (chunk: Buffer) => {
        const text = chunk.toString();
        tail = `${tail}${text}`.slice(-4000);
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);
      child.on('error', (error) => rejectPromise(error));
      child.on('close', (code) => {
        if (code === 0) return resolvePromise();
        log(`! ${command} 退出码 ${code}\n${tail}`);
        rejectPromise(new Error(`${command} 退出码 ${code}: ${tail.split('\n').slice(-6).join(' | ')}`));
      });
    });

  /**
   * 下载并校验：`sha256` 为空表示「只记录、不钉死」（ComfyUI 源码 tarball 用上游
   * commit 定位，哈希记录进日志，M4 再把它钉进目标表）。
   */
  const download = async (
    url: string,
    destination: string,
    sha256: string,
    stage: InstallStageId = 'runtime',
  ): Promise<string> => {
    const part = `${destination}.part`;
    rmSync(part, { force: true });
    const response = await fetchImpl(url, { redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`下载失败 ${response.status} ${url}`);
    const total = Number(response.headers.get('content-length') ?? 0);
    let received = 0;
    const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    source.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (total > 0) progress(stage, `下载 ${Math.round((received / total) * 100)}%`, received / total);
    });
    await pipeline(source, createWriteStream(part));
    const digest = sha256OfFile(part);
    if (sha256 !== '' && digest !== sha256) {
      rmSync(part, { force: true });
      throw new Error(`sha256 不匹配（期望 ${sha256.slice(0, 12)}…，实际 ${digest.slice(0, 12)}…）`);
    }
    renameSync(part, destination);
    log(`校验${sha256 === '' ? '（仅记录）' : ''}通过 ${destination.split('/').pop()} sha256=${digest.slice(0, 12)}…`);
    return digest;
  };

  const extractTarGz = async (archive: string, destination: string) => {
    await run('tar', ['-xzf', archive, '-C', destination]);
  };

  const pythonBin = () => (process.platform === 'win32' ? join(root, 'python', 'python.exe') : join(root, 'python', 'bin', 'python3'));
  const venvPython = () => (process.platform === 'win32' ? join(paths.venv, 'Scripts', 'python.exe') : join(paths.venv, 'bin', 'python'));

  const probeReady = async (): Promise<boolean> => {
    if (!target) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`http://127.0.0.1:${target.port}${COMFY_BACKEND_READY_PATH}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  let installing = false;

  const installTask = async (): Promise<void> => {
    if (!target) {
      writeState({ state: 'failed', error: 'unsupported-platform', message: '当前设备暂不支持托管后端' });
      return;
    }
    try {
      progress('runtime', '下载 Python 运行时', 0);
      const runtimeArchive = join(downloads, target.python.asset);
      if (!existsSync(runtimeArchive)) await download(target.python.url, runtimeArchive, target.python.sha256);

      progress('extract', '解压运行时');
      if (!existsSync(pythonBin())) {
        rmSync(join(root, 'python'), { recursive: true, force: true });
        await extractTarGz(runtimeArchive, root);
      }
      await run(pythonBin(), ['-c', 'import venv; print("venv-ok")']);

      progress('venv', '创建虚拟环境');
      if (!existsSync(venvPython())) await run(pythonBin(), ['-m', 'venv', paths.venv]);

      progress('torch', `安装 PyTorch ${target.torch.version}`);
      await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', `${target.torch.url}#sha256=${target.torch.sha256}`]);

      progress('source', `下载 ComfyUI ${target.comfyui.tag}`);
      const sourceArchive = join(downloads, `comfyui-${target.comfyui.commit}.tar.gz`);
      if (!existsSync(sourceArchive)) await download(target.comfyui.tarball, sourceArchive, '', 'source');
      if (!existsSync(paths.comfyui)) {
        const staging = join(root, 'source-staging');
        rmSync(staging, { recursive: true, force: true });
        mkdirSync(staging, { recursive: true });
        await extractTarGz(sourceArchive, staging);
        const inner = readdirSyncSafe(staging).find((name) => name.startsWith('ComfyUI-'));
        if (!inner) throw new Error('源码压缩包结构不符合预期');
        renameSync(join(staging, inner), paths.comfyui);
        rmSync(staging, { recursive: true, force: true });
      }

      progress('requirements', '安装 ComfyUI 依赖');
      await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', join(paths.comfyui, 'requirements.txt')]);

      writeFileSync(
        join(root, '.ready'),
        JSON.stringify({ target: target.id, comfyui: target.comfyui, python: target.python.version, torch: target.torch.version, at: now() }, null, 2),
      );
      progress('done', '安装完成');
      log('安装完成');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`安装失败：${message}`);
      writeState({ state: 'failed', error: 'install-failed', message: '安装失败', stage: null, percent: 0 });
    } finally {
      installing = false;
    }
  };

  const status = async (): Promise<ComfyBackendStatus> => {
    const current = readState();
    if (current.state === 'installing' || current.state === 'starting') return current;
    if (!existsSync(join(root, '.ready'))) {
      return current.state === 'not-installed' ? current : writeState({ state: 'not-installed', stage: null, percent: 0, pid: null });
    }
    const alive = current.pid !== null && isProcessAlive(current.pid);
    if (alive && (await probeReady())) return writeState({ state: 'ready', message: 'ComfyUI 已就绪', error: null });
    if (alive) return writeState({ state: 'starting', message: '正在启动 ComfyUI' });
    return writeState({ state: 'installed', message: '已安装，未运行', pid: null });
  };

  const install = async (): Promise<ComfyBackendStatus> => {
    if (installing) return readState();
    installing = true;
    progress('runtime', '准备安装', 0);
    void installTask();
    return readState();
  };

  const start = async (): Promise<ComfyBackendStatus> => {
    if (!target) return writeState({ state: 'failed', error: 'unsupported-platform', message: '当前设备暂不支持托管后端' });
    if (!existsSync(join(root, '.ready'))) return writeState({ state: 'not-installed', message: '尚未安装托管后端' });
    if (await probeReady()) return writeState({ state: 'ready', message: 'ComfyUI 已就绪' });
    writeState({ state: 'starting', message: '正在启动 ComfyUI' });
    const out = createWriteStream(join(root, 'logs', 'backend.log'), { flags: 'a' });
    const child = spawnImpl(
      venvPython(),
      [
        join(paths.comfyui, 'main.py'),
        '--port', String(target.port),
        '--base-directory', paths.userdata,
        '--enable-cors-header', '*',
      ],
      { cwd: paths.comfyui, detached: true, stdio: ['ignore', out, out] },
    );
    child.unref?.();
    writeState({ state: 'starting', pid: child.pid ?? null, message: '正在启动 ComfyUI' });
    log(`启动 ComfyUI pid=${child.pid ?? 'unknown'}`);
    const deadline = now() + READY_TIMEOUT_MS;
    while (now() < deadline) {
      if (await probeReady()) return writeState({ state: 'ready', message: 'ComfyUI 已就绪', error: null });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
    return writeState({ state: 'failed', error: 'start-timeout', message: '启动超时，请看后端日志' });
  };

  const stop = async (): Promise<ComfyBackendStatus> => {
    const current = readState();
    if (current.pid !== null) {
      try {
        process.kill(current.pid, 'SIGTERM');
      } catch (error) {
        // 进程已经退出：正常路径，但仍记录一次，便于排查「stop 没停掉」。
        log(`stop: pid ${current.pid} 已不在：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    writeState({ state: 'installed', pid: null, message: '已停止' });
    return readState();
  };

  return { paths, status, install, start, stop, probeReady };
}

function readdirSyncSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
