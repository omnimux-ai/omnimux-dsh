import { createReadStream, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  handleAnalyze,
  handleBatchDelete,
  handleCreate,
  handleDeleteItem,
  handleGetItem,
  handleImportUrl,
  handleList,
  handlePatchItem,
  handleTranslate,
} from './http-handlers.js'
import { detectPlatformFromUrl } from './url-normalizer.js'

export { detectPlatformFromUrl } from './url-normalizer.js'

export const LOCAL_PREFIX = '/omnimux/inspiration/local'

const CODE_MESSAGES = {
  'omnimux-unconfigured': 'OmniMux 未配置 API Key，请在 设置 → 个人资料 或凭据库中配置 OMNIMUX_API_KEY',
  'needs-omnimux': '需要登录 OmniMux 账号，请在 设置 → 个人资料 中登录',
}

const MEDIA_TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const COLLECTION_ROUTES = { GET: 'list', POST: 'create' }
const ITEM_ROUTES = { GET: 'get', PATCH: 'patch', DELETE: 'delete' }
const ROUTE_HANDLERS = {
  list: handleList,
  create: handleCreate,
  'import-url': handleImportUrl,
  analyze: handleAnalyze,
  translate: handleTranslate,
  'batch-delete': handleBatchDelete,
  get: handleGetItem,
  patch: handlePatchItem,
  delete: handleDeleteItem,
}

function extractObjectMessage(obj) {
  const code = typeof obj.code === 'string' ? obj.code : ''
  let msg = ''
  if (typeof obj.message === 'string') msg = obj.message
  else if (typeof obj.error === 'string') msg = obj.error
  if (CODE_MESSAGES[code]) return CODE_MESSAGES[code]
  if (code && msg) return `[${code}] ${msg}`
  if (msg) return msg
  if (code) return `[${code}]`
  return stringifyUnknown(obj)
}

function stringifyUnknown(obj) {
  try {
    const serialized = JSON.stringify(obj)
    if (serialized && serialized !== '{}') return serialized
  } catch {
    return ''
  }
  return ''
}

/** Format any thrown error / object safely without [object Object]. */
export function formatErrorMessage(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const extracted = extractObjectMessage(err)
    if (extracted) return extracted
  }
  return String(err)
}


function parseJsonChunk(raw, resolve) {
  if (!raw.trim()) {
    resolve({})
    return
  }
  try {
    resolve(JSON.parse(raw))
  } catch {
    resolve(null)
  }
}

/** Read request body safely. */
export async function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 2 * 1024 * 1024) resolve(null)
    })
    req.on('end', () => parseJsonChunk(raw, resolve))
    req.on('error', () => resolve(null))
  })
}

/** Send JSON HTTP response. */
export function sendJson(res, status, payload) {
  const json = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  })
  res.end(json)
}

function isCollectionPath(path) {
  return path === LOCAL_PREFIX || path === `${LOCAL_PREFIX}/`
}

function parseActionId(path, action) {
  const suffix = `/${action}`
  if (!path.startsWith(`${LOCAL_PREFIX}/`) || !path.endsWith(suffix)) return ''
  return decodeURIComponent(path.slice(`${LOCAL_PREFIX}/`.length, -suffix.length))
}

function parseItemId(path) {
  if (!path.startsWith(`${LOCAL_PREFIX}/`) || path === LOCAL_PREFIX) return ''
  const id = decodeURIComponent(path.slice(`${LOCAL_PREFIX}/`.length))
  if (!id || id.includes('/')) return ''
  return id
}

function notFoundRoute() {
  return { name: 'not-found' }
}

function matchCollection(method, path) {
  if (!isCollectionPath(path)) return null
  const name = COLLECTION_ROUTES[method]
  return name ? { name } : notFoundRoute()
}

const SPECIAL_PATHS = {
  [`${LOCAL_PREFIX}/import-url`]: { POST: 'import-url' },
  [`${LOCAL_PREFIX}/batch-delete`]: { POST: 'batch-delete', DELETE: 'batch-delete' },
}

function matchAnalyze(method, path) {
  if (method !== 'POST') return null
  const analyzeId = parseActionId(path, 'analyze')
  if (analyzeId) return { name: 'analyze', id: analyzeId }
  const translateId = parseActionId(path, 'translate')
  if (translateId) return { name: 'translate', id: translateId }
  return null
}

function matchSpecial(method, path) {
  const table = SPECIAL_PATHS[path]
  if (table) {
    const name = table[method]
    return name ? { name } : notFoundRoute()
  }
  return matchAnalyze(method, path)
}

function matchItem(method, path) {
  const id = parseItemId(path)
  const name = id ? ITEM_ROUTES[method] : ''
  if (!name) return notFoundRoute()
  return { name, id }
}

function matchRoute(method, path) {
  return matchCollection(method, path) || matchSpecial(method, path) || matchItem(method, path)
}

