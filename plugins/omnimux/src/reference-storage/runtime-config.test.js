import test from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../config.js'
import { readReferenceStorage } from './config.js'

test('hub config exposes reference storage as a live official form field', () => {
  assert.equal(typeof Config.toJSON, 'function')
  const schema = Config.toJSON()
  assert.ok(schema.refs)
  assert.equal(Config.dict.referenceStorage.meta.volatile, true)
})
test('current settings forms without legacy get use injected live config reader', async () => {
  const config = { enabled: false, endpoint: '', bucket: '', region: 'auto', publicBaseUrl: '', credentialId: '' }
  const result = await readReferenceStorage({ settings: { describe: () => [{ ns: 'omnimux', revision: 0 }] }, readConfig: () => config })
  assert.deepEqual(result.config, config)
  assert.equal(result.revision, 0)
})
