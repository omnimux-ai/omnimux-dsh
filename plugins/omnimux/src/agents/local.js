import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

/**
 * Local agent CLIs the onboarding can offer. `bin` is the executable name as
 * it appears on PATH; nothing here is a dev-machine address or a fallback —
 * an agent that is not installed is simply not offered.
 *
 * `auth`, `login` and `update` are per-CLI capability descriptors, not guesses.
 * `auth` says how sign-in state is observed offline (a command whose exit code
 * answers it, or credential files whose non-secret keys do); `login` is the
 * command that starts an account sign-in, or null when the vendor no longer
 * offers one; `update` names the channel the binary actually came from — a CLI
 * whose install shape cannot be determined is never upgraded.
 */
export const KNOWN_AGENTS = Object.freeze([
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    models: Object.freeze([
      'claude-3-7-sonnet',
      'claude-3-5-sonnet',
      'claude-3-5-haiku',
      'claude-3-opus',
    ]),
    auth: Object.freeze({
      kind: 'command',
      command: Object.freeze({ bin: 'claude', args: Object.freeze(['auth', 'status']) }),
      jsonFlag: 'loggedIn',
    }),
    login: Object.freeze({ bin: 'claude', args: Object.freeze(['auth', 'login']) }),
    update: Object.freeze({ channel: 'npm', npmPackage: '@anthropic-ai/claude-code' }),
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    models: Object.freeze([
      'gpt-6-astra',
      'gpt-6-sol',
      'gpt-6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
    ]),
    // `codex login status` prints nothing to stdout: the exit code is the answer.
    auth: Object.freeze({
      kind: 'command',
      command: Object.freeze({ bin: 'codex', args: Object.freeze(['login', 'status']) }),
    }),
    login: Object.freeze({ bin: 'codex', args: Object.freeze(['login']) }),
    update: Object.freeze({ channel: 'npm', npmPackage: '@openai/codex' }),
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    models: Object.freeze([
      'kimi-code/k3',
      'kimi-code/k3-256k',
      'kimi-code/kimi-for-coding',
      'kimi-code/kimi-for-coding-highspeed',
    ]),
    auth: Object.freeze({
      kind: 'file',
      paths: Object.freeze(['.kimi-code/credentials/*.json']),
      tokenKeys: Object.freeze(['access_token', 'refresh_token']),
    }),
    login: Object.freeze({ bin: 'kimi', args: Object.freeze(['login']) }),
    // Native install: npm ships a different artifact on a diverged version
    // train, so this CLI's own release ledger is the only truthful source.
    update: Object.freeze({
      channel: 'self',
      // `--yes` exists on newer builds; 0.34 ignores it. Without a TTY even
      // 0.34 only prints the manual command and exits 0.
      selfCommand: Object.freeze({ bin: 'kimi', args: Object.freeze(['upgrade', '--yes']) }),
      ledgerPath: '.kimi-code/updates/latest.json',
      ledgerVersionKey: 'latest',
      // 0.34.0's upgrade cannot install non-interactively: it prints the text
      // below and exits 0 without touching the binary. Re-run the official
      // installer (the same command Kimi's own native upgrade spawns).
      manualOnlyPattern: 'To update manually|Auto-update is not supported',
      fallbackCommand: Object.freeze({
        darwin: Object.freeze({ bin: 'bash', args: Object.freeze(['-c', 'set -o pipefail; curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash']) }),
        linux: Object.freeze({ bin: 'bash', args: Object.freeze(['-c', 'set -o pipefail; curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash']) }),
        win32: Object.freeze({ bin: 'powershell', args: Object.freeze(['-NoProfile', '-Command', 'irm https://code.kimi.com/kimi-code/install.ps1 | iex']) }),
      }),
    }),
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    models: Object.freeze([
      'qwen-max',
      'qwen-plus',
      'qwen-turbo',
      'qwen-2.5-coder-32b',
    ]),
    auth: Object.freeze({
      kind: 'file',
      paths: Object.freeze(['.qwen/oauth_creds.json']),
      tokenKeys: Object.freeze(['access_token']),
    }),
    // Qwen retired its account OAuth flow; there is no sign-in command to run.
    login: null,
    update: Object.freeze({ channel: 'npm', npmPackage: '@qwen-code/qwen-code' }),
  },
])

