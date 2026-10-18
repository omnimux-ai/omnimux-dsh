import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compareClientProofBundles, prepareClientProofBundle } from './live-runtime-proof.mjs'

const SCRIPT_METHOD = 'Debugger.scriptParsed'
const HASH = /^[a-f0-9]{64}$/
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, path) => path !== root && path.startsWith(root + sep)

function localOrigin(value) {
  const url = new URL(value)
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)
    && Number(url.port) > 0 && url.port !== '45120' && !url.username && !url.password
    && url.pathname === '/' && !url.search && !url.hash, 'Task runtime requires its own dynamic loopback origin')
  return url.origin
}

function ownedPath(privateRoot, path, directory = false) {
  assert.ok(typeof path === 'string' && isAbsolute(path), 'Installed path must be absolute')
  const lexicalRoot = resolve(privateRoot)
  const lexicalPath = resolve(path)
  assert.ok(inside(lexicalRoot, lexicalPath), 'Installed path escapes task private root')
  let current = lexicalRoot
  assert.ok(lstatSync(current).isDirectory() && !lstatSync(current).isSymbolicLink(), 'Task private root must be a real directory')
  for (const part of relative(lexicalRoot, lexicalPath).split(sep)) {
    current = join(current, part)
    assert.ok(!lstatSync(current).isSymbolicLink(), 'Installed path contains a symlink')
  }
  const actual = realpathSync(lexicalPath)
  assert.ok(inside(realpathSync(lexicalRoot), actual), 'Installed real path escapes task private root')
  assert.ok(directory ? lstatSync(actual).isDirectory() : lstatSync(actual).isFile(), 'Installed path has the wrong file type')
  return actual
}

