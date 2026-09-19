import { OmnimuxError } from '../media/errors.js'
import { DEFAULT_JEV_MODEL, postDecisions } from './client.js'

/**
 * Normalize and validate state input
 * @param {unknown} state
 * @returns {unknown}
 */
export function normalizeState(state) {
  if (state === undefined || state === null || state === '') {
    throw new OmnimuxError('omnimux-invalid-request', 'state is required for decision evaluation')
  }
  return state
}

/**
 * Build questions record from user arguments
 * @param {{
 *   questions?: Record<string, unknown>,
 *   choices?: Record<string, string> | string[],
 *   score_criteria?: string[],
 *   scoreCriteria?: string[],
 *   instructions?: string,
 * }} args
 * @returns {Record<string, unknown>}
 */
export function buildQuestions(args = {}) {
  const result = { ...(args.questions || {}) }

  // 1. Convert choices to choice question
  if (args.choices) {
    let criteria = {}
    if (Array.isArray(args.choices)) {
      for (const item of args.choices) {
        const key = String(item).trim()
        if (key) criteria[key] = key
      }
    } else if (typeof args.choices === 'object' && args.choices !== null) {
      criteria = { ...args.choices }
    }
    if (Object.keys(criteria).length > 0) {
      result.decision = {
        type: 'choice',
        instructions: args.instructions || 'Select the most appropriate choice given the state.',
        criteria,
      }
    }
  }

  // 2. Convert score_criteria to score question
  const scoreCriteria = args.score_criteria || args.scoreCriteria
  if (Array.isArray(scoreCriteria) && scoreCriteria.length > 0) {
    result.score = {
      type: 'score',
      instructions: args.instructions || 'Evaluate the score based on the given criteria scale.',
      criteria: scoreCriteria.map((c) => String(c).trim()),
    }
  }

  if (Object.keys(result).length === 0) {
    throw new OmnimuxError(
      'omnimux-invalid-request',
      'At least one question must be specified via "choices", "score_criteria", or "questions"',
    )
  }

  return result
}

/**
 * Execute a decision request using TypeSafe Jev model via OpenRouter
 *
 * @param {{
 *   fetcher?: typeof fetch,
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   resolveApiKey?: () => Promise<string | undefined> | string | undefined,
 * }} deps
 * @param {{
 *   state: unknown,
 *   choices?: Record<string, string> | string[],
 *   score_criteria?: string[],
 *   scoreCriteria?: string[],
 *   instructions?: string,
 *   questions?: Record<string, unknown>,
 *   model?: string,
 * }} args
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function executeJevDecision(deps, args, options = {}) {
  const state = normalizeState(args?.state)
  const questions = buildQuestions(args)
  const model = args?.model || DEFAULT_JEV_MODEL

  const raw = await postDecisions(deps, { model, state, questions }, options)

  const answers = raw?.answers || {}
  const keys = Object.keys(answers)

  let primaryDecision = undefined
  let primaryScore = undefined
  let confidence = undefined

  if (answers.decision && answers.decision.type === 'choice') {
    primaryDecision = answers.decision.choice
    confidence = answers.decision.confidence
  } else if (keys.length === 1 && answers[keys[0]]?.type === 'choice') {
    primaryDecision = answers[keys[0]].choice
    confidence = answers[keys[0]].confidence
  }

  if (answers.score && answers.score.type === 'score') {
    primaryScore = answers.score.score
    if (confidence === undefined) confidence = answers.score.confidence
  } else if (keys.length === 1 && answers[keys[0]]?.type === 'score') {
    primaryScore = answers[keys[0]].score
    if (confidence === undefined) confidence = answers[keys[0]].confidence
  }

  return {
    mode: 'live',
    model: raw.model || model,
    ...(primaryDecision !== undefined ? { decision: primaryDecision } : {}),
    ...(primaryScore !== undefined ? { score: primaryScore } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    answers,
    usage: raw.usage || {},
    id: raw.id,
    provider: raw.provider || 'TypeSafe',
  }
}
