import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_CONTRACTS_DIR = path.join(__dirname, 'contracts')

/**
 * Parses frontmatter and body from a markdown contract.
 *
 * @param {string} rawContent
 * @param {string} [fallbackName]
 * @returns {{ name: string, agents: string[], body: string }}
 */
export function parseContractContent(rawContent, fallbackName = 'unknown') {
  if (typeof rawContent !== 'string') {
    return { name: fallbackName, agents: [], body: '' }
  }

  const trimmed = rawContent.trim()
  if (!trimmed.startsWith('---')) {
    return { name: fallbackName, agents: ['*'], body: trimmed }
  }

  const secondDelimiter = trimmed.indexOf('\n---', 3)
  if (secondDelimiter === -1) {
    return { name: fallbackName, agents: ['*'], body: trimmed }
  }

  const frontmatterStr = trimmed.slice(3, secondDelimiter).trim()
  const body = trimmed.slice(secondDelimiter + 4).trim()

  let name = fallbackName
  /** @type {string[]} */
  let agents = []

  const lines = frontmatterStr.split('\n')
  let inAgentsList = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    if (line.startsWith('name:')) {
      const val = line.slice(5).trim()
      if (val) name = val.replace(/^['"]|['"]$/g, '')
      inAgentsList = false
      continue
    }

    if (line.startsWith('agents:')) {
      const rest = line.slice(7).trim()
      if (rest.startsWith('[') && rest.endsWith(']')) {
        agents = rest
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
        inAgentsList = false
      } else if (!rest) {
        inAgentsList = true
      }
      continue
    }

    if (inAgentsList && line.startsWith('-')) {
      const item = line.slice(1).trim().replace(/^['"]|['"]$/g, '')
      if (item) agents.push(item)
    }
  }

  if (agents.length === 0) {
    agents = ['*']
  }

  return { name, agents, body }
}

/**
 * Loads all active contracts matching target agent.
 *
 * @param {{ contractsDir?: string, agentName?: string }} [options]
 * @returns {{ contracts: Array<{ name: string, agents: string[], body: string, file: string }>, formatted: string }}
 */
export function loadActiveContracts(options = {}) {
  const contractsDir = options.contractsDir || DEFAULT_CONTRACTS_DIR
  const agentName = (options.agentName || 'orchestrator').toLowerCase().trim()

  if (!fs.existsSync(contractsDir)) {
    return { contracts: [], formatted: '' }
  }

  let entries = []
  try {
    entries = fs.readdirSync(contractsDir).sort()
  } catch {
    return { contracts: [], formatted: '' }
  }

  const matched = []

  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry.toLowerCase() === 'readme.md') continue
    const fullPath = path.join(contractsDir, entry)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const fallbackName = entry.replace(/\.md$/i, '')
      const parsed = parseContractContent(content, fallbackName)

      const isMatch =
        parsed.agents.includes('*') ||
        parsed.agents.some((a) => a.toLowerCase() === agentName)

      if (isMatch && parsed.body) {
        matched.push({
          ...parsed,
          file: entry,
        })
      }
    } catch {
      // Ignore unreadable contract files gracefully
    }
  }

  const formattedParts = matched.map(
    (c) => `<contract name="${c.name}">\n${c.body}\n</contract>`
  )

  const formatted =
    formattedParts.length > 0
      ? `## Living Agent Contracts\n\n${formattedParts.join('\n\n')}`
      : ''

  return { contracts: matched, formatted }
}

/**
 * Mounts contracts into DSH systemPrompt section if available.
 *
 * @param {object} ctx Cordis context
 * @param {{ contractsDir?: string, defaultAgentName?: string }} [options]
 */
export function mountContractsPrompt(ctx, options = {}) {
  const contractsDir = options.contractsDir || DEFAULT_CONTRACTS_DIR
  const defaultAgentName = options.defaultAgentName || 'orchestrator'

  if (ctx?.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    const { formatted } = loadActiveContracts({ contractsDir, agentName: defaultAgentName })
    if (formatted) {
      ctx.systemPrompt.section({
        name: 'omnimux-contracts',
        order: 20,
        text: formatted,
      })
    }
  }

  return {
    getContractsForAgent: (agentName) =>
      loadActiveContracts({ contractsDir, agentName }),
  }
}
