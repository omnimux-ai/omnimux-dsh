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
import { accessSync, closeSync, constants as fsConstants, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import {
  COMFY_BACKEND_READY_PATH,
  installPercent,
  resolveLocalComfyBackendTarget,
  stageLabel,
  versionMatches,
  type ComfyBackendFailure,
  type ComfyBackendTargetResult,
  type ComfyBackendState,
  type ComfyBackendStatus,
  type ComfyBackendTarget,
  type InstallStageId,
} from './plan.ts';
import { launchArgs, runPreflight } from './preflight.ts';
import { checkDriver, type DriverProbe } from './driver.ts';
import {
  EMPTY_SETTINGS,
  modelsConfigYaml,
  parseSettings,
  resolveInstallRoot,
  validateDirectory,
  type ComfyBackendSettings,
} from './settings.ts';

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
  /** 注入点：驱动探测（测试用假实现；生产由 service 内部按平台探测）。 */
  driverProbe?: DriverProbe;
  /** 注入点：平台/架构（测试用；生产用 process.platform / process.arch）。 */
  platform?: string;
  arch?: string;
}

export interface ComfyBackendService {
  paths: { root: string; state: string; log: string; userdata: string; comfyui: string; venv: string; settings: string };
  status: () => Promise<ComfyBackendStatus>;
  install: () => Promise<ComfyBackendStatus>;
  start: () => Promise<ComfyBackendStatus>;
  stop: () => Promise<ComfyBackendStatus>;
  probeReady: () => Promise<boolean>;
  settings: () => ComfyBackendSettings;
  updateSettings: (patch: Partial<ComfyBackendSettings>) => { ok: boolean; code: string | null; settings: ComfyBackendSettings };
  /** 当前解析到的目标（含 support/driver/variant），没解析到时为 null。 */
  currentTarget: () => ComfyBackendTarget | null;
  /** 目标解析失败的原因（variant-required / unsupported-platform / unsupported-variant）。 */
  targetProblem: () => Extract<ComfyBackendTargetResult, { ok: false }> | null;
  /** 驱动判定（当前目标）。 */
  driverVerdict: () => Promise<{ status: string; detail: string; required: string | null }>;
}

const READY_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 2_000;
const MODELS_CONFIG_FILE = 'local-models.yaml';

