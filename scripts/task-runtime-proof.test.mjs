import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, test } from 'node:test'
import { assertTaskProofStable, captureTaskClientProof, createTaskPeerProbeSource, validateTaskPeerResolution, verifyTaskServerLoading } from './task-runtime-proof.mjs'
import { readSidebarSupportIdentity, readSupportPeerExemptions } from './task-runtime-install.mjs'

const roots = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const registration = (name, body = `return ${JSON.stringify(name)}`) => `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:()=>{${body}}});`

function fixture() {
  const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'omnimux-task-proof-')))
  roots.push(privateRoot)
  const installation = {
    taskId: 'task-3409', runId: 'run-proof', sourceRoot: process.cwd(), privateRoot,
    profile: 'web', base: 'a'.repeat(40), head: 'b'.repeat(40), candidateDigest: 'c'.repeat(64), inputsDigest: 'd'.repeat(64),
    origin: 'http://127.0.0.1:48765', pid: process.pid, packages: [],
    hostPeerExpectations: [],
    runtimeExecutable: process.execPath,
  }
  for (const name of ['omnimux', 'omnimux-inspiration']) {
    const installedRoot = join(privateRoot, name)
    mkdirSync(join(installedRoot, 'lib'), { recursive: true })
    writeFileSync(join(installedRoot, 'package.json'), JSON.stringify({ name, type: 'module', main: 'lib/server.mjs', exports: { '.': './lib/server.mjs', './client': './lib/client.js' } }))
    writeFileSync(join(installedRoot, 'lib/server.mjs'), `export const name=${JSON.stringify(name)};\n`)
    writeFileSync(join(installedRoot, 'lib/client.js'), registration(name))
    const payload = ['package.json', 'lib/server.mjs', 'lib/client.js'].map(path => {
      const bytes = readFileSync(join(installedRoot, path))
      return { path, sha256: hash(bytes), size: bytes.length }
    })
    installation.packages.push({ name, installedRoot, payload,
      serverEntry: { ...payload[1] }, clientBundle: { path: payload[2].path, sha256: payload[2].sha256, bytes: payload[2].size } })
  }
  return installation
}

function client(installation, options = {}) {
  const source = installation.packages.filter(pkg => pkg.clientBundle).map(pkg => readFileSync(join(pkg.installedRoot, pkg.clientBundle.path), 'utf8')).join('\n')
  const scripts = options.scripts || [{ scriptId: 'one', url: `${installation.origin}/plugins/all.js`, source }]
  const calls = [], byId = new Map(scripts.map(script => [script.scriptId, script.source]))
  let originReads = 0
  return {
    calls,
    send: async (method, params) => {
      calls.push({ method, params })
      if (method === 'Runtime.evaluate' && params.expression === 'location.origin') {
        originReads++
        return { result: { value: options.origins?.[originReads - 1] ?? installation.origin } }
      }
      if (method === 'Debugger.getScriptSource') {
        options.duringSource?.()
        return { scriptSource: byId.get(params.scriptId) }
      }
      return {}
    },
    readEvents: async ({ afterSequence } = {}) => afterSequence === undefined
      ? { cursor: 8, events: [{ sequence: 1, method: 'Debugger.scriptParsed', params: { scriptId: 'old', url: '/plugins/old.js' } }] }
      : { cursor: 20, truncated: options.truncated, hasMore: options.hasMore,
        events: scripts.map(({ source: _source, ...params }, index) => ({ sequence: options.stale ? 1 : 9 + index, method: 'Debugger.scriptParsed', params })) },
  }
}

const capture = (installation, options) => captureTaskClientProof({ ...client(installation, options), origin: installation.origin, installation })

test('client proof binds installed payload, task identity, dynamic origin and actual registrations', async () => {
  const installation = fixture(), adapter = client(installation)
  const proof = await captureTaskClientProof({ ...adapter, origin: installation.origin, installation })
  assert.equal(proof.kind, 'task-client-loading')
  assert.equal(proof.candidateDigest, installation.candidateDigest)
  assert.equal(proof.bundles.length, 2)
  assert.ok(proof.bundles.every(bundle => bundle.matchingRegistrationCount === 1 && bundle.match === 'raw-registration'))
  assert.equal(adapter.calls.filter(call => call.method === 'Debugger.getScriptSource').length, 1)
  assert.equal(adapter.calls.at(-1).method, 'Debugger.disable')
  assert.ok(!JSON.stringify(proof).includes('factory:'), 'source text stays in memory')
  assertTaskProofStable(proof, structuredClone(proof))
  const changed = structuredClone(proof); changed.head = 'f'.repeat(40)
  assert.throws(() => assertTaskProofStable(proof, changed), /changed/)
})

