import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../client.js'), 'utf8')

test('client bundle registers both plugin configuration seats', () => {
  // 0.1.5 seat: keyed by the settings namespace.
  assert.match(client, /settings\.plugin\.item/)
  assert.match(client, /key: "omnimux-market"/)
  // 0.2.x seat: keyed by the bundle package name on the Plugins page.
  assert.match(client, /plugins\.bundle\.config/)
})
