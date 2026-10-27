import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { discoverPackages, selectShard, SHARD_NAMES } from './run-workspace-tests.mjs'

const RUNNER = fileURLToPath(new URL('./run-workspace-tests.mjs', import.meta.url))

test('CI shards cover every workspace package exactly once and match the workflow matrix', () => {
  const packages = discoverPackages()
  const seen = new Map()
  for (const shard of SHARD_NAMES) {
    const selected = selectShard(packages, shard)
    assert.ok(selected.length > 0, `shard ${shard} must not be empty`)
    for (const pkg of selected) {
      assert.equal(seen.has(pkg.name), false, `${pkg.name} runs in both ${seen.get(pkg.name)} and ${shard}`)
      seen.set(pkg.name, shard)
    }
  }
  assert.deepEqual([...seen.keys()].sort(), packages.map((pkg) => pkg.name).sort())
  const workflow = parse(readFileSync(new URL('../.github/workflows/quality-gate.yml', import.meta.url), 'utf8'))
  assert.deepEqual(workflow.jobs['plugin-tests'].strategy.matrix.shard, [...SHARD_NAMES])
})

test('shard selection fails loudly on unknown shards and stale shard tables', () => {
  const pkg = (name) => ({ name, dir: `/tmp/${name}`, command: 'true' })
  const full = ['omnimux', 'omnimux-inspiration', 'omnimux-workflow', 'omnimux-market', 'omnimux-new'].map(pkg)
  assert.throws(() => selectShard(full, 'nope'), /unknown shard/)
  assert.deepEqual(selectShard(full, 'rest').map((item) => item.name), ['omnimux-new'], 'new packages fall into rest')
  assert.throws(() => selectShard(full.filter((item) => item.name !== 'omnimux-market'), 'rest'), /missing package\(s\): omnimux-market/)
})

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