test('client proof shares semantic registration comparison without broadening the Dev entry', async () => {
  const installation = fixture()
  const scripts = [{ scriptId: 'one', url: `${installation.origin}/plugins/all.js`, source:
    installation.packages.map(pkg => `${registration(pkg.name)} // generated comment`).join('\n') }]
  const proof = await capture(installation, { scripts })
  assert.equal(proof.bundles.length, 2)
  installation.origin = 'http://127.0.0.1:45120'
  await assert.rejects(capture(installation), /own dynamic loopback/)
})

test('client rejects changed or foreign origins before and after source reads', async () => {
  const installation = fixture()
  await assert.rejects(capture(installation, { origins: ['http://127.0.0.1:55555'] }), /origin changed before/)
  await assert.rejects(capture(installation, { origins: [installation.origin, 'https://example.com'] }), /origin changed after/)
  await assert.rejects(captureTaskClientProof({ ...client(installation), origin: 'http://127.0.0.1:55555', installation }), /does not belong/)
})

test('client rejects stale, truncated and incomplete script captures', async () => {
  const installation = fixture()
  for (const options of [{ stale: true }, { truncated: true }, { hasMore: true }]) {
    await assert.rejects(capture(installation, options), /stale|incomplete/)
  }
})

test('client refuses missing, wrong-origin, sourceURL and changed registrations', async () => {
  const installation = fixture()
  for (const scripts of [
    [],
    [{ scriptId: '1', url: 'http://127.0.0.1:55555/plugins/all.js', source: registration('omnimux') }],
    [{ scriptId: '1', url: `${installation.origin}/plugins/all.js`, hasSourceURL: true, source: registration('omnimux') }],
    [{ scriptId: '1', url: `${installation.origin}/plugins/all.js`, source: registration('omnimux', 'return "old"') }],
  ]) await assert.rejects(capture(installation, { scripts }), /no same-origin|sourceURL|does not match|not loaded/)
})

test('client refuses duplicate and old/new loaded scripts', async () => {
  const installation = fixture()
  const bundle = name => readFileSync(join(installation.packages.find(pkg => pkg.name === name).installedRoot, 'lib/client.js'), 'utf8')
  await assert.rejects(capture(installation, { scripts: [{ scriptId: '1', url: `${installation.origin}/plugins/all.js`,
    source: `${bundle('omnimux')}\n${bundle('omnimux')}\n${bundle('omnimux-inspiration')}` }] }), /multiple registrations/)
  await assert.rejects(capture(installation, { scripts: [
    { scriptId: '1', url: `${installation.origin}/plugins/omnimux/client.js?new`, source: bundle('omnimux') },
    { scriptId: '2', url: `${installation.origin}/plugins/omnimux/client.js?old`, source: registration('omnimux', 'return "old"') },
  ] }), /ambiguous old\/new/)
})

test('installed identity rejects duplicate packages, duplicate payloads and wrong manifest names', async () => {
  const installation = fixture()
  const duplicate = structuredClone(installation); duplicate.packages.push(structuredClone(duplicate.packages[0]))
  await assert.rejects(capture(duplicate), /Duplicate registered task plugin/)
  const repeated = structuredClone(installation); repeated.packages[0].payload.push(repeated.packages[0].payload[0])
  await assert.rejects(capture(repeated), /Duplicate installed payload/)
  installation.packages[0].name = 'wrong-name'
  await assert.rejects(capture(installation), /does not match its manifest/)
})

test('installed dependency graph preserves same-name multiple versions and checks declared versions', async () => {
  const installation = fixture()
  for (const version of ['1.0.0', '2.0.0']) {
    const installedRoot = join(installation.privateRoot, `normal-dependency-${version}`)
    mkdirSync(installedRoot)
    const bytes = Buffer.from(JSON.stringify({ name: 'normal-dependency', version }))
    writeFileSync(join(installedRoot, 'package.json'), bytes)
    installation.packages.push({ name: 'normal-dependency', version, installedRoot,
      payload: [{ path: 'package.json', sha256: hash(bytes), size: bytes.length }] })
  }
  const proof = await capture(installation)
  assert.equal(proof.bundles.length, 2)
  installation.packages.at(-1).version = '1.0.0'
  await assert.rejects(capture(installation), /version does not match its manifest/)
})

test('all canonical package roots remain unique even for ordinary dependencies', async () => {
  const installation = fixture(), pkg = structuredClone(installation.packages[0])
  delete pkg.serverEntry; delete pkg.clientBundle
  installation.packages.push(pkg)
  await assert.rejects(capture(installation), /Duplicate installed package root/)
})

