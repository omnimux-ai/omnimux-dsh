/**
 * The background worker's side of the TikTok shortcuts.
 *
 * The content script cannot reach the DSH process itself — it only holds the
 * page — so it hands each shortcut here, and this module talks to the local
 * OmniMux HTTP surface the inspiration plugin already publishes. Doing the work
 * in the host rather than in the page is what makes the download real: the host
 * resolves the watermark-free stream with its own resolver and writes the file,
 * while the page could only ever fetch a watermarked, page-scoped blob.
 *
 * Results are answered as a code plus a detail string, never as rendered copy:
 * the host's messages are already localised, and the wording a user sees belongs
 * to the content script.
 *
 * @module
 */

/** Where the inspiration plugin's local HTTP surface lives. */
export const INSPIRATION_BASE_PATH = '/omnimux/inspiration/local'

/** Paths the two shortcuts call. */
export const FETCH_MEDIA_PATH = `${INSPIRATION_BASE_PATH}/fetch-media`
export const IMPORT_URL_PATH = `${INSPIRATION_BASE_PATH}/import-url`

/** What a shortcut asked the host to export. */
export type ExportKind = 'video' | 'audio'

/**
 * The answer a shortcut renders.
 *
 * `unreachable` is deliberately distinct from `rejected`: "OmniMux is not
 * running" and "this post has no downloadable stream" need different advice, and
 * collapsing them into one failure would send the user hunting for a content
 * problem that does not exist.
 */
export interface ExportOutcome {
  ok: boolean
  code: 'exported' | 'saved' | 'duplicate' | 'unreachable' | 'rejected'
  /** Name of the written file, for `exported`. */
  filename?: string
  /** Host-authored reason, for `rejected`. */
  detail?: string
}

/**
 * Convert the bridge's WebSocket address into the HTTP base on the same origin.
 *
 * The bridge and the HTTP surface are served by the same DSH process, so the
 * address the panel already discovered is the one to reuse — no second port
 * guess, and no second discovery mechanism to keep in step.
 * @param bridgeUrl
 * @returns the base, or `null` when there is nothing usable to derive
 */
export function httpBaseFromBridgeUrl(bridgeUrl: string): string | null {
  let url: URL
  try {
    url = new URL(bridgeUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null
  if (url.host === '') return null
  return `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`
}

/** Read a JSON body, answering `null` for anything that is not JSON. */
async function readJson(response: Response): Promise<Record<string, any> | null> {
  try {
    const body = await response.json() as unknown
    return typeof body === 'object' && body !== null ? body as Record<string, any> : null
  } catch {
    // A gateway error page or an empty body: the status code carries the answer.
    return null
  }
}

/** The host's own explanation, or a status-derived stand-in. */
function errorText(body: Record<string, any> | null, response: Response): string {
  const message = typeof body?.error === 'string' ? body.error.trim() : ''
  if (message !== '') return message
  return `OmniMux 主程序返回 ${response.status}`
}

/** One POST, with a network failure folded into `null` rather than thrown. */
async function postJson(
  fetchImpl: typeof fetch,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<Response | null> {
  try {
    return await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return null
  }
}

/**
 * Export a post's watermark-free video, or its soundtrack, into Downloads.
 * @param args
 */
export async function requestMediaExport(args: {
  base: string
  url: string
  kind: ExportKind
  fetchImpl?: typeof fetch
}): Promise<ExportOutcome> {
  const fetchImpl = args.fetchImpl ?? fetch
  const response = await postJson(fetchImpl, `${args.base}${FETCH_MEDIA_PATH}`, {
    url: args.url,
    kind: args.kind,
  })
  if (response === null) return { ok: false, code: 'unreachable' }
  const body = await readJson(response)
  if (!response.ok) return { ok: false, code: 'rejected', detail: errorText(body, response) }
  const filename = typeof body?.data?.filename === 'string' ? body.data.filename : ''
  return { ok: true, code: 'exported', filename }
}

/**
 * Import a post into the OmniMux inspiration library.
 *
 * A 409 duplicate is answered as success: the user asked for the post to be in
 * the library, and it is. Reporting it as a failure would be a lie the user
 * cannot act on.
 * @param args
 */
export async function requestInspirationSave(args: {
  base: string
  url: string
  fetchImpl?: typeof fetch
}): Promise<ExportOutcome> {
  const fetchImpl = args.fetchImpl ?? fetch
  const response = await postJson(fetchImpl, `${args.base}${IMPORT_URL_PATH}`, { url: args.url })
  if (response === null) return { ok: false, code: 'unreachable' }
  const body = await readJson(response)
  if (body?.is_duplicate === true) return { ok: true, code: 'duplicate' }
  if (!response.ok) return { ok: false, code: 'rejected', detail: errorText(body, response) }
  return { ok: true, code: 'saved' }
}
