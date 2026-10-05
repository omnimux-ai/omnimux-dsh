/**
 * Harness server for Issue #3178 browser acceptance.
 *
 * Serves the static harness page plus the four contract routes from
 * `specs/cli-auth-update.spec.md` §3 over REAL HTTP (the panel's `api()` helper
 * uses the global `fetch`, so these are real network round-trips).
 *
 * Every request is recorded; `GET /__requests` returns the log so assertions can
 * be made on the server side rather than on client-side instrumentation.
 *
 * Binds an ephemeral port (port 0) and writes the resolved URL to PORT_FILE.
 */
import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PORT_FILE = process.env.PORT_FILE || '/tmp/omnimux-3178-harness.json'

/* ---------------- stubbed contract payloads (spec §3) ---------------- */

const AGENTS = [
  {
    id: 'claude', name: 'Claude Code', installed: true,
    version: '2.1.223 (Claude Code)', models: ['claude-3-7-sonnet'],
    auth: { state: 'signed-out', method: 'command', loginSupported: true },
  },
  {
    id: 'codex', name: 'Codex CLI', installed: true,
    version: 'codex-cli 0.159.3', models: ['gpt-6-sol'],
    auth: { state: 'signed-in', method: 'command', loginSupported: true },
  },
  {
    id: 'qwen', name: 'Qwen Code', installed: true,
    version: '0.19.6', models: ['qwen-max'],
    auth: { state: 'signed-out', method: 'file', loginSupported: false },
  },
]

const UPDATES = {
  checkedAt: 1,
  updates: {
    claude: { state: 'available', current: '2.1.223 (Claude Code)', latest: '2.1.289', channel: 'npm', installShape: 'npm', supported: true },
    codex: { state: 'current', current: 'codex-cli 0.159.3', latest: '0.160.1', channel: 'npm', installShape: 'npm', supported: true },
    qwen: { state: 'unknown', current: '0.19.6', latest: '', channel: 'npm', installShape: 'unknown', supported: false },
  },
}

/* ---------------- mutable harness state ---------------- */

let claudeSignedIn = false
const requests = []

function agentsPayload() {
  return {
    agents: AGENTS.map((agent) => (
      agent.id === 'claude' && claudeSignedIn
        ? { ...agent, auth: { ...agent.auth, state: 'signed-in' } }
        : agent
    )),
  }
}

/* ---------------- static files ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/bundle.js': 'dist/entry.js',
  '/bundle.css': 'dist/entry.css',
  '/tokens.css': 'tokens.css',
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const path = url.pathname
  const method = req.method || 'GET'

  // Harness-control routes are NOT part of the observed contract surface.
  if (path.startsWith('/__')) {
    if (path === '/__requests') return sendJson(res, 200, { requests })
    if (path === '/__reset') {
      requests.length = 0
      claudeSignedIn = false
      return sendJson(res, 200, { ok: true })
    }
    return sendJson(res, 404, { error: 'unknown-control-route' })
  }

  const body = method === 'POST' || method === 'PUT' ? await readBody(req) : ''
  requests.push({ method, path, search: url.search, body, at: Date.now() })

  /* ---- contract routes ---- */

  if (path === '/omnimux/agents' && method === 'GET') {
    return sendJson(res, 200, agentsPayload())
  }

  if (path === '/omnimux/agents/updates' && method === 'GET') {
    return sendJson(res, 200, UPDATES)
  }

  if (path === '/omnimux/agents/login' && method === 'POST') {
    // Stub flips claude to signed-in so the NEXT GET /omnimux/agents converges,
    // exactly as the real server would once the terminal login completes.
    claudeSignedIn = true
    return sendJson(res, 200, { ok: true, launched: true, mode: 'terminal' })
  }

  if (path === '/omnimux/agents/update' && method === 'POST') {
    return sendJson(res, 200, { ok: true, version: '2.1.289 (Claude Code)' })
  }

  // Panel also mounts the cloud-auth hook; keep it quiet and signed-out.
  if (path === '/omnimux/auth/status') {
    return sendJson(res, 200, { logged_in: false })
  }

  /* ---- static ---- */

  const rel = STATIC[path]
  if (rel && (method === 'GET' || method === 'HEAD')) {
    try {
      const buf = await readFile(join(here, rel))
      res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream', 'content-length': buf.length })
      return res.end(method === 'HEAD' ? undefined : buf)
    } catch (error) {
      return sendJson(res, 500, { error: `static-read-failed: ${String(error)}` })
    }
  }

  return sendJson(res, 404, { error: 'not-found', path })
})

server.listen(0, '127.0.0.1', async () => {
  const { port } = server.address()
  const info = { url: `http://127.0.0.1:${port}`, port, pid: process.pid }
  await writeFile(PORT_FILE, JSON.stringify(info))
  console.log(`HARNESS_URL=${info.url}`)
  console.log(`PORT_FILE=${PORT_FILE}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
