import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import semver from 'semver'
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
    assert.ok(typeof pkg.name === 'string' && pkg.name, 'Invalid installed package name')
    // Node dependency graphs may contain multiple versions of a package. Only
    // registered task plugins have a process-wide module registration identity.
    if (pkg.serverEntry || pkg.clientBundle) {
      assert.ok(!names.has(pkg.name), 'Duplicate registered task plugin name')
      names.add(pkg.name)
    }
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
    if (pkg.version !== undefined) assert.equal(manifest.version, pkg.version, 'Installed package version does not match its manifest')
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

function installationBinding(installation, identity) {
  return sha256(JSON.stringify({ identity, appAnchor: installation.appAnchor, peerProbe: installation.peerProbe,
    hostPeerExpectations: installation.hostPeerExpectations, packages: installation.packages.map(pkg => ({
    name: pkg.name, version: pkg.version, installedRoot: pkg.installedRoot, payload: pkg.payload,
    serverEntry: pkg.serverEntry, clientBundle: pkg.clientBundle,
  })) }))
}

const peerKey = peer => `${peer.parentRoot}\0${peer.name}`
const prereleasePolicy = spec => /\d+\.\d+\.\d+-[0-9A-Za-z]/.test(spec) ? 'explicit-prerelease-bounds' : 'semver'
const samePeerFields = peer => ({ parentName: peer.parentName, parentRoot: peer.parentRoot, name: peer.name,
  spec: peer.spec, optional: peer.optional, versionPolicy: peer.versionPolicy, ...(peer.privateRoot ? { privateRoot: peer.privateRoot } : {}) })

function validatePeerExpectations(installation) {
  assert.ok(Array.isArray(installation.hostPeerExpectations), 'Task host peer expectations are required')
  const seen = new Set()
  for (const peer of installation.hostPeerExpectations) {
    assert.ok(peer && typeof peer.name === 'string' && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(peer.name), 'Invalid task peer name')
    assert.ok(typeof peer.spec === 'string' && semver.validRange(peer.spec), 'Invalid task peer version range')
    assert.equal(typeof peer.optional, 'boolean', 'Task peer optional declaration is required')
    assert.equal(peer.versionPolicy, prereleasePolicy(peer.spec), 'Task peer version policy differs from its range')
    assert.ok(!seen.has(peerKey(peer)), 'Duplicate task peer expectation')
    seen.add(peerKey(peer))
    assert.ok(installation.packages.some(pkg => pkg.name === peer.parentName && pkg.installedRoot === peer.parentRoot), 'Task peer parent is outside installed graph')
    if (peer.privateRoot) assert.ok(installation.packages.some(pkg => pkg.name === peer.name && pkg.installedRoot === peer.privateRoot), 'Task peer target is outside installed graph')
  }
}

function assertPeerDeclarations(installation) {
  validatePeerExpectations(installation)
  const declared = installation.packages.flatMap(pkg => {
    const manifest = JSON.parse(installedFile(installation, pkg, pkg.payload.find(item => item.path === 'package.json')).source)
    return Object.entries(manifest.peerDependencies || {}).map(([name, spec]) => ({
      parentName: pkg.name, parentRoot: pkg.installedRoot, name, spec,
      optional: manifest.peerDependenciesMeta?.[name]?.optional === true, versionPolicy: prereleasePolicy(spec),
    }))
  })
  const withoutTarget = peer => { const { privateRoot: _privateRoot, ...value } = samePeerFields(peer); return value }
  const sorted = peers => peers.map(withoutTarget).sort((a, b) => peerKey(a).localeCompare(peerKey(b)))
  assert.deepEqual(sorted(installation.hostPeerExpectations), sorted(declared), 'Task peer expectations differ from installed declarations')
}

