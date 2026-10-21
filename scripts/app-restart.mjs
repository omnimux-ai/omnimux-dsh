#!/usr/bin/env node
/**
 * scripts/app-restart.mjs
 *
 * Verified restart for the desktop apps (Dev / Prod), shared by the manual
 * `omnimux.mjs restart` command. The flow never force-kills anything:
 *
 *   1. list main processes by the exact app-bundle executable path;
 *   2. more than one instance → refuse (`shared-instance`);
 *   3. none → launch with the sanitized environment;
 *   4. one → ask the app to quit via AppleScript, poll until it exits
 *      (`quit-timeout` when it does not), then launch;
 *   5. any launch/quit failure returns a concrete status instead of success.
 *
 * Runner, launcher and sleep are injectable so tests never touch a real app.
 */
import { spawnSync } from 'node:child_process'
import { launchApp } from './dev-launch-env.mjs'

export const DESKTOP_APPS = Object.freeze({
  dev: Object.freeze({ name: 'OmniMux Dev', bundle: '/Applications/OmniMux Dev.app' }),
  prod: Object.freeze({ name: 'OmniMux', bundle: '/Applications/OmniMux.app' }),
})

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {{ status: number, stdout: string }}
 */
function defaultRun(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return { status: result.status ?? 1, stdout: String(result.stdout || '') }
}

/**
 * Synchronous sleep: the restart command is a short CLI and the wait loop is
 * bounded by `waitMs`. Tests inject a no-op.
 * @param {number} ms
 */
function defaultSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Main-process PIDs for one app bundle. Shell/helper processes that merely
 * mention the path are filtered out by re-reading the exact command line.
 * @param {(command: string, args: string[]) => { status: number, stdout: string }} run
 * @param {string} bundle
 * @returns {string[]}
 */
export function listMainPids(run, bundle) {
  const executable = `${bundle}/Contents/MacOS/OmniMux`
  const listed = run('pgrep', ['-f', executable])
  if (listed.status !== 0) return []
  const pids = []
  for (const pid of listed.stdout.split('\n').map((row) => row.trim()).filter(Boolean)) {
    const command = run('ps', ['-p', pid, '-o', 'command=']).stdout.trim()
    if (!command.startsWith(executable) || command.includes(' --type=')) continue
    pids.push(pid)
  }
  return pids
}

/**
 * @typedef {{
 *   run?: (command: string, args: string[]) => { status: number, stdout: string },
 *   launch?: (name: string) => { status: number | null },
 *   sleep?: (ms: number) => void,
 *   waitMs?: number,
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
  const pollMs = deps.pollMs ?? 500

  const pids = listMainPids(run, app.bundle)
  if (pids.length > 1) {
    return {
      ok: false,
      status: 'shared-instance',
      detail: `检测到 ${pids.length} 个 ${app.name} 主进程，存在并发占用，未执行任何退出或拉起`,
    }
  }

  const launchAppNow = () => {
    const launched = launch(app.name)
    if (launched?.status !== 0) {
      return { ok: false, status: 'launch-failed', detail: `open -a "${app.name}" 返回非 0` }
    }
    return { ok: true, status: pids.length > 0 ? 'restarted' : 'launched' }
  }

  if (pids.length === 0) return launchAppNow()

  const [pid] = pids
  const quit = run('osascript', [
    '-e', `if application "${app.name}" is running then`,
    '-e', `tell application "${app.name}" to quit`,
    '-e', 'end if',
  ])
  if (quit.status !== 0) {
    return { ok: false, status: 'quit-request-failed', detail: '优雅退出请求未被接受，已放弃重启', pid }
  }

  const deadline = Date.now() + waitMs
  while (Date.now() < deadline && listMainPids(run, app.bundle).length > 0) sleep(pollMs)
  if (listMainPids(run, app.bundle).length > 0) {
    return {
      ok: false,
      status: 'quit-timeout',
      detail: '应用未在超时内退出（可能存在未保存工作或活跃任务），已放弃重启，未发送任何强杀信号',
      pid,
    }
  }
  return launchAppNow()
}
