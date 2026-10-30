import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  committedVersion,
  uncommittedPaths,
  verifyPublishSource,
  workingVersion,
} from './verify-publish-source.mjs'

/** Builds a throwaway repository with one package and commits it. */
function fixture(t, { version = '0.1.2', committed = '0.1.2' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'publish-guard-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  const pkg = join(root, 'plugins', 'thing')
  mkdirSync(pkg, { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'thing', version: committed }))
  git('add', '-A')
  git('commit', '-q', '-m', 'seed')
  if (version !== committed) {
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'thing', version }))
  }
  return { root, pkg }
}

test('accepts a package whose committed version matches the working tree', (t) => {
  const { pkg } = fixture(t)
  assert.deepEqual(verifyPublishSource(pkg), { ok: true, problems: [] })
})

test('rejects a version bumped without committing it', (t) => {
  const { pkg } = fixture(t, { committed: '0.1.2', version: '0.1.4' })
  const result = verifyPublishSource(pkg)
  assert.equal(result.ok, false)
  assert.match(result.problems.join('\n'), /version 0\.1\.4 is not committed/u)
})

test('rejects an uncommitted source edit even when the version matches', (t) => {
  const { root, pkg } = fixture(t)
  writeFileSync(join(pkg, 'index.js'), 'export const x = 1\n')
  const result = verifyPublishSource(pkg)
  assert.equal(result.ok, false)
  assert.deepEqual(uncommittedPaths(root, pkg), ['plugins/thing/index.js'])
  assert.match(result.problems.join('\n'), /uncommitted changes/u)
})

test('rejects a staged but uncommitted edit', (t) => {
  const { root, pkg } = fixture(t)
  writeFileSync(join(pkg, 'index.js'), 'export const x = 2\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  assert.equal(verifyPublishSource(pkg).ok, false)
})

test('reads the committed and working versions independently', (t) => {
  const { root, pkg } = fixture(t, { committed: '0.1.2', version: '0.1.4' })
  assert.equal(committedVersion(root, 'plugins/thing/package.json'), '0.1.2')
  assert.equal(workingVersion(pkg), '0.1.4')
})