async function dispatchRequest(ctx, req) {
  const method = (req.method || 'GET').toUpperCase()
  const rawPath = req.url || LOCAL_PREFIX
  const url = new URL(rawPath, 'http://127.0.0.1')
  // The rival prefix lives *under* `LOCAL_PREFIX`, so it has to be claimed
  // before the inspiration route table runs: `matchItem` reads the segment
  // after `/local/` as an item id, so every `/rival-accounts...` path would
  // resolve to the item route's `not found`.
  if (typeof ctx.rivalDispatcher?.dispatch === 'function' && ctx.rivalDispatcher.owns?.(url.pathname) === true) {
    return ctx.rivalDispatcher.dispatch({ method, url, body: req.body })
  }
  const route = matchRoute(method, url.pathname)
  const args = { ...ctx, req, url, id: route.id }
  try {
    return await runRoute(route.name, args)
  } catch (error) {
    const status = error.status || 500
    const message = error.message || String(error)
    return { status, body: { error: message } }
  }
}

function createDispatch(ctx) {
  return (req) => dispatchRequest(ctx, req)
}

async function streamLocalMedia(paths, req, res) {
  const url = new URL(req.url || LOCAL_PREFIX, 'http://127.0.0.1')
  const prefix = `${LOCAL_PREFIX}/media/`
  if (!url.pathname.startsWith(prefix)) {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  const subpath = url.pathname.slice(prefix.length)
  if (!subpath || subpath.includes('..')) {
    sendJson(res, 400, { error: 'invalid path' })
    return
  }
  const filePath = join(paths.mediaDir, subpath)
  if (!existsSync(filePath)) {
    sendJson(res, 404, { error: 'file not found' })
    return
  }
  pipeMedia(req, res, filePath)
}

function createStreamer(paths) {
  return (req, res) => streamLocalMedia(paths, req, res)
}

async function runRoute(name, args) {
  const handler = ROUTE_HANDLERS[name]
  if (!handler) return { status: 404, body: { error: 'not found' } }
  return handler(args)
}

function pipeMedia(req, res, filePath) {
  const fileSize = statSync(filePath).size
  const range = req.headers?.range || req.headers?.Range
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const contentType = MEDIA_TYPES[ext] || 'application/octet-stream'
  if (typeof range === 'string') {
    pipeRange({ res, filePath, fileSize, range, contentType })
    return
  }
  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
  })
  createReadStream(filePath).pipe(res)
}

function pipeRange(opts) {
  const parts = opts.range.replace(/bytes=/, '').split('-')
  const start = parseInt(parts[0], 10)
  const end = parts[1] ? parseInt(parts[1], 10) : opts.fileSize - 1
  const file = createReadStream(opts.filePath, { start, end })
  opts.res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${opts.fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': (end - start) + 1,
    'Content-Type': opts.contentType,
  })
  file.pipe(opts.res)
}

/**
 * Create dispatcher for inspiration local endpoints.
 *
 * `deps.rivalDispatcher` is the module that owns the rival prefix. It is
 * consulted *first* (see `dispatchRequest`) and needs a `owns(pathname)`
 * predicate plus a `dispatch({ method, url, body })` method; passing it in
 * keeps this file free of any import from the rival module while still making
 * this dispatcher the single router for everything under `LOCAL_PREFIX`.
 * @param {{
 *   localStore: any,
 *   socialFetcher?: Function,
 *   videoAnalyzeTool?: any,
 *   textComplete?: any,
 *   fetcher?: typeof fetch,
 *   resolver?: Function,
 *   analyzeInspiration?: Function,
 *   rivalDispatcher?: { owns: (pathname: string) => boolean, dispatch: Function },
 * }} deps
 */
export function createLocalInspirationDispatcher(deps) {
  const store = deps.localStore
  const paths = store.paths
  const fetcher = deps.fetcher ?? fetch
  const ctx = {
    store,
    paths,
    socialFetcher: deps.socialFetcher,
    videoAnalyzeTool: deps.videoAnalyzeTool,
    textComplete: deps.textComplete,
    fetcher,
    // Forwarded to the download target check. Left undefined in production so the
    // real `dns.lookup` is used; tests inject a stub to stay offline.
    resolver: deps.resolver,
    // Also undefined in production, where `maybeAnalyze` calls the real analyzer.
    // The analyzer degrades to a local breakdown instead of reporting failure, so
    // its failure branch is unreachable from a test through any other seam — an
    // injected one is the only way to hold the "stored item keeps its video and
    // records the reason" contract.
    analyzeInspiration: deps.analyzeInspiration,
    rivalDispatcher: deps.rivalDispatcher,
    detectPlatformFromUrl,
    formatErrorMessage,
  }
  return {
    dispatch: createDispatch(ctx),
    streamLocalMedia: createStreamer(paths),
  }
}
