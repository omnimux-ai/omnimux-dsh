import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, lstatSync, readlinkSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
let temp, unpacked, files, beforePayload
function inventory(directory) {
  const rows = []
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name); const info = lstatSync(path)
      rows.push({ path: relative(directory, path), mode: info.mode & 0o7777,
        ...(info.isSymbolicLink() ? { link: readlinkSync(path) } : info.isFile() ? { bytes: info.size, sha256: sha(readFileSync(path)) } : {}) })
      if (info.isDirectory()) visit(path)
    }
  }
  visit(directory); return rows
}
before(() => {
  beforePayload = inventory(join(root, 'runtime'))
  temp = mkdtempSync(join(root, '.qa-package-')); unpacked = join(temp, '迁址 package')
  mkdirSync(unpacked)
  const listing = spawnSync('/usr/bin/tar', ['-tzf', join(root, 'omnimux-assets-0.2.0.tgz')], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  assert.equal(listing.status, 0, listing.stderr)
  const entries = listing.stdout.trim().split('\n')
  assert.ok(entries.every((p) => p.startsWith('package/') && !p.split('/').includes('..')))
  assert.equal(new Set(entries).size, entries.length)
  const result = spawnSync('/usr/bin/tar', ['-xzf', join(root, 'omnimux-assets-0.2.0.tgz'), '-C', unpacked], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  unpacked = join(unpacked, 'package'); files = inventory(unpacked)
})
after(() => {
  assert.deepEqual(inventory(join(root, 'runtime')), beforePayload, 'original supply must remain byte/mode/link identical')
  rmSync(temp, { recursive: true, force: true })
})

test('QA-PKG01 actual archive identity and independent entry list excludes caches/tests', () => {
  const tgz = readFileSync(join(root, 'omnimux-assets-0.2.0.tgz'))
  const [pack] = JSON.parse(readFileSync(join(root, '.final-pack.json')))
  assert.equal(pack.filename, 'omnimux-assets-0.2.0.tgz')
  assert.equal(tgz.length, pack.size)
  assert.equal(createHash('sha1').update(tgz).digest('hex'), pack.shasum)
  assert.equal(`sha512-${createHash('sha512').update(tgz).digest('base64')}`, pack.integrity)
  const regular = files.filter((f) => f.bytes !== undefined)
  assert.equal(regular.length, pack.entryCount)
  assert.equal(regular.reduce((sum, f) => sum + f.bytes, 0), pack.unpackedSize)
  const byPath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  assert.deepEqual(regular.map(({ path, bytes, mode }) => ({ path, size: bytes, mode })).sort(byPath),
    [...pack.files].sort(byPath))
  assert.ok(files.every((f) => !/(^runtime\/(archives|evidence)\/)|__pycache__|\.pyc$|\.test\.|\.package-cache|storage-pressure/.test(f.path)))
  for (const f of regular.filter((f) => f.path.startsWith('src/') || ['package.json', 'dsh.manifest.json', 'lib/client.js'].includes(f.path))) assert.equal(f.sha256, sha(readFileSync(join(root, f.path))), f.path)
})

for (const arch of ['arm64', 'x64']) test(`QA-PKG02 all ${arch} payload bytes modes links match independently accepted inventory`, () => {
  const supply = JSON.parse(readFileSync(join(root, 'runtime/python-supply.json')))
  const artifact = supply.artifacts.find((a) => a.arch === arch)
  const accepted = JSON.parse(readFileSync(join(root, `runtime/evidence/${arch}-inventory.json`)))
  const production = JSON.parse(readFileSync(join(unpacked, `runtime/${arch}-integrity.json`)))
  assert.deepEqual(production, accepted)
  const actualSource = new Map(inventory(join(root, 'runtime', artifact.directory)).map((f) => [f.path, f]))
  const actualPackage = new Map(inventory(join(unpacked, 'runtime', artifact.directory)).map((f) => [f.path, f]))
  for (const f of accepted.entries) {
    assert.deepEqual(actualSource.get(f.path), f, `${arch} source ${f.path}`)
    if (f.bytes !== undefined && !/__pycache__|\.pyc$/.test(f.path)) assert.deepEqual(actualPackage.get(f.path), f, `${arch} package ${f.path}`)
  }
  assert.equal(actualSource.size, accepted.entries.length)
  const cpu = spawnSync('/usr/bin/lipo', ['-archs', join(unpacked, 'runtime', artifact.directory, artifact.executable)], { encoding: 'utf8' })
  assert.equal(cpu.status, 0, cpu.stderr); assert.equal(cpu.stdout.trim(), arch === 'x64' ? 'x86_64' : 'arm64')
})

test('QA-PKG03 112 license notices and unchanged supply script fingerprints', () => {
  const expected = {
    'scripts/python-supply.mjs': '590be1c72eb3c94dd7cb413ef0361063507e3a257193e2ac214e9d3844616cde',
    'scripts/python-supply-audit.mjs': '1ec9d88d84fddccc731a6c51f0fdfd28d0eef03d7d38e6b93f4b7cacb33027ac',
    'scripts/python-supply-metadata.mjs': '26efadcac0b1db2cb6f28c4fbd3092c7438f2f8affcbc51bff9cb53fed502bdf',
    'scripts/python-supply-notices.mjs': '74bda9c5de389520567692d864e613f06175d604e0bb1179bd3c2972d90f63b7',
    'runtime/python-supply.json': 'fa0adb6cade26b55117d483996b0255a299129bfa56a42b1536d25f1afe897d8',
    'runtime/evidence/arm64-inventory.json': '42bd4322a4dc4c541fed79ed5b50e7975642b110d1c53531a51e075dc78cd3b4',
    'runtime/evidence/x64-inventory.json': '3cca72f9afc999a5544ef7547025f3e1229a315c94418b7665fc60739703d767',
  }
  for (const [path, digest] of Object.entries(expected)) assert.equal(sha(readFileSync(join(root, path))), digest)
  const notices = JSON.parse(readFileSync(join(unpacked, 'runtime/licenses/license-index.json'))).flatMap((g) => g.notices)
  assert.equal(notices.length, 112)
  for (const n of notices) assert.equal(sha(readFileSync(join(unpacked, 'runtime', n.path))), n.sha256)
})

async function exercisePackaged(packageRoot, home) {
  const assert = (await import('node:assert/strict')).default
  const fs = await import('node:fs'); const { join } = await import('node:path')
  const { once } = await import('node:events'); const { createServer } = await import('node:http')
  const { pathToFileURL } = await import('node:url')
  process.env.DYLD_INSERT_LIBRARIES = '/not-trusted/inject.dylib'
  const { apply } = await import(pathToFileURL(join(packageRoot, 'src/index.js')))
  const { SafeStorageFS, storageSync } = await import(pathToFileURL(join(packageRoot, 'src/storage-fs.js')))
  const { privatePythonRuntime } = await import(pathToFileURL(join(packageRoot, 'src/python-runtime.js')))
  const execution = privatePythonRuntime(); assert.deepEqual(Object.keys(execution.env).sort(), ['LANG', 'LC_ALL'])
  assert.deepEqual(execution.args.slice(0, -1), ['-I', '-S', '-B', '-u'])
  const worker = new SafeStorageFS(); assert.equal((await worker.probe()).python, '3.13.15')
  assert.equal(worker.execution, execution); assert.equal(worker.child.spawnfile, execution.executable)
  assert.equal(storageSync('probe', {}).python, '3.13.15')
  const stopped = once(worker.child, 'exit'); worker.dispose(); await stopped
  const source = join(home, 'external.png'); fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(source, 'EXTERNAL-QA')
  const root = join(home, 'omnimux/assets'); fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(join(root, 'old.png'), 'OLD-QA')
  for (const [name, value] of Object.entries({
    'library.json': { schema: 2, revision: 1, migrated_mappings: true, assets: [{ id: 'old', name: '旧资产', type: 'custom', description: 'retained', tags: ['tag'], cover_file_id: 'f', files: [{ id: 'f', relative_path: 'old.png' }] }] },
    'artifacts.json': { schema: 1, revision: 0, artifacts: [] }, 'mappings.json': { schema: 1, revision: 0, mappings: [] },
  })) fs.writeFileSync(join(root, name), JSON.stringify(value))
  const tools = new Map(); const cleanups = []; let handler
  const ctx = { tools: { register: (s) => tools.set(s.name, s) }, webServer: { register: (r) => { handler = r.handler; return () => {} } }, effect: (fn) => { const f = fn(); if (typeof f === 'function') cleanups.push(f) } }
  let dispose = apply(ctx)
  const server = createServer((req, res) => { void handler(req, res) }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/omnimux/assets`
  try {
    assert.equal(tools.size, 7)
    assert.equal((await tools.get('assets_get').execute({ id: 'old' })).asset.description, 'retained')
    for (const path of ['/state', '/library', '/library/detail?id=old']) assert.equal((await fetch(base + path)).status, 200, path)
    const preview = await fetch(base + '/library/preview?id=old&file=f'); assert.equal(preview.status, 200); assert.equal(await preview.text(), 'OLD-QA')
    const created = (await tools.get('assets_create').execute({ name: 'Imported', files: [source] })).asset
    await tools.get('assets_update').execute({ id: created.id, description: 'updated' })
    assert.equal((await tools.get('assets_search').execute({ query: 'Imported' })).assets.length, 1)
    const upload = await tools.get('assets_upload').execute({ path: source, agent: 'qa', run_id: 'isolated' })
    assert.equal(fs.readFileSync(join(root, upload.artifact.content_ref), 'utf8'), 'EXTERNAL-QA')
    assert.equal((await tools.get('assets_list').execute({ scope: 'artifacts' })).artifacts.length, 1)
    await tools.get('assets_delete').execute({ id: created.id, confirm: true })
    assert.equal(fs.readFileSync(source, 'utf8'), 'EXTERNAL-QA')
    dispose(); for (const fn of cleanups.splice(0)) fn()
    let ready = false
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 20)); dispose = apply(ctx)
      try { await tools.get('assets_get').execute({ id: 'old' }); ready = true; break }
      catch (e) { dispose(); for (const fn of cleanups.splice(0)) fn(); if (e.code !== 'storage-busy') throw e }
    }
    assert.equal(ready, true)
    assert.equal((await tools.get('assets_list').execute({ scope: 'artifacts' })).artifacts.length, 1)
    const restartPreview = await fetch(base + '/library/preview?id=old&file=f'); assert.equal(await restartPreview.text(), 'OLD-QA')
    console.log(JSON.stringify({ tools: tools.size, oldSchema: true, preview: true, upload: true, restart: true, python: '3.13.15', executable: execution.executable }))
  } finally { dispose(); for (const fn of cleanups) fn(); server.closeAllConnections(); await new Promise((r) => server.close(r)) }
}

test('QA-PKG04 relocated production resolver no-PATH real legacy HTTP seven tools upload and restart', () => {
  const home = join(temp, 'home')
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await (${exercisePackaged.toString()})(${JSON.stringify(unpacked)},${JSON.stringify(home)})`], {
    env: { DSH_HOME: home, PATH: '/nonexistent-assets-python', PYTHONHOME: '/not-trusted', PYTHONPATH: '/not-trusted' },
    encoding: 'utf8', timeout: 30000,
  })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  const evidence = JSON.parse(result.stdout.trim()); assert.equal(evidence.tools, 7)
  assert.ok(evidence.executable.startsWith(unpacked)); console.log('PACKAGED_BUSINESS=' + result.stdout.trim())
  assert.ok(inventory(unpacked).every((f) => !/__pycache__|\.pyc$/.test(f.path)))
})
