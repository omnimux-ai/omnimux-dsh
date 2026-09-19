import { OmnimuxError } from '../media/errors.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const DECISIONS_API_URL = 'https://openrouter.ai/api/alpha/decisions'
export const DEFAULT_JEV_MODEL = '~typesafe/jev-latest'

/**
 * Resolve OpenRouter API Key from various sources:
 * 1. Explicit resolver function (sync or async)
 * 2. Dependency env object
 * 3. Process environment
 * 4. DSH credentials store service
 * 5. Local ~/.dsh/.credentials.yaml fallback
 *
 * @param {{
 *   resolveApiKey?: () => Promise<string | undefined> | string | undefined,
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 * }} deps
 * @returns {Promise<string>}
 */
export async function resolveOpenRouterApiKey(deps = {}) {
  if (typeof deps.resolveApiKey === 'function') {
    const fromResolver = await deps.resolveApiKey()
    if (fromResolver && typeof fromResolver === 'string' && fromResolver.trim()) {
      return fromResolver.trim()
    }
  }

  const fromEnv = String(deps.env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '').trim()
  if (fromEnv) return fromEnv

  if (deps.credentials && typeof deps.credentials.resolve === 'function') {
    try {
      const hit = await deps.credentials.resolve('OPENROUTER_API_KEY')
      const value = hit && typeof hit.value === 'string' ? hit.value.trim() : ''
      if (value) return value
    } catch {
      // ignore resolution error and fall through
    }
  }

  // Direct ~/.dsh/.credentials.yaml read
  try {
    const credPath = join(homedir(), '.dsh/.credentials.yaml')
    if (existsSync(credPath)) {
      const raw = readFileSync(credPath, 'utf-8')
      const match = raw.match(/OPENROUTER_API_KEY:\s*["']?([^"'\r\n]+)["']?/)
      if (match && match[1] && match[1].trim()) {
        return match[1].trim()
      }
    }
  } catch {
    // ignore
  }

  throw new OmnimuxError(
    'omnimux-auth-required',
    'OPENROUTER_API_KEY is required to call the Jev decisions model. Please configure it in ~/.dsh/.credentials.yaml',
  )
}

/**
 * Call the OpenRouter decisions endpoint.
 *
 * @param {{
 *   fetcher?: typeof fetch,
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   resolveApiKey?: () => Promise<string | undefined> | string | undefined,
 * }} deps
 * @param {{
 *   model?: string,
 *   state: unknown,
 *   questions: Record<string, unknown>,
 * }} body
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function postDecisions(deps, body, options = {}) {
  const apiKey = await resolveOpenRouterApiKey(deps)
  const fetchFn = deps?.fetcher || globalThis.fetch

  const res = await fetchFn(DECISIONS_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://omnimux.ai',
      'X-Title': 'OmniMux DSH',
    },
    body: JSON.stringify({
      model: body.model || DEFAULT_JEV_MODEL,
      state: body.state,
      questions: body.questions,
    }),
    signal: options.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let errMsg = `OpenRouter decisions API failed with status ${res.status}`
    try {
      const parsed = JSON.parse(text)
      if (parsed?.error?.message) {
        errMsg = parsed.error.message
      }
    } catch {
      if (text) errMsg += `: ${text.slice(0, 300)}`
    }
    throw new OmnimuxError('omnimux-upstream-error', errMsg, { status: res.status })
  }

  return await res.json()
}
