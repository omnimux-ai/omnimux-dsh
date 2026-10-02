import test from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkPackage,
  discoverPlugins,
  normalizeInject,
  repoRoot,
} from './verify-plugin-load.mjs'

const here = resolve(fileURLToPath(import.meta.url), '..')
const FIXTURES = join(repoRoot, 'scripts', 'test-fixtures', 'plugin-load', 'plugins')

function fixturePkg(name) {
  const dir = join(FIXTURES, name)
  return { name, dir, hostEntry: join(dir, 'src', 'index.js'), clientEntry: undefined }
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
