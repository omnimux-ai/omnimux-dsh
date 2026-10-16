// scripts/runtime-source-observation.mjs
// #3365: observe which module source a controlled Node child actually parsed, by
// attaching the standard inspector to a task-owned process and binding the
// reported file:// URL plus full bytes/SHA-256 back to the expected file.
// Success means "the VM resolved exactly this controlled file"; it never claims
// product install, load, or activation.

import { spawn } from 'node:child_process'
import { lstatSync, realpathSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { once } from 'node:events'

const SOURCE_OBSERVATION_TIMEOUT_MS = 20000
const SOURCE_OBSERVATION_EVENT_LIMIT = 256
const INSPECTOR_ENDPOINT_RE = /Debugger listening on (ws:\/\/127\.0\.0\.1:(\d+)\/[0-9a-f-]+)/
const COMPLETION_MARKER = 'SOURCE_OBSERVATION_DONE'
const RECEIPT_TAIL = 4096

const failure = (code, hint = null) => Object.assign(new Error('SOURCE_OBSERVATION_' + code), {
  code: 'SOURCE_OBSERVATION_' + code,
  ...(hint ? { hint } : {}),
})

function validateRelativeName(name, label) {
  if (typeof name !== 'string' || !name || isAbsolute(name) || name.includes('..')) {
    throw failure('ARGUMENT', { [label]: name })
  }
}

function requireRelative(ownerRoot, canonicalOwner, name, label) {
  validateRelativeName(name, label)
  const full = join(ownerRoot, name)
  let canonical
  try { canonical = realpathSync(full) } catch { throw failure('ARGUMENT', { path: name, reason: 'missing-file' }) }
  if (!canonical.startsWith(canonicalOwner + sep) && canonical !== canonicalOwner) {
    throw failure('ARGUMENT', { path: name, reason: 'outside-owner' })
  }
  const stat = lstatSync(full)
  if (!stat.isFile() || stat.isSymbolicLink()) throw failure('ARGUMENT', { path: name, reason: 'not-file' })
  return { full, canonical }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function fileUrlToPath(url) {
  try { return fileURLToPath(url) } catch { return null }
}

function timeout(ms, code, detail) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(failure(code, detail)), ms)
    // The timer only bounds a race; it must not keep the parent event loop alive
    // after the race already resolved.
    if (timer && typeof timer.unref === 'function') timer.unref()
  })
}

function decodeWsMessage(data) {
  try { return JSON.parse(String(data)) } catch { return null }
}

/**
 * Observed only: the VM parsed a script whose bytes exactly match the controlled
 * file. This does not prove activation, product loading, or installation.
 * @param {{rootDir:string, entryName:string, expectedName:string, decoyName?:string, timeoutMs?:number}} options
 */