function extraBinDirs(home, fsImpl) {
  const dirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.kimi-code', 'bin'),
    path.join(home, '.grok', 'bin'),
    path.join(home, '.codeium', 'windsurf', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, 'Library', 'pnpm'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  try {
    const nvmRoot = path.join(home, '.nvm', 'versions', 'node')
    const versions = fsImpl.readdirSync(nvmRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    for (const version of versions) dirs.push(path.join(nvmRoot, version, 'bin'))
  } catch {
    // No nvm install; ignore.
  }
  return dirs
}

/**
 * Resolve an executable name to the absolute path PATH would pick. A missing
 * name is an empty string, never a guess; an explicit path is resolved as-is.
 * @param {string} bin
 * @param {{ env?: Record<string, string|undefined>, fsImpl?: typeof fs, platform?: string }} [options]
 */
export function resolveBinPath(bin, options = {}) {
  const env = options.env || process.env
  const fsImpl = options.fsImpl || fs
  const platform = options.platform || process.platform
  const raw = String(bin || '').trim()
  if (!raw) return ''
  const realpath = (value) => {
    try {
      return typeof fsImpl.realpathSync === 'function' ? fsImpl.realpathSync(value) : value
    } catch {
      return value
    }
  }
  const executable = (candidate) => {
    try {
      if (typeof fsImpl.accessSync !== 'function') return true
      fsImpl.accessSync(candidate, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  if (raw.includes('/') || raw.includes('\\')) {
    try {
      if (!fsImpl.existsSync(raw)) return ''
    } catch {
      return ''
    }
    return executable(raw) ? realpath(raw) : ''
  }
  const home = env.HOME || os.homedir()
  const pathDirs = String(env.PATH || '').split(platform === 'win32' ? ';' : ':').filter(Boolean)
  const dirs = [...new Set([...pathDirs, ...extraBinDirs(home, fsImpl)])]
  const extensions = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, raw + extension)
      try {
        if (!fsImpl.existsSync(candidate)) continue
      } catch {
        continue
      }
      if (executable(candidate)) return realpath(candidate)
    }
  }
  return ''
}

const PROBE_TIMEOUT_MS = 5000

const SAFE_MODEL_REGEX = /^[a-zA-Z0-9_.:/-]+$/

/**
 * Validates that an agent model identifier is safe to pass as a CLI option value.
 * Disallows empty strings, leading hyphens (which could trigger option parsing bugs),
 * and special shell characters.
 * @param {any} model
 * @returns {boolean}
 */
export function isSafeAgentModel(model) {
  if (typeof model !== 'string') return false
  const trimmed = model.trim()
  if (!trimmed || trimmed.startsWith('-')) return false
  return SAFE_MODEL_REGEX.test(trimmed)
}

/**
 * Dynamically probes the local runtime/cache files for an agent's available models.
 * If the config/cache is present, returns live model identifiers; otherwise returns
 * the static known models for that agent.
 * @param {string} id
 * @param {{ codexPath?: string, kimiPath?: string, runCodexModels?: () => string }} [options]
 * @returns {string[]}
 */
export function probeAgentModels(id, options = {}) {
  try {
    if (id === 'codex') {
      const runModels = options.codexPath
        ? null
        : (typeof options.runCodexModels === 'function'
            ? options.runCodexModels
            : () => execFileSync('codex', ['debug', 'models'], {
                timeout: 5000,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
              }))
      let live = null
      try {
        live = runModels ? JSON.parse(String(runModels() || '')) : null
      } catch {
        live = null
      }
      if (live && Array.isArray(live.models)) {
        const list = live.models
          .filter((model) => model && model.visibility === 'list')
          .map((model) => String(model.slug || model.id || '').trim())
          .filter((model) => isSafeAgentModel(model))
        if (list.length > 0) return [...new Set(list)]
      }
      const cachePath = options.codexPath || path.join(os.homedir(), '.codex', 'models_cache.json')
      if (fs.existsSync(cachePath)) {
        const raw = fs.readFileSync(cachePath, 'utf8')
        const data = JSON.parse(raw)
        if (Array.isArray(data.models)) {
          const list = data.models
            .filter((m) => m && m.visibility === 'list')
            .map((m) => String(m.id || m.slug || '').trim())
            .filter((m) => isSafeAgentModel(m))
          if (list.length > 0) return [...new Set(list)]
        }
      }
    } else if (id === 'kimi') {
      const configPath = options.kimiPath || path.join(os.homedir(), '.kimi-code', 'config.toml')
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8')
        const matches = [...raw.matchAll(/\[models\.["']([^"']+)["']\]/g)].map((m) => m[1].trim())
        const list = matches.filter((m) => isSafeAgentModel(m))
        if (list.length > 0) return [...new Set(list)]
      }
    }
  } catch {
    // fallback to preset
  }
  const found = KNOWN_AGENTS.find((a) => a.id === id)
  return found && Array.isArray(found.models) ? [...found.models] : []
}

/**
 * Whether one binary answers `--version`. A missing binary, a timeout, or a
 * non-zero exit all mean "not available" — never a guess, never a fallback.
 * @param {string} bin
 * @param {(file: string, args: string[], opts: object) => Promise<{ stdout: string, stderr: string }>} [run]
 */
export async function probeAgentBin(bin, run = execFileAsync) {
  try {
    const { stdout, stderr } = await run(bin, ['--version'], { timeout: PROBE_TIMEOUT_MS })
    const line = `${stdout || stderr || ''}`.trim().split('\n')[0] ?? ''
    return { installed: true, version: line.slice(0, 120) }
  } catch {
    return { installed: false, version: '' }
  }
}

/**
 * Scan PATH for the known agent CLIs. Returns every known agent with its
 * availability and dynamically probed models.
 * @param {(file: string, args: string[], opts: object) => Promise<{ stdout: string, stderr: string }>} [run]
 * @param {{ codexPath?: string, kimiPath?: string, runCodexModels?: () => string }} [options]
 */
export async function scanLocalAgents(run = execFileAsync, options = {}) {
  const rows = await Promise.all(KNOWN_AGENTS.map(async (agent) => {
    const resolved = resolveBinPath(agent.bin, options)
    const probeRun = resolved
      ? (file, args, opts = {}) => run(file, args, {
          ...opts,
          env: {
            ...process.env,
            PATH: [path.dirname(file), ...extraBinDirs(options.env?.HOME || os.homedir(), options.fsImpl || fs), process.env.PATH]
              .filter(Boolean).join(path.delimiter),
          },
        })
      : run
    const probe = await probeAgentBin(resolved || agent.bin, probeRun)
    const models = probeAgentModels(agent.id, options)
    return {
      id: agent.id,
      name: agent.name,
      installed: probe.installed,
      version: probe.version,
      models: models.length > 0 ? models : (Array.isArray(agent.models) ? [...agent.models] : []),
    }
  }))
  return rows
}

/**
 * The one-shot text command for an agent: how the hub hands a prompt to it.
 * Kept declarative so each CLI's flags live in exactly one place. `--` ends
 * option parsing, so a prompt that starts with a dash is data, never a flag.
 * @param {string} id
 * @param {string} prompt
 * @param {string} [model]
 */
export function agentTextCommand(id, prompt, model = '') {
  const chosenModel = isSafeAgentModel(model) ? model.trim() : ''
  switch (id) {
    case 'claude': {
      const args = ['-p', '--output-format', 'text']
      if (chosenModel) args.push('--model', chosenModel)
      args.push('--', prompt)
      return { bin: 'claude', args }
    }
    case 'codex': {
      const args = ['exec']
      if (chosenModel) args.push('-m', chosenModel)
      args.push('--', prompt)
      return { bin: 'codex', args }
    }
    case 'kimi': {
      const args = ['-p']
      if (chosenModel) args.push('-m', chosenModel)
      args.push('--', prompt)
      return { bin: 'kimi', args }
    }
    case 'qwen': {
      const args = ['-p']
      if (chosenModel) args.push('-m', chosenModel)
      args.push('--', prompt)
      return { bin: 'qwen', args }
    }
    default:
      return null
  }
}

/**
 * Run one text completion through the selected agent CLI. The agent's own
 * sign-in is the user's responsibility — a non-zero exit surfaces its error
 * text; the hub never retries it against the official route.
 * @param {{ id: string, prompt: string, model?: string, timeoutMs?: number, run?: Function }} input
 */
export async function runAgentText({ id, prompt, model = '', timeoutMs = 120000, run = execFileAsync }) {
  const command = agentTextCommand(id, prompt, model)
  if (!command) {
    throw Object.assign(new Error(`unknown agent '${id}'`), { code: 'unknown-agent' })
  }
  try {
    const { stdout } = await run(command.bin, command.args, { timeout: timeoutMs })
    const text = String(stdout ?? '').trim()
    if (!text) {
      throw Object.assign(new Error('agent produced no text'), { code: 'agent-empty' })
    }
    return text
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') throw error
    const detail = String(error?.stderr || error?.message || error).trim().slice(0, 300)
    throw Object.assign(new Error(`agent failed: ${detail || 'unknown'}`), { code: 'agent-failed' })
  }
}
