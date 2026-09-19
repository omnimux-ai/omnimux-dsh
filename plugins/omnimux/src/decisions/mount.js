import { assertCapabilityEnabled, isToolEnabled } from '../gate/guard.js'
import { OmnimuxError } from '../media/errors.js'
import { executeJevDecision } from './execute.js'

/**
 * Mount the TypeSafe Jev Decision model tool on the OmniMux Hub.
 *
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   provide?: (name: string, value: unknown) => void,
 *   get?: (name: string) => unknown,
 * }} ctx
 * @param {{
 *   hub?: { gate?: object },
 *   gate?: object,
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   resolveApiKey?: () => Promise<string | undefined> | string | undefined,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   objectParams: Function,
 *   jsonOut: object,
 *   rethrow: (error: unknown) => never,
 * }} deps
 */
export function mountDecisions(ctx, deps) {
  const gate = deps.gate ?? deps.hub?.gate ?? ctx.get?.('gate')
  const toolName = 'omnimux_jev_decision'

  const api = {
    /**
     * @param {{
     *   state: unknown,
     *   choices?: Record<string, string> | string[],
     *   score_criteria?: string[],
     *   instructions?: string,
     *   questions?: Record<string, unknown>,
     *   model?: string,
     * }} args
     * @param {{ signal?: AbortSignal }} [options]
     */
    evaluate(args, options) {
      assertCapabilityEnabled(gate, toolName, 'tool')
      return executeJevDecision(
        {
          env: deps.env,
          fetcher: deps.fetcher,
          credentials: deps.credentials || ctx.get?.('credentials'),
          resolveApiKey: deps.resolveApiKey,
        },
        args,
        options,
      )
    },
  }

  if (typeof ctx.provide === 'function') {
    ctx.provide('decisions', api)
  }

  if (!isToolEnabled(gate, toolName)) return

  ctx.tools.register({
    name: toolName,
    description:
      'Execute high-speed structured decision-making or quantitative scoring using TypeSafe Jev latest model (~typesafe/jev-latest). This is a dedicated System One decision engine on OpenRouter for binary/multi-choice triage, policy gates, quality scoring, and routing. Pass state (context) and either choices (options dict/list) or score_criteria (scale list). Returns typed decision, confidence score, and full probability distribution.',
    parameters: deps.objectParams({
      state: {
        type: 'string',
        required: true,
        description: 'Context, premise, code snippet, or facts to evaluate.',
      },
      choices: {
        type: 'object',
        description: 'Options mapping for single-choice decision, e.g. {"approve": "Approve changes", "reject": "Reject with feedback"}.',
      },
      score_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Graded evaluation scale for numerical scoring, e.g. ["Poor", "Fair", "Good", "Great", "Excellent"].',
      },
      instructions: {
        type: 'string',
        description: 'Specific evaluation guidance or decision policy.',
      },
      questions: {
        type: 'object',
        description: 'Advanced custom multi-question schema for complex decision matrices.',
      },
      model: {
        type: 'string',
        description: 'OpenRouter decision model id. Defaults to ~typesafe/jev-latest.',
      },
    }),
    output: deps.jsonOut,
    async execute(args, exec) {
      try {
        assertCapabilityEnabled(gate, toolName, 'tool')
        return await executeJevDecision(
          {
            env: deps.env,
            fetcher: deps.fetcher,
            credentials: deps.credentials || ctx.get?.('credentials'),
            resolveApiKey: deps.resolveApiKey,
          },
          args,
          { signal: exec?.signal },
        )
      } catch (error) {
        if (error instanceof OmnimuxError) throw error
        return deps.rethrow(error)
      }
    },
  })
}
