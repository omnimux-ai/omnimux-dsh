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
      kind: 'config',
      path: '.qwen/settings.json',
      selectedTypePath: 'security.auth.selectedType',
      providersPath: 'modelProviders',
      envPath: 'env',
      // Default key variable per protocol; a model entry may override it with envKey.
      defaultEnvKeys: Object.freeze({
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        gemini: 'GEMINI_API_KEY',
        'vertex-ai': 'GOOGLE_API_KEY',
      }),
      // Qwen retired the account OAuth flow; keep reading its old store as a fallback.
      legacyPaths: Object.freeze(['.qwen/oauth_creds.json']),
      legacyTokenKeys: Object.freeze(['access_token']),
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
 * A model list captured while reading a CLI's own configuration. `live` means
 * the CLI answered with its current list; `preset` is the shipped fallback and
 * must never be presented as live.
 * @typedef {{ models: string[], source: 'live'|'preset' }} AgentModelProbe
 */

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000
const CODEX_MODELS_MAX_BUFFER = 8 * 1024 * 1024

/**
 * Keep only safe, non-empty, unique model identifiers, preserving order.
 * @param {unknown[]} values
 * @returns {string[]}
 */
function uniqueSafeModels(values) {
  const out = []
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text || !isSafeAgentModel(text) || out.includes(text)) continue
    out.push(text)
  }
  return out
}

/**
 * JSON text as a plain object, or null. CLI output can carry banners or be
 * empty, which is a normal "no answer" rather than a failure to report.
 * @param {unknown} text
 * @returns {object|null}
 */
