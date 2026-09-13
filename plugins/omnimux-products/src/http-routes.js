/**
 * ProductsDispatcher: one request in, one result out.
 *
 * Writes (POST / PUT / DELETE) all run assertLocalWrite. Assets only
 * gated POST — do not copy that shortcut.
 */
import { createReadStream } from 'node:fs'
import { LinkImportError, importProductFromUrl } from './link-importer.js'
import { PRODUCT_KINDS, listViewOf, ProductsError } from './library.js'
import { PickerError, pickNativePath } from './picker.js'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const PREFIX = '/omnimux/products'

const STATUS_BY_CODE = {
  'invalid-json': 400,
  'path-not-found': 400,
  'path-unsupported': 400,
  'name-required': 400,
  'name-invalid': 400,
  'kind-invalid': 400,
  'text-too-long': 400,
  'categories-invalid': 400,
  'media-invalid': 400,
  'media-path-invalid': 400,
  'media-path-unavailable': 400,
  'content-required': 400,
  'brand-strategy-invalid': 400,
  'invalid-url': 400,
  'link-import-empty': 422,
  'link-import-failed': 502,
  'library-corrupt': 500,
  'picker-invalid-kind': 400,
  'picker-unsupported': 501,
  'picker-failed': 500,
  'product-not-found': 404,
  'name-conflict': 409,
  'not-local': 403,
}

/**
 * Read-only media stream. Never writes user files.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {{ absolutePath: string, mime: string, size?: number }} stream
 */
export function sendPreview(res, status, stream) {
  res.writeHead(status, {
    'Content-Type': stream.mime,
    ...(Number.isFinite(stream.size) ? { 'Content-Length': String(stream.size) } : {}),
    'Cache-Control': 'private, max-age=30',
  })
  createReadStream(stream.absolutePath).on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal', message: 'preview stream failed' })
      return
    }
    res.destroy()
  }).pipe(res)
}

/**
 * A key shape, not the two letters `sk`. An import now answers page-derived and
 * model-authored copy, where `risk-free` / `task-focused` are ordinary English;
 * matching those would fail a good import with a 500.
 */
const SECRET_PATTERN = /access_token|sk-[A-Za-z0-9_-]{16,}/

export function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  if (SECRET_PATTERN.test(text)) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'refused to emit a secret' }))
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

/**
 * Parse a request body as JSON. Empty body = {}. Bad JSON = null.
 * @param {import('node:http').IncomingMessage} req
 */
export async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return null
  }
}

/**
 * Write routes only accept same-machine browser calls.
 * @param {{ origin?: string, referer?: string, secFetchSite?: string }} headers
 */
