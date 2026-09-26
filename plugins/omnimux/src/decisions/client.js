import { OmnimuxError } from '../media/errors.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const DEFAULT_JEV_MODEL = 'jev'
export const DEFAULT_DECISIONS_BASE = 'https://api.omnimux.ai/v1'
const USER_AGENT = 'OmniMuxHub/0.1.2 (omnimux_jev_decision; +https://omnimux.ai)'

/**
 * Resolve Decisions Gateway Base URL from env or fallback.
 * @param {string | undefined} raw
 * @returns {string}
 */
export function resolveDecisionsBaseUrl(raw) {
  const base = String(raw || DEFAULT_DECISIONS_BASE).trim().replace(/\/+$/, '')
  if (!base) return DEFAULT_DECISIONS_BASE
  if (/\/v1$/i.test(base)) return base
  return `${base}/v1`
}

/**
 * Resolve Gateway API Key from official credentials:
 * 1. Explicit resolver function (sync or async)
 * 2. Dependency env object (OMNIMUX_API_KEY / OMNIMUX_TOKEN)
 * 3. Process environment (OMNIMUX_API_KEY / OMNIMUX_TOKEN)
 * 4. DSH credentials store service (OMNIMUX_API_KEY / OMNIMUX_TOKEN)
 * 5. Local ~/.dsh/.credentials.yaml fallback
 *
 * @param {{
 *   resolveApiKey?: () => Promise<string | undefined> | string | undefined,
 *   env?: Record<string, string | undefined>,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 * }} deps
 * @returns {Promise<string>}
 */
export async function resolveGatewayApiKey(deps = {}) {
  if (typeof deps.resolveApiKey === 'function') {
    const fromResolver = await deps.resolveApiKey()
    if (fromResolver && typeof fromResolver === 'string' && fromResolver.trim()) {
      return fromResolver.trim()
    }
  }

  const env = deps.env !== undefined ? deps.env : process.env
  const fromEnv = String(env?.OMNIMUX_API_KEY || env?.OMNIMUX_TOKEN || '').trim()
  if (fromEnv) return fromEnv

  if (deps.credentials && typeof deps.credentials.resolve === 'function') {
    for (const ref of ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN']) {
      try {
        const hit = await deps.credentials.resolve(ref)
        const value = hit && typeof hit.value === 'string' ? hit.value.trim() : ''
        if (value) return value
      } catch {
        // ignore resolution error and fall through
      }
    }
  }

  // Direct ~/.dsh/.credentials.yaml read
  try {
    const credPath = deps.credentialsPath || join(homedir(), '.dsh/.credentials.yaml')
    if (existsSync(credPath)) {
      const raw = readFileSync(credPath, 'utf-8')
      for (const ref of ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN']) {
        const match = raw.match(new RegExp(`${ref}:\\s*["']?([^"'\\r\\n]+)["']?`))
        if (match && match[1] && match[1].trim()) {
          return match[1].trim()
        }
      }
    }
  } catch {
    // ignore
  }

  throw new OmnimuxError(
    'omnimux-unconfigured',
    'set OMNIMUX_API_KEY or OMNIMUX_TOKEN to call the Jev decisions gateway',
  )
}

/**
 * Call the OmniMux upstream gateway decisions endpoint.
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
  const apiKey = await resolveGatewayApiKey(deps)
  const fetchFn = deps?.fetcher || globalThis.fetch
  const env = deps?.env ?? process.env
  const base = resolveDecisionsBaseUrl(env?.OMNIMUX_BASE_URL)
  const endpoint = `${base}/decisions`

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': USER_AGENT,
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
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // ignore
    }

    if (json) {
      const classification = classifyQuotaFailure({ status: res.status, body: json })
      if (classification.kind === 'quota-exceeded') {
        throw new OmnimuxError('quota-exceeded', classification.message, { status: res.status, details: classification })
      }
      if (classification.kind === 'needs-omnimux') {
        throw new OmnimuxError('needs-omnimux', classification.message, { status: res.status })
      }
    }

    let errMsg = `Gateway decisions API failed with status ${res.status}`
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
