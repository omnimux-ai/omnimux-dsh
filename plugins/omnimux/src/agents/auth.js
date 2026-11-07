import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { KNOWN_AGENTS } from './local.js'

const execFileAsync = promisify(execFile)

const AUTH_TIMEOUT_MS = 5000
const LOGIN_OPEN_TIMEOUT_MS = 10000

/** Argument values handed to a spawned CLI must never carry shell syntax. */
const UNSAFE_ARG = /[^a-zA-Z0-9._:@/=-]/

/**
 * Sign-in state of a local agent CLI. `unknown` is a first-class answer: it
 * means this machine could not be asked, and callers must not render it as
 * "signed out". Only `signed-out` justifies offering a sign-in action.
 * @typedef {{ state: 'signed-in'|'signed-out'|'unknown', method: 'command'|'file'|'none' }} AgentAuth
 */

/** @type {AgentAuth} */
export const AUTH_UNKNOWN = Object.freeze({ state: 'unknown', method: 'none' })

/** @param {string} id */
function findAgent(id) {
  const key = typeof id === 'string' ? id.trim() : ''
  return KNOWN_AGENTS.find((row) => row.id === key) || null
}

/** @param {unknown} source @param {string} dotted */
function readDotted(source, dotted) {
  if (!source || typeof source !== 'object') return undefined
  return String(dotted).split('.').reduce((acc, part) => (
    acc && typeof acc === 'object' ? acc[part] : undefined
  ), source)
}

