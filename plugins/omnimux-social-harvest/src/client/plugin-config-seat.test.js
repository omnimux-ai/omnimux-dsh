import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const entry = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8')

test('client entry registers both plugin configuration seats', () => {
  // 0.1.5 seat: keyed by the settings namespace.
  assert.match(entry, /settings\.plugin\.item/)
  // 0.2.x seat: keyed by the bundle package name on the Plugins page.
  assert.match(entry, /plugins\.bundle\.config/)
  assert.match(entry, /key: 'omnimux-social-harvest'/)
})