/** Pure receipt validation shared by the proof producer and report consumer. */
export function validateTaskPeerResolution(installation, peers) {
  validatePeerExpectations(installation)
  assert.ok(Array.isArray(peers), 'Task peer resolution receipts are required')
  assert.equal(peers.length, installation.hostPeerExpectations.length, 'Task peer resolution set is incomplete')
  const expected = new Map(installation.hostPeerExpectations.map(peer => [peerKey(peer), peer]))
  const seen = new Set()
  for (const peer of peers) {
    const declaration = expected.get(peerKey(peer))
    assert.ok(declaration && !seen.has(peerKey(peer)), 'Unexpected or duplicate task peer receipt')
    seen.add(peerKey(peer))
    assert.deepEqual(samePeerFields(peer), samePeerFields(declaration), 'Task peer receipt declaration changed')
    if (peer.status === 'missing') {
      assert.ok(declaration.optional, 'Required task peer is missing')
      assert.equal(peer.scope, null, 'Missing peer has a resolution scope')
      for (const key of ['version', 'packageRoot', 'manifestPath', 'manifestSha256', 'entryPath', 'entrySha256', 'anchorResolution']) {
        assert.equal(peer[key], null, 'Missing peer retains resolved identity')
      }
      continue
    }
    assert.equal(peer.status, 'resolved', 'Task peer resolution status is invalid')
    assert.ok(semver.valid(peer.version) && semver.satisfies(peer.version, peer.spec,
      { includePrerelease: peer.versionPolicy === 'explicit-prerelease-bounds' }), 'Task peer version does not satisfy its declaration')
    for (const key of ['manifestSha256', 'entrySha256']) assert.match(peer[key], HASH, 'Task peer file digest is invalid')
    assert.ok(typeof peer.packageRoot === 'string' && isAbsolute(peer.packageRoot)
      && resolve(peer.packageRoot) === peer.packageRoot, 'Task peer package root is invalid')
    assert.equal(peer.manifestPath, join(peer.packageRoot, 'package.json'), 'Task peer manifest path is invalid')
    assert.ok(typeof peer.entryPath === 'string' && inside(peer.packageRoot, peer.entryPath)
      && resolve(peer.entryPath) === peer.entryPath, 'Task peer entry escapes its package')
    if (declaration.privateRoot) {
      assert.equal(peer.scope, 'private', 'Private task peer has the wrong resolution scope')
      assert.equal(peer.packageRoot, declaration.privateRoot, 'Task peer resolved outside its declared private graph')
      const record = installation.packages.find(pkg => pkg.installedRoot === declaration.privateRoot)
      const manifest = record.payload.find(file => file.path === 'package.json')
      const entry = record.payload.find(file => resolve(record.installedRoot, file.path) === peer.entryPath)
      assert.equal(peer.manifestSha256, manifest?.sha256, 'Private peer manifest differs from installed payload')
      assert.equal(peer.entrySha256, entry?.sha256, 'Private peer entry differs from installed payload')
      if (record.version !== undefined) assert.equal(peer.version, record.version, 'Private peer version differs from installed record')
      assert.equal(peer.anchorResolution, null, 'Private peer unexpectedly claims a shipping anchor')
    } else {
      assert.equal(peer.scope, 'shipping-app', 'Task host peer did not resolve from the shipping app')
      assert.ok(typeof installation.appAnchor === 'string' && /\/Contents\/Resources\/app\.asar\/node_modules\/@deepseek-ai\/dsh\/package\.json$/.test(installation.appAnchor), 'Task shipping app anchor is invalid')
      const appRoot = installation.appAnchor.split('/app.asar/')[0] + '/app.asar'
      assert.ok(inside(appRoot, peer.packageRoot), 'Task host peer resolved outside the shipping app')
      assert.deepEqual(peer.anchorResolution, { packageRoot: peer.packageRoot, version: peer.version,
        manifestPath: peer.manifestPath, manifestSha256: peer.manifestSha256,
        entryPath: peer.entryPath, entrySha256: peer.entrySha256 }, 'Task host peer differs from shipping anchor resolution')
    }
  }
  return peers
}

