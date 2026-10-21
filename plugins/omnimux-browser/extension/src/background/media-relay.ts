/**
 * Media byte relay (TikTok / Douyin).
 *
 * Both CDNs refuse a non-browser download even with the page cookies, but the
 * opened page can read the bytes. The content script reads the file with the page
 * session and streams it here in 1MB base64 chunks; this module forwards each
 * chunk to the host's relay session and commits the record when every file is
 * complete.
 *
 * Nothing here pretends success: a failed relay reports the reason so the save
 * flow can fall back to the cloud import and the panel can say why.
 *
 * @module
 */

import { loopbackFetch } from '../shared/loopback-fetch.ts'
import type { CapturedPost } from '../content/capture/types.ts'

/**
 * Platforms whose media CDN only answers a real page session.
 *
 * Measured 2026-10-21: TikTok video bytes are readable from the page (XHR 200,
 * 3,288,875B) and unreadable by the host (403). Douyin rejected the in-page read
 * (its CDN sends no CORS headers) but the host download works (236MB ready), so
 * Douyin stays on the direct capture path instead of attempting a doomed relay.
 */
export const RELAY_PLATFORMS = new Set(['tiktok'])

export const RELAY_SESSION_PATH = '/omnimux/inspiration/local/capture-media-session'
export const RELAY_CHUNK_PATH = '/omnimux/inspiration/local/capture-media-chunk'
export const RELAY_COMMIT_PATH = '/omnimux/inspiration/local/capture-commit'

/** Whole-file read budget inside the page. */
const RELAY_TAB_TIMEOUT_MS = 300_000
/** Host chunk acceptance budget (network is loopback). */
const RELAY_CHUNK_TIMEOUT_MS = 30_000

/** Ports that accepted the relay session; chunk messages are routed back to them. */
const relaySessionPorts = new Map<string, number[]>()

interface RelaySessionResponse {
  sessionId: string
  media: Array<{ index: number }>
}

interface RelayCommitResult {
  ok: boolean
  data?: unknown
}

interface RelayOutcome {
  ok: boolean
  data?: unknown
  reason?: string
}

function httpUrl(value: unknown): string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : ''
}

function isTiktokDouyin(post: CapturedPost): boolean {
  return RELAY_PLATFORMS.has(String(post.platform || '').toLowerCase())
}

/** The active http(s) tab, or `null` when the user is on a page we cannot read. */
export async function activeHttpTabId(): Promise<number | null> {
  const tabs = await chrome.tabs?.query?.({ active: true, currentWindow: true })
  const tab = tabs?.[0]
  if (tab?.id === undefined || typeof tab.url !== 'string' || !/^https?:/i.test(tab.url)) return null
  return tab.id
}

/** The relay-eligible media of a captured post, in page order. */
export function relayMediaItems(post: CapturedPost): Array<{ index: number, type: 'video' | 'image', url: string }> {
  const items: Array<{ index: number, type: 'video' | 'image', url: string }> = []
  for (const entry of Array.isArray(post.media) ? post.media : []) {
    if (entry === null || typeof entry !== 'object') continue
    const url = httpUrl((entry as { url?: unknown }).url)
    if (url === '') continue
    const type = (entry as { type?: unknown }).type === 'video' ? 'video' : 'image'
    items.push({ index: items.length, type, url })
  }
  return items
}

/** Whether this post should use the byte relay instead of a host download. */
export function shouldRelayPost(post: CapturedPost | null): post is CapturedPost {
  if (post === null || !isTiktokDouyin(post)) return false
  return relayMediaItems(post).some((item) => item.type === 'video')
}

/**
 * Body for the host relay session: the same capture metadata the direct capture
 * carries, but only the media index/type/url triples the chunks will fill.
 */
export function buildRelaySessionBody(post: CapturedPost): Record<string, unknown> {
  return {
    source_url: post.source_url,
    platform: post.platform,
    title: post.title,
    content: post.content,
    content_shape: post.content_shape,
    author: post.author,
    stats: post.stats,
    posted_at: post.posted_at,
    cover_url: post.cover_url || '',
    media: relayMediaItems(post).map((item) => ({ index: item.index, type: item.type, url: item.url })),
  }
}

async function postJson(ports: number[], path: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response | null> {
  for (const port of ports) {
    const response = await Promise.resolve(loopbackFetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })).then((res) => res, () => null)
    if (response !== null && response.ok) return response
  }
  return null
}

