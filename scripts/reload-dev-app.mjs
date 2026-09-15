#!/usr/bin/env node
/**
 * scripts/reload-dev-app.mjs
 *
 * 合并后物化收尾的刷新入口，按变更面二选一：
 *
 * - 界面刷新（默认）：自动探测本地运行的 OmniMux Dev App（CDP 端口默认 9229，或环境变量
 *   OMNIMUX_CDP_PORT），通过 CDP WebSocket 发送 Page.reload。Client 产物由 Web 服务按请求从
 *   磁盘读取，刷新页面即取得新版；应用未运行或无页面目标时静默返回，不阻断流程。
 * - 受控重启（--restart）：宿主进程内的插件模块只在进程启动时载入一次，磁盘文件更新不会生效，
 *   因此涉及宿主路由、清单或构建期入口的变更必须让进程重新加载。
 *
 * 重启按 docs/contracts/plugin-git-pr.md 与 docs/contracts/dev-pipeline.md 的边界执行：
 * 目标必须同时是「被核实的开发版主进程」与「CDP 端口上的监听进程」，且不得存在第二个开发版
 * 实例（可能有其他任务或人工在并发使用同一 App 二进制）。核实通过后只请求优雅退出；超时即
 * 放弃并如实报告，绝不补发强杀信号。重新拉起后等到页面目标就绪才报告成功。
 */
import http from 'node:http';
import { spawnSync } from 'node:child_process';

const CDP_PORT = Number(process.env.OMNIMUX_CDP_PORT || process.env.OMNIMUX_DEV_CDP_PORT || 9229);
const DEV_APP_BUNDLE = '/Applications/OmniMux Dev.app';
const DEV_APP_NAME = 'OmniMux Dev';
const DEV_APP_INNER = `${DEV_APP_BUNDLE}/Contents/`;
const DEV_APP_MAIN = `${DEV_APP_BUNDLE}/Contents/MacOS/`;
const PROD_APP_BUNDLE = '/Applications/OmniMux.app';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {{ status: number, stdout: string }}
 */
function defaultRun(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: String(result.stdout || '') };
}

/**
 * 一次 CDP 探测；取不到可用目标时返回 null 而不是抛错。
 * @param {number} port
 * @returns {Promise<unknown[] | null>}
 */
