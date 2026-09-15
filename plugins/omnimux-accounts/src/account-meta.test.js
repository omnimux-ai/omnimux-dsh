import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccountMetaStore } from './account-meta.js'
for (const createStore of [createAccountMetaStore]) {
  test(`permission documents fail closed without erasing corrupt policy: ${createStore.name}`, (t) => {
    const home = mkdtempSync(join(tmpdir(), 'policy-'))
    t.after(() => rmSync(home, { recursive: true, force: true }))
    const store = createStore({ home })
    assert.deepEqual(store.readForAuthorization(), {})
    mkdirSync(join(home, 'omnimux'))
    const file = join(home, 'omnimux/accounts.json')
    for (const content of ['{', 'null', '[]', '{"a":null}', '{"a":{"agent_usable":"false"}}']) {
      writeFileSync(file, content)
      assert.throws(() => store.readForAuthorization(), /account-policy-unavailable/)
      assert.throws(() => (store.update || store.patch)('a', { group: 'new' }), /account-policy-unavailable/)
      assert.equal(readFileSync(file, 'utf8'), content)
    }
  })
}
