/** Regression guard for Issue #2427: the built web client bundle MUST export a
 * standard Cordis client-plugin shape (name / inject / apply). Without it the
 * web runtime rejects the module with "invalid plugin … received object" and
 * the whole app boots into the plugin recovery screen.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadClientBundle() {
  const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  let captured = null
  const window = {
    __ModuleLoader__: {
      load: ({ factory }) => {
        captured = factory
      },
    },
  }
  new Function('window', code)(window)
  assert.ok(captured, 'lib/client.js did not register a module factory')
  // Universal stub for externals (react, @deepseek-ai/*): property access and
  // calls both return the same callable proxy, so module-level evaluation works.
  const stub = new Proxy(function () {}, {
    get: (_target, prop) => (prop === '__esModule' ? undefined : stub),
    apply: () => stub,
  })
  return captured((id) => {
    if (typeof id !== 'string') throw new Error(`unexpected require: ${id}`)
    return stub
  })
}

test('client bundle exports a valid Cordis plugin shape', () => {
  const exports = loadClientBundle()
  assert.equal(exports.name, 'omnimux-device')
  assert.ok(Array.isArray(exports.inject), 'inject must be an array')
  assert.equal(typeof exports.apply, 'function', 'apply must be a function')
})