function sha256OfFile(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

/** 读文本文件，缺失/不可读返回 null（设置文件缺失就是「用默认值」）。 */
function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** 目录可写探测：不存在时看父目录是否可写（安装根会被创建）。 */
function isWritableDir(path: string): boolean {
  try {
    if (existsSync(path)) {
      if (!statSync(path).isDirectory()) return false;
      accessSync(path, fsConstants.W_OK);
      return true;
    }
    const parent = dirname(path);
    if (!existsSync(parent)) return false;
    accessSync(parent, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** 卷可用空间；探测失败返回 null（不因为探测不到就拒绝安装）。 */
function freeBytesAt(path: string): number | null {
  try {
    const info = statfsSync(existsSync(path) ? path : dirname(path));
    const free = Number(info.bavail) * Number(info.bsize);
    return Number.isFinite(free) ? free : null;
  } catch {
    return null;
  }
}

/** 端口是否空闲（尝试监听一次，立刻释放）。 */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.once('listening', () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export function createComfyBackendService(options: ComfyBackendServiceOptions): ComfyBackendService {
  const dataRoot = options.dataRoot;
  // 设置文件固定在默认根下（它是「用户把根改到哪」的唯一记录，不能跟着根一起搬走）。
  const settingsPath = join(dataRoot, 'comfyui-backend', 'settings.json');
  let settings = parseSettings(readTextOrNull(settingsPath));
  let root = resolveInstallRoot(dataRoot, settings);
  const paths = {
    root,
    state: join(root, 'install-state.json'),
    log: join(root, 'logs', 'install.log'),
    userdata: join(root, 'userdata'),
    comfyui: join(root, 'ComfyUI'),
    venv: join(root, 'venv'),
    settings: settingsPath,
  };
  const downloads = () => join(paths.root, 'downloads');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const spawnImpl = options.spawnImpl ?? spawn;
  const now = options.now ?? Date.now;

  // 目标解析：用户选的方案优先；没选时「有实测方案」或「只有一个候选」才自动选，
  // Windows 这种多候选平台必须让用户显式选（`variant-required`，不猜也不回退）。
  let target: ComfyBackendTarget | null = null;
  let targetProblem: Extract<ComfyBackendTargetResult, { ok: false }> | null = null;
  /** 解析目标（用户换方案后必须重新解析，否则会拿旧方案去装）。 */
  const resolveTarget = () => {
    const result = options.target
      ? ({ ok: true, target: options.target } as const)
      : resolveLocalComfyBackendTarget(
          options.platform ?? process.platform,
          options.arch ?? process.arch,
          settings.variant,
        );
    target = result.ok ? result.target : null;
    targetProblem = result.ok ? null : result;
  };
  resolveTarget();

  /** 安装根变了：把 paths 整体指过去并建骨架（用户数据目录不搬，就地新建）。 */
  const applyRoot = (nextRoot: string) => {
    root = nextRoot;
    paths.root = nextRoot;
    paths.state = join(nextRoot, 'install-state.json');
    paths.log = join(nextRoot, 'logs', 'install.log');
    paths.userdata = join(nextRoot, 'userdata');
    paths.comfyui = join(nextRoot, 'ComfyUI');
    paths.venv = join(nextRoot, 'venv');
    mkdirSync(dirname(paths.log), { recursive: true });
    mkdirSync(downloads(), { recursive: true });
    // `--base-directory` 指向 userdata；ComfyUI 启动时会直接 os.listdir 这些子目录，
    // 缺一个就 FileNotFoundError 起不来（实测 custom_nodes 缺失即崩）。
    for (const name of ['custom_nodes', 'models', 'input', 'output', 'temp']) {
      mkdirSync(join(paths.userdata, name), { recursive: true });
    }
  };
  applyRoot(root);

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
      installRoot: root,
      failure: null,
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
    writeState({ state: stage === 'done' ? 'installed' : 'installing', stage, percent: installPercent(stage, ratio), message, error: null, failure: null });

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
      const runtimeArchive = join(downloads(), target.python.asset);
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
      // 一个方案可能带多个 wheel（AMD 那条：torch 2.4.1 + torchvision + torch-directml）。
      const wheelArgs = target.torch.wheels.map((wheel) => `${wheel.url}#sha256=${wheel.sha256}`);
      await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', ...wheelArgs]);

      progress('source', `下载 ComfyUI ${target.comfyui.tag}`);
      const sourceArchive = join(downloads(), `comfyui-${target.comfyui.commit}.tar.gz`);
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
        JSON.stringify(
          { target: target.id, variant: target.variant, comfyui: target.comfyui, python: target.python.version, torch: target.torch.version, at: now() },
          null,
          2,
        ),
      );
      progress('done', '安装完成');
      log('安装完成');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`安装失败：${message}`);
      writeState({ state: 'failed', error: 'install-failed', message: '安装失败', stage: null, percent: 0, failure: 'install-failed' });
    } finally {
      installing = false;
    }
  };

  const status = async (): Promise<ComfyBackendStatus> => {
    const current = readState();
    // 只有本进程真的在跑安装时才相信文件里的 installing：宿主中途退出后不能永远
    // 停在「安装中」（实测踩到过）。已下载/已建好的部分会被下一次 install 复用。
    if (current.state === 'installing') {
      if (installing) return current;
      return writeState({ state: 'not-installed', stage: null, percent: 0, pid: null, message: '上次安装未完成，可重试', error: null });
    }
    // failed 必须粘住：安装失败/启动超时的原因不能被「.ready 不存在」或「进程没在跑」
    // 洗成 not-installed/installed，否则界面会把「失败 + 重试」显示成「未安装 + 安装」，
    // 用户永远看不到真实原因。下一次 install/start 动作才会覆盖它。
    if (current.state === 'failed') return current;
    if (!existsSync(join(root, '.ready'))) {
      return current.state === 'not-installed' ? current : writeState({ state: 'not-installed', stage: null, percent: 0, pid: null });
    }
    // 目标解析不出来（选了本平台没有的方案 / 多候选没选）→ 如实报错，不能因为
    // `.ready` 还在就显示成「已装未启动」（实测踩到：界面会说可用，其实用不了）。
    if (!target && targetProblem) {
      const mapped = targetFailure(targetProblem);
      return writeState({
        state: 'failed',
        failure: mapped.failure,
        error: mapped.failure,
        message: mapped.message,
        stage: null,
        percent: 0,
      });
    }
    // 已装版本与当前固定目标不一致 → 需要更新，不能当成正常就绪继续跑（M3）。
    if (target && !versionMatches(readReady(), target)) {
      return writeState({
        state: 'failed',
        failure: 'version-mismatch',
        error: 'version-mismatch',
        message: '已安装的后端版本与当前固定版本不一致，需要更新',
        stage: null,
        percent: 0,
      });
    }
    const alive = current.pid !== null && isProcessAlive(current.pid);
    if (alive && (await probeReady())) return writeState({ state: 'ready', message: 'ComfyUI 已就绪', error: null });
    if (alive) return writeState({ state: 'starting', message: '正在启动 ComfyUI' });
    return writeState({ state: 'installed', message: '已安装，未运行', pid: null });
  };

  const install = async (): Promise<ComfyBackendStatus> => {
    if (installing) return readState();
    if (!target && targetProblem) {
      const mapped = targetFailure(targetProblem);
      return writeState({
        state: 'failed',
        failure: mapped.failure,
        error: mapped.failure,
        message: mapped.message,
        stage: null,
        percent: 0,
      });
    }
    const pre = await preflightFor(target, true);
    if (!pre.ok) {
      const failure = pre.failures[0] ?? 'install-failed';
      log(`安装前预检未通过：${failure}（需要 ${pre.requiredBytes} 字节，可用 ${String(pre.freeBytes)}）`);
      return writeState({
        state: 'failed',
        failure,
        error: failure,
        message: preflightMessage(failure, pre.requiredBytes, pre.freeBytes),
        stage: null,
        percent: 0,
      });
    }
    installing = true;
    progress('runtime', '准备安装', 0);
    void installTask();
    return readState();
  };

  const start = async (): Promise<ComfyBackendStatus> => {
    if (!target) {
      const mapped = targetFailure(targetProblem);
      return writeState({
        state: 'failed',
        failure: mapped.failure,
        error: mapped.failure,
        message: mapped.message,
        stage: null,
        percent: 0,
      });
    }
    if (!existsSync(join(root, '.ready'))) return writeState({ state: 'not-installed', message: '尚未安装托管后端' });
    // 已装的是旧固定版本时，别把它拉起来冒充可用（M3 实测发现：start 之前不比对版本）。
    if (!versionMatches(readReady(), target)) {
      return writeState({
        state: 'failed',
        failure: 'version-mismatch',
        error: 'version-mismatch',
        message: '已安装的后端版本与当前固定版本不一致，需要更新',
        stage: null,
        percent: 0,
      });
    }
    if (await probeReady()) return writeState({ state: 'ready', message: 'ComfyUI 已就绪' });
    const portFree = await portIsFree(target.port);
    if (!portFree) {
      return writeState({
        state: 'failed',
        failure: 'port-occupied',
        error: 'port-occupied',
        message: `端口 ${target.port} 被其它程序占用`,
        stage: null,
        percent: 0,
      });
    }
    writeState({ state: 'starting', message: '正在启动 ComfyUI' });
    // 用同步 fd 交给子进程（直接传 WriteStream 会因为 fd 还没打开而报 stdio 非法）。
    const logFd = openSync(join(root, 'logs', 'backend.log'), 'a');
    const child = spawnImpl(
      venvPython(),
      launchArgs({
        mainPy: join(paths.comfyui, 'main.py'),
        port: target.port,
        baseDirectory: paths.userdata,
        modelsConfigFile: modelsConfigFile(),
      }),
      { cwd: paths.comfyui, detached: true, stdio: ['ignore', logFd, logFd] },
    );
    closeSync(logFd);
    child.unref?.();
    writeState({ state: 'starting', pid: child.pid ?? null, message: '正在启动 ComfyUI' });
    log(`启动 ComfyUI pid=${child.pid ?? 'unknown'}`);
    const deadline = now() + READY_TIMEOUT_MS;
    while (now() < deadline) {
      if (await probeReady()) return writeState({ state: 'ready', message: 'ComfyUI 已就绪', error: null });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
    return writeState({ state: 'failed', error: 'start-timeout', message: '启动超时，请看后端日志', failure: 'start-timeout' });
  };

  /** 预检输入取自真实文件系统与端口；`forInstall` 决定是否检查磁盘空间。 */
  const preflightFor = async (t: ComfyBackendTarget | null, forInstall: boolean) => {
    const writable = isWritableDir(paths.root);
    const free = forInstall ? freeBytesAt(paths.root) : null;
    const freePort = t ? await portIsFree(t.port) : true;
    const owned = !freePort && (await probeReady());
    const driverVerdict = t ? await checkDriver(t, options.driverProbe ?? {}) : undefined;
    return runPreflight({
      target: t,
      writable,
      freeBytes: free,
      portFree: freePort,
      portOwnedByBackend: owned,
      ...(driverVerdict ? { driverVerdict } : {}),
    });
  };

  /** 模型目录：设置后写配置文件并把它交给 ComfyUI（不复制、不移动用户文件）。 */
  const modelsConfigFile = (): string | undefined => {
    const yaml = modelsConfigYaml(settings.modelsPath);
    if (yaml === '') return undefined;
    const file = join(paths.root, MODELS_CONFIG_FILE);
    try {
      writeFileSync(file, yaml);
      return file;
    } catch (error) {
      log(`模型目录配置写入失败：${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  const readReady = (): { comfyui?: { commit?: string }; python?: string; torch?: string; variant?: string } | null => {
    const text = readTextOrNull(join(paths.root, '.ready'));
    if (!text) return null;
    try {
      return JSON.parse(text) as { comfyui?: { commit?: string }; python?: string; torch?: string; variant?: string };
    } catch {
      return null;
    }
  };

  const settingsApi = () => ({ ...settings });
  const updateSettings = (patch: Partial<ComfyBackendSettings>) => {
    const next: ComfyBackendSettings = { ...settings, ...patch };
    const checks: Array<{ field: keyof ComfyBackendSettings; path: string }> = [];
    if (typeof patch.installRoot === 'string') checks.push({ field: 'installRoot', path: patch.installRoot });
    if (typeof patch.modelsPath === 'string') checks.push({ field: 'modelsPath', path: patch.modelsPath });
    for (const check of checks) {
      if (check.path.trim() === '') continue;
      const verdict = validateDirectory({
        path: check.path,
        exists: existsSync(check.path),
        isDirectory: existsSync(check.path) ? statSync(check.path).isDirectory() : false,
        writable: isWritableDir(check.path),
        installRoot: check.field === 'modelsPath' ? paths.root : undefined,
      });
      if (!verdict.ok) return { ok: false, code: verdict.code, settings: settingsApi() };
      next[check.field] = verdict.path;
    }
    settings = next;
    try {
      writeFileSync(paths.settings, JSON.stringify(settings, null, 2));
    } catch (error) {
      log(`设置写入失败：${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, code: 'settings-write-failed', settings: settingsApi() };
    }
    applyRoot(resolveInstallRoot(dataRoot, settings));
    resolveTarget();
    // 用户改了设置（换方案/换目录）说明在回应上一次失败：清掉粘住的失败标记，
    // 让状态按新配置重新判定，否则界面会一直显示旧的失败原因。
    if (readState().state === 'failed') {
      writeState({ state: 'not-installed', stage: null, percent: 0, pid: null, failure: null, error: null, message: '' });
    }
    return { ok: true, code: null, settings: settingsApi() };
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

  return {
    paths,
    status,
    install,
    start,
    stop,
    probeReady,
    settings: settingsApi,
    updateSettings,
    currentTarget: () => target,
    targetProblem: () => targetProblem,
    driverVerdict: async () => (target ? checkDriver(target, options.driverProbe ?? {}) : { status: 'unknown', detail: '未解析到目标', required: null }),
  };
}

/** 目标解析失败 → 失败码与文案（选到本平台没有的方案不能被折叠成「平台不支持」）。 */
function targetFailure(problem: { reason: string } | null): { failure: ComfyBackendFailure; message: string } {
  if (problem && problem.reason === 'variant-required') {
    return { failure: 'variant-required', message: '这台机器有多套显卡方案，请先选一个' };
  }
  if (problem && problem.reason === 'unsupported-variant') {
    return { failure: 'unsupported-variant', message: '这个方案不适用于当前设备，请换一个方案' };
  }
  return { failure: 'unsupported-platform', message: '当前设备暂不支持托管后端' };
}

function preflightMessage(failure: ComfyBackendFailure, requiredBytes: number, freeBytes: number | null): string {
  if (failure === 'unsupported-platform') return '当前设备暂不支持托管后端';
  if (failure === 'install-dir-not-writable') return '安装目录不可写，请换一个目录';
  if (failure === 'insufficient-disk') {
    const need = Math.round(requiredBytes / (1024 * 1024));
    const free = freeBytes === null ? null : Math.round(freeBytes / (1024 * 1024));
    return free === null ? `磁盘空间不足，需要约 ${need} MB` : `磁盘空间不足：需要约 ${need} MB，可用 ${free} MB`;
  }
  if (failure === 'port-occupied') return '端口 18188 被其它程序占用';
  if (failure === 'version-mismatch') return '已安装的后端版本与当前固定版本不一致，需要更新';
  if (failure === 'start-timeout') return '启动超时，请看后端日志';
  if (failure === 'driver-unsatisfied') return '当前驱动不满足这个方案的要求，请换一个方案或先升级驱动';
  if (failure === 'variant-required') return '这台机器有多套显卡方案，请先选一个';
  if (failure === 'unsupported-variant') return '这个方案不适用于当前设备，请换一个方案';
  return '安装失败';
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