test('installed entries must match package declarations and dependencies need no runtime entry', async () => {
  const installation = fixture(), pkg = installation.packages[0], adapter = client(installation)
  pkg.serverEntry = { ...pkg.serverEntry, path: 'lib/client.js' }
  await assert.rejects(captureTaskClientProof({ ...adapter, origin: installation.origin, installation }), /server entry differs/)
  pkg.serverEntry = { ...pkg.payload.find(item => item.path === 'lib/server.mjs') }
  pkg.clientBundle = { ...pkg.clientBundle, path: 'lib/server.mjs' }
  await assert.rejects(captureTaskClientProof({ ...adapter, origin: installation.origin, installation }), /client bundle differs/)
  const dependency = structuredClone(installation.packages[1]); delete dependency.serverEntry; delete dependency.clientBundle
  installation.packages[1] = dependency
  pkg.clientBundle = { path: 'lib/client.js', sha256: pkg.payload[2].sha256, bytes: pkg.payload[2].size }
  const proof = await capture(installation)
  assert.equal(proof.bundles.length, 1)
})

test('installed file checks reject escape, symlink, stale digest, wrong size and absent payload', async () => {
  for (const kind of ['escape', 'symlink', 'digest', 'size', 'absent']) {
    const installation = fixture(), pkg = installation.packages[0]
    const adapter = client(installation)
    if (kind === 'escape') pkg.clientBundle.path = '../lib/client.js'
    if (kind === 'symlink') {
      const file = join(pkg.installedRoot, 'lib/client.js'), source = readFileSync(file)
      rmSync(file); writeFileSync(join(installation.privateRoot, 'elsewhere.js'), source)
      symlinkSync(join(installation.privateRoot, 'elsewhere.js'), file)
    }
    if (kind === 'digest') writeFileSync(join(pkg.installedRoot, 'lib/client.js'), `${registration('omnimux')} `)
    if (kind === 'size') pkg.clientBundle.bytes++
    if (kind === 'absent') pkg.payload = pkg.payload.filter(item => item.path !== pkg.clientBundle.path)
    await assert.rejects(captureTaskClientProof({ ...adapter, origin: installation.origin, installation }), /Unsafe|symlink|changed|differs|absent/)
  }
})

test('client rechecks installed bundle after asynchronous reads', async () => {
  const installation = fixture(), file = join(installation.packages[0].installedRoot, 'lib/client.js')
  await assert.rejects(capture(installation, { duringSource: () => writeFileSync(file, 'changed') }), /changed/)
})

test('client rejects task identity and payload metadata changing during asynchronous reads', async () => {
  for (const change of [installation => { installation.head = 'f'.repeat(40) }, installation => { installation.packages[0].payload.reverse() }]) {
    const installation = fixture()
    await assert.rejects(capture(installation, { duringSource: () => change(installation) }), /installation identity changed/)
  }
})

async function ownedProcess(installation, body, execPath = process.execPath) {
  const runner = join(installation.privateRoot, 'runner.mjs')
  writeFileSync(runner, `${body}\nconsole.log('TASK_PROOF_READY'); setInterval(()=>{},1000);\n`)
  const child = spawn(execPath, ['--inspect=127.0.0.1:0', runner], {
    env: { HOME: installation.privateRoot, PATH: '/usr/bin:/bin' }, cwd: installation.privateRoot, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const closed = new Promise(resolve => child.once('close', resolve))
  let stderr = '', stdout = '', timer
  try {
    const inspector = new Promise((resolve, reject) => {
      child.stderr.on('data', chunk => { stderr += chunk; const match = stderr.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/); if (match) resolve(match[1]) })
      child.once('error', reject); child.once('exit', () => reject(new Error('Owned inspector child exited before ready')))
    })
    const ready = new Promise(resolve => child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('TASK_PROOF_READY')) resolve() }))
    const [inspectorUrl] = await Promise.race([
      Promise.all([inspector, ready]), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned inspector child startup timed out')), 10000) }),
    ])
    installation.pid = child.pid
    return { inspectorUrl, pid: child.pid, async cleanup() { child.kill('SIGTERM'); await closed } }
  } catch (error) { child.kill('SIGTERM'); await closed; throw error }
  finally { clearTimeout(timer) }
}

test('real task-owned Node inspector binds same PID and exact source bytes', async () => {
  const installation = fixture()
  const child = await ownedProcess(installation, installation.packages.map(pkg => `import ${JSON.stringify(pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href)};`).join('\n'))
  try {
    const proof = await verifyTaskServerLoading({ ...child, installation })
    assert.equal(proof.kind, 'task-server-loading')
    assert.equal(proof.pid, child.pid)
    assert.equal(proof.runtimeExecutable, process.execPath)
    assert.equal(proof.modules.length, 2)
    assert.equal(proof.peerObserver, null)
    assert.ok(proof.modules.every(module => module.sha256 === module.loadedScriptSha256 && module.matchingScriptCount === 1))
    assertTaskProofStable(proof, await verifyTaskServerLoading({ ...child, installation }))
    const wrong = { ...installation, pid: child.pid + 1 }
    await assert.rejects(verifyTaskServerLoading({ inspectorUrl: child.inspectorUrl, pid: wrong.pid, installation: wrong }), /different process/)
    await assert.rejects(verifyTaskServerLoading({ ...child, installation: { ...installation, runtimeExecutable: '/wrong/node' } }), /executable differs/)
  } finally { await child.cleanup() }
})

