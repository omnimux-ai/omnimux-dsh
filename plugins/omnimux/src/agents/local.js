import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Local agent CLIs the onboarding can offer. `bin` is the executable name as
 * it appears on PATH; nothing here is a dev-machine address or a fallback —
 * an agent that is not installed is simply not offered.
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
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    models: Object.freeze([
      'gpt-4o',
      'o3-mini',
      'o1',
      'gpt-4.5-preview',
    ]),
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    models: Object.freeze([
      'kimi-latest',
      'moonshot-v1-128k',
      'moonshot-v1-32k',
      'moonshot-v1-8k',
    ]),
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
  },
])

const PROBE_TIMEOUT_MS = 5000

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
 * availability — the UI hides or disables the ones that are not installed.
 * @param {(file: string, args: string[], opts: object) => Promise<{ stdout: string, stderr: string }>} [run]
 */
export async function scanLocalAgents(run = execFileAsync) {
  const rows = await Promise.all(KNOWN_AGENTS.map(async (agent) => {
    const probe = await probeAgentBin(agent.bin, run)
    return {
      id: agent.id,
      name: agent.name,
      installed: probe.installed,
      version: probe.version,
      models: Array.isArray(agent.models) ? [...agent.models] : [],
    }
  }))
  return rows
}

const SAFE_MODEL_REGEX = /^[a-zA-Z0-9_.:/-]+$/

export function isSafeAgentModel(model) {
  if (typeof model !== 'string') return false
  const trimmed = model.trim()
  if (!trimmed || trimmed.startsWith('-')) return false
  return SAFE_MODEL_REGEX.test(trimmed)
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