// This function runs only from the real, hashed profile-side probe module.
function observeTaskPeerGraph(expectations, appAnchor, fs, path, crypto, module) {
  const digest = value => crypto.createHash('sha256').update(value).digest('hex')
  const manifestAt = file => ({ value: JSON.parse(fs.readFileSync(file, 'utf8')), sha256: digest(fs.readFileSync(file)) })
  const anchorPath = fs.realpathSync(appAnchor)
  if (anchorPath !== appAnchor || manifestAt(anchorPath).value.name !== '@deepseek-ai/dsh') throw new Error('Task app anchor identity is invalid')
  const resolvePackage = (parent, name) => {
    let entry
    try { entry = module.createRequire(parent).resolve(name) }
    catch (error) { if (['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(error.code)) return null; throw error }
    entry = fs.realpathSync(entry)
    let directory = path.dirname(entry)
    for (;;) {
      const manifestPath = path.join(directory, 'package.json')
      if (fs.existsSync(manifestPath)) {
        const manifest = manifestAt(manifestPath)
        if (manifest.value.name === name) return { packageRoot: fs.realpathSync(directory), version: manifest.value.version,
          manifestPath: fs.realpathSync(manifestPath), manifestSha256: manifest.sha256,
          entryPath: entry, entrySha256: digest(fs.readFileSync(entry)) }
      }
      const parent = path.dirname(directory)
      if (parent === directory) throw new Error('Resolved task peer has no matching package manifest')
      directory = parent
    }
  }
  return expectations.map(expected => {
    const actual = resolvePackage(path.join(expected.parentRoot, 'package.json'), expected.name)
    if (!actual) return { ...expected, status: 'missing', scope: null, version: null, packageRoot: null,
      manifestPath: null, manifestSha256: null, entryPath: null, entrySha256: null, anchorResolution: null }
    return { ...expected, ...actual, status: 'resolved', scope: expected.privateRoot ? 'private' : 'shipping-app',
      anchorResolution: expected.privateRoot ? null : resolvePackage(appAnchor, expected.name) }
  })
}

/** Fixed source installed as a real module directly inside the private profile. */
export function createTaskPeerProbeSource({ expectations, appAnchor }) {
  assert.ok(Array.isArray(expectations), 'Peer probe requires explicit expectations')
  const imports = [...new Set(expectations.map(peer => peer.parentRoot))].sort()
    .map(root => `import ${JSON.stringify(pathToFileURL(join(root, 'package.json')).href)} with { type: 'json' };`).join('\n')
  return `${imports}\nimport * as fs from 'node:fs';\nimport * as path from 'node:path';\nimport * as crypto from 'node:crypto';\nimport * as module from 'node:module';\nconst observe=${observeTaskPeerGraph.toString()};\nexport function observeTaskPeers() { return observe(${JSON.stringify(expectations)},${JSON.stringify(appAnchor)},fs,path,crypto,module); }\n`
}

async function captureTaskPeerProof(connection, installation) {
  assertPeerDeclarations(installation)
  if (!installation.hostPeerExpectations.length) return []
  const probe = installation.peerProbe
  assert.ok(probe && dirname(probe.path) === installation.profile, 'Task peer probe must be a real file directly in its profile')
  const file = ownedPath(installation.privateRoot, probe.path)
  assert.match(probe.sha256, HASH, 'Task peer probe digest is invalid')
  const source = readFileSync(file, 'utf8')
  assert.equal(sha256(source), probe.sha256, 'Task peer probe file changed')
  assert.equal(source, createTaskPeerProbeSource({ expectations: installation.hostPeerExpectations, appAnchor: installation.appAnchor }), 'Task peer probe source is not the declared controlled observer')
  const response = await connection.send('Runtime.evaluate', {
    expression: `process.getBuiltinModule('node:module').createRequire(${JSON.stringify(installation.appAnchor)})(${JSON.stringify(file)}).observeTaskPeers()`,
    returnByValue: true,
  })
  if (response.exceptionDetails) {
    throw Object.assign(new Error('Task peer observer failed in the actual server process'), {
      peerObserverFailure: { className: response.exceptionDetails.exception?.className,
        detail: String(response.exceptionDetails.exception?.description || response.exceptionDetails.text || '').split('\n', 1)[0].slice(0, 300) },
    })
  }
  const parsed = connection.readEvents().filter(event => event.params.url === pathToFileURL(file).href).map(event => event.params)
  assert.equal(new Set(parsed.map(script => script.scriptId)).size, 1, 'Task peer probe was not uniquely parsed by the server')
  assert.ok(!parsed[0].hasSourceURL, 'Task peer probe uses a sourceURL alias')
  const loaded = await connection.send('Debugger.getScriptSource', { scriptId: parsed[0].scriptId })
  assert.equal(typeof loaded?.scriptSource, 'string', 'Task peer probe source is unavailable')
  assert.equal(sha256(loaded.scriptSource), probe.sha256, 'Loaded peer observer differs from its real installed file')
  assert.equal(sha256(readFileSync(file)), probe.sha256, 'Task peer probe changed during observation')
  return validateTaskPeerResolution(installation, response.result?.value)
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
  const binding = installationBinding(installation, identity)
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
    assert.equal(installationBinding(installation, installationIdentity(installation)), binding, 'Task installation identity changed during client proof')
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
  const binding = installationBinding(installation, identity)
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
    const peers = await captureTaskPeerProof(connection, installation)
    assert.equal(installationBinding(installation, installationIdentity(installation)), binding, 'Task installation identity changed during server proof')
    return { kind: 'task-server-loading', ...identity, modules, peers }
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
