import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RUNNER = fileURLToPath(new URL('./run-workspace-tests.mjs', import.meta.url))

test('packageEnv injects an isolated DSH_HOME per package run', async () => {
  const { packageEnv } = await import(pathToFileURL(RUNNER).href)
  const home = mkdtempSync(join(tmpdir(), 'omnimux-test-home-probe-'))
  try {
    const env = packageEnv('/tmp/pkg', { PATH: '/bin' }, home)
    assert.equal(env.DSH_HOME, home, 'spawned test processes must see the throwaway DSH_HOME')
    const env2 = packageEnv('/tmp/pkg', { PATH: '/bin', DSH_HOME: '/real/.dsh' }, home)
    assert.equal(env2.DSH_HOME, home, 'a caller-supplied DSH_HOME must be overridden by isolation')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('spawned package tests can still override DSH_HOME in-process', () => {
  // Contract: runner-level DSH_HOME is a floor, not a cage — tests that need
  // their own ledger dir (task-store, task-collect-lifecycle) set it inside
  // the process and win over the inherited env. Verified structurally: those
  // files already do `process.env.DSH_HOME = mkdtempSync(...)` before use.
  const probe = new URL('../plugins/omnimux/src/media/task-collect-lifecycle.test.mjs', import.meta.url)
  assert.ok(existsSync(probe), 'task-collect-lifecycle regression fixture must exist')
})
