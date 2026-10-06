import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { KNOWN_AGENTS, resolveBinPath, probeAgentBin } from './local.js'

const execFileAsync = promisify(execFile)

const REGISTRY_URL = 'https://registry.npmjs.org'
const REGISTRY_TIMEOUT_MS = 5000
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000
const UPDATE_TIMEOUT_MS = 180000
const UPDATE_MAX_BUFFER = 1024 * 1024
const DETAIL_LIMIT = 300

const VERSION_RE = /(\d+)\.(\d+)\.(\d+)/

/**
 * Version text as these CLIs print it: `2.1.223 (Claude Code)`,
 * `codex-cli 0.159.3`, `1.2.3+abc123`, `0.34.0`. Prefix and suffix are noise.
 * @param {unknown} text
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
export function parseVersion(text) {
  const match = VERSION_RE.exec(String(text ?? ''))
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/**
 * Whether `latest` is strictly newer than `current`. An unparseable side is
 * not "newer" — an unknown comparison must never claim an update exists.
 * @param {unknown} latest
 * @param {unknown} current
 */
export function isNewerVersion(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  return a.patch > b.patch
}

/**
 * Which channel owns the binary that PATH actually resolves to. Installing a
 * package over a binary from another channel creates a second copy and leaves
 * the panel showing a version the user is not running, so an unrecognised
 * shape is reported as `unknown` and never upgraded.
 * @param {unknown} binPath
 * @returns {'npm'|'homebrew'|'native'|'unknown'}
 */
export function detectInstallShape(binPath) {
  const value = String(binPath ?? '').replace(/\\/g, '/')
  if (!value) return 'unknown'
  if (value.includes('/node_modules/')) return 'npm'
  if (value.includes('/Cellar/') || value.includes('/Caskroom/') || value.includes('/homebrew/')) return 'homebrew'
  if (value.includes('/.kimi-code/')) return 'native'
  return 'unknown'
}

/**
 * The npm that owns a global package, derived from the binary it installed:
 * `<prefix>/lib/node_modules/<pkg>/…` → `<prefix>/bin/npm`. Anything that was
 * not installed through a node_modules tree gets null, so a native binary can
 * never be "upgraded" by writing a second copy into an npm prefix.
 * @param {unknown} binPath
 */
export function npmPathForBin(binPath) {
  const value = String(binPath ?? '').replace(/\\/g, '/')
  const marker = value.lastIndexOf('/node_modules/')
  if (marker <= 0) return null
  const prefix = value.slice(0, marker).replace(/\/lib$/, '')
  return prefix ? `${prefix}/bin/npm` : null
}

/**
 * Remove credential-shaped fragments from child-process output before it can
 * reach an HTTP response or a log line.
 * @param {unknown} text
 */