function parseJsonText(text) {
  try {
    const parsed = JSON.parse(String(text || ''))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Parse exactly the rows a CLI lists for user selection.
 * @param {unknown} payload
 * @returns {string[]}
 */
function codexModelsFromPayload(payload) {
  const parsed = payload && typeof payload === 'object' ? payload : null
  if (!parsed || !Array.isArray(parsed.models)) return []
  return uniqueSafeModels(parsed.models
    .filter((model) => model && model.visibility === 'list')
    .map((model) => model.slug || model.id || ''))
}

/**
 * Read a JSON object without ever throwing on a missing or malformed file.
 * @param {string} file
 * @param {typeof fs} fsImpl
 * @returns {object|null}
 */
function readJsonObject(file, fsImpl) {
  try {
    const parsed = JSON.parse(String(fsImpl.readFileSync(file, 'utf8')))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Model ids Qwen Code declares for its own `/model` picker. `modelProviders`
 * is the current source; `model.name` is the single configured selection used
 * only when no provider list exists.
 * @param {object|null} settings
 * @returns {string[]}
 */
export function qwenProviderModels(settings) {
  if (!settings || typeof settings !== 'object') return []
  const providers = settings.modelProviders
  const declared = []
  if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
    for (const list of Object.values(providers)) {
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        if (typeof entry === 'string') declared.push(entry)
        else if (entry && typeof entry === 'object') declared.push(entry.id || '')
      }
    }
  }
  const fromProviders = uniqueSafeModels(declared)
  if (fromProviders.length > 0) return fromProviders
  const current = settings.model && typeof settings.model === 'object' ? settings.model.name : ''
  return uniqueSafeModels([current])
}

/**
 * Resolve one agent's models and where they came from, with no synchronous
 * child process on the request path.
 * @param {string} id
 * @param {{ codexPath?: string, kimiPath?: string, qwenPath?: string, home?: string, env?: Record<string, string|undefined>, fsImpl?: typeof fs, runCodexModels?: () => string }} [options]
 * @returns {Promise<AgentModelProbe>}
 */
export async function probeAgentModelsDetailed(id, options = {}) {
  const fsImpl = options.fsImpl || fs
  const home = options.home || options.env?.HOME || os.homedir()
  const presetAgent = KNOWN_AGENTS.find((agent) => agent.id === id)
  const presetResult = {
    models: presetAgent && Array.isArray(presetAgent.models) ? [...presetAgent.models] : [],
    source: /** @type {'preset'} */ ('preset'),
  }
  try {
    if (id === 'codex') {
      if (typeof options.runCodexModels === 'function') {
        let text = ''
        try {
          text = String(options.runCodexModels() || '')
        } catch {
          text = ''
        }
        let payload = null
        try {
          payload = JSON.parse(text)
        } catch {
          payload = null
        }
        const live = codexModelsFromPayload(payload)
        if (live.length > 0) return { models: live, source: 'live' }
      } else if (!options.codexPath) {
        // A build without `debug models` is expected capability variance, not an
        // error: the CLI's own cache file is the next source. A real failure
        // there still yields the preset list rather than an empty one. The
        // resolved binary and the widened PATH matter for a GUI launch, whose
        // PATH does not include the user's version-manager shims.
        const codexBin = options.binPath || 'codex'
        const probePath = [
          options.binPath ? path.dirname(options.binPath) : '',
          ...extraBinDirs(home, fsImpl),
          process.env.PATH || '',
        ].filter(Boolean).join(path.delimiter)
        const live = await execFileAsync(codexBin, ['debug', 'models'], {
          timeout: PROBE_TIMEOUT_MS,
          maxBuffer: CODEX_MODELS_MAX_BUFFER,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...process.env, PATH: probePath },
        })
          .then(({ stdout }) => codexModelsFromPayload(parseJsonText(stdout)))
          .catch(() => [])
        if (live.length > 0) return { models: live, source: 'live' }
      }
      const cachePath = options.codexPath || path.join(home, '.codex', 'models_cache.json')
      const cached = readJsonObject(cachePath, fsImpl)
      const live = codexModelsFromPayload(cached)
      return live.length > 0 ? { models: live, source: 'live' } : presetResult
    }
    if (id === 'kimi') {
      const configPath = options.kimiPath || path.join(home, '.kimi-code', 'config.toml')
      let raw = ''
      try {
        raw = String(fsImpl.readFileSync(configPath, 'utf8'))
      } catch {
        raw = ''
      }
      const live = uniqueSafeModels([...raw.matchAll(/\[models\.["']([^"']+)["']\]/g)].map((match) => match[1]))
      return live.length > 0 ? { models: live, source: 'live' } : presetResult
    }
    if (id === 'qwen') {
      const settingsPath = options.qwenPath || path.join(home, '.qwen', 'settings.json')
      const settings = readJsonObject(settingsPath, fsImpl)
      const live = qwenProviderModels(settings)
      return live.length > 0 ? { models: live, source: 'live' } : presetResult
    }
  } catch {
    return presetResult
  }
  return presetResult
}

/**
 * Cache model probes so one page load does not re-run every CLI. `refresh`
 * bypasses the entry for an explicit user scan.
 * @param {{ ttlMs?: number, now?: () => number, cache?: Map<string, { at: number, entry: AgentModelProbe }> }} [options]
 */
export function createAgentModelResolver(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : MODEL_CACHE_TTL_MS
  const cache = options.cache instanceof Map ? options.cache : new Map()
  /**
   * @param {string} id
   * @param {{ binPath?: string, codexPath?: string, kimiPath?: string, qwenPath?: string, home?: string, env?: object, fsImpl?: object, runCodexModels?: () => string, refresh?: boolean }} [context]
   * @returns {Promise<AgentModelProbe>}
   */
  const resolve = async (id, context = {}) => {
    const key = [id, context.binPath || '', context.codexPath || '', context.kimiPath || '', context.qwenPath || '', context.home || ''].join('|')
    const cached = cache.get(key)
    if (context.refresh !== true && cached && now() - cached.at < ttlMs) return cached.entry
    const entry = await probeAgentModelsDetailed(id, context)
    cache.set(key, { at: now(), entry })
    return entry
  }
  return { cache, resolve }
}

/** Shared resolver: the page, the update check and manual rescans all see one cache. */
const defaultModelResolver = createAgentModelResolver()

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
 * availability and its current models, each row naming where the list came from.
 * @param {(file: string, args: string[], opts: object) => Promise<{ stdout: string, stderr: string }>} [run]
 * @param {{ codexPath?: string, kimiPath?: string, qwenPath?: string, home?: string, env?: object, fsImpl?: object, runCodexModels?: () => string, refresh?: boolean, resolveModels?: { resolve: (id: string, context?: object) => Promise<AgentModelProbe> } }} [options]
 */
export async function scanLocalAgents(run = execFileAsync, options = {}) {
  const resolver = options.resolveModels && typeof options.resolveModels.resolve === 'function'
    ? options.resolveModels
    : defaultModelResolver
  const home = options.home || options.env?.HOME || os.homedir()
  const rows = await Promise.all(KNOWN_AGENTS.map(async (agent) => {
    const resolved = resolveBinPath(agent.bin, options)
    const probeRun = resolved
      ? (file, args, opts = {}) => run(file, args, {
          ...opts,
          env: {
            ...process.env,
            PATH: [path.dirname(file), ...extraBinDirs(home, options.fsImpl || fs), process.env.PATH]
              .filter(Boolean).join(path.delimiter),
          },
        })
      : run
    const probe = await probeAgentBin(resolved || agent.bin, probeRun)
    let probed = null
    try {
      probed = await resolver.resolve(agent.id, {
        binPath: resolved,
        home,
        fsImpl: options.fsImpl || fs,
        env: options.env || process.env,
        codexPath: options.codexPath,
        kimiPath: options.kimiPath,
        qwenPath: options.qwenPath,
        runCodexModels: options.runCodexModels,
        refresh: options.refresh === true,
      })
    } catch {
      probed = null
    }
    const models = probed && Array.isArray(probed.models) && probed.models.length > 0
      ? probed.models
      : (Array.isArray(agent.models) ? [...agent.models] : [])
    return {
      id: agent.id,
      name: agent.name,
      installed: probe.installed,
      version: probe.version,
      models,
      modelsSource: probed && probed.source === 'live' ? 'live' : 'preset',
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
