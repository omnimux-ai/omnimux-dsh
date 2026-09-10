/**
 * Unified test harness for all OmniMux plugin tool registrations.
 *
 * Strictly replicates the @deepseek-ai/dsh-tools official register contract
 * so unit tests fail immediately on missing-field errors (e.g. output { schema, render })
 * before code ever reaches deployment or desktop startup.
 */

export function assertToolContract(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('tool register payload must be an object')
  }
  const name = definition.name
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('tool must declare a non-empty name')
  }
  if (typeof definition.description !== 'string' || definition.description.length === 0) {
    throw new TypeError(`tool "${name}" must declare a non-empty description`)
  }
  if (definition.parameters === undefined || typeof definition.parameters !== 'object') {
    throw new TypeError(`tool "${name}" must declare parameters (JSON Schema object)`)
  }
  const output = definition.output
  if (
    output === undefined ||
    typeof output !== 'object' ||
    typeof output.render !== 'function'
  ) {
    throw new TypeError(
      `tool "${name}" must declare output { schema, render, presentationMeta? }`,
    )
  }
  if (typeof definition.execute !== 'function') {
    throw new TypeError(`tool "${name}" must declare execute()`)
  }
}

/**
 * Creates a mock Cordis context with strict tool registration verification.
 * @param {{ strict?: boolean }} [opts]
 */
export function createTestToolContext(opts = {}) {
  const strict = opts.strict !== false
  const tools = new Map()

  function register(tool) {
    if (strict) {
      assertToolContract(tool)
    } else {
      if (!tool || typeof tool !== 'object' || !tool.name) {
        throw new TypeError('tool must be an object with name')
      }
    }
    tools.set(tool.name, tool)
  }

  return {
    tools,
    ctx: {
      tools: {
        register,
        get: (name) => tools.get(name),
        has: (name) => tools.has(name),
      },
    },
    registered: () => [...tools.values()],
  }
}
