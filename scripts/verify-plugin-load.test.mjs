import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkPackage,
  discoverPlugins,
  normalizeInject,
  pluginEntries,
  repoRoot,
} from './verify-plugin-load.mjs'

const here = resolve(fileURLToPath(import.meta.url), '..')
const FIXTURES = join(repoRoot, 'scripts', 'test-fixtures', 'plugin-load', 'plugins')

function fixturePkg(name) {
  const dir = join(FIXTURES, name)
  return { name, dir, hostEntry: join(dir, 'src', 'index.js'), clientEntry: undefined }
}

function clientFixturePkg(name) {
  const dir = join(FIXTURES, name)
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const { clientEntry, clientDeclared } = pluginEntries(dir, manifest)
  return { name, dir, hostEntry: undefined, clientEntry, clientDeclared }
}

test('fixture plugin reading an undeclared service fails with inject error', async () => {
  const failures = await checkPackage(fixturePkg('fixture-missing-inject'))
  assert.equal(failures.length, 1)
  assert.match(failures[0], /without inject|undeclared service/i)
  assert.match(failures[0], /tools/)
})

test('fixture plugin with declared inject passes', async () => {
  const failures = await checkPackage(fixturePkg('fixture-good'))
  assert.deepEqual(failures, [])
})

test('normalizeInject handles array and object forms', () => {
  assert.deepEqual(normalizeInject(['a', 'b']), ['a', 'b'])
  assert.deepEqual(normalizeInject({ a: null, b: { required: false } }), ['a', 'b'])
  assert.deepEqual(normalizeInject(undefined), [])
})

// Regression for #2956/#2950: client bundles ship as window.__ModuleLoader__.load(...)
// wrappers. Before the fix the eval returned {} and the apply check never ran, so a
// free-identifier crash inside apply() passed the gate.
test('ModuleLoader-format client bundle with unbound call in apply fails', async () => {
  const pkg = clientFixturePkg('fixture-client-loader-bad')
  assert.ok(pkg.clientEntry && existsSync(pkg.clientEntry), 'fixture bundle should exist')
  const failures = await checkPackage(pkg)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /neverDefinedSymbol|not defined|client/i)
})

test('ModuleLoader-format client bundle with clean apply passes', async () => {
  const pkg = clientFixturePkg('fixture-client-loader-good')
  const failures = await checkPackage(pkg)
  assert.deepEqual(failures, [])
})

test('declared-but-missing client bundle fails unless skipped', async () => {
  const pkg = clientFixturePkg('fixture-client-missing-bundle')
  assert.equal(pkg.clientDeclared, true)
  assert.equal(pkg.clientEntry, undefined)
  const failures = await checkPackage(pkg)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /bundle is missing/)
  const skipped = await checkPackage(pkg, { skipMissingClient: true })
  assert.deepEqual(skipped, [])
})