test('real inspector rejects unexecuted installed source and sourceURL aliases', async () => {
  for (const alias of [false, true]) {
    const installation = fixture()
    const pkg = installation.packages[0]
    const body = alias ? `eval(${JSON.stringify(`${readFileSync(join(pkg.installedRoot, pkg.serverEntry.path), 'utf8').replace('export ', '')}\n//# sourceURL=${pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href}`)});` : ''
    const child = await ownedProcess(installation, body)
    try { await assert.rejects(verifyTaskServerLoading({ ...child, installation }), alias ? /sourceURL/ : /missing or duplicated/) }
    finally { await child.cleanup() }
  }
})

test('real inspector rejects an old loaded version even if new disk metadata is internally consistent', async () => {
  const installation = fixture(), pkg = installation.packages[0]
  const child = await ownedProcess(installation, `import ${JSON.stringify(pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href)};`)
  try {
    const file = join(pkg.installedRoot, pkg.serverEntry.path)
    writeFileSync(file, 'export const name="old-source-differs";\n')
    const bytes = readFileSync(file), record = pkg.payload.find(item => item.path === pkg.serverEntry.path)
    record.sha256 = hash(bytes); record.size = bytes.length; pkg.serverEntry = { ...record }
    await assert.rejects(verifyTaskServerLoading({ ...child, installation }), /loaded server source differs/)
  } finally { await child.cleanup() }
})

test('real inspector rejects duplicate versions of one installed file', async () => {
  const installation = fixture(), pkg = installation.packages[0]
  const url = pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href
  const child = await ownedProcess(installation, `import ${JSON.stringify(url)}; import ${JSON.stringify(url + '?another-version')};`)
  try { await assert.rejects(verifyTaskServerLoading({ ...child, installation }), /missing or duplicated/) }
  finally { await child.cleanup() }
})

test('server inspector rejects unsafe endpoints before connecting', async () => {
  const installation = fixture()
  for (const inspectorUrl of ['ws://example.com:1234/abc', 'ws://127.0.0.1:1234/abc?token=x', 'http://127.0.0.1:1234/abc']) {
    await assert.rejects(verifyTaskServerLoading({ inspectorUrl, pid: installation.pid, installation }), /Unsafe task inspector/)
  }
})

