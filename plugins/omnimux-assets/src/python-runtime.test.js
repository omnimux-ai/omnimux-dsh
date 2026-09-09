import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { privatePythonRuntime } from './python-runtime.js'
import { SafeStorageFS, storageSync } from './storage-fs.js'

test('all filesystem entrypoints use one verified absolute private Python and an environment whitelist', async (t) => {
  const execution = privatePythonRuntime()
  assert.ok(execution.executable.startsWith('/'))
  assert.deepEqual(execution.args.slice(0, -1), ['-I', '-S', '-B', '-u'])
  assert.deepEqual(Object.keys(execution.env).sort(), ['LANG', 'LC_ALL'])
  assert.equal(spawnSync('python3', ['--version'], { env: { PATH: '/nonexistent-assets-path' } }).error.code, 'ENOENT')
  const before = { ...process.env }
  process.env.PATH = '/nonexistent-assets-path'
  process.env.PYTHONHOME = '/untrusted'
  process.env.PYTHONPATH = '/untrusted'
  process.env.DYLD_INSERT_LIBRARIES = '/untrusted/injected.dylib'
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before) })
  const fs = new SafeStorageFS(); t.after(() => fs.dispose())
  assert.equal((await fs.probe()).python, '3.13.15')
  assert.equal(fs.execution, execution)
  assert.equal(storageSync('probe', {}).python, '3.13.15')
  assert.equal(fs.sync('probe', {}).python, '3.13.15')
  assert.equal(fs.child.spawnfile, execution.executable)
  assert.deepEqual(fs.child.spawnargs.slice(1), execution.args)
})
