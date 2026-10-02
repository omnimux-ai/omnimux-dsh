import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkPackage,
  collectLocaleDuplicates,
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

// Regression for #2970: same locale namespace registered twice on one side must be
// caught — cordis throws "already has locale" at runtime and crashes the whole
// plugin load page; the per-package isolation used to hide it.
test('same-package duplicate locale namespace registers twice and is collected', async () => {
  const localeRegistry = new Map()
  const pkg = clientFixturePkg('fixture-client-locale-dup-self')
  await checkPackage(pkg, { localeRegistry })
  const dups = collectLocaleDuplicates(localeRegistry)
  assert.equal(dups.length, 1)
  assert.equal(dups[0].side, 'client')
  assert.equal(dups[0].namespace, 'omnimux-dup-ns')
  assert.deepEqual(dups[0].entries.map((e) => e.package), ['fixture-client-locale-dup-self', 'fixture-client-locale-dup-self'])
})

test('cross-package duplicate locale namespace reports both registrants', async () => {
  const localeRegistry = new Map()
  const pkgA = clientFixturePkg('fixture-client-locale-dup-a')
  const pkgB = clientFixturePkg('fixture-client-locale-dup-b')
  await checkPackage(pkgA, { localeRegistry })
  await checkPackage(pkgB, { localeRegistry })
  const dups = collectLocaleDuplicates(localeRegistry)
  assert.equal(dups.length, 1)
  assert.equal(dups[0].side, 'client')
  assert.equal(dups[0].namespace, 'omnimux-shared-ns')
  const pkgs = dups[0].entries.map((e) => e.package).sort()
  assert.deepEqual(pkgs, ['fixture-client-locale-dup-a', 'fixture-client-locale-dup-b'])
})