function relativePayloadPath(path) {
  assert.ok(typeof path === 'string' && path && !isAbsolute(path)
    && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe installed payload path')
  return path
}

function installedFile(installation, pkg, descriptor, bytesField = 'size') {
  const path = relativePayloadPath(descriptor?.path)
  assert.match(descriptor.sha256, HASH, 'Installed file digest is missing')
  const payload = pkg.payload.find(item => item.path === path)
  assert.ok(payload, 'Declared entry is absent from installed payload')
  assert.equal(payload.sha256, descriptor.sha256, 'Declared entry digest differs from installed payload')
  const full = ownedPath(installation.privateRoot, resolve(pkg.installedRoot, path))
  assert.ok(inside(realpathSync(pkg.installedRoot), full), 'Declared entry escapes installed package')
  const bytes = readFileSync(full)
  assert.equal(bytes.length, payload.size, 'Installed file byte count changed')
  if (descriptor[bytesField] !== undefined) assert.equal(bytes.length, descriptor[bytesField], 'Declared entry byte count differs')
  assert.equal(sha256(bytes), descriptor.sha256, 'Installed file digest changed')
  return { path, full, source: bytes.toString('utf8'), bytes: bytes.length, sha256: descriptor.sha256 }
}

function installationIdentity(installation) {
  assert.ok(installation && typeof installation === 'object', 'Task installation is required')
  for (const key of ['taskId', 'runId', 'sourceRoot', 'privateRoot', 'profile']) {
    assert.ok(typeof installation[key] === 'string' && installation[key], `Task installation ${key} is required`)
  }
  for (const key of ['candidateDigest', 'inputsDigest']) assert.match(installation[key], HASH, `Task installation ${key} is invalid`)
  for (const key of ['base', 'head']) assert.match(installation[key], /^[a-f0-9]{40,64}$/, `Task installation ${key} is invalid`)
  assert.ok(Number.isSafeInteger(installation.pid) && installation.pid > 1, 'Task installation PID is required')
  const origin = localOrigin(installation.origin)
  assert.ok(Array.isArray(installation.packages) && installation.packages.length, 'Installed packages are required')
  const names = new Set(), roots = new Set()
  for (const pkg of installation.packages) {
    assert.ok(typeof pkg.name === 'string' && pkg.name && !names.has(pkg.name), 'Duplicate or invalid installed package name')
    names.add(pkg.name)
    const root = ownedPath(installation.privateRoot, pkg.installedRoot, true)
    assert.ok(!roots.has(root), 'Duplicate installed package root')
    roots.add(root)
    assert.ok(Array.isArray(pkg.payload) && pkg.payload.length, 'Installed package payload is required')
    const paths = new Set()
    for (const item of pkg.payload) {
      const path = relativePayloadPath(item.path)
      assert.ok(!paths.has(path), 'Duplicate installed payload path')
      paths.add(path)
      assert.match(item.sha256, HASH, 'Invalid installed payload digest')
      assert.ok(Number.isSafeInteger(item.size) && item.size >= 0, 'Invalid installed payload byte count')
    }
    const manifestRecord = pkg.payload.find(item => item.path === 'package.json')
    assert.ok(manifestRecord, 'Installed package manifest is absent from payload')
    const manifest = JSON.parse(installedFile(installation, pkg, manifestRecord).source)
    assert.equal(manifest.name, pkg.name, 'Installed package name does not match its manifest')
    if (pkg.serverEntry || pkg.clientBundle) assert.match(pkg.name, /^omnimux(?:-[a-z0-9-]+)?$/, 'Only registered OmniMux packages can declare runtime entries')
    assert.ok(!pkg.clientBundle || pkg.serverEntry, 'Client package has no server entry')
    if (pkg.serverEntry) {
      const entry = manifest.exports?.['.']
      const declared = typeof entry === 'string' ? entry : entry?.import || entry?.default || manifest.main
      assert.equal(typeof declared, 'string', 'Installed server entry is not declared by its package')
      assert.equal(declared.replace(/^\.\//, ''), pkg.serverEntry.path, 'Installed server entry differs from its manifest')
    }
    if (pkg.clientBundle) {
      const dshRecord = pkg.payload.find(item => item.path === 'dsh.manifest.json')
      const dsh = dshRecord ? JSON.parse(installedFile(installation, pkg, dshRecord).source) : {}
      const declared = typeof dsh.client === 'string' ? dsh.client : dsh.client?.entry || manifest.dsh?.client?.entry || manifest.exports?.['./client']
      assert.equal(typeof declared, 'string', 'Installed client bundle is not declared by its package')
      assert.equal(declared.replace(/^\.\//, ''), pkg.clientBundle.path, 'Installed client bundle differs from its manifest')
    }
  }
  return {
    taskId: installation.taskId, runId: installation.runId, origin, pid: installation.pid,
    sourceRoot: installation.sourceRoot, privateRoot: installation.privateRoot, profile: installation.profile,
    base: installation.base, head: installation.head,
    candidateDigest: installation.candidateDigest, inputsDigest: installation.inputsDigest,
  }
}

function debuggerEvents(response, phase, afterSequence) {
  assert.ok(response && Number.isSafeInteger(response.cursor) && response.cursor >= 0 && Array.isArray(response.events)
    && !response.hasMore && !response.truncated, `Task CDP event capture is incomplete ${phase}`)
  if (afterSequence !== undefined) {
    assert.ok(response.cursor >= afterSequence && response.events.every(event => Number.isSafeInteger(event.sequence)
      && event.sequence > afterSequence && event.sequence <= response.cursor), 'Task CDP event capture contains stale events')
  }
  return response.events.filter(event => event.method === SCRIPT_METHOD).map(event => event.params)
}

async function pageOrigin(send, origin, phase) {
  const response = await send('Runtime.evaluate', { expression: 'location.origin', returnByValue: true })
  assert.ok(!response.exceptionDetails, 'Unable to observe task browser origin')
  assert.equal(response?.result?.value, origin, `Task browser origin changed ${phase}`)
}

/** The event adapter must return bounded cursor pages in the live-proof format. */
export async function captureTaskClientProof({ send, readEvents, origin, installation }) {
  const identity = installationIdentity(installation)
  assert.equal(localOrigin(origin), identity.origin, 'Requested browser origin does not belong to this installation')
  assert.equal(typeof send, 'function', 'Task CDP send is required')
  assert.equal(typeof readEvents, 'function', 'Task CDP cursor reader is required')
  const bundles = await Promise.all(installation.packages.filter(pkg => pkg.clientBundle).map(async pkg => {
    const file = installedFile(installation, pkg, pkg.clientBundle, 'bytes')
    return prepareClientProofBundle({ plugin: pkg.name, path: file.path, source: file.source, sha256: file.sha256, bytes: file.bytes })
  }))
  assert.ok(bundles.length, 'Task installation has no client bundles')
  await pageOrigin(send, identity.origin, 'before proof')
  let enabled = false, operationError
  try {
    const cursor = await readEvents({ methods: [SCRIPT_METHOD] })
    debuggerEvents(cursor, 'before enable')
    await send('Debugger.enable')
    enabled = true
    // This command response is a barrier for scriptParsed messages replayed by enable.
    await send('Runtime.evaluate', { expression: 'void 0', returnByValue: true })
    const response = await readEvents({ afterSequence: cursor.cursor, methods: [SCRIPT_METHOD], limit: 1000 })
    const parsed = debuggerEvents(response, 'after enable', cursor.cursor)
    assert.ok(parsed.length <= 1000, 'Task CDP event capture exceeds limit')
    const ids = new Set(), scripts = []
    for (const script of parsed) {
      assert.ok(typeof script?.scriptId === 'string' && script.scriptId, 'Task CDP script identifier is missing')
      if (ids.has(script.scriptId)) continue
      ids.add(script.scriptId)
      if (!script.url) continue
      const url = new URL(script.url, identity.origin)
      if (url.origin !== identity.origin || !url.pathname.startsWith('/plugins/')) continue
      assert.ok(!script.hasSourceURL, 'Task client script uses a sourceURL alias')
      const source = await send('Debugger.getScriptSource', { scriptId: script.scriptId })
      assert.equal(typeof source?.scriptSource, 'string', 'Task CDP returned no script source')
      scripts.push({ scriptId: script.scriptId, url: url.href, source: source.scriptSource })
    }
    assert.ok(scripts.length, 'Task CDP emitted no same-origin plugin scripts')
    const proofBundles = await compareClientProofBundles(bundles, scripts, 'task renderer')
    await pageOrigin(send, identity.origin, 'after proof')
    // Check installed bytes again, including during an asynchronous browser read.
    installationIdentity(installation)
    for (const pkg of installation.packages.filter(pkg => pkg.clientBundle)) installedFile(installation, pkg, pkg.clientBundle, 'bytes')
    return { kind: 'task-client-loading', ...identity, scriptCount: scripts.length, bundles: proofBundles }
  } catch (error) { operationError = error; throw error }
  finally {
    if (enabled) {
      try { await send('Debugger.disable') } catch (error) { if (!operationError) throw error }
    }
  }
}

async function inspectorConnection(inspectorUrl) {
  const url = new URL(inspectorUrl)
  assert.ok(url.protocol === 'ws:' && url.hostname === '127.0.0.1' && Number(url.port) > 0
    && /^\/[a-f0-9-]+$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password, 'Unsafe task inspector endpoint')
  const socket = new WebSocket(url)
  const pending = new Map(), events = []
  let nextId = 0, sequence = 0, overflow = false
  const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id)
      pending.delete(message.id); clearTimeout(request.timer)
      message.error ? request.reject(new Error('Task inspector command failed')) : request.resolve(message.result)
    } else if (message.method === SCRIPT_METHOD) {
      sequence++
      if (events.length < 10000) events.push({ ...message, sequence })
      else overflow = true
    }
  })
  let connectTimer
  try {
    await new Promise((resolve, reject) => {
      connectTimer = setTimeout(() => reject(new Error('Task inspector connection timed out')), 10000)
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('Task inspector connection failed')), { once: true })
    })
  } catch (error) { socket.close(); throw error }
  finally { clearTimeout(connectTimer) }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Task inspector command timed out')) }, 10000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  return {
    send,
    readEvents: () => {
      assert.ok(!overflow, 'Task inspector script event capture exceeds limit')
      return events
    },
    async close() {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Task inspector disconnected')) }
      pending.clear(); socket.close()
      let timer
      try { await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Task inspector close timed out')), 2000) })]) }
      finally { clearTimeout(timer) }
    },
  }
}