const jsonOf = (response: Response): Promise<any> => Promise.resolve(response.json()).then((value) => value, () => null)

/** Create a host relay session, remembering which ports answered it. */
export async function createRelaySession(post: CapturedPost, ports: number[]): Promise<RelaySessionResponse | null> {
  const response = await postJson(ports, RELAY_SESSION_PATH, buildRelaySessionBody(post), RELAY_CHUNK_TIMEOUT_MS)
  if (response === null) return null
  const body = await jsonOf(response)
  const sessionId = body && body.data && typeof body.data.session_id === 'string' ? body.data.session_id : ''
  if (sessionId === '') return null
  relaySessionPorts.set(sessionId, ports)
  return { sessionId, media: Array.isArray(body.data.media) ? body.data.media : [] }
}

/** Ask the active tab to read one media file and stream its chunks to the host. */
async function relayOneMedia(tabId: number, sessionId: string, index: number, url: string): Promise<boolean> {
  const reply = await new Promise<{ ok?: boolean } | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), RELAY_TAB_TIMEOUT_MS)
    try {
      chrome.tabs.sendMessage(tabId, { action: 'RELAY_CAPTURE_MEDIA', sessionId, index, url }, { frameId: 0 }, (response) => {
        clearTimeout(timer)
        if (chrome.runtime?.lastError || !response) resolve(null)
        else resolve(response as { ok?: boolean })
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
  return reply !== null && reply.ok === true
}

/**
 * Forward one chunk message from a content script to the host session.
 *
 * The session port list was recorded when the session was created; an unknown
 * session is an explicit failure so the content script stops instead of looping.
 */
export async function forwardMediaChunk(message: Record<string, unknown>): Promise<{ ok: boolean, error?: string }> {
  const sessionId = typeof message.sessionId === 'string' ? message.sessionId : ''
  const ports = relaySessionPorts.get(sessionId)
  if (ports === undefined) return { ok: false, error: 'unknown-session' }
  const response = await postJson(ports, RELAY_CHUNK_PATH, {
    session_id: sessionId,
    index: message.index,
    seq: message.seq,
    data: message.data,
    final: message.final === true,
  }, RELAY_CHUNK_TIMEOUT_MS)
  if (response === null) return { ok: false, error: 'chunk-post-failed' }
  const body = await jsonOf(response)
  if (body === null || !body.data || body.data.complete === undefined) return { ok: false, error: 'chunk-bad-response' }
  return { ok: true }
}

/** Commit the relayed session; the host validates completeness and writes the row. */
export async function commitRelaySession(sessionId: string): Promise<RelayCommitResult> {
  const ports = relaySessionPorts.get(sessionId)
  if (ports === undefined) return { ok: false }
  const response = await postJson(ports, RELAY_COMMIT_PATH, { session_id: sessionId }, RELAY_CHUNK_TIMEOUT_MS)
  if (response === null) return { ok: false }
  const body = await jsonOf(response)
  const ok = body !== null && body.data !== undefined
  return { ok, data: body ? body.data : undefined }
}

/** Drop a session's port bookkeeping (success or failure). */
export function forgetRelaySession(sessionId: string): void {
  relaySessionPorts.delete(sessionId)
}

/**
 * Relay a captured TikTok / Douyin post end to end.
 *
 * Returns `{ok:false, reason}` when the page cannot read the bytes or the host
 * rejects a chunk; callers then fall back to the cloud import path.
 */
export async function relayCapturedMedia(post: CapturedPost, tabId: number, ports: number[]): Promise<RelayOutcome> {
  const session = await createRelaySession(post, ports)
  if (session === null) return { ok: false, reason: 'capture-media-unavailable' }
  const items = relayMediaItems(post)
  for (const item of items) {
    const relayed = await relayOneMedia(tabId, session.sessionId, item.index, item.url)
    if (!relayed) {
      forgetRelaySession(session.sessionId)
      return { ok: false, reason: 'capture-media-unavailable' }
    }
  }
  const committed = await commitRelaySession(session.sessionId)
  forgetRelaySession(session.sessionId)
  if (!committed.ok) return { ok: false, reason: 'capture-media-unavailable' }
  return { ok: true, data: committed.data }
}
