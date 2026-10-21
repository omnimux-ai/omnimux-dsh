/**
 * Worker-side lookup of one X post's public media payload.
 *
 * Why this lives in the worker: `cdn.syndication.twimg.com` answers with
 * `access-control-allow-origin: https://platform.twitter.com`, so a content
 * script fetch from `x.com` is refused by CORS. The worker has the host
 * permission and can read the JSON, which carries the real progressive mp4
 * variants the page itself never exposes (the page plays HLS through a `blob:`
 * MediaSource handle).
 *
 * The token is the public syndication token, derived from the post id exactly as
 * X's own embed scripts do. This module never invents data: a failed fetch is a
 * failed lookup, and the caller decides what to tell the user.
 *
 * @module
 */

/** Public tweet-payload endpoint used by X's embedded timelines. */
const SYNDICATION_ENDPOINT = 'https://cdn.syndication.twimg.com/tweet-result'

/** How long one successful payload stays cached, in ms. */
const CACHE_TTL_MS = 60_000

/** How many posts stay cached; the oldest entry is evicted first. */
const CACHE_LIMIT = 24

/** Budget for one upstream request, in ms. */
const REQUEST_TIMEOUT_MS = 6_000

/** Everything the lookup needs from the environment. */
export interface XVariantLookupDeps {
  /** `fetch` bound to the worker's global scope. */
  fetch: typeof fetch
  /** Clock; tests inject a fake. */
  now?: () => number
}

/** The answer one lookup produces. */
export type XVariantLookup =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: 'invalid-request' | 'fetch-failed' } }

/** Whether a value is a plausible X post id. */
export function isValidTweetId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5,25}$/.test(value)
}

/**
 * The public syndication token for one post id.
 *
 * X's embedder derives it from the numeric id, so it is a pure function of the
 * id and needs no secret.
 */
export function syndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
}

/** The absolute payload URL for one post. */
export function tweetResultUrl(tweetId: string, lang = 'en'): string {
  return `${SYNDICATION_ENDPOINT}?id=${encodeURIComponent(tweetId)}&token=${syndicationToken(tweetId)}&lang=${lang}`
}

/**
 * Creates the cached lookup the worker routes `DSH_X_VIDEO_VARIANTS` through.
 *
 * Only a successful fetch is cached: a transient failure must not pin the
 * user's next press to a remembered error.
 */
export function createXVariantLookup(
  deps: XVariantLookupDeps,
  options: { cacheTtlMs?: number; cacheLimit?: number } = {},
): (tweetId: unknown) => Promise<XVariantLookup> {
  const ttl = options.cacheTtlMs ?? CACHE_TTL_MS
  const limit = options.cacheLimit ?? CACHE_LIMIT
  const now = deps.now ?? (() => Date.now())
  const cache = new Map<string, { at: number; result: unknown }>()

  return async (tweetId: unknown): Promise<XVariantLookup> => {
    if (!isValidTweetId(tweetId)) return { ok: false, error: { code: 'invalid-request' } }

    const cached = cache.get(tweetId)
    if (cached !== undefined && now() - cached.at < ttl) return { ok: true, result: cached.result }

    let response: Response
    try {
      response = await deps.fetch(tweetResultUrl(tweetId), {
        credentials: 'omit',
        signal: timeoutSignal(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      })
    } catch {
      return { ok: false, error: { code: 'fetch-failed' } }
    }
    if (!response.ok) return { ok: false, error: { code: 'fetch-failed' } }

    let result: unknown
    try {
      result = await response.json()
    } catch {
      return { ok: false, error: { code: 'fetch-failed' } }
    }

    cache.delete(tweetId)
    cache.set(tweetId, { at: now(), result })
    while (cache.size > limit) {
      const oldest = cache.keys().next()
      if (oldest.done === true) break
      cache.delete(oldest.value)
    }
    return { ok: true, result }
  }
}

/** An abort signal that fires after `ms`, or `undefined` where unsupported. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  return undefined
}