function defaultProbePort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          resolve(Array.isArray(targets) ? targets : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * 命中开发版包路径、且命令行确属该 App 包内部的进程。仅凭路径片段命中的命令行
 * （例如某条 shell 命令里写了这个路径）不算，因此不含 `/Contents/` 的进程被排除。
 * @param {(command: string, args: string[]) => { status: number, stdout: string }} run
 * @returns {{ pid: string, command: string }[]}
 */
function devAppProcesses(run = defaultRun) {
  const listed = run('pgrep', ['-f', DEV_APP_BUNDLE]);
  if (listed.status !== 0) return [];
  const rows = [];
  for (const pid of listed.stdout.split('\n').map((line) => line.trim()).filter(Boolean)) {
    const command = run('ps', ['-p', pid, '-o', 'command=']).stdout.trim();
    if (!command.includes(DEV_APP_INNER)) continue;
    if (command.includes(PROD_APP_BUNDLE)) continue;
    rows.push({ pid, command });
  }
  return rows;
}

/**
 * 开发版实例的全部进程号（含渲染、GPU、宿主等子进程）。
 * @param {(command: string, args: string[]) => { status: number, stdout: string }} run
 * @returns {string[]}
 */
export function verifiedDevAppPids(run = defaultRun) {
  return devAppProcesses(run).map((row) => row.pid);
}

/**
 * 开发版实例的**主进程**号：`Contents/MacOS/` 下的可执行文件且不是 Electron 子进程类型。
 * 一个 App 实例对应一个主进程，因此它才是「实例数」的判据。
 * @param {(command: string, args: string[]) => { status: number, stdout: string }} run
 * @returns {string[]}
 */
export function verifiedDevMainPids(run = defaultRun) {
  return devAppProcesses(run)
    .filter((row) => row.command.includes(DEV_APP_MAIN) && !row.command.includes('--type='))
    .map((row) => row.pid);
}

/**
 * 监听指定 CDP 端口的进程号。端口即刷新目标：拿不到监听者就没有可刷新的实例。
 * @param {number} port
 * @param {(command: string, args: string[]) => { status: number, stdout: string }} run
 * @returns {string[]}
 */
function cdpListenerPids(port, run = defaultRun) {
  const listed = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  if (listed.status !== 0) return [];
  return listed.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

/**
 * @param {string} pid
 * @param {(command: string, args: string[]) => { status: number, stdout: string }} run
 */
function isAlive(pid, run) {
  return run('ps', ['-p', pid, '-o', 'pid=']).stdout.trim() !== '';
}

/**
 * 请求优雅退出。先判在运行再发 quit，避免把没开的应用顺带拉起来。
 * @param {(command: string, args: string[]) => { status: number, stdout: string }} run
 */
function requestGracefulQuit(run) {
  const result = run('osascript', [
    '-e', `if application "${DEV_APP_NAME}" is running then`,
    '-e', `tell application "${DEV_APP_NAME}" to quit`,
    '-e', 'end if',
  ]);
  return result.status === 0;
}

/**
 * 受控重启开发版实例。目标不可核实或存在并发占用时不做任何破坏性动作，只报告结果。
 * @param {{ run?: Function, probePort?: Function, sleep?: Function, port?: number,
 *   quitTimeoutMs?: number, readyTimeoutMs?: number, pollMs?: number }} [opts]
 * @returns {Promise<{ restarted: boolean, reason?: string, detail?: string, waitedMs?: number }>}
 */
export async function restartDevApp(opts = {}) {
  const run = opts.run ?? defaultRun;
  const probePort = opts.probePort ?? defaultProbePort;
  const wait = opts.sleep ?? sleep;
  const port = opts.port ?? CDP_PORT;
  const quitTimeoutMs = opts.quitTimeoutMs ?? 20_000;
  const readyTimeoutMs = opts.readyTimeoutMs ?? 90_000;
  const pollMs = opts.pollMs ?? 500;
  const started = Date.now();

  const instances = verifiedDevMainPids(run);
  if (instances.length === 0) {
    return { restarted: false, reason: 'not-running', detail: '开发版实例未运行，未启动任何进程' };
  }
  const targetPid = cdpListenerPids(port, run).find((pid) => instances.includes(pid));
  if (!targetPid) {
    return {
      restarted: false,
      reason: 'no-target',
      detail: `端口 ${port} 上没有已核实的开发版实例（未就绪或该端口被其他程序占用），未启动任何进程`,
    };
  }
  if (instances.length > 1) {
    return {
      restarted: false,
      reason: 'shared-instance',
      detail: `检测到 ${instances.length} 个开发版实例同时运行，存在并发占用，已放弃重启，请先协调该冲突`,
    };
  }

  if (!requestGracefulQuit(run)) {
    return { restarted: false, reason: 'quit-request-failed', detail: '优雅退出请求未被接受，已放弃重启' };
  }

  const quitDeadline = Date.now() + quitTimeoutMs;
  while (Date.now() < quitDeadline && isAlive(targetPid, run)) {
    await wait(pollMs);
  }
  if (isAlive(targetPid, run)) {
    return {
      restarted: false,
      reason: 'quit-timeout',
      detail: '开发版实例未在超时内退出（可能存在未保存工作、活跃生成或并发占用），已放弃重启，未发送任何强杀信号',
    };
  }

  if (run('open', ['-a', DEV_APP_NAME]).status !== 0) {
    return { restarted: false, reason: 'launch-failed', detail: '重新拉起开发版失败' };
  }

  const readyDeadline = Date.now() + readyTimeoutMs;
  while (Date.now() < readyDeadline) {
    const targets = await probePort(port);
    if (Array.isArray(targets) && targets.some((t) => t && t.type === 'page' && t.webSocketDebuggerUrl)) {
      return { restarted: true, waitedMs: Date.now() - started };
    }
    await wait(pollMs);
  }
  return { restarted: false, reason: 'not-ready', detail: '开发版重新拉起后未在超时内就绪，不能声明重启成功' };
}

/**
 * 页面刷新：Client 产物按请求从磁盘读取，刷新即可取得新版。
 * @param {number} port
 */
export async function reloadDevApp(port = CDP_PORT) {
  try {
    const targets = await defaultProbePort(port);

    if (!Array.isArray(targets)) {
      return { reloaded: false, reason: 'invalid-targets' };
    }

    const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) {
      return { reloaded: false, reason: 'no-page-target' };
    }

    const wsUrl = page.webSocketDebuggerUrl;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: 'Page.reload' }));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      };
      ws.onerror = (err) => {
        try { ws.close(); } catch {}
        reject(err);
      };
      setTimeout(() => {
        try { ws.close(); } catch {}
        resolve();
      }, 2000);
    });

    return { reloaded: true, title: page.title || page.url };
  } catch (err) {
    return { reloaded: false, reason: err.message };
  }
}

if (process.argv[1] && process.argv[1].endsWith('reload-dev-app.mjs')) {
  if (process.argv.includes('--restart')) {
    const result = await restartDevApp();
    if (result.restarted) {
      console.log(`🔁 [Host Reload] 宿主插件有变更，已受控重启开发版并确认就绪 (${result.waitedMs}ms)`);
    } else if (result.reason === 'not-running') {
      console.log(`ℹ️ [Host Reload] 无需重启 (${result.detail})`);
    } else {
      console.log(`⚠️ [Host Reload] 未能完成受控重启：${result.detail || result.reason}`);
    }
  } else {
    const result = await reloadDevApp();
    if (result.reloaded) {
      console.log(`⚡ [Live Reload] 已通知本地 Dev 桌面应用完成界面刷新 (${result.title})`);
    } else {
      // 未开应用属正常状态，不报错
      console.log(`ℹ️ [Live Reload] Dev 应用未运行或无可用窗口 (${result.reason})，跳过刷新`);
    }
  }
}