/** Observe already-loaded real files in the exact task child, without source logging. */
export async function verifyTaskServerLoading({ inspectorUrl, pid, installation }) {
  const identity = installationIdentity(installation)
  assert.equal(pid, identity.pid, 'Inspector PID does not belong to this installation')
  const entries = installation.packages.filter(pkg => pkg.serverEntry).map(pkg => ({ pkg, file: installedFile(installation, pkg, pkg.serverEntry) }))
  assert.ok(entries.length, 'Task installation has no server entries')
  const connection = await inspectorConnection(inspectorUrl)
  let enabled = false, operationError
  try {
    const observedPid = await connection.send('Runtime.evaluate', { expression: 'process.pid', returnByValue: true })
    assert.ok(!observedPid.exceptionDetails, 'Unable to observe task inspector PID')
    assert.equal(observedPid?.result?.value, pid, 'Task inspector is attached to a different process')
    await connection.send('Debugger.enable'); enabled = true
    await connection.send('Runtime.evaluate', { expression: 'void 0', returnByValue: true })
    const scripts = connection.readEvents().map(event => event.params)
    const modules = []
    for (const { pkg, file } of entries) {
      const matches = scripts.filter(script => {
        if (!script.url?.startsWith('file://')) return false
        const url = new URL(script.url)
        return !url.hostname && fileURLToPath(url) === file.full
      })
      const unique = [...new Map(matches.map(script => [script.scriptId, script])).values()]
      assert.equal(unique.length, 1, `${pkg.name} server entry is missing or duplicated in task process`)
      const script = unique[0]
      assert.ok(!script.hasSourceURL, `${pkg.name} server script uses a sourceURL alias`)
      assert.equal(script.url, pathToFileURL(file.full).href, `${pkg.name} server script URL is not its installed file`)
      const loaded = await connection.send('Debugger.getScriptSource', { scriptId: script.scriptId })
      assert.equal(typeof loaded?.scriptSource, 'string', 'Task inspector returned no server script source')
      const loadedHash = sha256(loaded.scriptSource)
      assert.equal(loadedHash, file.sha256, `${pkg.name} loaded server source differs from installation`)
      installedFile(installation, pkg, pkg.serverEntry)
      modules.push({ name: pkg.name, path: file.path, sha256: file.sha256, bytes: file.bytes,
        loadedScriptUrl: pathToFileURL(file.full).href, loadedScriptSha256: loadedHash, matchingScriptCount: unique.length })
    }
    return { kind: 'task-server-loading', ...identity, modules }
  } catch (error) { operationError = error; throw error }
  finally {
    try { if (enabled) await connection.send('Debugger.disable') } catch (error) { if (!operationError) operationError = error }
    try { await connection.close() } catch (error) { if (!operationError) operationError = error }
    if (operationError) throw operationError
  }
}

/** Both identities and observed script fingerprints must survive the journey. */
export function assertTaskProofStable(before, after) {
  assert.ok(before && ['task-server-loading', 'task-client-loading'].includes(before.kind), 'Invalid task loading proof')
  assert.deepEqual(before, after, 'Task loading proof changed while browser QA was running')
}
