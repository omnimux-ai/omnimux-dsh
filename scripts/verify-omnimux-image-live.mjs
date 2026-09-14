#!/usr/bin/env node
// Live OmniMux image check. Not part of default `pnpm test`.
// Without a key the script self-skips (exit 0). Inject via:
//   omnimux tokens exec 40 --yes --timeout=600 -- env OMNIMUX_API_KEY=__OMNIMUX_TOKEN_40__ \
//     node scripts/verify-omnimux-image-live.mjs
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeOmnimuxImage } from '../plugins/omnimux/src/media/image.js'

const destDir = mkdtempSync(join(tmpdir(), 'omnimux-image-live-'))
const dest = join(destDir, 'probe.png')

const SECRET_KEY = /^(authorization|api[_-]?key|access[_-]?token|token|secret|password|bearer)$/i
const SECRET_VALUE = /\bsk-[A-Za-z0-9._-]{8,}\b/g

/**
 * @returns {string | undefined}
 */
function resolveKey() {
  if (process.env.OMNIMUX_API_KEY) return process.env.OMNIMUX_API_KEY
  if (process.env.OMNIMUX_TOKEN) return process.env.OMNIMUX_TOKEN
  try {
    const envPath = join(homedir(), '.config', 'omnimux', 'dsh.env')
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?(?:OMNIMUX_API_KEY|OMNIMUX_TOKEN)\s*=\s*["']?([^"'\s]+)["']?\s*$/)
      if (match) return match[1]
    }
  } catch {
    // no key file
  }
  return undefined
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 */
function redact(value, depth = 0) {
  if (depth > 8) return '[truncated]'
  if (typeof value === 'string') {
    if (value.length > 240 && /^[A-Za-z0-9+/=]+$/.test(value)) return `[b64 ${value.length} chars]`
    const cleaned = value.replace(SECRET_VALUE, 'sk-[redacted]')
    return cleaned.length > 4000 ? `${cleaned.slice(0, 4000)}…` : cleaned
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1))
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)
    }
    return out
  }
  return value
}

/**
 * @param {unknown} input
 */
function requestUrl(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (input && typeof input === 'object' && 'url' in input) return String(/** @type {{ url: unknown }} */ (input).url)
  return String(input)
}

/**
 * @param {string} url
 */
function isImageJson(url) {
  try {
    return new URL(url).pathname.includes('/images/generations')
  } catch {
    return url.includes('/images/generations')
  }
}

/**
 * @param {unknown} input
 * @param {RequestInit} [init]
 */
async function loggingFetch(input, init) {
  const url = requestUrl(input)
  const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (isImageJson(url) && method === 'POST') {
    let requestBody = undefined
    try {
      requestBody = init?.body ? JSON.parse(String(init.body)) : undefined
    } catch {
      requestBody = { _parse: 'not-json' }
    }
    process.stdout.write(`${JSON.stringify({
      event: 'request',
      method,
      path: new URL(url, 'https://api.omnimux.ai').pathname,
      body: redact(requestBody),
    })}\n`)
  }
  const response = await fetch(input, init)
  if (!isImageJson(url)) return response
  const clone = response.clone()
  let body
  try {
    body = await clone.json()
  } catch {
    body = { _parse: 'not-json', status: response.status }
  }
  const event = method === 'POST' ? 'submit' : 'poll'
  process.stdout.write(`${JSON.stringify({
    event,
    method,
    httpStatus: response.status,
    path: new URL(url, 'https://api.omnimux.ai').pathname,
    body: redact(body),
  })}\n`)
  return response
}

const key = resolveKey()
if (!key) {
  process.stdout.write(`${JSON.stringify({
    event: 'skip',
    reason: 'no OMNIMUX_API_KEY (env or ~/.config/omnimux/dsh.env)',
  })}\n`)
  process.exit(0)
}
process.env.OMNIMUX_API_KEY = key

const started = Date.now()
try {
  const result = await executeOmnimuxImage({
    prompt: 'a single red apple on a white table, product photo, even light',
    dest,
    fetcher: loggingFetch,
  })
  const bytes = statSync(dest).size
  process.stdout.write(`${JSON.stringify({
    event: 'result',
    mode: result.mode,
    taskId: result.taskId,
    url: redact(result.url),
    bytes,
    dest,
    modelId: process.env.OMNIMUX_IMAGE_MODEL ?? 'gpt-image-2.5',
    elapsedMs: Date.now() - started,
  })}\n`)
  if (result.mode !== 'live' || !result.url || bytes <= 0) {
    process.exitCode = 1
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    event: 'error',
    name: error instanceof Error ? error.name : 'Error',
    code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
    message: redact(error instanceof Error ? error.message : String(error)),
    elapsedMs: Date.now() - started,
  })}\n`)
  process.exitCode = 1
}
