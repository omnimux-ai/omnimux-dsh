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
 * the wording a user sees belongs to the content script. `detail` carries the
 * host’s own reason verbatim, and that reason is written in Chinese whatever
 * the extension’s locale is — translating it here would drop the specifics it
 * names (which link failed, which region refused), which are the actionable part.
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

/** Path the bridge publishes its own address on. */
const BRIDGE_CONFIG_PATH = '/ext/bridge-config'

/**
 * Budget for one shortcut request.
 *
 * The host's own worst case is a 60s download plus a 120s extraction, so the
 * client waits longer than the work can take. Without a budget, a host that
 * accepts the connection and then wedges would leave the menu row spinning and
 * its action permanently un-retryable.
 */
const SHORTCUT_TIMEOUT_MS = 240_000

/** Per-port budget while probing for a local DSH process. */
const HOST_PROBE_TIMEOUT_MS = 1_500

/**
 * Find the local DSH process, asking every candidate port at once.
 *
 * Serial probing would make a user wait out each dead port's timeout before the
 * live one is reached — the worst case is nine ports, and the user is watching a
 * menu row that says it is working. Asking in parallel keeps the wait at one
 * timeout, while reading the answers in port order keeps the choice deterministic
 * instead of letting a race decide which host answers.
 * @param ports candidate loopback ports, in priority order
 * @param fetchImpl injectable transport, for tests
 * @param timeoutMs per-port budget in milliseconds
 * @returns the first reachable host's HTTP base, or `null` for none
 */
export async function discoverHostBase(
  ports: readonly number[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = HOST_PROBE_TIMEOUT_MS,
): Promise<string | null> {
  // Every probe starts at once, then the answers are read in port order. The list
  // is a priority order (Dev, then Desktop, then the legacy ports), so letting
  // "whoever answers first" win could hand the shortcuts to a second local DSH that
  // the user’s panel is not talking to — and that host may not serve the
  // inspiration prefix at all. Reading in order costs nothing here: the slower
  // probes are already in flight, so the worst case is still one timeout.
  const probes = ports.map(async (port): Promise<string> => {
    const response = await fetchImpl(`http://127.0.0.1:${port}${BRIDGE_CONFIG_PATH}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`port ${port} answered ${response.status}`)
    const body = await response.json() as { wsUrl?: unknown }
    const base = typeof body.wsUrl === 'string' ? httpBaseFromBridgeUrl(body.wsUrl) : null
    if (base === null) throw new Error(`port ${port} is not a dsh host`)
    return base
  })
  // The loop may return before the later probes settle, and an unhandled rejection
  // inside a service worker is noise the user can never act on.
  for (const probe of probes) probe.catch(() => {})
  for (const probe of probes) {
    try {
      return await probe
    } catch {
      // This candidate is not the host; the next one already has its answer.
    }
  }
  return null
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
      signal: AbortSignal.timeout(SHORTCUT_TIMEOUT_MS),
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