function addPeerFixture(installation, { optional = false, missing = false, version = '1.2.3', spec = '^1.0.0' } = {}) {
  const parent = installation.packages[0], parentManifest = join(parent.installedRoot, 'package.json')
  const manifest = JSON.parse(readFileSync(parentManifest, 'utf8'))
  manifest.peerDependencies = { 'test-peer': spec }
  if (optional) manifest.peerDependenciesMeta = { 'test-peer': { optional: true } }
  writeFileSync(parentManifest, JSON.stringify(manifest))
  const parentRecord = parent.payload.find(file => file.path === 'package.json'), parentBytes = readFileSync(parentManifest)
  Object.assign(parentRecord, { sha256: hash(parentBytes), size: parentBytes.length })
  const peerRoot = join(installation.privateRoot, 'test-peer')
  if (!missing) {
    mkdirSync(peerRoot)
    writeFileSync(join(peerRoot, 'package.json'), JSON.stringify({ name: 'test-peer', version, main: 'index.js' }))
    writeFileSync(join(peerRoot, 'index.js'), 'module.exports = 1;\n')
    const payload = ['package.json', 'index.js'].map(path => { const bytes = readFileSync(join(peerRoot, path)); return { path, sha256: hash(bytes), size: bytes.length } })
    installation.packages.push({ name: 'test-peer', version, installedRoot: peerRoot, payload })
    mkdirSync(join(parent.installedRoot, 'node_modules'))
    symlinkSync(peerRoot, join(parent.installedRoot, 'node_modules/test-peer'))
  }
  installation.hostPeerExpectations = [{ parentName: parent.name, parentRoot: parent.installedRoot, name: 'test-peer', spec, optional,
    versionPolicy: /\d+\.\d+\.\d+-/.test(spec) ? 'explicit-prerelease-bounds' : 'semver', ...(!missing ? { privateRoot: peerRoot } : {}) }]
  // This fixture is a regular directory, not an actual shipping App. It only
  // exercises the controlled observer protocol in a task-owned Node process.
  installation.appAnchor = join(installation.privateRoot, 'Host.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/package.json')
  mkdirSync(dirname(installation.appAnchor), { recursive: true })
  writeFileSync(installation.appAnchor, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.0' }))
  installation.profile = join(installation.privateRoot, 'profile')
  mkdirSync(installation.profile)
  const source = createTaskPeerProbeSource({ expectations: installation.hostPeerExpectations, appAnchor: installation.appAnchor })
  const path = join(installation.profile, 'task-peer-probe.mjs')
  writeFileSync(path, source)
  installation.peerProbe = { path, sha256: hash(source) }
}

test('same-PID controlled profile probe resolves the real declared private peer graph', async () => {
  const installation = fixture(); addPeerFixture(installation)
  const child = await ownedProcess(installation, installation.packages.filter(pkg => pkg.serverEntry)
    .map(pkg => `import ${JSON.stringify(pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href)};`).join('\n'))
  try {
    const proof = await verifyTaskServerLoading({ ...child, installation })
    assert.equal(proof.peers.length, 1)
    assert.equal(proof.peers[0].scope, 'private')
    assert.equal(proof.peers[0].version, '1.2.3')
    assert.equal(proof.peerObserver.loadedScriptSha256, installation.peerProbe.sha256)
    assert.equal(proof.peerObserver.path, installation.peerProbe.path)
    assert.equal(proof.peerObserver.matchingScriptCount, 1)
    validateTaskPeerResolution(installation, proof.peers)
    const outside = structuredClone(proof.peers); outside[0].packageRoot = '/outside'
    assert.throws(() => validateTaskPeerResolution(installation, outside), /manifest path|entry escapes|private graph/)
    const missing = structuredClone(proof.peers); missing[0].status = 'missing'; missing[0].scope = null
    assert.throws(() => validateTaskPeerResolution(installation, missing), /Required task peer/)
    const duplicate = [...proof.peers, proof.peers[0]]
    assert.throws(() => validateTaskPeerResolution(installation, duplicate), /incomplete/)
  } finally { await child.cleanup() }
})

test('same-PID peer proof explicitly records optional missing but rejects required missing and wrong versions', async () => {
  for (const options of [{ optional: true, missing: true }, { missing: true }, { version: '2.0.0' }]) {
    const installation = fixture(); addPeerFixture(installation, options)
    const child = await ownedProcess(installation, installation.packages.filter(pkg => pkg.serverEntry)
      .map(pkg => `import ${JSON.stringify(pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href)};`).join('\n'))
    try {
      if (options.optional) {
        const proof = await verifyTaskServerLoading({ ...child, installation })
        assert.equal(proof.peers[0].status, 'missing'); assert.equal(proof.peers[0].entryPath, null)
      } else await assert.rejects(verifyTaskServerLoading({ ...child, installation }), error => {
        assert.match(error.message, /Required task peer|version does not satisfy/)
        assert.equal(error.peerResolutionFailure.name, 'test-peer')
        assert.equal(error.peerResolutionFailure.spec, '^1.0.0')
        assert.equal(error.peerResolutionFailure.optional, false)
        assert.equal(error.peerResolutionFailure.status, options.missing ? 'missing' : 'resolved')
        assert.deepEqual(Object.keys(error.peerResolutionFailure), ['parentName', 'parentRoot', 'name', 'spec', 'optional', 'status', 'scope', 'version', 'packageRoot'])
        return true
      })
    } finally { await child.cleanup() }
  }
})

test('peer proof rejects missing declarations and modified or unowned probe source', async () => {
  for (const kind of ['declaration', 'source', 'location']) {
    const installation = fixture(); addPeerFixture(installation)
    if (kind === 'declaration') installation.hostPeerExpectations = []
    if (kind === 'source') writeFileSync(installation.peerProbe.path, 'export const observeTaskPeers=()=>[];')
    if (kind === 'location') installation.peerProbe.path = join(installation.privateRoot, 'outside.mjs')
    const child = await ownedProcess(installation, installation.packages.filter(pkg => pkg.serverEntry)
      .map(pkg => `import ${JSON.stringify(pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href)};`).join('\n'))
    try { await assert.rejects(verifyTaskServerLoading({ ...child, installation }), /differ from installed|probe file changed|directly in its profile/) }
    finally { await child.cleanup() }
  }
})

test('pure peer validator binds shipping resolution to the exact App anchor and semver policy', () => {
  const installation = fixture(); addPeerFixture(installation)
  const expected = installation.hostPeerExpectations[0]
  delete expected.privateRoot
  const packageRoot = installation.appAnchor.split('/app.asar/')[0] + '/app.asar/node_modules/test-peer'
  const anchorResolution = { packageRoot, version: '1.2.3', manifestPath: join(packageRoot, 'package.json'),
    manifestSha256: '1'.repeat(64), entryPath: join(packageRoot, 'index.js'), entrySha256: '2'.repeat(64) }
  const peer = { ...expected, ...anchorResolution, status: 'resolved', scope: 'shipping-app', anchorResolution }
  validateTaskPeerResolution(installation, [peer])
  const wrongAnchor = structuredClone(peer); wrongAnchor.anchorResolution.entrySha256 = '3'.repeat(64)
  assert.throws(() => validateTaskPeerResolution(installation, [wrongAnchor]), /differs from shipping anchor/)
  const foreign = structuredClone(peer)
  foreign.packageRoot = '/repository/node_modules/test-peer'; foreign.manifestPath = join(foreign.packageRoot, 'package.json'); foreign.entryPath = join(foreign.packageRoot, 'index.js')
  assert.throws(() => validateTaskPeerResolution(installation, [foreign]), /outside the shipping app/)
  const prerelease = structuredClone(peer)
  prerelease.version = '1.2.3-rc.1'; prerelease.anchorResolution.version = prerelease.version
  assert.throws(() => validateTaskPeerResolution(installation, [prerelease]), /version does not satisfy/)
  expected.spec = '>=1.0.0-rc.1'; expected.versionPolicy = 'explicit-prerelease-bounds'
  prerelease.spec = expected.spec; prerelease.versionPolicy = expected.versionPolicy
  validateTaskPeerResolution(installation, [prerelease])
  const unexpected = structuredClone(prerelease); unexpected.name = 'other-peer'
  assert.throws(() => validateTaskPeerResolution(installation, [unexpected]), /Unexpected or duplicate/)
})

test('same-PID peer proof rejects a real ancestor package outside the declared private graph', async () => {
  const installation = fixture(); addPeerFixture(installation)
  const expected = installation.hostPeerExpectations[0]
  const wrongRoot = join(installation.privateRoot, 'undeclared-ancestor-peer')
  mkdirSync(wrongRoot)
  writeFileSync(join(wrongRoot, 'package.json'), JSON.stringify({ name: 'test-peer', version: '1.2.3', main: 'index.js' }))
  writeFileSync(join(wrongRoot, 'index.js'), 'module.exports = "outside declared graph";\n')
  const link = join(expected.parentRoot, 'node_modules/test-peer')
  rmSync(link); symlinkSync(wrongRoot, link)
  const child = await ownedProcess(installation, installation.packages.filter(pkg => pkg.serverEntry)
    .map(pkg => `import ${JSON.stringify(pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href)};`).join('\n'))
  try { await assert.rejects(verifyTaskServerLoading({ ...child, installation }), /outside its declared private graph/) }
  finally { await child.cleanup() }
})

// ---------------------------------------------------------------- 声明驱动的精确版本豁免（proof 侧）

// The blocker shape (Issue #3762): a packaged support package whose non-optional host peers
// declare an older generation than the shipping app actually resolves. The parent identity is
// always taken from the shipped declaration, never restated as a host version literal here.
function addHostPeerFixture(installation, options) {
  const parentRoot = join(installation.privateRoot, options.parentName)
  mkdirSync(parentRoot, { recursive: true })
  const spec = '^0.1.5-rc.1'
  writeFileSync(join(parentRoot, 'package.json'), JSON.stringify({ name: options.parentName, version: options.parentVersion,
    peerDependencies: { '@deepseek-ai/dsh-agent': spec } }))
  const parentBytes = readFileSync(join(parentRoot, 'package.json'))
  installation.packages.push({ name: options.parentName, version: options.parentVersion, installedRoot: parentRoot,
    payload: [{ path: 'package.json', sha256: hash(parentBytes), size: parentBytes.length }] })
  installation.appAnchor = join(installation.privateRoot, 'Host.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/package.json')
  mkdirSync(dirname(installation.appAnchor), { recursive: true })
  writeFileSync(installation.appAnchor, JSON.stringify({ name: '@deepseek-ai/dsh', version: options.hostVersion }))
  const appRoot = installation.appAnchor.split('/app.asar/')[0] + '/app.asar'
  const peerRoot = join(appRoot, 'node_modules/@deepseek-ai/dsh-agent')
  mkdirSync(peerRoot, { recursive: true })
  writeFileSync(join(peerRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-agent', version: options.hostVersion, main: 'index.js' }))
  writeFileSync(join(peerRoot, 'index.js'), 'module.exports = 1;\n')
  mkdirSync(join(parentRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  symlinkSync(peerRoot, join(parentRoot, 'node_modules/@deepseek-ai/dsh-agent'))
  installation.hostPeerExpectations = [{ parentName: options.parentName, parentRoot, name: '@deepseek-ai/dsh-agent',
    spec, optional: false, versionPolicy: 'explicit-prerelease-bounds' }]
}

function addHostPeerProbe(installation) {
  installation.profile = join(installation.privateRoot, 'profile')
  mkdirSync(installation.profile, { recursive: true })
  const source = createTaskPeerProbeSource({ expectations: installation.hostPeerExpectations, appAnchor: installation.appAnchor })
  const path = join(installation.profile, 'task-peer-probe.mjs')
  writeFileSync(path, source)
  installation.peerProbe = { path, sha256: hash(source) }
}

function hostPeerReceipt(installation, hostVersion) {
  const packageRoot = installation.appAnchor.split('/app.asar/')[0] + '/app.asar/node_modules/@deepseek-ai/dsh-agent'
  const anchorResolution = { packageRoot, version: hostVersion, manifestPath: join(packageRoot, 'package.json'),
    manifestSha256: '1'.repeat(64), entryPath: join(packageRoot, 'index.js'), entrySha256: '2'.repeat(64) }
  return Object.assign({}, installation.hostPeerExpectations[0], anchorResolution,
    { status: 'resolved', scope: 'shipping-app', anchorResolution })
}

// The shipped identity file is the only exemption truth source; the cases below drive the same
// reader with an injected identity rather than restating an exemption list of their own.
function shippedDeclaration() {
  const identity = readSidebarSupportIdentity()
  const rows = readSupportPeerExemptions(identity)
  assert.ok(rows.length, 'the shipped identity must declare at least one peer exemption')
  return { identity, declared: rows[0] }
}

function declaredHostFixture(declared) {
  const installation = fixture()
  addHostPeerFixture(installation, { parentName: declared.package, parentVersion: declared.version, hostVersion: declared.hostSpec })
  return installation
}

test('proof accepts the shipped host peer exemption and records it for audit', () => {
  const { declared } = shippedDeclaration()
  const installation = declaredHostFixture(declared)
  const receipt = hostPeerReceipt(installation, declared.hostSpec)
  const peers = validateTaskPeerResolution(installation, [receipt])
  assert.equal(peers[0].exempted, true)
  assert.equal(peers[0].exemptionKey, `${declared.package}@${declared.version}`)
  assert.equal(peers[0].exemptionHostSpec, declared.hostSpec)
  assert.equal(peers[0].exemptionReviewedAt, declared.reviewedAt)
  assert.equal(peers[0].version, declared.hostSpec)
  assert.equal(peers[0].spec, '^0.1.5-rc.1')
  assert.equal(peers[0].scope, 'shipping-app')
  // The consumer re-validates the very same receipts; audit fields must not disturb that.
  assert.equal(validateTaskPeerResolution(installation, [receipt])[0].exempted, true)
})

test('proof still refuses an undeclared host peer and names the missing exemption', () => {
  const { identity, declared } = shippedDeclaration()
  const installation = declaredHostFixture(declared)
  const receipt = hostPeerReceipt(installation, declared.hostSpec)
  assert.throws(() => validateTaskPeerResolution(installation, [receipt],
    { identity: Object.assign({}, identity, { peerExemptions: [] }) }), error => {
    assert.match(error.message, /version does not satisfy/)
    assert.match(error.message, /with no declared peer exemption/)
    assert.equal(error.peerResolutionFailure.name, '@deepseek-ai/dsh-agent')
    assert.equal(error.peerResolutionFailure.spec, '^0.1.5-rc.1')
    assert.equal(error.peerResolutionFailure.version, declared.hostSpec)
    assert.equal(error.peerResolutionFailure.scope, 'shipping-app')
    return true
  })
})

test('proof refuses a stale, expired or malformed exemption declaration', () => {
  const { identity, declared } = shippedDeclaration()
  const changes = [
    { name: 'stale host generation', peerExemptions: [Object.assign({}, declared, { hostSpec: '9.9.9' })],
      code: 'TEST_ENV_INSTALL_SUPPORT_EXEMPTION_STALE' },
    { name: 'expired review', peerExemptions: [Object.assign({}, declared, { reviewedAt: '2020-01-01' })],
      code: 'TEST_ENV_INSTALL_SUPPORT_EXEMPTION_STALE' },
    { name: 'malformed declaration', peerExemptions: 'not-a-list', code: 'TEST_ENV_INSTALL_SUPPORT_EXEMPTION_INVALID' },
  ]
  for (const change of changes) {
    const installation = declaredHostFixture(declared)
    const receipt = hostPeerReceipt(installation, declared.hostSpec)
    const injected = Object.assign({}, identity, { peerExemptions: change.peerExemptions })
    assert.throws(() => validateTaskPeerResolution(installation, [receipt], { identity: injected }), { code: change.code }, change.name)
  }
})

test('a granted exemption still rejects changed digests, foreign roots and anchor drift', () => {
  const { identity, declared } = shippedDeclaration()
  const granted = Object.assign({}, identity, { peerExemptions: [Object.assign({}, declared)] })
  const changes = [
    { name: 'manifest digest', pattern: /digest is invalid/, mutate: peer => { peer.manifestSha256 = 'not-a-digest' } },
    { name: 'entry digest', pattern: /differs from shipping anchor/, mutate: peer => { peer.entrySha256 = '0'.repeat(64) } },
    { name: 'foreign package root', pattern: /outside the shipping app/, mutate: peer => {
      peer.packageRoot = '/repository/node_modules/@deepseek-ai/dsh-agent'
      peer.manifestPath = join(peer.packageRoot, 'package.json')
      peer.entryPath = join(peer.packageRoot, 'index.js')
    } },
  ]
  for (const change of changes) {
    const installation = declaredHostFixture(declared)
    const receipt = hostPeerReceipt(installation, declared.hostSpec)
    change.mutate(receipt)
    assert.throws(() => validateTaskPeerResolution(installation, [receipt], { identity: granted }), change.pattern, change.name)
  }
})

test('same-PID server proof accepts the shipped exemption for the blocker peer shape', async () => {
  const { declared } = shippedDeclaration()
  const installation = declaredHostFixture(declared)
  addHostPeerProbe(installation)
  // The shipping anchor must belong to the actual server executable, so the child runs a copy of
  // this Node binary placed at the same fake App layout the fixture's anchor describes.
  const executable = join(installation.privateRoot, 'Host.app/Contents/MacOS/OmniMux')
  mkdirSync(dirname(executable), { recursive: true })
  copyFileSync(process.execPath, executable)
  installation.runtimeExecutable = executable
  const child = await ownedProcess(installation, installation.packages.filter(pkg => pkg.serverEntry)
    .map(pkg => `import ${JSON.stringify(pathToFileURL(join(pkg.installedRoot, pkg.serverEntry.path)).href)};`).join('\n'), executable)
  try {
    const proof = await verifyTaskServerLoading(Object.assign({}, child, { installation }))
    assert.equal(proof.runtimeExecutable, executable)
    assert.equal(proof.peers.length, 1)
    assert.equal(proof.peers[0].exempted, true)
    assert.equal(proof.peers[0].scope, 'shipping-app')
    assert.equal(proof.peers[0].version, declared.hostSpec)
    assert.equal(proof.peers[0].exemptionKey, `${declared.package}@${declared.version}`)
    assert.equal(proof.peers[0].exemptionHostSpec, declared.hostSpec)
    assert.equal(proof.peerObserver.matchingScriptCount, 1)
    // Counterexamples on the very same real observations: with no declaration the observed peer is
    // still refused, and a tampered digest stays refused even though the exemption is granted.
    assert.throws(() => validateTaskPeerResolution(installation, proof.peers, { identity: {} }), /version does not satisfy/, 'undeclared')
    const tampered = Object.assign({}, proof.peers[0], { entrySha256: '0'.repeat(64) })
    assert.throws(() => validateTaskPeerResolution(installation, [tampered]), /differs from shipping anchor/, 'tampered digest')
  } finally { await child.cleanup() }
})

test('the exemption never covers a private-graph host peer the installer chose itself', () => {
  const { declared } = shippedDeclaration()
  const installation = declaredHostFixture(declared)
  const privateRoot = join(installation.privateRoot, 'private-dsh-agent')
  mkdirSync(privateRoot)
  writeFileSync(join(privateRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-agent', version: declared.hostSpec, main: 'index.js' }))
  writeFileSync(join(privateRoot, 'index.js'), 'module.exports = 1;\n')
  const payload = ['package.json', 'index.js'].map(path => {
    const bytes = readFileSync(join(privateRoot, path))
    return { path, sha256: hash(bytes), size: bytes.length }
  })
  installation.packages.push({ name: '@deepseek-ai/dsh-agent', version: declared.hostSpec, installedRoot: privateRoot, payload })
  installation.hostPeerExpectations[0].privateRoot = privateRoot
  const receipt = Object.assign({}, installation.hostPeerExpectations[0], { status: 'resolved', scope: 'private',
    version: declared.hostSpec, packageRoot: privateRoot, manifestPath: join(privateRoot, 'package.json'),
    manifestSha256: payload[0].sha256, entryPath: join(privateRoot, 'index.js'), entrySha256: payload[1].sha256,
    anchorResolution: null })
  assert.throws(() => validateTaskPeerResolution(installation, [receipt]), /version does not satisfy/, 'private peer')
  assert.equal(receipt.exempted, undefined)
})
