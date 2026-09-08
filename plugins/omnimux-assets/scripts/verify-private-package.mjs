import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const pack = JSON.parse(readFileSync(join(root, '.final-pack.json'), 'utf8'))[0]
const files = new Set(pack.files.map((file) => file.path))
for (const path of files) assert.ok(!/(^runtime\/(archives|evidence)\/)|(__pycache__)|(\.pyc$)|(\.test\.)|(^\.package-cache)|storage-pressure/.test(path), `excluded packaging input: ${path}`)
const supply = JSON.parse(readFileSync(join(root, 'runtime/python-supply.json'), 'utf8'))
const tmp = mkdtempSync(join(root, '.package-verify-'))
try {
  const extracted = spawnSync('/usr/bin/tar', ['-xzf', join(root, pack.filename), '-C', tmp], { encoding: 'utf8' })
  assert.equal(extracted.status, 0, extracted.stderr)
  for (const artifact of supply.artifacts) {
    const inventory = JSON.parse(readFileSync(join(root, `runtime/${artifact.arch}-integrity.json`), 'utf8'))
    for (const item of inventory.entries) {
      if (item.bytes === undefined || /__pycache__|\.pyc$/.test(item.path)) continue
      const path = `runtime/${artifact.directory}/${item.path}`
      assert.ok(files.has(path), `missing payload: ${path}`)
      assert.equal(createHash('sha256').update(readFileSync(join(tmp, 'package', path))).digest('hex'), item.sha256)
    }
  }
  assert.ok(files.has('runtime/licenses/NOTICE.md'))
  assert.ok(files.has('runtime/licenses/license-index.json'))
  const notices = JSON.parse(readFileSync(join(root, 'runtime/licenses/license-index.json'), 'utf8'))
  for (const group of notices) for (const notice of group.notices) {
    const path = `runtime/${notice.path}`
    assert.ok(files.has(path), `missing notice: ${path}`)
    assert.equal(createHash('sha256').update(readFileSync(join(tmp, 'package', path))).digest('hex'), notice.sha256)
  }
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const {SafeStorageFS,storageSync}=await import(${JSON.stringify(new URL(`file://${join(tmp, 'package/src/storage-fs.js')}`).href)});
    const fs=new SafeStorageFS();try { const value=await fs.probe(); if(value.python!=='3.13.15'||storageSync('probe',{}).python!==value.python)throw Error('version mismatch');console.log(JSON.stringify(value));}finally{fs.dispose()}
  `], { env: { PATH: '/nonexistent-assets-python', LANG: 'C.UTF-8' }, encoding: 'utf8' })
  assert.equal(probe.status, 0, probe.stderr)
  console.log(JSON.stringify({ size: pack.size, unpackedSize: pack.unpackedSize, entryCount: pack.entryCount, sha256: createHash('sha256').update(readFileSync(join(root, pack.filename))).digest('hex'), bothCpuPayloads: 'all ordinary non-cache files match', extractedNoPathProbe: JSON.parse(probe.stdout) }, null, 2))
} finally { rmSync(tmp, { recursive: true, force: true }) }