export function assertLocalWrite(headers = {}) {
  const site = String(headers.secFetchSite || '').toLowerCase()
  if (site === 'cross-site') throw new Error('cross-origin write refused')
  const origin = headers.origin || originFromReferer(headers.referer)
  if (!origin) return
  let host
  try {
    host = new URL(origin).hostname
  } catch {
    throw new Error('cross-origin write refused')
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('cross-origin write refused')
}

/**
 * @param {string | undefined} referer
 */
function originFromReferer(referer) {
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

/**
 * @param {{ headers?: Record<string, string | string[] | undefined> } | undefined} req
 * @param {string} name
 */
function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/**
 * @param {unknown} error
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read one seat off the host context. A seat that is absent, or that throws on
 * lookup, reads as "missing" — never as a request failure.
 *
 * @param {unknown} ctx
 * @param {string} name
 * @returns {unknown}
 */
function readSeat(ctx, name) {
  if (!ctx || typeof ctx !== 'object') return undefined
  const getter = /** @type {{ get?: Function }} */ (ctx).get
  if (typeof getter !== 'function') return undefined
  try {
    return getter.call(ctx, name)
  } catch {
    return undefined
  }
}

/**
 * The host tool registry: `ctx.tools` directly, else the `tools` seat.
 * @param {unknown} ctx
 * @returns {{ get?: Function, execute?: Function } | null}
 */
function toolRegistry(ctx) {
  if (!ctx || typeof ctx !== 'object') return null
  const direct = /** @type {{ tools?: unknown }} */ (ctx).tools
  if (direct && typeof direct === 'object') return /** @type {{ get?: Function }} */ (direct)
  const seat = readSeat(ctx, 'tools')
  return seat && typeof seat === 'object' ? /** @type {{ get?: Function }} */ (seat) : null
}

/**
 * The hub's own chat-completions path, a sibling of this plugin wherever the
 * two are installed together. Loaded lazily so a host without `omnimux` still
 * boots this plugin.
 */
const HUB_CHAT_MODULE = '../../omnimux/src/text/chat.js'

/** Model and cap the chat bridge asks for when the caller names neither. */
const DEFAULT_CHAT_MODEL = 'gemini-3.8-flash'
const BRIDGE_MAX_TOKENS = 6000

/** @type {Function | null} */
let hubChatComplete = null

/**
 * @returns {Promise<Function | null>} null when the hub is not installed here
 */
async function loadHubChatComplete() {
  if (hubChatComplete) return hubChatComplete
  try {
    const mod = await import(new URL(HUB_CHAT_MODULE, import.meta.url).href)
    if (typeof mod?.completeTextViaChat === 'function') hubChatComplete = mod.completeTextViaChat
  } catch {
    return null
  }
  return hubChatComplete
}

/**
 * Wrap the hub capabilities this vertical consumes, resolved lazily at call time
 * (load order between plugins is not this plugin's contract):
 *
 * - `textComplete` — the hub's one-shot model seam, as the provided service, else
 *   the official `omnimux_text_complete` tool, else the hub chat bridge;
 * - `pageFetch` — the official `omnimux_page_fetch` tool (OmniMux Jina Reader).
 *
 * @param {unknown} ctx
 * @param {{ chatComplete?: Function }} [deps] test seam for the chat bridge
 * @returns {{ textComplete: Function, pageFetch: Function } | null}
 */
export function createHubSeams(ctx, deps) {
  if (!ctx || typeof ctx !== 'object') return null
  const overrides = deps && typeof deps === 'object' ? deps : {}
  const injectedChat = typeof overrides.chatComplete === 'function' ? overrides.chatComplete : null

  /**
   * Last-resort channel, used only when neither the provided seat nor the
   * official tool answered. The hub chat module resolves the provider this host
   * already configured (`llm-pi-ai` in settings / credentials, e.g. CPA or
   * `gemini-3.8-flash-high`), so an import still gets a model answer on hosts
   * where the LLM seat behind `omnimux_text_complete` cannot run. Keys stay in
   * the host: this plugin reads a credential seat, never a key file.
   *
   * @param {{ prompt: string, model?: string, system?: string, maxTokens?: number }} request
   * @returns {Promise<unknown>}
   */
  async function textCompleteViaChat(request) {
    const chat = injectedChat ?? await loadHubChatComplete()
    if (typeof chat !== 'function') throw new Error('hub chat module is not reachable')
    const maxTokens = Number.isFinite(request.maxTokens) && request.maxTokens > 0
      ? request.maxTokens
      : BRIDGE_MAX_TOKENS
    return chat({
      model: request.model || DEFAULT_CHAT_MODEL,
      prompt: request.prompt,
      ...(request.system ? { system: request.system } : {}),
      maxTokens,
      env: process.env,
      credentials: readSeat(ctx, 'credentials'),
      settings: readSeat(ctx, 'settings'),
    })
  }

  const seams = {
    /**
     * @param {{ prompt: string, model?: string, system?: string, maxTokens?: number, reason?: string }} request
     * @returns {Promise<unknown>}
     */
    async textComplete(request) {
      const reasons = []

      const service = /** @type {{ execute?: Function } | undefined} */ (readSeat(ctx, 'textComplete'))
      if (service && typeof service.execute === 'function') {
        try {
          return await service.execute(request)
        } catch (error) {
          reasons.push(`textComplete seat failed: ${messageOf(error)}`)
        }
      } else {
        reasons.push('textComplete seat: not provided')
      }

      const tools = toolRegistry(ctx)
      const tool = tools && typeof tools.get === 'function' ? tools.get('omnimux_text_complete') : null
      if (!tool || typeof tool.execute !== 'function') {
        reasons.push('omnimux_text_complete unavailable: hub is not loaded or text completion is disabled')
      } else {
        try {
          return await tool.execute({
            prompt: request.prompt,
            model: request.model,
            system: request.system,
            max_tokens: request.maxTokens,
            reason: request.reason || 'omnimux-products import-from-link',
          })
        } catch (error) {
          reasons.push(`omnimux_text_complete failed: ${messageOf(error)}`)
        }
      }

      try {
        return await textCompleteViaChat(request)
      } catch (error) {
        reasons.push(`chat bridge failed: ${messageOf(error)}`)
      }

      throw new Error(`no text channel answered the request (${reasons.join(' | ')})`)
    },

    /**
     * @param {string} url
     * @returns {Promise<unknown>}
     */
    async pageFetch(url) {
      const tools = toolRegistry(ctx)
      const tool = tools && typeof tools.get === 'function' ? tools.get('omnimux_page_fetch') : null
      if (!tool || typeof tool.execute !== 'function') {
        throw new Error('omnimux_page_fetch unavailable: hub is not loaded or the reader is disabled')
      }
      return tool.execute({ url })
    },
  }
  return seams
}

/**
 * @param {string} pathname
 */
function parseProductPath(pathname) {
  if (pathname === PREFIX || pathname === `${PREFIX}/`) return { kind: 'collection' }
  if (pathname === `${PREFIX}/state`) return { kind: 'state' }
  if (pathname === `${PREFIX}/pick`) return { kind: 'pick' }
  if (pathname === `${PREFIX}/import-from-link`) return { kind: 'import-from-link' }
  if (!pathname.startsWith(`${PREFIX}/`)) return { kind: 'unknown' }
  const rest = pathname.slice(`${PREFIX}/`.length)
  const media = rest.match(/^([^/]+)\/media$/)
  if (media) return { kind: 'media', id: decodeURIComponent(media[1]) }
  if (!rest.includes('/')) return { kind: 'item', id: decodeURIComponent(rest) }
  return { kind: 'unknown' }
}

/**
 * @param {{
 *   library: ReturnType<typeof import('./library.js').createLibraryStore>,
 *   ctx?: unknown,
 *   hub?: { textComplete?: Function, pageFetch?: Function } | null,
 *   picker?: (kind: 'file' | 'directory') => Promise<{ path: string | null, paths?: string[] }>,
 *   importFromUrl?: (args: { url: unknown, kind?: 'physical' | 'digital', hub?: object | null }) => Promise<object>,
 *   chatComplete?: Function,
 * }} deps
 */
export function createProductsDispatcher(deps) {
  const { library } = deps
  const picker = deps.picker ?? ((kind) => pickNativePath(kind))
  const importFromUrl = deps.importFromUrl ?? importProductFromUrl
  // Hub seams are optional: without a hub the importer still answers from its own
  // page read and the heuristics, and reports the degradation in-band.
  const hub = deps.hub ?? createHubSeams(deps.ctx, { chatComplete: deps.chatComplete })

  /**
   * @param {{ body?: unknown }} req
   */
  function jsonBodyProblem(req) {
    if (req.body === null) {
      return { status: 400, body: { error: 'invalid-json', message: 'request body is not valid JSON' } }
    }
    if (req.body === undefined || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return { status: 400, body: { error: 'invalid-json', message: 'request body must be a JSON object' } }
    }
    return null
  }

  /**
   * GET /omnimux/products/state?prev=<n>
   * Single revision. Matching prev answers `unchanged: true` with no products.
   */
  function stateRoute(url) {
    const current = library.revision()
    const prevRaw = url.searchParams.get('prev')
    const prev = prevRaw == null || prevRaw === '' ? NaN : Number(prevRaw)
    if (Number.isFinite(prev) && prev === current) {
      return { status: 200, body: { revision: current, unchanged: true } }
    }
    return {
      status: 200,
      body: {
        revision: current,
        unchanged: false,
        products: library.list().map(listViewOf),
      },
    }
  }

  /**
   * @param {{ method: string, url: string, origin?: string, referer?: string, secFetchSite?: string, body?: unknown }} req
   * @returns {Promise<{ status: number, body?: unknown, stream?: unknown }>}
   */
  async function dispatch(req) {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      const method = (req.method || 'GET').toUpperCase()
      const parsed = parseProductPath(url.pathname)

      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        try {
          assertLocalWrite(req)
        } catch {
          return { status: 403, body: { error: 'not-local', message: 'cross-origin write refused' } }
        }
      }

      if (method === 'GET' && parsed.kind === 'state') {
        return stateRoute(url)
      }

      if (method === 'POST' && parsed.kind === 'pick') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ kind?: string }} */ (req.body)
        const kind = body.kind === 'directory' ? 'directory' : 'file'
        const result = await picker(kind)
        const paths = Array.isArray(result?.paths)
          ? result.paths.filter((row) => typeof row === 'string' && row !== '')
          : (typeof result?.path === 'string' && result.path !== '' ? [result.path] : [])
        return { status: 200, body: { path: paths[0] ?? result?.path ?? null, paths } }
      }

      /**
       * POST /omnimux/products/import-from-link
       * Read a landing page and answer a product draft. Local-only (the write
       * guard above), and the importer re-validates every url it fetches. The
       * vertical scrapes the page itself and borrows the hub only for the model
       * call and the reader: no OmniMux client, no credential.
       */
      if (method === 'POST' && parsed.kind === 'import-from-link') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ url?: unknown, kind?: unknown, model?: unknown, language?: unknown }} */ (req.body)
        if (body.kind !== undefined && !PRODUCT_KINDS.includes(/** @type {'physical' | 'digital'} */ (body.kind))) {
          throw new ProductsError('kind-invalid', `kind must be one of ${PRODUCT_KINDS.join(', ')}`)
        }
        const data = await importFromUrl({
          url: body.url,
          kind: body.kind === 'digital' ? 'digital' : 'physical',
          model: typeof body.model === 'string' ? body.model : undefined,
          language: typeof body.language === 'string' ? body.language : undefined,
          hub,
        })
        return { status: 200, body: { success: true, data } }
      }

      if (method === 'GET' && parsed.kind === 'collection') {
        const query = url.searchParams.get('q') || url.searchParams.get('query') || ''
        return {
          status: 200,
          body: {
            revision: library.revision(),
            products: library.list({ query }).map(listViewOf),
          },
        }
      }

      if (method === 'POST' && parsed.kind === 'collection') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {Record<string, unknown>} */ (req.body)
        const product = library.add(body)
        return { status: 200, body: { product, revision: library.revision() } }
      }

      if (method === 'GET' && parsed.kind === 'media') {
        const product = library.getView(parsed.id)
        if (!product) throw new ProductsError('product-not-found', 'product not found')
        return { status: 200, body: { product, media: product.media } }
      }

      if (method === 'GET' && parsed.kind === 'item') {
        const preview = url.searchParams.get('preview')
        if (preview) {
          const stream = library.resolvePreview(parsed.id, preview)
          return { status: 200, stream }
        }
        // Editing must retain persisted references even when files are currently unavailable.
        const product = url.searchParams.get('view') === 'edit'
          ? library.get(parsed.id)
          : library.getView(parsed.id)
        if (!product) throw new ProductsError('product-not-found', 'product not found')
        return { status: 200, body: { product } }
      }

      if (method === 'PUT' && parsed.kind === 'item') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {Record<string, unknown>} */ (req.body)
        const product = library.update(parsed.id, body)
        return { status: 200, body: { product, revision: library.revision() } }
      }

      if (method === 'DELETE' && parsed.kind === 'item') {
        library.remove(parsed.id)
        return { status: 200, body: { revision: library.revision() } }
      }

      return { status: 404, body: { error: 'not-found', message: 'unknown route' } }
    } catch (error) {
      if (error instanceof ProductsError || error instanceof PickerError || error instanceof LinkImportError) {
        return {
          status: STATUS_BY_CODE[error.code] ?? 400,
          body: { error: error.code, message: error.message },
        }
      }
      return { status: 500, body: { error: 'internal', message: messageOf(error) } }
    }
  }

  return { dispatch }
}

/**
 * Mount the products prefix on the official webServer seat.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ dispatch: (req: object) => Promise<{ status: number, body?: unknown, stream?: unknown }> }} dispatcher
 * @returns {() => void} disposer
 */
export function registerProductsRoutes(webServer, dispatcher) {
  const dispose = webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(req, res) {
      try {
        const method = (req.method || 'GET').toUpperCase()
        const body = method === 'POST' || method === 'PUT' ? await readJsonBody(req) : undefined
        const result = await dispatcher.dispatch({
          method,
          url: req.url || `${PREFIX}/state`,
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
          body,
        })
        if (result.stream) {
          sendPreview(res, result.status, result.stream)
          return
        }
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal', message: 'internal error' })
      }
    },
  })
  return () => {
    dispose()
  }
}
