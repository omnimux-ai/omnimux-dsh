#!/usr/bin/env node
/**
 * scripts/app-restart.mjs
 *
 * Verified restart for the desktop apps (Dev / Prod), shared by the manual
 * `omnimux.mjs restart` command. The flow never force-kills anything:
 *
 *   1. inspect main processes by the exact app-bundle executable path
 *      (an inspection failure is reported, never treated as "not running");
 *   2. more than one instance → refuse (`shared-instance`);
 *   3. none → launch with the sanitized environment and confirm a main process;
 *   4. one → ask the app to quit via AppleScript (bounded), poll until it exits
 *      (`quit-timeout` when it does not), then launch and confirm the new PID.
 *
 * Runner, launcher and sleep are injectable so tests never touch a real app.
 */
import { spawnSync } from 'node:child_process'
import { launchApp } from './dev-launch-env.mjs'

export const DESKTOP_APPS = Object.freeze({
  dev: Object.freeze({ name: 'OmniMux Dev', bundle: '/Applications/OmniMux Dev.app' }),
  prod: Object.freeze({ name: 'OmniMux', bundle: '/Applications/OmniMux.app' }),
})

const RUN_TIMEOUT_MS = 5_000

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {{ status: number, stdout: string, stderr: string, timedOut: boolean }}
 */
function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? RUN_TIMEOUT_MS,
  })
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    timedOut: result.error?.code === 'ETIMEDOUT',
  }
}

/**
 * Synchronous sleep: the restart command is a short CLI and every wait loop is
 * bounded by `waitMs`. Tests inject a no-op.
 * @param {number} ms
 */
function defaultSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Strict process inspection. `pgrep` exit 1 means "no match"; any other
 * failure and a failing `ps` are inspection errors, not "not running".
 * @param {(command: string, args: string[], options?: { timeoutMs?: number }) => { status: number, stdout: string, stderr?: string }} run
 * @param {string} bundle
 * @returns {{ status: 'ok', pids: string[] } | { status: 'inspect-failed', detail: string }}
 */
export function inspectMainPids(run, bundle) {
  const executable = `${bundle}/Contents/MacOS/OmniMux`
  const listed = run('pgrep', ['-f', executable])
  if (listed.status === 1) return { status: 'ok', pids: [] }
  if (listed.status !== 0) {
    return { status: 'inspect-failed', detail: `pgrep 退出码 ${listed.status}` }
  }
  const pids = []
  for (const pid of listed.stdout.split('\n').map((row) => row.trim()).filter(Boolean)) {
    const inspected = run('ps', ['-p', pid, '-o', 'command='])
    if (inspected.status !== 0) {
      return { status: 'inspect-failed', detail: `ps -p ${pid} 退出码 ${inspected.status}` }
    }
    const command = inspected.stdout.trim()
    if (!command.startsWith(executable) || command.includes(' --type=')) continue
    pids.push(pid)
  }
  return { status: 'ok', pids }
}

/**
 * @param {(command: string, args: string[], options?: { timeoutMs?: number }) => { status: number, stdout: string, stderr?: string }} run
 * @param {string} bundle
 * @returns {string[]}
 */
export function listMainPids(run, bundle) {
  const inspected = inspectMainPids(run, bundle)
  if (inspected.status !== 'ok') throw new Error(inspected.detail)
  return inspected.pids
}

/**
 * Poll the process table until `done(pids)` or the bounded wait expires.
 * @param {(command: string, args: string[], options?: { timeoutMs?: number }) => { status: number, stdout: string, stderr?: string }} run
 * @param {string} bundle
 * @param {(pids: string[]) => boolean} done
 * @param {{ waitMs: number, pollMs: number, sleep: (ms: number) => void }} wait
 */
