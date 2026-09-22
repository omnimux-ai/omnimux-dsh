import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Local agent CLIs the onboarding can offer. `bin` is the executable name as
 * it appears on PATH; nothing here is a dev-machine address or a fallback —
 * an agent that is not installed is simply not offered.
 */
export const KNOWN_AGENTS = Object.freeze([
  { id: 'claude', name: 'Claude Code', bin: 'claude' },
  { id: 'codex', name: 'Codex CLI', bin: 'codex' },
  { id: 'kimi', name: 'Kimi CLI', bin: 'kimi' },
  { id: 'qwen', name: 'Qwen Code', bin: 'qwen' },
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
    return { id: agent.id, name: agent.name, installed: probe.installed, version: probe.version }
  }))
  return rows
}

/**
 * The one-shot text command for an agent: how the hub hands a prompt to it.
 * Kept declarative so each CLI's flags live in exactly one place. `--` ends
 * option parsing, so a prompt that starts with a dash is data, never a flag.
 * @param {string} id
 * @param {string} prompt
 */
export function agentTextCommand(id, prompt) {
  switch (id) {
    case 'claude':
      return { bin: 'claude', args: ['-p', '--output-format', 'text', '--', prompt] }
    case 'codex':
      return { bin: 'codex', args: ['exec', '--', prompt] }
    case 'kimi':
      return { bin: 'kimi', args: ['-p', '--', prompt] }
    case 'qwen':
      return { bin: 'qwen', args: ['-p', '--', prompt] }
    default:
      return null
  }
}

/**
 * Run one text completion through the selected agent CLI. The agent's own
 * sign-in is the user's responsibility — a non-zero exit surfaces its error
 * text; the hub never retries it against the official route.
 * @param {{ id: string, prompt: string, timeoutMs?: number, run?: Function }} input
 */
export async function runAgentText({ id, prompt, timeoutMs = 120000, run = execFileAsync }) {
  const command = agentTextCommand(id, prompt)
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
