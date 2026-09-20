import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChildEnv, resolveOpenCliBin } from './run.js'

test('buildChildEnv 能够正确聚合标准路径且不丢失原有 PATH', () => {
  const mockEnv = { PATH: '/usr/bin:/bin' }
  const result = buildChildEnv(mockEnv)

  assert.ok(result.PATH.includes('/usr/local/bin'), 'should include /usr/local/bin')
  assert.ok(result.PATH.includes('/usr/bin'), 'should preserve original /usr/bin')
  assert.ok(result.PATH.includes('/opt/homebrew/bin'), 'should include /opt/homebrew/bin')
})

test('resolveOpenCliBin 能够通过 PATH 找到存在的可执行文件或回落默认值', () => {
  const emptyEnv = { PATH: '' }
  assert.equal(resolveOpenCliBin(emptyEnv), 'opencli')

  const envWithLocal = buildChildEnv()
  const resolved = resolveOpenCliBin(envWithLocal)
  assert.ok(typeof resolved === 'string' && resolved.length > 0)
})
