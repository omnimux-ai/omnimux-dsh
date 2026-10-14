import test from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../config.js'

test('official persistence validation rejects secrets and unsafe addresses before commit', () => {
  const secret = Config['~standard'].validate({ referenceStorage: { enabled: false, secretAccessKey: 'synthetic-secret' } })
  const unsafe = Config['~standard'].validate({ referenceStorage: { enabled: false, endpoint: 'http://127.0.0.1' } })
  assert.equal(secret.issues.length, 1)
  assert.equal(unsafe.issues.length, 1)
  const valid = Config['~standard'].validate({ referenceStorage: { enabled: false } })
  assert.equal(valid.value.referenceStorage.get().enabled, false)
})
