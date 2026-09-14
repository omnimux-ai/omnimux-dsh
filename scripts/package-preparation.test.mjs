import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const prepare = 'node plugins/omnimux-forms/scripts/build-client.mjs'
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')

for (const name of ['test:gates', 'check:package-files']) {
  test(`${name} prepares forms assets before running existing checks`, () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.ok(pkg.scripts[name].startsWith(`${prepare} && `), `${name} must prepare real assets first`)
    assert.match(pkg.scripts[name].slice(prepare.length + 4), name === 'test:gates' ? /^node --test / : /^node scripts\/verify-package-files\.mjs$/)
    if (name === 'test:gates') assert.ok(pkg.scripts[name].split(/\s+/).includes('scripts/package-preparation.test.mjs'))
  })
}

function fixture(t, withExamples) {
  const parent = join(root, '.agent-reports/package-preparation-fixtures')
  mkdirSync(parent, { recursive: true })
  const dir = mkdtempSync(join(parent, 'run-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const plugin = join(dir, 'plugins/omnimux-forms')
  const sourcePlugin = join(root, 'plugins/omnimux-forms')
  mkdirSync(plugin, { recursive: true })
  for (const part of ['src', 'scripts', 'package.json']) cpSync(join(sourcePlugin, part), join(plugin, part), { recursive: true })
  symlinkSync(join(sourcePlugin, 'node_modules'), join(plugin, 'node_modules'), 'dir')
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir')
  const contract = join(dir, 'packages/form-contract')
  mkdirSync(contract, { recursive: true })
  symlinkSync(join(root, 'packages/form-contract/node_modules'), join(contract, 'node_modules'), 'dir')
  for (const part of ['src', 'templates', 'package.json', ...(withExamples ? ['examples'] : [])]) {
    cpSync(join(root, 'packages/form-contract', part), join(contract, part), { recursive: true })
  }
  return { dir, plugin, contract }
}

test('real forms preparation creates missing assets with exact source media bytes', t => {
  const { dir, plugin, contract } = fixture(t, true)
  const target = join(plugin, 'assets/examples/replication-demo.mp4')
  assert.equal(existsSync(target), false)
  const result = spawnSync(process.execPath, ['plugins/omnimux-forms/scripts/build-client.mjs'], { cwd: dir, encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, result.stderr || String(result.error))
  assert.equal(sha(target), sha(join(contract, 'examples/replication-demo.mp4')))
  assert.ok(existsSync(join(plugin, 'lib/client.js')))
})

test('missing real examples fail preparation and do not run a subsequent check', t => {
  const { dir, plugin } = fixture(t, false)
  const result = spawnSync('/bin/sh', ['-c', '"$NODE" plugins/omnimux-forms/scripts/build-client.mjs && "$NODE" -e "console.log(\'CHECK_RAN\')"'], {
    cwd: dir, env: { ...process.env, NODE: process.execPath }, encoding: 'utf8', timeout: 30000,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /ENOENT/)
  assert.ok(result.stderr.includes(join(dir, 'packages/form-contract/examples')), result.stderr)
  assert.equal(result.stdout.includes('CHECK_RAN'), false)
  assert.equal(existsSync(join(plugin, 'assets/examples/replication-demo.mp4')), false)
})