export async function observeLoadedSource(options = {}) {
  const { rootDir, entryName, expectedName, decoyName, timeoutMs = SOURCE_OBSERVATION_TIMEOUT_MS } = options
  if (!rootDir || typeof rootDir !== 'string') throw failure('ROOT_REQUIRED')
  validateRelativeName(entryName, 'entryName')
  validateRelativeName(expectedName, 'expectedName')
  if (decoyName !== undefined) validateRelativeName(decoyName, 'decoyName')
  let owner
  try { owner = realpathSync(rootDir) } catch { throw failure('ROOT_REQUIRED', { root: rootDir }) }
  const ownerStat = lstatSync(owner)
  if (!ownerStat.isDirectory() || ownerStat.isSymbolicLink()) throw failure('ROOT_UNSAFE', { root: rootDir })

  const entry = requireRelative(owner, owner, entryName, 'entryName')
  const expected = requireRelative(owner, owner, expectedName, 'expectedName')
  const decoy = decoyName ? requireRelative(owner, owner, decoyName, 'decoyName') : null
  const expectedBytes = readFileSync(expected.full)
  const expectedSha256 = sha256(expectedBytes)
  // Binding is checked on the decoded real path, never on a raw URL string:
  // a file:// URL percent-encodes non-ASCII segments and must not be compared
  // textually against a filesystem path.
  const expectedPath = expected.canonical
  const decoyPath = decoy ? decoy.canonical : null

  const childEnv = {
    PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}/usr/bin:/bin`,
    HOME: owner,
    LC_ALL: 'C',
  }
  const child = spawn(process.execPath, [
    '--inspect-wait=127.0.0.1:0',
    '--inspect-publish-uid=stderr',
    entry.full,
  ], { cwd: owner, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] })

  const raw = { stdout: '', stderr: '', endpoint: null, commands: [], events: 0, exit: null, detached: false }
  const scripts = []
  let endpoint = null
  let sourceValue = null
  let sourceError = null
  let socket = null
  let seq = 0
  let markerSeen = false
  let observedBytes = null
  let observedSha256 = null
  let matching = []
  let decoyLoaded = false
  const pending = new Map()
  const deadline = Date.now() + Math.min(timeoutMs, SOURCE_OBSERVATION_TIMEOUT_MS)
  const state = { exit: null, closed: false }

  // Only enable/getScriptSource/disable and the release command may be issued;
  // evaluate, setScriptSource, or any other mutation is refused before the wire.
  const ALLOWED_COMMANDS = new Set(['Debugger.enable', 'Debugger.getScriptSource', 'Debugger.disable', 'Runtime.runIfWaitingForDebugger'])
  const send = (method, params = {}) => {
    if (!ALLOWED_COMMANDS.has(method)) throw failure('PROTOCOL', { method })
    const id = ++seq
    const record = { id, method }
    raw.commands.push(record)
    socket.send(JSON.stringify({ id, method, params }))
    return Promise.race([
      new Promise((resolve, reject) => pending.set(id, {
        resolve: (result) => { record.response = 'ok'; resolve(result) },
        reject: (error) => { record.response = String(error && error.message || error); reject(error) },
      })),
      timeout(Math.max(1, deadline - Date.now()), 'INSPECTOR_RESPONSE_TIMEOUT', { method }),
    ])
  }

  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        const onData = (data) => {
          raw.stderr += data.toString()
          if (endpoint) return
          const match = raw.stderr.match(INSPECTOR_ENDPOINT_RE)
          if (!match) return
          endpoint = new URL(match[1])
          raw.endpoint = String(endpoint)
          if (endpoint.hostname !== '127.0.0.1' || !endpoint.port || Number(endpoint.port) <= 0) {
            reject(failure('UNSAFE_ENDPOINT', { endpoint: String(endpoint) }))
            return
          }
          resolve()
        }
        child.stderr.on('data', onData)
        child.once('error', reject)
        child.once('exit', () => reject(failure('CHILD_EXIT_BEFORE_ENDPOINT', { stderr: raw.stderr.slice(-RECEIPT_TAIL) })))
      }),
      timeout(Math.max(1, deadline - Date.now()), 'ENDPOINT_TIMEOUT', { stderr: 'inspector endpoint not published' }),
    ])

    child.stdout.on('data', (data) => {
      raw.stdout += data.toString()
      if (raw.stdout.includes(COMPLETION_MARKER)) markerSeen = true
    })
    child.once('exit', (code, signal) => { state.exit = { code, signal } })

    socket = new WebSocket(String(endpoint))
    await Promise.race([
      once(socket, 'open'),
      timeout(Math.max(1, deadline - Date.now()), 'WS_CONNECT_TIMEOUT', { endpoint: String(endpoint) }),
    ])

    // Event cursor first: scriptParsed is collected from this point on, then
    // Debugger.enable replays already-parsed scripts, then the child is released.
    socket.addEventListener('message', (event) => {
      const message = decodeWsMessage(event.data)
      if (!message) return
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) reject(new Error(JSON.stringify(message.error)))
        else resolve(message.result)
      } else if (message.method === 'Debugger.scriptParsed') {
        const params = message.params || {}
        scripts.push(params)
        raw.events += 1
        if (params.url && params.url.startsWith('file://') && fileUrlToPath(params.url) === expectedPath && params.scriptId && !sourceValue) {
          send('Debugger.getScriptSource', { scriptId: params.scriptId })
            .then((result) => { sourceValue = { scriptId: params.scriptId, source: result.scriptSource, params } })
            .catch((error) => { sourceError = error })
        }
      }
      if (scripts.length > SOURCE_OBSERVATION_EVENT_LIMIT) {
        sourceError = sourceError || failure('EVENT_LIMIT', { count: scripts.length })
      }
    })

    await send('Debugger.enable')
    await send('Runtime.runIfWaitingForDebugger')

    let markerSettled = null
    while (Date.now() < deadline) {
      if (sourceValue) break
      if (sourceError) throw sourceError
      if (markerSeen && !scripts.some((script) => script.url && fileUrlToPath(script.url) === expectedPath)) {
        // The entry already completed its top-level work; no further parse can still arrive.
        markerSettled = markerSettled === null ? Date.now() + 150 : markerSettled
        if (Date.now() >= markerSettled) break
      }
      if (state.exit && !sourceValue) {
        const matching = scripts.find((script) => script.url && fileUrlToPath(script.url) === expectedPath && script.isModule === true)
        if (matching && !sourceValue) await new Promise((resolve) => setTimeout(resolve, 100))
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    if (!sourceValue) throw failure('SOURCE_NOT_LOADED', { path: expectedPath, scripts: scripts.length })
    if (sourceError) throw sourceError

    // The observed script must be a module bound to exactly this real file, without
    // a sourceURL alias; the source text must re-encode to the identical bytes and hash.
    if (sourceValue.params.isModule !== true) {
      throw failure('NOT_MODULE', { scriptId: sourceValue.scriptId, isModule: sourceValue.params.isModule })
    }
    if (sourceValue.params.hasSourceURL === true) {
      throw failure('SOURCE_URL_ALIAS', { scriptId: sourceValue.scriptId })
    }
    observedBytes = Buffer.from(String(sourceValue.source), 'utf8')
    observedSha256 = sha256(observedBytes)
    const bytesIdentical = observedBytes.equals(expectedBytes) && observedSha256 === expectedSha256
    if (!bytesIdentical) {
      throw failure('SOURCE_MISMATCH', { expectedSha256, observedSha256 })
    }

    matching = scripts.filter((script) => script.url && fileUrlToPath(script.url) === expectedPath)
    if (matching.length !== 1) {
      throw failure('AMBIGUOUS_SOURCE', { count: matching.length, path: expectedPath })
    }
    decoyLoaded = decoyPath !== null && scripts.some((script) => script.url && fileUrlToPath(script.url) === decoyPath)
    if (decoyLoaded) {
      throw failure('DECOY_LOADED', { path: decoyPath })
    }

    try {
      await send('Debugger.disable')
    } catch { /* detach failure does not downgrade an already verified identity */ }
    const socketToClose = socket
    socket = null
    try {
      socketToClose.close()
      await Promise.race([
        once(socketToClose, 'close'),
        timeout(2000, 'WS_CLOSE_TIMEOUT', { endpoint: String(endpoint) }),
      ])
    } catch { /* teardown bounded; the session ends with the socket or child anyway */ }
    raw.detached = true
  } finally {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try { socket.close() } catch { /* best effort */ }
    }
    if (!state.closed) {
      if (!state.exit) {
        try { child.stdin.end() } catch { /* already closed */ }
        state.exit = await Promise.race([
          new Promise((resolve) => {
            child.once('exit', (code, signal) => resolve({ code, signal }))
          }),
          timeout(1000, 'CHILD_EXIT_TIMEOUT', { pid: child.pid }),
        ])
      }
      state.closed = true
      if (!state.exit) {
        child.kill('SIGTERM')
        state.exit = await Promise.race([
          new Promise((resolve) => {
            child.once('exit', (code, signal) => resolve({ code, signal }))
          }),
          timeout(1000, 'CHILD_KILL_TIMEOUT', { pid: child.pid }),
        ]) || { code: null, signal: 'SIGTERM' }
      }
    }
    raw.exit = state.exit
  }

  const childOutcome = state.exit
  if (!childOutcome || childOutcome.code !== 0 || childOutcome.signal) {
    throw failure('CHILD_EXIT', childOutcome ? { code: childOutcome.code, signal: childOutcome.signal } : { code: null })
  }
  if (!raw.stdout.includes(COMPLETION_MARKER)) {
    throw failure('COMPLETION_MISSING', { stdout: raw.stdout.slice(-RECEIPT_TAIL) })
  }

  return {
    status: 'observed',
    scope: 'controlled-esm-only',
    activation: 'not-proven',
    productLoaded: 'not-tested',
    scriptId: sourceValue.scriptId,
    url: sourceValue.params.url,
    path: expected.canonical,
    isModule: sourceValue.params.isModule === true,
    bytes: observedBytes.length,
    sha256: observedSha256,
    matching: matching.length,
    decoyAbsent: !decoyLoaded,
    exit: childOutcome,
    observations: {
      endpoint: String(endpoint),
      childPid: child.pid,
      markerSeen,
      eventCount: scripts.length,
      ownerRoot: owner,
    },
    rawReceipts: {
      endpoint: raw.endpoint,
      commands: raw.commands,
      eventCount: raw.events,
      stdout: raw.stdout.slice(-RECEIPT_TAIL),
      stderr: raw.stderr.slice(-RECEIPT_TAIL),
      exit: raw.exit,
      detached: raw.detached,
    },
  }
}