/** @param {string} raw */
function parseJsonObject(raw) {
  try {
    const parsed = JSON.parse(String(raw || ''))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Expand one credential pattern to the files that exist. `dir/*.json` means
 * "every JSON in that directory" — an empty result is a real "nothing stored".
 * @param {string} pattern
 * @param {string} home
 * @param {typeof fs} fsImpl
 * @returns {string[]}
 */
function listCredentialFiles(pattern, home, fsImpl) {
  const raw = String(pattern || '')
  if (!raw) return []
  const expanded = path.isAbsolute(raw) ? raw : path.join(home, raw)
  if (!expanded.endsWith('/*.json')) {
    try {
      return fsImpl.existsSync(expanded) ? [expanded] : []
    } catch {
      return []
    }
  }
  const dir = expanded.slice(0, -'/*.json'.length)
  try {
    return fsImpl.readdirSync(dir)
      .filter((name) => String(name).endsWith('.json'))
      .sort()
      .map((name) => path.join(dir, name))
  } catch {
    return []
  }
}

/**
 * Ask the CLI itself. Exit code 1 is the vendor's "not signed in"; anything
 * else that is not a clean exit (spawn failure, timeout, unexpected code)
 * stays `unknown` rather than being downgraded to `signed-out`.
 * @param {{ command: { bin: string, args: string[] }, jsonFlag?: string }} spec
 * @param {{ run?: Function, timeoutMs?: number }} options
 * @returns {Promise<AgentAuth>}
 */
async function probeByCommand(spec, options) {
  const run = typeof options.run === 'function' ? options.run : execFileAsync
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : AUTH_TIMEOUT_MS
  const method = /** @type {'command'} */ ('command')
  let verdict = /** @type {AgentAuth} */ ({ state: 'unknown', method })
  try {
    const { stdout } = await run(spec.command.bin, [...spec.command.args], { timeout: timeoutMs })
    verdict = { state: 'signed-in', method }
    const flag = typeof spec.jsonFlag === 'string' ? spec.jsonFlag : ''
    if (flag) {
      const parsed = parseJsonObject(stdout)
      if (parsed && typeof parsed[flag] === 'boolean') {
        verdict = { state: parsed[flag] ? 'signed-in' : 'signed-out', method }
      }
    }
  } catch (error) {
    verdict = { state: Number(error?.code) === 1 ? 'signed-out' : 'unknown', method }
  }
  return verdict
}

/**
 * Read the CLI's own credential store. Only key names and emptiness are
 * inspected — token values are never copied, returned or logged.
 * @param {{ paths?: string[], tokenKeys?: string[] }} spec
 * @param {{ home?: string, fsImpl?: typeof fs }} options
 * @returns {Promise<AgentAuth>}
 */
async function probeByFile(spec, options) {
  const fsImpl = options.fsImpl || fs
  const home = options.home || os.homedir()
  const method = /** @type {'file'} */ ('file')
  const patterns = Array.isArray(spec.paths) ? spec.paths : []
  const files = patterns.flatMap((pattern) => listCredentialFiles(pattern, home, fsImpl))
  if (files.length === 0) return { state: 'signed-out', method }
  const keys = Array.isArray(spec.tokenKeys) ? spec.tokenKeys.filter((key) => typeof key === 'string') : []
  let parsedAny = false
  for (const file of files) {
    let data = null
    try {
      data = parseJsonObject(fsImpl.readFileSync(file, 'utf8'))
    } catch {
      data = null
    }
    if (!data) continue
    parsedAny = true
    if (keys.length === 0) return { state: 'signed-in', method }
    const complete = keys.every((key) => {
      const value = readDotted(data, key)
      return typeof value === 'string' && value.trim() !== ''
    })
    if (complete) return { state: 'signed-in', method }
  }
  return { state: parsedAny ? 'signed-out' : 'unknown', method }
}

/**
 * Observe whether one local agent CLI is signed in, without network access.
 * @param {string} id
 * @param {{ run?: Function, home?: string, fsImpl?: typeof fs, timeoutMs?: number }} [options]
 * @returns {Promise<AgentAuth>}
 */
export async function probeAgentAuth(id, options = {}) {
  const agent = findAgent(id)
  if (!agent || !agent.auth) return { ...AUTH_UNKNOWN }
  const spec = agent.auth
  if (spec.kind === 'command' && spec.command) return probeByCommand(spec, options)
  if (spec.kind === 'file') return probeByFile(spec, options)
  return { ...AUTH_UNKNOWN }
}

/** @param {{ bin: string, args: string[] }} command */
function commandParts(command) {
  const bin = String(command?.bin || '')
  const args = Array.isArray(command?.args) ? command.args.map((arg) => String(arg)) : []
  if (!bin || UNSAFE_ARG.test(bin)) return null
  if (args.some((arg) => UNSAFE_ARG.test(arg))) return null
  return { bin, args }
}

/**
 * A double-clickable macOS terminal script for one CLI's sign-in command.
 * Built only from the capability table — request data never reaches it.
 * @param {{ name: string, id: string, login: { bin: string, args: string[] } }} agent
 */
export function buildLoginScript(agent) {
  const parts = commandParts(agent.login)
  if (!parts) return ''
  const invocation = [parts.bin, ...parts.args].join(' ')
  return [
    '#!/bin/sh',
    '# OmniMux: 在本窗口完成账号登录，完成后回到设置面板。',
    'cd "$HOME" || exit 1',
    `echo "正在登录 ${agent.name} …"`,
    invocation,
    'status=$?',
    'echo ""',
    'if [ "$status" -eq 0 ]; then',
    '  echo "登录流程已结束，可以关闭此窗口。"',
    'else',
    '  echo "登录未完成（退出码 $status），可在此窗口重试。"',
    'fi',
    '',
  ].join('\n')
}

/**
 * Start one CLI's account sign-in. By default it runs in a detached background
 * pseudo-terminal so the browser/device hand-off works without opening
 * Terminal.app; pass `mode: 'terminal'` (or set OMNIMUX_CLI_LOGIN_MODE=terminal)
 * to use the visible Terminal fallback.
 * @param {string} id
 * @param {{ platform?: string, mode?: 'background'|'terminal', home?: string, run?: Function, spawnImpl?: Function, fsImpl?: typeof fs, scriptDir?: string }} [options]
 * @returns {Promise<{ ok: true, launched: true, mode: 'terminal'|'background', logPath?: string } | { ok: false, error: string }>}
 */
export async function launchAgentLogin(id, options = {}) {
  const agent = findAgent(id)
  if (!agent) return { ok: false, error: 'unknown-agent' }
  if (!agent.login) return { ok: false, error: 'login-unsupported' }
  const platform = options.platform || process.platform
  if (platform !== 'darwin') return { ok: false, error: 'unsupported-platform' }
  const parts = commandParts(agent.login)
  if (!parts) return { ok: false, error: 'login-unsupported' }
  const mode = options.mode === 'terminal' || process.env.OMNIMUX_CLI_LOGIN_MODE === 'terminal'
    ? 'terminal'
    : 'background'
  const fsImpl = options.fsImpl || fs
  const home = options.home || os.homedir()
  const scriptDir = options.scriptDir || path.join(os.tmpdir(), 'omnimux-agent-login')

  if (mode === 'terminal') {
    const script = buildLoginScript(agent)
    if (!script) return { ok: false, error: 'login-unsupported' }
    const scriptPath = path.join(scriptDir, `omnimux-${agent.id}-login.command`)
    let prepared = true
    try {
      fsImpl.mkdirSync(scriptDir, { recursive: true })
      fsImpl.writeFileSync(scriptPath, script, { mode: 0o700 })
    } catch {
      prepared = false
    }
    if (!prepared) return { ok: false, error: 'launch-failed' }
    const run = typeof options.run === 'function' ? options.run : execFileAsync
    let opened = true
    try {
      await run('open', ['-a', 'Terminal', scriptPath], { timeout: LOGIN_OPEN_TIMEOUT_MS })
    } catch {
      opened = false
    }
    if (!opened) return { ok: false, error: 'launch-failed' }
    return { ok: true, launched: true, mode: 'terminal' }
  }

  // Background PTY: the CLI still sees a terminal (so its browser/device
  // hand-off works) but no Terminal.app window is opened. `script` allocates
  // the pseudo-terminal; the child is detached from the Host lifetime.
  const logPath = path.join(scriptDir, `omnimux-${agent.id}-login.log`)
  const invocation = `cd "$HOME" || exit 1\nexec ${parts.bin} ${parts.args.join(' ')}`
  const spawnImpl = typeof options.spawnImpl === 'function' ? options.spawnImpl : spawn
  const safeEnv = {
    HOME: home,
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    TERM: 'xterm-256color',
  }
  for (const key of ['USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE']) {
    if (process.env[key]) safeEnv[key] = process.env[key]
  }
  try {
    fsImpl.mkdirSync(scriptDir, { recursive: true, mode: 0o700 })
    const fd = fsImpl.openSync(logPath, 'a', 0o600)
    let child
    try {
      child = spawnImpl('/usr/bin/script', ['-q', '/dev/null', '/bin/sh', '-lc', invocation], {
        cwd: home,
        env: safeEnv,
        detached: true,
        stdio: ['ignore', fd, fd],
      })
    } finally {
      fsImpl.closeSync(fd)
    }
    if (child && typeof child.on === 'function') child.on('error', () => {})
    if (child && typeof child.once === 'function') {
      const earlyFailure = await new Promise((resolve) => {
        let done = false
        const settle = (value) => { if (!done) { done = true; resolve(value) } }
        child.once('error', (error) => settle(error))
        child.once('exit', (code) => { if (code !== 0) settle(new Error(`exit ${code}`)) })
        setTimeout(() => settle(null), 800)
      })
      if (earlyFailure) return { ok: false, error: 'launch-failed' }
    }
    if (child && typeof child.unref === 'function') child.unref()
    return { ok: true, launched: true, mode: 'background', logPath }
  } catch {
    return { ok: false, error: 'launch-failed' }
  }
}
