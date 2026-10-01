import { OmnimuxError } from '../media/errors.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const JEV_MODEL = 'jev-latest'
export const SYSTEMONE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const USER_AGENT = 'OmniMuxHub/0.1.2 (omnimux_prompt_optimizer; +https://omnimux.ai)'
const KEY_REF = 'JEV_API_KEY'

/**
 * Resolve the TypeSafe Jev API key through the same three-tier chain the
 * decisions gateway uses (decisions/client.js resolveGatewayApiKey), narrowed
 * to the single JEV_API_KEY ref:
 * 1. Dependency env object / process environment (JEV_API_KEY)
 * 2. DSH credentials store service (JEV_API_KEY)
 * 3. Local ~/.dsh/.credentials.yaml fallback
 *
 * The key never reaches the client bundle; this module only runs host-side.
 *
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   credentialsPath?: string,
 * }} [deps]
 * @returns {Promise<string>}
 */
export async function resolveJevApiKey(deps = {}) {
  const env = deps.env !== undefined ? deps.env : process.env
  const fromEnv = String(env?.[KEY_REF] || '').trim()
  if (fromEnv) return fromEnv

  if (deps.credentials && typeof deps.credentials.resolve === 'function') {
    try {
      const hit = await deps.credentials.resolve(KEY_REF)
      const value = hit && typeof hit.value === 'string' ? hit.value.trim() : ''
      if (value) return value
    } catch {
      // ignore resolution error and fall through
    }
  }

  // Direct ~/.dsh/.credentials.yaml read
  try {
    const credPath = deps.credentialsPath || join(homedir(), '.dsh/.credentials.yaml')
    if (existsSync(credPath)) {
      const raw = readFileSync(credPath, 'utf-8')
      const match = raw.match(new RegExp(`${KEY_REF}:\\s*["']?([^"'\\r\\n]+)["']?`))
      if (match && match[1] && match[1].trim()) {
        return match[1].trim()
      }
    }
  } catch {
    // ignore
  }

  throw new OmnimuxError('omnimux-unconfigured', 'set JEV_API_KEY to use prompt optimizer')
}

/**
 * POST one TypeSafe System One (Jev) evaluation, direct to api.typesafe.ai.
 * Unlike the OmniMux gateway path, this is an official direct upstream: the
 * key is a plain Bearer token and quota classification does not apply.
 *
 * @param {{
 *   fetcher?: typeof fetch,
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   credentialsPath?: string,
 * }} deps
 * @param {{ state: unknown, questions: Record<string, unknown> }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<unknown>} the parsed JSON response body
 */
export async function postSystemOne(deps, payload, options = {}) {
  const apiKey = await resolveJevApiKey(deps)
  const fetchFn = deps?.fetcher || globalThis.fetch

  const res = await fetchFn(SYSTEMONE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: payload.state,
      questions: payload.questions,
    }),
    signal: options.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // ignore
    }

    let errMsg = `TypeSafe systemone failed with status ${res.status}`
    if (json?.error?.message) {
      errMsg = json.error.message
    } else if (json?.message) {
      errMsg = json.message
    } else if (text) {
      errMsg += `: ${text.slice(0, 300)}`
    }
    throw new OmnimuxError('omnimux-upstream-error', errMsg, { status: res.status })
  }

  return await res.json()
}
