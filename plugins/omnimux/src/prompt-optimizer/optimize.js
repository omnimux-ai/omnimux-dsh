import { OmnimuxError } from '../media/errors.js'
import { postSystemOne, resolveJevApiKey } from './typesafe-client.js'
import { buildChoiceCriteria, fillTemplate, getTemplate, FALLBACK_TEMPLATE_ID } from './templates.js'

/** Probability below this routes to the generic fallback even when a scenario template is chosen. */
export const MATCH_THRESHOLD = 0.3

const DECISION_INSTRUCTIONS =
  '判断用户指令属于哪个开发场景提示词模板。若指令与所有候选均不吻合，选择 generic-optimize。'

/**
 * Whether prompt optimization is usable: resolves the JEV_API_KEY chain
 * without throwing. Async because the credentials store resolves
 * asynchronously.
 *
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   credentialsPath?: string,
 * }} [deps]
 * @returns {Promise<boolean>}
 */
export async function isConfigured(deps = {}) {
  try {
    await resolveJevApiKey(deps)
    return true
  } catch {
    return false
  }
}

/**
 * Evaluate a draft: Jev picks the prompt template, the draft is mechanically
 * backfilled into it, and the finished prompt is returned for the composer.
 *
 * @param {{
 *   fetcher?: typeof fetch,
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   credentialsPath?: string,
 * }} deps
 * @param {string} text the user's draft text
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ ok: true, templateId: string, matched: boolean, confidence?: number, probability?: number, prompt: string }>}
 */
export async function evaluate(deps, text, options = {}) {
  const draft = typeof text === 'string' ? text.trim() : ''
  if (!draft) {
    throw new OmnimuxError('omnimux-invalid-request', 'text is required for prompt optimization')
  }

  const criteria = buildChoiceCriteria()
  const raw = await postSystemOne(
    deps,
    {
      state: { user_instruction: draft },
      questions: {
        decision: {
          type: 'choice',
          instructions: DECISION_INSTRUCTIONS,
          criteria,
        },
      },
    },
    { signal: options.signal },
  )

  const answer = raw?.answers?.decision
  const choice = typeof answer?.choice === 'string' ? answer.choice : ''
  const confidence = typeof answer?.confidence === 'number' ? answer.confidence : undefined
  const probability = answer?.probabilities && typeof answer.probabilities[choice] === 'number'
    ? answer.probabilities[choice]
    : undefined

  // Fallback routing: Jev picked the generic template outright, or its pick
  // (including an unknown/unmatched id) lands under the match threshold.
  const matched = choice !== FALLBACK_TEMPLATE_ID
    && getTemplate(choice) !== undefined
    && (probability === undefined || probability >= MATCH_THRESHOLD)
  const templateId = matched ? choice : FALLBACK_TEMPLATE_ID
  const template = getTemplate(templateId)
  if (!template) {
    throw new OmnimuxError('omnimux-upstream-error', `prompt template not found: ${templateId}`)
  }

  return {
    ok: true,
    templateId,
    matched,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(probability !== undefined ? { probability } : {}),
    prompt: fillTemplate(template, draft),
  }
}
