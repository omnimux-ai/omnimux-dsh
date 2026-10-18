import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, test } from 'node:test'
import { assertTaskProofStable, captureTaskClientProof, verifyTaskServerLoading } from './task-runtime-proof.mjs'

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
  await assert.rejects(capture(duplicate), /Duplicate or invalid installed package/)
  const repeated = structuredClone(installation); repeated.packages[0].payload.push(repeated.packages[0].payload[0])
  await assert.rejects(capture(repeated), /Duplicate installed payload/)
  installation.packages[0].name = 'wrong-name'
  await assert.rejects(capture(installation), /does not match its manifest/)
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

async function ownedProcess(installation, body) {
  const runner = join(installation.privateRoot, 'runner.mjs')
  writeFileSync(runner, `${body}\nconsole.log('TASK_PROOF_READY'); setInterval(()=>{},1000);\n`)
  const child = spawn(process.execPath, ['--inspect=127.0.0.1:0', runner], {
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
    assert.equal(proof.modules.length, 2)
    assert.ok(proof.modules.every(module => module.sha256 === module.loadedScriptSha256 && module.matchingScriptCount === 1))
    assertTaskProofStable(proof, await verifyTaskServerLoading({ ...child, installation }))
    const wrong = { ...installation, pid: child.pid + 1 }
    await assert.rejects(verifyTaskServerLoading({ inspectorUrl: child.inspectorUrl, pid: wrong.pid, installation: wrong }), /different process/)
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