export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/(\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1***:***@')
    .replace(/(_authToken=)[^\s&]+/gi, '$1***')
    .replace(/\bnpm_[A-Za-z0-9]{8,}\b/g, 'npm_***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .slice(-DETAIL_LIMIT)
    .trim()
}

/**
 * Newest published version of an npm package. In-process fetch with a hard
 * timeout: `npm view` hangs behind a dead proxy and then answers from its own
 * cache, which a caller cannot tell apart from a fresh result.
 * @param {string} pkg
 * @param {typeof fetch} fetchImpl
 */
async function latestFromRegistry(pkg, fetchImpl) {
  const response = await fetchImpl(`${REGISTRY_URL}/${encodeURIComponent(pkg)}/latest`, {
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  })
  if (!response || response.ok !== true) throw new Error('registry-unavailable')
  const body = await response.json()
  const version = body?.['dist-tags']?.latest || body?.version
  if (typeof version !== 'string' || !parseVersion(version)) throw new Error('registry-payload-unusable')
  return version
}

/**
 * Newest version a self-updating CLI recorded in its own release ledger. This
 * is the only truthful source for a native install whose npm namesake ships a
 * different artifact on a diverged version train.
 * @param {{ ledgerPath?: string, ledgerVersionKey?: string }} update
 * @param {string} home
 * @param {typeof fs} fsImpl
 */
function latestFromLedger(update, home, fsImpl) {
  const ledgerPath = String(update?.ledgerPath || '')
  const key = String(update?.ledgerVersionKey || '')
  if (!ledgerPath || !key) return null
  const file = path.isAbsolute(ledgerPath) ? ledgerPath : path.join(home, ledgerPath)
  let raw = ''
  try {
    raw = fsImpl.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const version = parsed && typeof parsed === 'object' ? parsed[key] : null
  return typeof version === 'string' && parseVersion(version) ? version : null
}

/**
 * Cached, offline-tolerant update check. `unknown` is a real answer meaning
 * "this machine could not be asked" — it must never render as "up to date".
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   ttlMs?: number,
 *   cache?: Map<string, { at: number, entry: object }>,
 *   home?: string,
 *   fsImpl?: typeof fs,
 *   resolveBin?: (bin: string) => string,
 * }} [options]
 */
export function createUpdateChecker(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS
  const cache = options.cache instanceof Map ? options.cache : new Map()
  const home = options.home || os.homedir()
  const fsImpl = options.fsImpl || fs
  const resolveBin = typeof options.resolveBin === 'function' ? options.resolveBin : resolveBinPath

  async function check(agents, opts = {}) {
    const rows = Array.isArray(agents) ? agents : []
    const refresh = opts.refresh === true
    const checkedAt = now()
    const updates = {}
    await Promise.all(rows.map(async (row) => {
      const id = typeof row?.id === 'string' ? row.id : ''
      if (!id) return
      const agent = KNOWN_AGENTS.find((item) => item.id === id) || null
      const channel = agent?.update?.channel || 'none'
      const entry = {
        state: 'unknown',
        current: typeof row?.version === 'string' ? row.version : '',
        latest: '',
        channel,
        installShape: 'unknown',
        supported: false,
      }
      updates[id] = entry
      if (!agent || row?.installed !== true) return
      const installShape = detectInstallShape(resolveBin(agent.bin))
      entry.installShape = installShape
      entry.supported = (channel === 'npm' && installShape === 'npm')
        || (channel === 'self' && installShape === 'native')
      if (!entry.supported) return
      const cacheKey = `${id}:${entry.current}:${channel}`
      const cached = cache.get(cacheKey)
      if (!refresh && cached && checkedAt - cached.at < ttlMs) {
        updates[id] = cached.entry
        return
      }
      let latest = null
      if (channel === 'npm') {
        try {
          latest = await latestFromRegistry(agent.update.npmPackage, fetchImpl)
        } catch {
          latest = null
        }
      } else if (channel === 'self') {
        latest = latestFromLedger(agent.update, home, fsImpl)
      }
      if (latest) {
        entry.latest = latest
        // An unparseable side means the comparison is impossible, not "current".
        entry.state = parseVersion(latest) && parseVersion(entry.current)
          ? (isNewerVersion(latest, entry.current) ? 'available' : 'current')
          : 'unknown'
      }
      cache.set(cacheKey, { at: checkedAt, entry })
      updates[id] = entry
    }))
    return { checkedAt, updates }
  }

  return { check, cache }
}

/**
 * Run the upgrade that matches the detected install shape. Only the capability
 * table decides the command; the caller supplies an agent id, never a command.
 * @param {string} id
 * @param {{
 *   shape?: string,
 *   run?: Function,
 *   home?: string,
 *   timeoutMs?: number,
 *   probeVersion?: (bin: string) => Promise<{ installed: boolean, version: string }>,
 * }} [options]
 */
export async function runAgentUpdate(id, options = {}) {
  const agent = KNOWN_AGENTS.find((item) => item.id === String(id || '').trim()) || null
  if (!agent || !agent.update) return { ok: false, error: 'update-unsupported' }
  const shape = options.shape || 'unknown'
  const channel = agent.update.channel
  const home = options.home || os.homedir()
  const run = typeof options.run === 'function' ? options.run : execFileAsync
  const timeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs : UPDATE_TIMEOUT_MS
  let bin = ''
  let args = []
  if (channel === 'npm' && shape === 'npm') {
    const npmPath = npmPathForBin(resolveBinPath(agent.bin))
    if (!npmPath) return { ok: false, error: 'update-unsupported' }
    bin = npmPath
    args = ['install', '-g', `${agent.update.npmPackage}@latest`]
  } else if (channel === 'self' && shape === 'native' && agent.update.selfCommand) {
    bin = agent.update.selfCommand.bin
    args = [...agent.update.selfCommand.args]
  } else {
    return { ok: false, error: 'update-unsupported' }
  }
  let failure = null
  try {
    // cwd is the user's home so a committed project .npmrc cannot redirect the
    // registry the upgrade talks to.
    await run(bin, args, { cwd: home, timeout, maxBuffer: UPDATE_MAX_BUFFER })
  } catch (error) {
    failure = error
  }
  if (failure) {
    const detail = redactSecrets(failure?.stderr || failure?.message || failure)
    return { ok: false, error: 'update-failed', detail }
  }
  const probe = typeof options.probeVersion === 'function' ? options.probeVersion : probeAgentBin
  let version = ''
  try {
    const probed = await probe(agent.bin)
    version = typeof probed?.version === 'string' ? probed.version : ''
  } catch {
    version = ''
  }
  return { ok: true, version }
}