function pollPids(run, bundle, done, wait) {
  const deadline = Date.now() + wait.waitMs
  let inspected = inspectMainPids(run, bundle)
  while (inspected.status === 'ok' && !done(inspected.pids) && Date.now() < deadline) {
    wait.sleep(wait.pollMs)
    inspected = inspectMainPids(run, bundle)
  }
  return inspected
}

/**
 * @typedef {{
 *   run?: (command: string, args: string[], options?: { timeoutMs?: number }) => { status: number, stdout: string, stderr?: string, timedOut?: boolean },
 *   launch?: (name: string) => { status: number | null },
 *   sleep?: (ms: number) => void,
 *   waitMs?: number,
 *   launchWaitMs?: number,
 *   pollMs?: number,
 * }} RestartDeps
 */

/**
 * Restart one desktop app in a verified, non-destructive way.
 * @param {'dev' | 'prod'} target
 * @param {RestartDeps} [deps]
 * @returns {{ ok: boolean, status: string, detail?: string, pid?: string }}
 */
export function restartDesktopApp(target, deps = {}) {
  const app = DESKTOP_APPS[target]
  if (!app) return { ok: false, status: 'invalid-target', detail: `unknown target: ${String(target)}` }
  const run = deps.run ?? defaultRun
  const launch = deps.launch ?? launchApp
  const sleep = deps.sleep ?? defaultSleep
  const waitMs = deps.waitMs ?? 20_000
  const launchWaitMs = deps.launchWaitMs ?? 5_000
  const pollMs = deps.pollMs ?? 500

  const inspectFailure = (inspected) => (
    inspected.status === 'ok'
      ? null
      : { ok: false, status: 'inspect-failed', detail: inspected.detail }
  )

  const launchAndConfirm = (statusWhenRunning) => {
    const launched = launch(app.name)
    if (launched?.status !== 0) {
      return { ok: false, status: 'launch-failed', detail: `open -a "${app.name}" 返回非 0` }
    }
    const confirmed = pollPids(run, app.bundle, (pids) => pids.length > 0, { waitMs: launchWaitMs, pollMs, sleep })
    const failure = inspectFailure(confirmed)
    if (failure) return failure
    if (confirmed.pids.length === 0) {
      return { ok: false, status: 'launch-unconfirmed', detail: 'open 返回成功但未观察到应用主进程' }
    }
    return { ok: true, status: statusWhenRunning, pid: confirmed.pids[0] }
  }

  const inspected = inspectMainPids(run, app.bundle)
  const inspectProblem = inspectFailure(inspected)
  if (inspectProblem) return inspectProblem
  if (inspected.pids.length > 1) {
    return {
      ok: false,
      status: 'shared-instance',
      detail: `检测到 ${inspected.pids.length} 个 ${app.name} 主进程，存在并发占用，未执行任何退出或拉起`,
    }
  }
  if (inspected.pids.length === 0) return launchAndConfirm('launched')

  const [pid] = inspected.pids
  const quit = run('osascript', [
    '-e', `if application "${app.name}" is running then`,
    '-e', `tell application "${app.name}" to quit`,
    '-e', 'end if',
  ], { timeoutMs: waitMs })
  if (quit.status !== 0) {
    const detail = quit.timedOut
      ? '退出请求超时（可能等待 macOS 自动化授权），已放弃重启'
      : `优雅退出请求未被接受${quit.stderr?.trim() ? `：${quit.stderr.trim().slice(0, 200)}` : ''}`
    return { ok: false, status: 'quit-request-failed', detail, pid }
  }

  const afterQuit = pollPids(run, app.bundle, (pids) => pids.length === 0, { waitMs, pollMs, sleep })
  const quitProblem = inspectFailure(afterQuit)
  if (quitProblem) return { ...quitProblem, pid }
  if (afterQuit.pids.length > 0) {
    return {
      ok: false,
      status: 'quit-timeout',
      detail: '应用未在超时内退出（可能存在未保存工作或活跃任务），已放弃重启，未发送任何强杀信号',
      pid,
    }
  }
  return launchAndConfirm('restarted')
}
